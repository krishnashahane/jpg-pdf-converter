document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initConverter();
});

function initNavigation() {
  const toggle = document.getElementById('nav-toggle');
  const menu = document.getElementById('nav-menu');

  if (toggle && menu) {
    toggle.addEventListener('click', () => {
      const isOpen = menu.classList.toggle('open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    menu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        menu.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }
}

function initConverter() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const jpgUploadArea = document.getElementById('jpg-upload-area');
  const pdfUploadArea = document.getElementById('pdf-upload-area');
  const jpgFileInput = document.getElementById('jpg-file-input');
  const pdfFileInput = document.getElementById('pdf-file-input');
  const jpgFileList = document.getElementById('jpg-file-list');
  const pdfFileList = document.getElementById('pdf-file-list');
  const jpgToPdfBtn = document.getElementById('jpg-to-pdf-btn');
  const pdfToJpgBtn = document.getElementById('pdf-to-jpg-btn');
  const resultContainer = document.getElementById('result-container');
  const downloadLink = document.getElementById('download-link');
  const newConversionBtn = document.getElementById('new-conversion-btn');
  const loadingOverlay = document.getElementById('loading-overlay');

  // Skip if the converter elements are not present on this page.
  if (!tabBtns.length || !tabContents.length || !jpgUploadArea || !pdfUploadArea || !jpgFileInput || !pdfFileInput || !jpgToPdfBtn || !pdfToJpgBtn || !resultContainer || !downloadLink || !newConversionBtn || !loadingOverlay || !jpgFileList || !pdfFileList) {
    return;
  }

  const jpgFiles = [];
  const pdfFiles = [];
  const MAX_FILE_SIZE = 100 * 1024 * 1024;

  const preferredTab = document.body.dataset.activeTab;
  if (preferredTab) {
    setActiveTab(preferredTab);
  } else {
    setActiveTab(tabBtns[0].dataset.tab);
  }

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      setActiveTab(btn.dataset.tab);
      resultContainer.style.display = 'none';
    });
  });

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    jpgUploadArea.addEventListener(eventName, preventDefaults, false);
    pdfUploadArea.addEventListener(eventName, preventDefaults, false);
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    jpgUploadArea.addEventListener(eventName, () => jpgUploadArea.classList.add('highlight'), false);
    pdfUploadArea.addEventListener(eventName, () => pdfUploadArea.classList.add('highlight'), false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    jpgUploadArea.addEventListener(eventName, () => jpgUploadArea.classList.remove('highlight'), false);
    pdfUploadArea.addEventListener(eventName, () => pdfUploadArea.classList.remove('highlight'), false);
  });

  jpgUploadArea.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    handleJpgFiles(files);
  }, false);

  pdfUploadArea.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    handlePdfFiles(files);
  }, false);

  jpgFileInput.addEventListener('change', () => handleJpgFiles(jpgFileInput.files));
  pdfFileInput.addEventListener('change', () => handlePdfFiles(pdfFileInput.files));

  document.querySelectorAll('.upload-btn').forEach(label => {
    label.addEventListener('click', (e) => e.stopPropagation());
  });

  jpgToPdfBtn.addEventListener('click', convertJpgToPdf);
  pdfToJpgBtn.addEventListener('click', convertPdfToJpg);
  newConversionBtn.addEventListener('click', () => {
    resultContainer.style.display = 'none';
    resetFileInputs();
  });

  function setActiveTab(tabId) {
    tabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
    tabContents.forEach(content => content.classList.toggle('active', content.id === tabId));
  }

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleJpgFiles(files) {
    const validFiles = Array.from(files).filter(file => {
      const validTypes = ['image/jpeg', 'image/jpg'];
      const fileType = file.type.toLowerCase();

      if (!validTypes.includes(fileType)) {
        alert(`File ${file.name} is not a JPG image. Only JPG/JPEG files are allowed.`);
        return false;
      }

      if (file.size > MAX_FILE_SIZE) {
        alert(`File ${file.name} exceeds the maximum size limit of 100MB.`);
        return false;
      }

      if (file.size === 0) {
        alert(`File ${file.name} is empty.`);
        return false;
      }

      return true;
    });

    validFiles.forEach(file => {
      jpgFiles.push(file);
      displayFileInList(file, jpgFileList, jpgFiles);
    });

    jpgToPdfBtn.disabled = jpgFiles.length === 0;
  }

  function handlePdfFiles(files) {
    pdfFiles.length = 0;
    pdfFileList.innerHTML = '';

    if (files.length === 0) {
      pdfToJpgBtn.disabled = true;
      return;
    }

    const file = files[0];

    if (!file.type.match('application/pdf')) {
      alert(`File ${file.name} is not a PDF.`);
      pdfToJpgBtn.disabled = true;
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      alert(`File ${file.name} exceeds the maximum size limit of 100MB.`);
      pdfToJpgBtn.disabled = true;
      return;
    }

    pdfFiles.push(file);
    displayFileInList(file, pdfFileList, pdfFiles);
    pdfToJpgBtn.disabled = false;
  }

  function displayFileInList(file, listElement, filesArray) {
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';

    const fileInfo = document.createElement('div');
    fileInfo.className = 'file-info';

    const fileIcon = document.createElement('i');
    fileIcon.className = file.type === 'application/pdf' ? 'fas fa-file-pdf file-icon' : 'fas fa-file-image file-icon';

    const fileName = document.createElement('span');
    fileName.className = 'file-name';
    fileName.textContent = file.name;

    const fileSize = document.createElement('span');
    fileSize.className = 'file-size';
    fileSize.textContent = formatFileSize(file.size);

    const removeBtn = document.createElement('i');
    removeBtn.className = 'fas fa-times remove-file';
    removeBtn.addEventListener('click', () => {
      const index = filesArray.indexOf(file);
      if (index !== -1) {
        filesArray.splice(index, 1);
        fileItem.remove();

        if (filesArray === jpgFiles) {
          jpgToPdfBtn.disabled = jpgFiles.length === 0;
        } else {
          pdfToJpgBtn.disabled = pdfFiles.length === 0;
        }
      }
    });

    fileInfo.appendChild(fileIcon);
    fileInfo.appendChild(fileName);
    fileInfo.appendChild(fileSize);
    fileItem.appendChild(fileInfo);
    fileItem.appendChild(removeBtn);
    listElement.appendChild(fileItem);
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  async function convertJpgToPdf() {
    if (jpgFiles.length === 0) return;
    showLoading();

    const formData = new FormData();
    jpgFiles.forEach(file => formData.append('images', file));

    try {
      const response = await fetch('/convert/jpg-to-pdf', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Server error: ${response.status}`);
      }

      if (data.success) {
        const downloadUrl = data.downloadPath;
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = '';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        if (window.va) {
          window.va('track', 'JPG to PDF Conversion', {
            files_count: jpgFiles.length,
            success: true
          });
        }

        resultContainer.style.display = 'block';
        downloadLink.href = downloadUrl;
      } else {
        if (window.va) {
          window.va('track', 'JPG to PDF Conversion', {
            files_count: jpgFiles.length,
            success: false,
            error: data.error
          });
        }
        throw new Error(data.error || 'Conversion failed');
      }
    } catch (error) {
      console.error('Error converting files:', error);
      alert(`Error: ${error.message}\n\nPlease make sure you're uploading valid JPG images.`);
    } finally {
      hideLoading();
    }
  }

  async function convertPdfToJpg() {
    if (pdfFiles.length === 0) return;
    showLoading();

    const formData = new FormData();
    formData.append('pdf', pdfFiles[0]);

    try {
      const response = await fetch('/convert/pdf-to-jpg', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        downloadLink.href = data.downloadPath;
        const hiddenDownloadLink = document.createElement('a');
        hiddenDownloadLink.href = data.downloadPath;
        hiddenDownloadLink.download = '';
        document.body.appendChild(hiddenDownloadLink);
        hiddenDownloadLink.click();
        document.body.removeChild(hiddenDownloadLink);

        if (window.va) {
          window.va('track', 'PDF to JPG Conversion', { success: true });
        }

        resultContainer.style.display = 'block';
      } else {
        if (window.va) {
          window.va('track', 'PDF to JPG Conversion', {
            success: false,
            error: data.error
          });
        }
        alert(data.error || 'Conversion failed: Unknown error');
      }
    } catch (error) {
      console.error('Error converting file:', error);
      alert('An error occurred during conversion. Please try again.');
    } finally {
      hideLoading();
    }
  }

  function showLoading() {
    loadingOverlay.style.display = 'flex';
  }

  function hideLoading() {
    loadingOverlay.style.display = 'none';
  }

  function resetFileInputs() {
    jpgFiles.length = 0;
    jpgFileList.innerHTML = '';
    jpgFileInput.value = '';
    jpgToPdfBtn.disabled = true;

    pdfFiles.length = 0;
    pdfFileList.innerHTML = '';
    pdfFileInput.value = '';
    pdfToJpgBtn.disabled = true;
  }
}
