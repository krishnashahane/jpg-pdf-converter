const crypto = require("crypto");
const express = require("express");
const fs = require("fs-extra");
const multer = require("multer");
const os = require("os");
const path = require("path");
const { PDFDocument } = require("pdf-lib");
const sharp = require("sharp");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_FILES = 20;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 30;
const rateBuckets = new Map();

app.set("trust proxy", 1);

const MIME_BY_EXT = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

function clientKey(req) {
  return String(req.ip || req.socket?.remoteAddress || "unknown");
}

function rateLimit(req, res, next) {
  const now = Date.now();
  const key = clientKey(req);
  const bucket = rateBuckets.get(key);

  if (!bucket || now - bucket.startedAt >= RATE_WINDOW_MS) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return next();
  }

  if (bucket.count >= RATE_LIMIT) {
    const retryAfter = Math.max(
      1,
      Math.ceil((RATE_WINDOW_MS - (now - bucket.startedAt)) / 1000),
    );
    res.setHeader("Retry-After", String(retryAfter));
    return res.status(429).json({
      success: false,
      error: "Too many conversion requests. Please try again shortly.",
    });
  }

  bucket.count += 1;
  return next();
}

function isJpegBuffer(buffer) {
  return (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  );
}

function isPdfBuffer(buffer) {
  return (
    buffer.length >= 5 &&
    buffer.subarray(0, 5).toString("ascii") === "%PDF-"
  );
}

function toDataUrl(buffer, filename) {
  const mime =
    MIME_BY_EXT[path.extname(filename).toLowerCase()] ||
    "application/octet-stream";
  return `data:${mime};base64,${Buffer.from(buffer).toString("base64")}`;
}

function tempPath(directory, extension) {
  return path.join(os.tmpdir(), "jpg-pdf-converter", directory, `${crypto.randomUUID()}${extension}`);
}

async function cleanup(filePath) {
  if (!filePath) return;
  try {
    await fs.remove(filePath);
  } catch {
    // Best-effort cleanup only.
  }
}

let pdfjs;
let canvas;

async function renderPdfFirstPageToJpg(pdfBuffer) {
  pdfjs ||= await import("pdfjs-dist/legacy/build/pdf.mjs");
  canvas ||= await import("@napi-rs/canvas");

  const document = await pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    disableFontFace: true,
    isEvalSupported: false,
  }).promise;

  try {
    if (document.numPages < 1) {
      throw new Error("PDF has no pages.");
    }

    const page = await document.getPage(1);
    const base = page.getViewport({ scale: 1 });

    if (!Number.isFinite(base.width) || !Number.isFinite(base.height)) {
      throw new Error("PDF page has invalid dimensions.");
    }

    const maxSide = Math.max(base.width, base.height);
    const scale = Math.min(2, 2000 / Math.max(maxSide, 1));
    const viewport = page.getViewport({ scale });

    const targetWidth = Math.max(1, Math.ceil(viewport.width));
    const targetHeight = Math.max(1, Math.ceil(viewport.height));
    const surface = canvas.createCanvas(targetWidth, targetHeight);
    const context = surface.getContext("2d");

    await page.render({
      canvasContext: context,
      viewport,
    }).promise;

    return surface.toBuffer("image/jpeg", { quality: 90 });
  } finally {
    await document.destroy();
  }
}

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const directory = path.join(os.tmpdir(), "jpg-pdf-converter", "uploads");
    try {
      await fs.ensureDir(directory);
      cb(null, directory);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const sanitized = path
      .basename(file.originalname || "upload")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 180);

    cb(null, `${crypto.randomUUID()}-${sanitized || "upload"}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = new Set(["image/jpeg", "image/jpg", "application/pdf"]);
  if (!allowed.has(file.mimetype)) {
    return cb(new Error("Only JPG/JPEG and PDF files are allowed."));
  }
  return cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES,
    fields: 10,
    parts: MAX_FILES + 10,
  },
});

app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: false, limit: "64kb" }));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
      "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com",
      "img-src 'self' data: https:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  );
  next();
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use(rateLimit);

async function jpgToPdf(files) {
  const pdfDoc = await PDFDocument.create();

  for (const file of files) {
    const imageBuffer = await fs.readFile(file.path);
    if (!isJpegBuffer(imageBuffer)) {
      throw new Error("Uploaded image is not a valid JPEG file.");
    }

    const processed = await sharp(imageBuffer)
      .rotate()
      .jpeg({ quality: 90 })
      .resize({
        width: 2480,
        height: 3508,
        fit: "inside",
        withoutEnlargement: true,
      })
      .toBuffer();

    const image = await pdfDoc.embedJpg(processed);
    const page = pdfDoc.addPage([image.width, image.height]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    });
  }

  return Buffer.from(await pdfDoc.save());
}

app.post("/convert/jpg-to-pdf", upload.array("images", MAX_FILES), async (req, res, next) => {
  const uploaded = Array.isArray(req.files) ? req.files : [];

  try {
    if (uploaded.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Select at least one JPG/JPEG image.",
      });
    }

    const pdfBuffer = await jpgToPdf(uploaded);
    const filename = "converted.pdf";

    return res.json({
      success: true,
      filename,
      downloadPath: toDataUrl(pdfBuffer, filename),
      message: `Successfully converted ${uploaded.length} image(s) to PDF.`,
    });
  } catch (error) {
    return next(error);
  } finally {
    await Promise.all(uploaded.map((file) => cleanup(file.path)));
  }
});

app.post("/convert/pdf-to-jpg", upload.single("pdf"), async (req, res, next) => {
  const uploaded = req.file;

  try {
    if (!uploaded) {
      return res.status(400).json({
        success: false,
        error: "Select a PDF file.",
      });
    }

    const pdfBuffer = await fs.readFile(uploaded.path);
    if (!isPdfBuffer(pdfBuffer)) {
      return res.status(415).json({
        success: false,
        error: "Uploaded file is not a valid PDF.",
      });
    }

    const jpgBuffer = await renderPdfFirstPageToJpg(pdfBuffer);
    const filename = "converted.jpg";

    return res.json({
      success: true,
      filename,
      downloadPath: toDataUrl(jpgBuffer, filename),
      message: "The first PDF page was converted to JPG.",
    });
  } catch (error) {
    return next(error);
  } finally {
    await cleanup(uploaded?.path);
  }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        success: false,
        error: "File exceeds the 100MB limit.",
      });
    }

    if (
      err.code === "LIMIT_FILE_COUNT" ||
      err.code === "LIMIT_PART_COUNT"
    ) {
      return res.status(413).json({
        success: false,
        error: "Too many files or form parts.",
      });
    }

    return res.status(400).json({
      success: false,
      error: "Invalid file upload.",
    });
  }

  if (err?.message === "Only JPG/JPEG and PDF files are allowed.") {
    return res.status(415).json({
      success: false,
      error: err.message,
    });
  }

  console.error("Request error:", err);
  return res.status(500).json({
    success: false,
    error: "Conversion failed. Please verify the uploaded file and try again.",
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`JPG/PDF converter running on http://localhost:${PORT}`);
  });
}

module.exports = app;
