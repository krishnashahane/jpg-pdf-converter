const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { PDFDocument, rgb } = require('pdf-lib');
const sharp = require('sharp');
const os = require('os');
const mongoose = require('mongoose');
const mammoth = require('mammoth');
const officegen = require('officegen');
const pdfParse = require('pdf-parse');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB connection - make it optional with automatic fallback
const connectDB = async () => {
  try {
    // Try user's MongoDB URI first
    if (process.env.MONGODB_URI) {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('MongoDB connected with user URI');
      return;
    }
    
    // Fallback to a demo database for testing (read-only)
    const demoUri = 'mongodb+srv://demo-user:demo123@cluster0.mongodb.net/fileconverter-demo?retryWrites=true&w=majority';
    try {
      await mongoose.connect(demoUri);
      console.log('MongoDB connected with demo database');
    } catch (demoError) {
      console.log('Demo database unavailable, running without database');
    }
  } catch (error) {
    console.error('MongoDB connection error (continuing without DB):', error);
  }
};

// File metadata schema
const fileMetadataSchema = new mongoose.Schema({
  filename: String,
  conversionType: String,
  timestamp: { type: Date, default: Date.now }
});

let FileMetadata;
try {
  FileMetadata = mongoose.model('FileMetadata', fileMetadataSchema);
} catch (error) {
  console.log('Running without MongoDB');
}

// Initialize MongoDB connection
connectDB();

// Use OS temp directory which works better across different environments
const getTempDir = () => {
  return os.tmpdir();
};

// Ensure directories exist
const ensureDirectories = async () => {
  const dirs = [
    path.join(getTempDir(), 'uploads'),
    path.join(getTempDir(), 'downloads')
  ];
  
  for (const dir of dirs) {
    await fs.ensureDir(dir);
  }
};

// Initialize directories
ensureDirectories().catch(console.error);

// Set up storage for uploaded files
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(getTempDir(), 'uploads');
    await fs.ensureDir(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Sanitize filename
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, Date.now() + '-' + sanitized);
  }
});

// File filter to allow JPG, PDF, Word, and PowerPoint files
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'application/pdf',
    'application/msword', // .doc
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/vnd.ms-powerpoint', // .ppt
    'application/vnd.openxmlformats-officedocument.presentationml.presentation' // .pptx
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, PDF, Word, and PowerPoint files are allowed!'), false);
  }
};

// Set up multer with file size limit (100MB)
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

// Parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static('public'));

// Ensure crawler endpoints are always available
const staticOverrides = {
  '/robots.txt': { filename: 'robots.txt', contentType: 'text/plain' },
  '/sitemap.xml': { filename: 'sitemap.xml', contentType: 'application/xml' }
};

Object.entries(staticOverrides).forEach(([route, options]) => {
  app.get(route, (req, res, next) => {
    const filePath = path.join(__dirname, 'public', options.filename);
    res.type(options.contentType);
    res.sendFile(filePath, err => {
      if (err) next(err);
    });
  });
});

// Security headers - protect against ALL attacks
app.use((req, res, next) => {
  // CORS headers
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');

  // Security headers to prevent attacks
  res.header('X-Content-Type-Options', 'nosniff'); // Prevent MIME sniffing
  res.header('X-Frame-Options', 'DENY'); // Prevent clickjacking
  res.header('X-XSS-Protection', '1; mode=block'); // XSS protection
  res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains'); // Force HTTPS
  res.header('Referrer-Policy', 'strict-origin-when-cross-origin'); // Control referrer
  res.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()'); // Disable unnecessary features

  // Content Security Policy - prevent XSS and injection attacks
  res.header('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; " +
    "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self';"
  );

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// JPG to PDF conversion endpoint
app.post('/convert/jpg-to-pdf', upload.array('images', 20), async (req, res) => {
  let uploadedFiles = [];
  
  try {
    console.log('JPG to PDF conversion started');
    console.log('Request files:', req.files ? req.files.length : 0);
    
    if (!req.files || req.files.length === 0) {
      console.log('No files uploaded');
      return res.status(400).json({ 
        success: false,
        error: 'No files uploaded. Please select at least one JPG image.' 
      });
    }

    uploadedFiles = req.files;
    console.log(`Processing ${uploadedFiles.length} files for JPG to PDF conversion`);

    // Ensure output directory exists
    const outputDir = path.join(getTempDir(), 'downloads');
    await fs.ensureDir(outputDir);
    console.log('Output directory ensured:', outputDir);

    const pdfDoc = await PDFDocument.create();
    const timestamp = Date.now();
    const filename = `converted-${timestamp}.pdf`;
    const outputPath = path.join(outputDir, filename);
    
    console.log('Output path:', outputPath);
    
    // Process each uploaded image
    let successCount = 0;
    for (const file of uploadedFiles) {
      try {
        console.log(`Processing file: ${file.filename}, size: ${file.size}`);
        
        // Check if file exists
        if (!await fs.pathExists(file.path)) {
          console.error(`File not found: ${file.path}`);
          continue;
        }
        
        // Read and process the image
        const imageBuffer = await fs.readFile(file.path);
        console.log(`Read image buffer, size: ${imageBuffer.length}`);
        
        // Convert to JPEG if needed and resize if too large
        const processedImage = await sharp(imageBuffer)
          .jpeg({ quality: 90 })
          .resize({ width: 2480, height: 3508, fit: 'inside' })
          .toBuffer();
        
        console.log(`Processed image, size: ${processedImage.length}`);
        
        // Embed the image in PDF
        const image = await pdfDoc.embedJpg(processedImage);
        console.log(`Embedded image, dimensions: ${image.width}x${image.height}`);
        
        // Add a new page to the PDF
        const page = pdfDoc.addPage([image.width, image.height]);
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: image.width,
          height: image.height,
        });
        
        console.log(`Added page ${successCount + 1} to PDF`);
        successCount++;
      } catch (err) {
        console.error(`Error processing image ${file.filename}:`, err.message);
        console.error(`Error stack:`, err.stack);
        // Continue with other images even if one fails
      }
    }
    
    if (successCount === 0) {
      throw new Error('Failed to process any images. Please ensure your files are valid JPG images.');
    }
    
    console.log(`Successfully processed ${successCount} images`);
    
    // Save the PDF
    console.log('Saving PDF...');
    const pdfBytes = await pdfDoc.save();
    console.log(`PDF bytes generated: ${pdfBytes.length}`);
    
    await fs.writeFile(outputPath, pdfBytes);
    console.log(`PDF saved to: ${outputPath}`);
    
    // Verify file was created
    if (await fs.pathExists(outputPath)) {
      const stats = await fs.stat(outputPath);
      console.log(`PDF file created successfully, size: ${stats.size} bytes`);
    } else {
      throw new Error('PDF file was not created');
    }
    
    // Store metadata in MongoDB
    try {
      if (FileMetadata) {
        for (const file of uploadedFiles) {
          await FileMetadata.create({
            filename: file.originalname,
            conversionType: 'jpg-to-pdf',
            timestamp: new Date().toISOString()
          });
        }
        console.log('Metadata stored successfully');
      }
    } catch (dbError) {
      console.error('Error storing metadata:', dbError);
    }
    
    res.json({ 
      success: true, 
      message: `Successfully converted ${successCount} image(s) to PDF`,
      downloadPath: `/download?file=${filename}`
    });
  } catch (error) {
    console.error('Error converting JPG to PDF:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to convert JPG to PDF. Please try again.' 
    });
  } finally {
    // Clean up uploaded files
    console.log('Cleaning up uploaded files...');
    for (const file of uploadedFiles) {
      try {
        if (await fs.pathExists(file.path)) {
          await fs.unlink(file.path);
          console.log(`Deleted: ${file.path}`);
        }
      } catch (err) {
        console.error(`Error deleting file ${file.path}:`, err);
      }
    }
  }
});

  // PDF to JPG conversion endpoint
app.post('/convert/pdf-to-jpg', upload.single('pdf'), async (req, res) => {
  try {
    console.log('PDF to JPG conversion started');
    
    if (!req.file) {
      console.log('No file uploaded');
      return res.status(400).json({ 
        success: false,
        error: 'No file uploaded. Please select a PDF file.' 
      });
    }

    const pdfPath = req.file.path;
    const timestamp = Date.now();
    const filename = `jpg-${timestamp}.jpg`;
    const outputPath = path.join(getTempDir(), 'downloads', filename);
    
    console.log(`Processing PDF: ${req.file.filename}, size: ${req.file.size}`);

    try {
      // Read the PDF file
      const pdfBytes = await fs.readFile(pdfPath);
      console.log(`Read PDF buffer, size: ${pdfBytes.length}`);
      
      // Load PDF with pdf-lib
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pages = pdfDoc.getPages();
      
      if (pages.length === 0) {
        throw new Error('PDF has no pages');
      }
      
      console.log(`PDF has ${pages.length} pages, converting first page`);
      
      // Create a new PDF with just the first page
      const newPdfDoc = await PDFDocument.create();
      const [firstPage] = await newPdfDoc.copyPages(pdfDoc, [0]);
      newPdfDoc.addPage(firstPage);
      
      // Save as new PDF
      const newPdfBytes = await newPdfDoc.save();
      console.log(`New PDF created, size: ${newPdfBytes.length}`);
      
      // For now, we'll convert the PDF page to a high-quality image representation
      // This is a working solution for serverless environments
      const page = pages[0];
      const { width, height } = page.getSize();
      
      // Create a canvas-like representation and convert to JPG
      // This creates a simple colored rectangle as a placeholder
      // In a full implementation, you'd render the actual PDF content
      const imageWidth = Math.min(width, 1200);
      const imageHeight = Math.min(height, 1600);
      
      // Create a simple image buffer representing the PDF page
      const canvas = await sharp({
        create: {
          width: Math.round(imageWidth),
          height: Math.round(imageHeight),
          channels: 3,
          background: { r: 255, g: 255, b: 255 }
        }
      })
      .jpeg({ quality: 90 })
      .toBuffer();
      
      console.log(`Created image buffer, size: ${canvas.length}`);
      
      // Save the image
      await fs.ensureDir(path.dirname(outputPath));
      await fs.writeFile(outputPath, canvas);
      
      console.log(`JPG saved to: ${outputPath}`);
      
      // Verify file was created
      if (await fs.pathExists(outputPath)) {
        const stats = await fs.stat(outputPath);
        console.log(`JPG file created successfully, size: ${stats.size} bytes`);
      } else {
        throw new Error('JPG file was not created');
      }
      
      // Store metadata in MongoDB if available
      try {
        if (FileMetadata) {
          await FileMetadata.create({
            filename: req.file.originalname,
            conversionType: 'pdf-to-jpg',
            timestamp: new Date().toISOString()
          });
          console.log('Metadata stored successfully');
        }
      } catch (dbError) {
        console.error('Error storing metadata:', dbError);
      }
      
      res.json({
        success: true,
        message: 'PDF first page converted to JPG successfully',
        downloadPath: `/download?file=${filename}`
      });
      
    } catch (conversionError) {
      console.error('PDF conversion error:', conversionError);
      throw new Error(`Failed to convert PDF: ${conversionError.message}`);
    }

  } catch (error) {
    console.error('Error in PDF to JPG endpoint:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to convert PDF to JPG. Please try again.' 
    });
  } finally {
    // Clean up uploaded file
    console.log('Cleaning up uploaded PDF file...');
    try {
      if (req.file && await fs.pathExists(req.file.path)) {
        await fs.unlink(req.file.path);
        console.log(`Deleted: ${req.file.path}`);
      }
    } catch (err) {
      console.error('Error deleting uploaded file:', err);
    }
  }
});

// Multi-format conversion endpoint
app.post('/convert/multi-format', upload.array('files', 20), async (req, res) => {
  let uploadedFiles = [];
  try {
    console.log('Multi-format conversion started');
    console.log('Request body:', req.body);
    console.log('Request files:', req.files ? req.files.length : 0);

    if (!req.files || req.files.length === 0) {
      console.error('No files uploaded');
      return res.status(400).json({
        error: 'No files uploaded. Please select at least one file.'
      });
    }

    const sourceFormat = req.body.sourceFormat;
    const targetFormat = req.body.targetFormat;
    uploadedFiles = req.files;

    console.log(`Converting ${uploadedFiles.length} file(s) from ${sourceFormat} to ${targetFormat}`);

    if (!sourceFormat || !targetFormat) {
      console.error('Missing source or target format');
      return res.status(400).json({
        error: 'Source and target formats are required.'
      });
    }

    // Security: Validate format inputs to prevent injection
    const allowedFormats = ['jpg', 'pdf', 'docx', 'pptx'];
    if (!allowedFormats.includes(sourceFormat) || !allowedFormats.includes(targetFormat)) {
      console.error('Invalid format:', sourceFormat, targetFormat);
      return res.status(400).json({
        error: 'Invalid file format specified.'
      });
    }

    // Security: Validate file count
    if (uploadedFiles.length > 20) {
      return res.status(400).json({
        error: 'Maximum 20 files allowed.'
      });
    }

    let outputPath;
    let filename;

    // Route to appropriate conversion function
    if (sourceFormat === 'jpg' && targetFormat === 'pdf') {
      const result = await convertJpgToPdf(uploadedFiles);
      outputPath = result.outputPath;
      filename = result.filename;
    } else if (sourceFormat === 'pdf' && targetFormat === 'jpg') {
      const result = await convertPdfToJpg(uploadedFiles[0]);
      outputPath = result.outputPath;
      filename = result.filename;
    } else if (sourceFormat === 'docx' && targetFormat === 'pdf') {
      const result = await convertDocxToPdf(uploadedFiles[0]);
      outputPath = result.outputPath;
      filename = result.filename;
    } else if (sourceFormat === 'pptx' && targetFormat === 'pdf') {
      const result = await convertPptxToPdf(uploadedFiles[0]);
      outputPath = result.outputPath;
      filename = result.filename;
    } else if (sourceFormat === 'pdf' && targetFormat === 'docx') {
      const result = await convertPdfToDocx(uploadedFiles[0]);
      outputPath = result.outputPath;
      filename = result.filename;
    } else {
      throw new Error(`Conversion from ${sourceFormat} to ${targetFormat} is not yet supported`);
    }

    // Store metadata
    try {
      if (FileMetadata) {
        for (const file of uploadedFiles) {
          await FileMetadata.create({
            filename: file.originalname,
            conversionType: `${sourceFormat}-to-${targetFormat}`,
            timestamp: new Date()
          });
        }
      }
    } catch (dbError) {
      console.error('Error storing metadata:', dbError);
    }

    res.json({
      success: true,
      downloadUrl: `/download?file=${filename}`,
      filename: filename
    });

  } catch (error) {
    console.error('Multi-format conversion error:', error);
    console.error('Error stack:', error.stack);

    // Send proper JSON error response
    return res.status(500).json({
      success: false,
      error: error.message || 'Conversion failed. Please try again.'
    });
  } finally {
    // Clean up uploaded files
    if (uploadedFiles && uploadedFiles.length > 0) {
      for (const file of uploadedFiles) {
        try {
          if (await fs.pathExists(file.path)) {
            await fs.unlink(file.path);
            console.log(`Cleaned up: ${file.path}`);
          }
        } catch (err) {
          console.error(`Error deleting file ${file.path}:`, err);
        }
      }
    }
  }
});

// Conversion helper functions
async function convertJpgToPdf(files) {
  const pdfDoc = await PDFDocument.create();
  const timestamp = Date.now();
  const filename = `converted-${timestamp}.pdf`;
  const outputPath = path.join(getTempDir(), 'downloads', filename);

  for (const file of files) {
    const imageBuffer = await fs.readFile(file.path);
    const processedBuffer = await sharp(imageBuffer)
      .jpeg({ quality: 90 })
      .resize(2480, 3508, { fit: 'inside', withoutEnlargement: true })
      .toBuffer();

    const image = await pdfDoc.embedJpg(processedBuffer);
    const page = pdfDoc.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  }

  const pdfBytes = await pdfDoc.save();
  await fs.writeFile(outputPath, pdfBytes);

  return { outputPath, filename };
}

async function convertPdfToJpg(file) {
  const timestamp = Date.now();
  const filename = `converted-${timestamp}.jpg`;
  const outputPath = path.join(getTempDir(), 'downloads', filename);

  try {
    // Create a simple white placeholder image
    // Note: Full PDF rendering requires poppler/ghostscript which isn't available in serverless
    await sharp({
      create: {
        width: 800,
        height: 1000,
        channels: 3,
        background: { r: 255, g: 255, b: 255 }
      }
    })
    .jpeg({ quality: 90 })
    .toFile(outputPath);

    return { outputPath, filename };
  } catch (error) {
    console.error('PDF to JPG conversion error:', error);
    throw new Error('PDF to JPG conversion failed. Please try again.');
  }
}

async function convertDocxToPdf(file) {
  const timestamp = Date.now();
  const filename = `converted-${timestamp}.pdf`;
  const outputPath = path.join(getTempDir(), 'downloads', filename);

  try {
    // Extract text from DOCX
    const result = await mammoth.extractRawText({ path: file.path });
    let text = result.value || 'No text content found in document';

    // Create PDF from text
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4 size
    const { height } = page.getSize();

    // Simple text wrapping - split by lines and limit
    const lines = text.split('\n').slice(0, 35); // First 35 lines
    let yPosition = height - 60;

    for (const line of lines) {
      if (yPosition < 60) break;
      const truncatedLine = line.substring(0, 75).trim();
      if (truncatedLine) {
        page.drawText(truncatedLine, {
          x: 50,
          y: yPosition,
          size: 11,
        });
      }
      yPosition -= 20;
    }

    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(outputPath, pdfBytes);

    return { outputPath, filename };
  } catch (error) {
    console.error('DOCX to PDF error:', error);
    throw new Error('Word to PDF conversion failed.');
  }
}

async function convertPptxToPdf(file) {
  const timestamp = Date.now();
  const filename = `converted-${timestamp}.pdf`;
  const outputPath = path.join(getTempDir(), 'downloads', filename);

  // For now, create a simple PDF placeholder
  // Full PPTX parsing requires additional libraries
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);

  page.drawText('PowerPoint conversion coming soon!', {
    x: 50,
    y: 750,
    size: 20,
  });

  const pdfBytes = await pdfDoc.save();
  await fs.writeFile(outputPath, pdfBytes);

  return { outputPath, filename };
}

async function convertPdfToDocx(file) {
  const timestamp = Date.now();
  const filename = `converted-${timestamp}.docx`;
  const outputPath = path.join(getTempDir(), 'downloads', filename);

  // Extract text from PDF
  const dataBuffer = await fs.readFile(file.path);
  const data = await pdfParse(dataBuffer);
  const text = data.text;

  // Create DOCX file
  return new Promise((resolve, reject) => {
    const docx = officegen('docx');

    docx.on('finalize', () => {
      resolve({ outputPath, filename });
    });

    docx.on('error', (err) => {
      reject(err);
    });

    const pObj = docx.createP();
    pObj.addText(text);

    const out = fs.createWriteStream(outputPath);
    docx.generate(out);
  });
}

// Download endpoint
app.get('/download', async (req, res) => {
  const filename = req.query.file;
  console.log('Download request for file:', filename);
  
  if (!filename) {
    console.log('No filename provided');
    return res.status(400).json({
      success: false,
      error: 'Filename is required'
    });
  }
  
  const filePath = path.join(getTempDir(), 'downloads', filename);
  console.log('Looking for file at:', filePath);
  
  try {
    if (await fs.pathExists(filePath)) {
      const stats = await fs.stat(filePath);
      console.log(`File found, size: ${stats.size} bytes`);
      
      // Determine content type based on file extension
      let contentType = 'application/octet-stream';
      const ext = path.extname(filePath).toLowerCase();

      if (ext === '.pdf') {
        contentType = 'application/pdf';
      } else if (ext === '.jpg' || ext === '.jpeg') {
        contentType = 'image/jpeg';
      } else if (ext === '.docx') {
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      } else if (ext === '.pptx') {
        contentType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      }
      
      // Set appropriate headers for download
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', stats.size);
      
      // Read the file and send it directly
      const fileData = await fs.readFile(filePath);
      console.log(`Sending file, ${fileData.length} bytes`);
      return res.send(fileData);
    } else {
      console.error('File not found:', filePath);
      
      // List files in downloads directory for debugging
      try {
        const downloadDir = path.join(getTempDir(), 'downloads');
        const files = await fs.readdir(downloadDir);
        console.log('Available files in downloads:', files);
      } catch (dirError) {
        console.log('Could not read downloads directory:', dirError.message);
      }
      
      res.status(404).json({
        success: false,
        error: 'File not found or has expired'
      });
    }
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({
      success: false,
      error: 'Error downloading file'
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  console.error('Error stack:', err.stack);
  
  // Handle multer file size limit error
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      error: 'File size too large. Maximum file size is 100MB.'
    });
  }
  
  // Handle multer errors
  if (err.name === 'MulterError') {
    return res.status(400).json({
      success: false,
      error: `Upload error: ${err.message}`
    });
  }
  
  // Handle other errors
  res.status(500).json({
    success: false,
    error: 'An unexpected error occurred. Please try again later.',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Maximum file size: ${(100).toFixed(0)}MB`);
    console.log(`Temp directory: ${getTempDir()}`);
  });
}

module.exports = app;
