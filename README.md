# JPG/PDF Converter

A privacy-focused Node.js web app for converting JPG/JPEG images to PDF and rendering the first page of a PDF as a JPG.

## Supported conversions

### JPG/JPEG → PDF
- Upload up to 20 images.
- Maximum 100 MB per file.
- Images are auto-rotated from EXIF metadata.
- Images are bounded to 2480×3508 pixels before PDF embedding.
- Original upload files are deleted after processing.

### PDF → JPG
- Accepts PDFs up to 100 MB.
- Renders the first page only.
- Output is capped at roughly 2000 pixels on the longest side.
- The result is returned immediately as a downloadable data URL.
- Temporary upload files are deleted after processing.

The application intentionally does **not** advertise DOC/DOCX/PPT/PPTX conversion. Older versions contained placeholder or low-fidelity Office conversion paths; those paths are no longer part of the supported product.

## Requirements

- Node.js 20+
- npm

## Installation

```bash
git clone https://github.com/krishnashahane/jpg-pdf-converter.git
cd jpg-pdf-converter
npm install
```

Run locally:

```bash
npm start
```

Open `http://localhost:3000`.

Development mode:

```bash
npm run dev
```

After dependency changes, use `npm install` to generate/update the local lockfile before using `npm ci` in CI.

## API

### `GET /health`

Returns:

```json
{"status":"ok"}
```

### `POST /convert/jpg-to-pdf`

Multipart field: `images` — one or more JPG/JPEG files, maximum 20.

Successful response:

```json
{
  "success": true,
  "filename": "converted.pdf",
  "downloadPath": "data:application/pdf;base64,..."
}
```

### `POST /convert/pdf-to-jpg`

Multipart field: `pdf` — one PDF file.

The response contains the first page as a JPEG data URL.

## Security and reliability

- Uploads are limited to 100 MB per file and 20 files per request.
- Multipart request parts and form fields are bounded.
- A lightweight per-client rate limiter protects conversion endpoints.
- Uploaded files are checked using file-signature bytes instead of trusting only the browser-supplied MIME type.
- Temporary filenames use UUIDs and are stored under the OS temp directory.
- Temporary uploads are deleted in cleanup blocks.
- Conversion errors return generic client-facing messages while detailed errors stay server-side.
- Security headers include CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy`.
- The app does not expose a separate download-by-filename endpoint.
- The server does not require a database or store conversion metadata.

The previous `multer@1.4.5-lts.1` release has multiple known high-severity denial-of-service issues; the application now uses the current 2.x line. citeturn847913search0turn847913search2

The previous `sharp@0.32.6` release is affected by a heap-based buffer overflow involving crafted image inputs; the dependency is now on the current 0.35.x line. citeturn847913search3

`pdfjs-dist@4.10.38` has no direct vulnerability listed in the current scan reviewed during this audit. citeturn847913search7

## Deployment

The repository includes `vercel.json` and exports the Express app with `module.exports = app`. The server starts a local listener only when run directly, so it remains compatible with serverless deployment.

## Project structure

```text
jpg-pdf-converter/
├── public/
│   ├── index.html
│   ├── jpg-to-pdf.html
│   ├── pdf-to-jpg.html
│   ├── js/
│   │   ├── consent.js
│   │   └── modern-converter.js
│   └── css/
├── server.js
├── package.json
├── vercel.json
├── LICENSE
└── README.md
```

## License

MIT
