// Modern Multi-Format Converter Script
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initModernConverter();
});

function initNavigation() {
  const toggle = document.getElementById('nav-toggle');
  const menu = document.getElementById('nav-menu');
  const navDropdown = document.querySelector('.nav-dropdown');

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

  // Mobile dropdown toggle
  if (navDropdown) {
    const navLinkMain = navDropdown.querySelector('.nav-link-main');
    if (navLinkMain && window.innerWidth <= 900) {
      navLinkMain.addEventListener('click', (e) => {
        e.preventDefault();
        navDropdown.classList.toggle('open');
      });
    }
  }
}

function initModernConverter() {
  const sourceFormat = document.getElementById('source-format');
  const targetFormat = document.getElementById('target-format');
  const fileInput = document.getElementById('file-input');
  const uploadArea = document.getElementById('upload-area');
  const uploadTitle = document.getElementById('upload-title');
  const uploadDescription = document.getElementById('upload-description');
  const filePreviewContainer = document.getElementById('file-preview-container');
  const filePreviews = document.getElementById('file-previews');
  const clearAllBtn = document.getElementById('clear-all-btn');
  const convertBtn = document.getElementById('convert-btn');
  const progressContainer = document.getElementById('progress-container');
  const progressText = document.getElementById('progress-text');
  const progressPercentage = document.getElementById('progress-percentage');
  const progressFill = document.getElementById('progress-fill');
  const resultContainer = document.getElementById('result-container');
  const downloadLink = document.getElementById('download-link');
  const newConversionBtn = document.getElementById('new-conversion-btn');

  // Skip if elements not present
  if (!sourceFormat || !targetFormat || !fileInput || !uploadArea) {
    return;
  }

  let selectedFiles = [];
  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
  const MAX_FILES = 20;

  // Format configurations
  const formatConfig = {
    jpg: { accept: '.jpg,.jpeg', icon: 'fa-image', label: 'JPG/JPEG', multiple: true },
    pdf: { accept: '.pdf', icon: 'fa-file-pdf', label: 'PDF', multiple: false },
    docx: { accept: '.doc,.docx', icon: 'fa-file-word', label: 'Word', multiple: false },
    pptx: { accept: '.ppt,.pptx', icon: 'fa-file-powerpoint', label: 'PowerPoint', multiple: false }
  };

  // Check URL parameters for preset formats
  function checkURLParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const fromParam = urlParams.get('from');
    const toParam = urlParams.get('to');

    if (fromParam && formatConfig[fromParam]) {
      sourceFormat.value = fromParam;
    }
    if (toParam && formatConfig[toParam]) {
      targetFormat.value = toParam;
    }
  }

  // Update UI when format changes
  function updateFormatUI() {
    const source = sourceFormat.value;
    const target = targetFormat.value;
    const config = formatConfig[source];

    fileInput.accept = config.accept;
    fileInput.multiple = config.multiple;

    uploadTitle.textContent = `Drop your ${config.label} file${config.multiple ? 's' : ''} here`;
    uploadDescription.textContent = config.multiple ?
      `or click to browse (up to ${MAX_FILES} files)` :
      'or click to browse';

    // Reset files when format changes
    selectedFiles = [];
    filePreviews.innerHTML = '';
    filePreviewContainer.style.display = 'none';
    convertBtn.disabled = true;
    resultContainer.style.display = 'none';
  }

  sourceFormat.addEventListener('change', updateFormatUI);
  targetFormat.addEventListener('change', updateFormatUI);

  // Load URL parameters first, then update UI
  checkURLParameters();
  updateFormatUI();

  // Drag and drop handlers
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    uploadArea.addEventListener(eventName, preventDefaults, false);
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    uploadArea.addEventListener(eventName, () => {
      uploadArea.classList.add('drag-over');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    uploadArea.addEventListener(eventName, () => {
      uploadArea.classList.remove('drag-over');
    }, false);
  });

  uploadArea.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    handleFiles(files);
  }, false);

  uploadArea.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    handleFiles(fileInput.files);
  });

  clearAllBtn.addEventListener('click', () => {
    selectedFiles = [];
    filePreviews.innerHTML = '';
    filePreviewContainer.style.display = 'none';
    convertBtn.disabled = true;
    fileInput.value = '';
  });

  let isConverting = false;

  convertBtn.addEventListener('click', async () => {
    if (isConverting) return; // Prevent double-click
    isConverting = true;
    await performConversion();
    isConverting = false;
  });

  newConversionBtn.addEventListener('click', () => {
    selectedFiles = [];
    filePreviews.innerHTML = '';
    filePreviewContainer.style.display = 'none';
    convertBtn.disabled = true;
    resultContainer.style.display = 'none';
    fileInput.value = '';
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleFiles(files) {
    const source = sourceFormat.value;
    const config = formatConfig[source];
    const fileArray = Array.from(files);

    // Validate files
    const validFiles = fileArray.filter(file => {
      // Check file type
      const fileName = file.name.toLowerCase();
      const acceptedExts = config.accept.split(',').map(ext => ext.trim());
      const hasValidExt = acceptedExts.some(ext => fileName.endsWith(ext.replace('.', '')));

      if (!hasValidExt) {
        showNotification(`File ${file.name} is not a valid ${config.label} file.`, 'error');
        return false;
      }

      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        showNotification(`File ${file.name} exceeds 100MB limit.`, 'error');
        return false;
      }

      if (file.size === 0) {
        showNotification(`File ${file.name} is empty.`, 'error');
        return false;
      }

      return true;
    });

    if (validFiles.length === 0) return;

    // Handle single vs multiple files
    if (!config.multiple) {
      selectedFiles = [validFiles[0]];
    } else {
      selectedFiles = [...selectedFiles, ...validFiles].slice(0, MAX_FILES);
    }

    renderFilePreviews();
    convertBtn.disabled = selectedFiles.length === 0;
  }

  function renderFilePreviews() {
    filePreviews.innerHTML = '';

    if (selectedFiles.length === 0) {
      filePreviewContainer.style.display = 'none';
      return;
    }

    filePreviewContainer.style.display = 'block';

    selectedFiles.forEach((file, index) => {
      const item = document.createElement('div');
      item.className = 'file-preview-item';

      const icon = getFileIcon(file.name);
      const size = formatFileSize(file.size);

      item.innerHTML = `
        <div class="file-icon">
          <i class="fas ${icon}"></i>
        </div>
        <div class="file-info">
          <div class="file-name">${file.name}</div>
          <div class="file-size">${size}</div>
        </div>
        <button class="file-remove" data-index="${index}" title="Remove file">
          <i class="fas fa-times"></i>
        </button>
      `;

      filePreviews.appendChild(item);
    });

    // Add remove handlers
    document.querySelectorAll('.file-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.currentTarget.dataset.index);
        selectedFiles.splice(index, 1);
        renderFilePreviews();
        convertBtn.disabled = selectedFiles.length === 0;
      });
    });
  }

  function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const iconMap = {
      jpg: 'fa-file-image',
      jpeg: 'fa-file-image',
      pdf: 'fa-file-pdf',
      doc: 'fa-file-word',
      docx: 'fa-file-word',
      ppt: 'fa-file-powerpoint',
      pptx: 'fa-file-powerpoint'
    };
    return iconMap[ext] || 'fa-file';
  }

  function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  async function performConversion() {
    if (selectedFiles.length === 0) return;

    const source = sourceFormat.value;
    const target = targetFormat.value;

    // Show progress and disable all controls
    convertBtn.disabled = true;
    convertBtn.style.opacity = '0.5';
    convertBtn.style.cursor = 'not-allowed';
    progressContainer.style.display = 'block';
    resultContainer.style.display = 'none';

    try {
      const formData = new FormData();

      selectedFiles.forEach(file => {
        formData.append('files', file);
      });

      formData.append('sourceFormat', source);
      formData.append('targetFormat', target);

      // Simulate progress
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress += Math.random() * 30;
        if (progress > 90) progress = 90;
        updateProgress(progress);
      }, 300);

      const response = await fetch('/convert/multi-format', {
        method: 'POST',
        body: formData
      });

      clearInterval(progressInterval);
      updateProgress(100);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Server response:', errorText);
        try {
          const error = JSON.parse(errorText);
          throw new Error(error.error || 'Conversion failed');
        } catch (e) {
          throw new Error(errorText || 'Conversion failed');
        }
      }

      const responseText = await response.text();
      console.log('Server response:', responseText);
      const result = JSON.parse(responseText);

      // Track analytics
      if (window.va) {
        window.va('track', 'Conversion', {
          from: source,
          to: target,
          files: selectedFiles.length
        });
      }

      // Hide progress, show result
      setTimeout(() => {
        progressContainer.style.display = 'none';
        resultContainer.style.display = 'block';
        downloadLink.href = result.downloadUrl;
        downloadLink.download = result.filename || 'converted-file';

        // Auto-download
        downloadLink.click();
      }, 500);

    } catch (error) {
      console.error('Conversion error:', error);
      showNotification(error.message || 'Conversion failed. Please try again.', 'error');
      progressContainer.style.display = 'none';
      convertBtn.disabled = selectedFiles.length === 0;
      convertBtn.style.opacity = '1';
      convertBtn.style.cursor = 'pointer';
    }
  }

  function updateProgress(percent) {
    const rounded = Math.round(percent);
    progressPercentage.textContent = rounded + '%';
    progressFill.style.width = rounded + '%';

    if (percent < 30) {
      progressText.textContent = 'Uploading files...';
    } else if (percent < 70) {
      progressText.textContent = 'Converting...';
    } else if (percent < 100) {
      progressText.textContent = 'Finalizing...';
    } else {
      progressText.textContent = 'Complete!';
    }
  }

  function showNotification(message, type = 'info') {
    // Simple alert for now - could be enhanced with a toast system
    alert(message);
  }
}
