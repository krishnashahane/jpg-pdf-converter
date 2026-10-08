document.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  initConverter();
});

function initNavigation() {
  const toggle = document.getElementById("nav-toggle");
  const menu = document.getElementById("nav-menu");

  if (!toggle || !menu) return;

  toggle.addEventListener("click", () => {
    const open = menu.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });

  menu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      menu.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    });
  });
}

function initConverter() {
  const sourceFormat = document.getElementById("source-format");
  const targetFormat = document.getElementById("target-format");
  const fileInput = document.getElementById("file-input");
  const uploadArea = document.getElementById("upload-area");
  const uploadTitle = document.getElementById("upload-title");
  const uploadDescription = document.getElementById("upload-description");
  const filePreviewContainer = document.getElementById("file-preview-container");
  const filePreviews = document.getElementById("file-previews");
  const clearAllBtn = document.getElementById("clear-all-btn");
  const convertBtn = document.getElementById("convert-btn");
  const progressContainer = document.getElementById("progress-container");
  const progressText = document.getElementById("progress-text");
  const progressPercentage = document.getElementById("progress-percentage");
  const progressFill = document.getElementById("progress-fill");
  const resultContainer = document.getElementById("result-container");
  const downloadLink = document.getElementById("download-link");
  const newConversionBtn = document.getElementById("new-conversion-btn");

  if (
    !sourceFormat ||
    !targetFormat ||
    !fileInput ||
    !uploadArea ||
    !uploadTitle ||
    !uploadDescription ||
    !filePreviews ||
    !convertBtn
  ) {
    return;
  }

  const MAX_FILE_SIZE = 100 * 1024 * 1024;
  const MAX_FILES = 20;
  let selectedFiles = [];
  let converting = false;

  const configs = {
    jpg: {
      accept: ".jpg,.jpeg",
      label: "JPG/JPEG",
      multiple: true,
      target: "pdf",
    },
    pdf: {
      accept: ".pdf",
      label: "PDF",
      multiple: false,
      target: "jpg",
    },
  };

  const renderOptions = () => {
    const source = sourceFormat.value;
    const config = configs[source];

    targetFormat.value = config.target;
    targetFormat.disabled = true;
    fileInput.accept = config.accept;
    fileInput.multiple = config.multiple;

    uploadTitle.textContent = `Drop your ${config.label} file${config.multiple ? "s" : ""} here`;
    uploadDescription.textContent = config.multiple
      ? `or click to browse (up to ${MAX_FILES} images)`
      : "or click to browse";

    reset();
  };

  const reset = () => {
    selectedFiles = [];
    filePreviews.replaceChildren();
    filePreviewContainer.style.display = "none";
    resultContainer.style.display = "none";
    progressContainer.style.display = "none";
    convertBtn.disabled = true;
    fileInput.value = "";
  };

  const acceptedExtensions = () =>
    configs[sourceFormat.value].accept
      .split(",")
      .map((value) => value.trim().toLowerCase());

  const handleFiles = (files) => {
    const config = configs[sourceFormat.value];
    const extensions = acceptedExtensions();

    const valid = Array.from(files).filter((file) => {
      const lower = file.name.toLowerCase();
      const validExtension = extensions.some((ext) => lower.endsWith(ext));
      if (!validExtension) {
        showNotification(`${file.name} is not a valid ${config.label} file.`);
        return false;
      }
      if (!file.size) {
        showNotification(`${file.name} is empty.`);
        return false;
      }
      if (file.size > MAX_FILE_SIZE) {
        showNotification(`${file.name} exceeds the 100MB limit.`);
        return false;
      }
      return true;
    });

    if (!valid.length) return;

    selectedFiles = config.multiple
      ? [...selectedFiles, ...valid].slice(0, MAX_FILES)
      : [valid[0]];

    renderPreviews();
    convertBtn.disabled = selectedFiles.length === 0;
  };

  const renderPreviews = () => {
    filePreviews.replaceChildren();

    if (!selectedFiles.length) {
      filePreviewContainer.style.display = "none";
      return;
    }

    filePreviewContainer.style.display = "block";

    selectedFiles.forEach((file, index) => {
      const item = document.createElement("div");
      item.className = "file-preview-item";

      const icon = document.createElement("div");
      icon.className = "file-icon";
      const iconEl = document.createElement("i");
      iconEl.className = `fas ${sourceFormat.value === "pdf" ? "fa-file-pdf" : "fa-file-image"}`;
      icon.appendChild(iconEl);

      const info = document.createElement("div");
      info.className = "file-info";

      const name = document.createElement("div");
      name.className = "file-name";
      name.textContent = file.name;

      const size = document.createElement("div");
      size.className = "file-size";
      size.textContent = formatFileSize(file.size);

      info.append(name, size);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "file-remove";
      remove.dataset.index = String(index);
      remove.title = "Remove file";
      const removeIcon = document.createElement("i");
      removeIcon.className = "fas fa-times";
      remove.appendChild(removeIcon);

      item.append(icon, info, remove);
      filePreviews.appendChild(item);
    });

    filePreviews.querySelectorAll(".file-remove").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number.parseInt(button.dataset.index, 10);
        selectedFiles.splice(index, 1);
        renderPreviews();
        convertBtn.disabled = selectedFiles.length === 0;
      });
    });
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const setProgress = (value, text) => {
    const rounded = Math.round(value);
    progressPercentage.textContent = `${rounded}%`;
    progressFill.style.width = `${rounded}%`;
    progressText.textContent = text;
  };

  const downloadResult = (data) => {
    if (!data.downloadPath || !data.filename) {
      throw new Error("The server returned an invalid conversion result.");
    }

    downloadLink.href = data.downloadPath;
    downloadLink.download = data.filename;
    downloadLink.click();
  };

  const performConversion = async () => {
    if (!selectedFiles.length || converting) return;

    converting = true;
    convertBtn.disabled = true;
    progressContainer.style.display = "block";
    resultContainer.style.display = "none";
    setProgress(5, "Preparing files…");

    try {
      const formData = new FormData();
      const source = sourceFormat.value;
      const endpoint =
        source === "jpg" ? "/convert/jpg-to-pdf" : "/convert/pdf-to-jpg";

      if (source === "jpg") {
        selectedFiles.forEach((file) => formData.append("images", file));
      } else {
        formData.append("pdf", selectedFiles[0]);
      }

      setProgress(20, "Uploading…");

      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error("The server returned an invalid response.");
      }

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Conversion failed.");
      }

      setProgress(100, "Complete");
      downloadResult(data);

      setTimeout(() => {
        progressContainer.style.display = "none";
        resultContainer.style.display = "block";
      }, 250);
    } catch (error) {
      showNotification(error instanceof Error ? error.message : "Conversion failed.");
      progressContainer.style.display = "none";
    } finally {
      converting = false;
      convertBtn.disabled = selectedFiles.length === 0;
    }
  };

  const showNotification = (message) => {
    window.alert(message);
  };

  sourceFormat.addEventListener("change", renderOptions);
  targetFormat.addEventListener("change", renderOptions);
  clearAllBtn?.addEventListener("click", reset);
  newConversionBtn?.addEventListener("click", reset);

  ["dragenter", "dragover"].forEach((eventName) => {
    uploadArea.addEventListener(eventName, (event) => {
      event.preventDefault();
      uploadArea.classList.add("drag-over");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    uploadArea.addEventListener(eventName, (event) => {
      event.preventDefault();
      uploadArea.classList.remove("drag-over");
    });
  });

  uploadArea.addEventListener("drop", (event) => {
    handleFiles(event.dataTransfer.files);
  });

  uploadArea.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => handleFiles(fileInput.files));
  convertBtn.addEventListener("click", performConversion);

  const params = new URLSearchParams(window.location.search);
  const requestedSource = params.get("from");
  if (requestedSource === "pdf" || requestedSource === "jpg") {
    sourceFormat.value = requestedSource;
  }

  renderOptions();
});
