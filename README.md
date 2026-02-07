# JPG/PDF Converter

A web application that allows users to convert JPG images to PDF and PDF files to JPG images. The application supports files up to 100MB in size.

## Features

- Convert multiple JPG images to a single PDF file
- Convert PDF files to JPG images
- Drag and drop file upload
- File size validation (max 100MB)
- Responsive design
- Modern and attractive UI

## Technologies Used

- Node.js
- Express
- pdf-lib (for JPG to PDF conversion)
- Sharp (for PDF to JPG conversion)
- HTML5/CSS3
- JavaScript (ES6+)

## Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Start the server:
   ```
   npm start
   ```
4. Open your browser and navigate to `http://localhost:3000`

## Development

To run the application in development mode with automatic reloading:

```
npm install -g nodemon
npm run dev
```

## Usage

1. Select the conversion type (JPG to PDF or PDF to JPG)
2. Upload your file(s) by dragging and dropping or using the file browser
3. Click the "Convert" button
4. Download the converted file

## Limitations

- PDF to JPG conversion supports up to 10 pages
- For very large PDFs, performance may be affected

## Browser Compatibility

This application works best in modern browsers:
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Deployment

### Deploy to Vercel

1. Install Vercel CLI:
   ```
   npm i -g vercel
   ```

2. Deploy the application:
   ```
   vercel
   ```

3. Follow the prompts to configure your deployment

### Alternative: Deploy with Git

1. Push your code to a GitHub repository
2. Import the repository on [Vercel Dashboard](https://vercel.com/new)
3. Vercel will automatically detect the configuration and deploy

## License

This project is open source and available under the MIT License. 