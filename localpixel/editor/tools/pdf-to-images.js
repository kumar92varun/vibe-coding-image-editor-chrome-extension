/* PDF to Images — converts each page of a PDF into a downloadable PNG */
(function () {

  /* ── state ── */
  let pdfDoc           = null;
  let totalPages       = 0;
  let pdfFileName      = '';
  let pages            = []; // { pageNum, selected, error }
  let brightness       = 0;
  let contrast         = 0;
  let renderCancelled  = false;
  let isPreparingDl    = false;

  /* ── element refs ── */
  const p2iBrowseBtn       = document.getElementById('p2iBrowseBtn');
  const p2iInput           = document.getElementById('p2iInput');
  const p2iModal           = document.getElementById('p2iModal');
  const p2iCloseBtn        = document.getElementById('p2iCloseBtn');
  const p2iGrid            = document.getElementById('p2iGrid');
  const p2iDownloadAllBtn  = document.getElementById('p2iDownloadAllBtn');
  const p2iSelectAllBtn    = document.getElementById('p2iSelectAllBtn');
  const p2iDeselectAllBtn  = document.getElementById('p2iDeselectAllBtn');
  const p2iDpiSelect       = document.getElementById('p2iDpiSelect');
  const p2iBrightnessSlider= document.getElementById('p2iBrightnessSlider');
  const p2iBrightnessVal   = document.getElementById('p2iBrightnessVal');
  const p2iContrastSlider  = document.getElementById('p2iContrastSlider');
  const p2iContrastVal     = document.getElementById('p2iContrastVal');
  const p2iResetBtn        = document.getElementById('p2iResetBtn');
  const p2iProgress        = document.getElementById('p2iProgress');
  const p2iProgressFill    = document.getElementById('p2iProgressFill');
  const p2iProgressText    = document.getElementById('p2iProgressText');

  /* ── PDF.js worker is already configured by images-to-pdf.js ── */
  const pdfjsLib = window.pdfjsLib;

  /* ── entry point ── */
  p2iBrowseBtn.addEventListener('click', () => p2iInput.click());

  p2iInput.addEventListener('change', () => {
    const file = p2iInput.files[0];
    if (!file) return;
    p2iInput.value = '';
    loadPdf(file);
  });

  /* ── load PDF ── */
  async function loadPdf(file) {
    renderCancelled = true;
    if (pdfDoc) { pdfDoc.destroy().catch(() => {}); pdfDoc = null; }

    pdfFileName = file.name;
    pages = [];
    p2iGrid.innerHTML = '';
    setBrowseBusy(true);

    try {
      const buf = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: buf });

      loadingTask.onPassword = (callback, reason) => {
        const msg = reason === 2
          ? 'Incorrect password. Enter the PDF password:'
          : 'This PDF is password protected. Enter the password:';
        const pwd = window.prompt(msg);
        if (pwd === null) { loadingTask.destroy(); setBrowseBusy(false); return; }
        callback(pwd);
      };

      pdfDoc = await loadingTask.promise;
      totalPages = pdfDoc.numPages;

      pages = Array.from({ length: totalPages }, (_, i) => ({
        pageNum: i + 1,
        selected: true,
        error: false,
      }));

      resetControls();
      p2iModal.classList.remove('hidden');
      updateDownloadAllBtn();
      updateSelectionBtns();
      await renderThumbnails();

    } catch (err) {
      if (!renderCancelled && err.name !== 'PasswordException') {
        console.error('PDF load error:', err);
        alert('Failed to load PDF. The file may be corrupted.');
      }
    } finally {
      setBrowseBusy(false);
    }
  }

  /* ── render thumbnails progressively ── */
  async function renderThumbnails() {
    renderCancelled = false;
    showProgress(true);

    for (let i = 0; i < totalPages; i++) {
      if (renderCancelled) break;

      p2iGrid.appendChild(createCard(i));
      p2iProgressText.textContent = `Rendering page ${i + 1} of ${totalPages}…`;

      try {
        const dataUrl = await renderPageAtScale(pdfDoc, i + 1, 0.5);
        if (renderCancelled) break;
        updateCardThumbnail(i, dataUrl);
      } catch {
        if (renderCancelled) break;
        pages[i].error = true;
        updateCardError(i);
      }

      p2iProgressFill.style.width = `${Math.round(((i + 1) / totalPages) * 100)}%`;
    }

    showProgress(false);
  }

  /* ── card DOM ── */
  function createCard(idx) {
    const label = padPage(idx + 1, totalPages);
    const card  = document.createElement('div');
    card.className = 'p2i-card p2i-card--selected';
    card.dataset.idx = idx;
    card.innerHTML = `
      <div class="p2i-thumb-wrap">
        <div class="p2i-check-badge"><div class="p2i-check-inner"></div></div>
        <div class="p2i-thumb-placeholder"></div>
      </div>
      <div class="p2i-card-footer">
        <span class="p2i-page-label">Page ${label}</span>
        <button class="p2i-dl-btn" title="Download page ${idx + 1}">
          <svg class="icon" viewBox="0 0 20 20" fill="none">
            <path d="M10 3v10M6 9l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M3 15h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>`;

    card.addEventListener('click', e => {
      if (e.target.closest('.p2i-dl-btn')) return;
      togglePage(idx);
    });

    card.querySelector('.p2i-dl-btn').addEventListener('click', e => {
      e.stopPropagation();
      downloadSinglePage(idx);
    });

    return card;
  }

  function updateCardThumbnail(idx, dataUrl) {
    const card = p2iGrid.querySelector(`[data-idx="${idx}"]`);
    if (!card) return;
    const wrap = card.querySelector('.p2i-thumb-wrap');
    const b = (brightness + 100) / 100;
    const c = (contrast   + 100) / 100;
    const badge = wrap.querySelector('.p2i-check-badge').outerHTML;
    wrap.innerHTML = badge +
      `<img src="${dataUrl}" class="p2i-thumb-img" style="filter:brightness(${b}) contrast(${c})" alt="Page ${idx + 1}" />`;
  }

  function updateCardError(idx) {
    const card = p2iGrid.querySelector(`[data-idx="${idx}"]`);
    if (!card) return;
    const wrap  = card.querySelector('.p2i-thumb-wrap');
    const badge = wrap.querySelector('.p2i-check-badge').outerHTML;
    wrap.innerHTML = badge + `<div class="p2i-thumb-error">Failed to render</div>`;
    card.querySelector('.p2i-dl-btn').disabled = true;
  }

  /* ── selection ── */
  function togglePage(idx) {
    if (pages[idx].error) return;
    pages[idx].selected = !pages[idx].selected;
    const card = p2iGrid.querySelector(`[data-idx="${idx}"]`);
    card.classList.toggle('p2i-card--selected', pages[idx].selected);
    updateDownloadAllBtn();
    updateSelectionBtns();
  }

  p2iSelectAllBtn.addEventListener('click', () => {
    pages.forEach((p, i) => {
      if (p.error) return;
      p.selected = true;
      p2iGrid.querySelector(`[data-idx="${i}"]`)?.classList.add('p2i-card--selected');
    });
    updateDownloadAllBtn();
    updateSelectionBtns();
  });

  p2iDeselectAllBtn.addEventListener('click', () => {
    pages.forEach((p, i) => {
      p.selected = false;
      p2iGrid.querySelector(`[data-idx="${i}"]`)?.classList.remove('p2i-card--selected');
    });
    updateDownloadAllBtn();
    updateSelectionBtns();
  });

  function updateDownloadAllBtn() {
    const n = pages.filter(p => p.selected).length;
    const disabled = n === 0 || isPreparingDl;
    p2iDownloadAllBtn.disabled = disabled;
    if (!isPreparingDl) {
      p2iDownloadAllBtn.innerHTML =
        `<svg class="icon" viewBox="0 0 20 20" fill="none"><path d="M10 3v10M6 9l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 15h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Download All (${n})`;
    }
  }

  function updateSelectionBtns() {
    const validPages = pages.filter(p => !p.error);
    p2iSelectAllBtn.disabled   = validPages.length > 0 && validPages.every(p => p.selected);
    p2iDeselectAllBtn.disabled = validPages.every(p => !p.selected);
  }

  /* ── brightness / contrast ── */
  p2iBrightnessSlider.addEventListener('input', () => {
    brightness = parseInt(p2iBrightnessSlider.value, 10);
    p2iBrightnessVal.textContent = brightness;
    applyPreviewFilter();
  });

  p2iContrastSlider.addEventListener('input', () => {
    contrast = parseInt(p2iContrastSlider.value, 10);
    p2iContrastVal.textContent = contrast;
    applyPreviewFilter();
  });

  p2iResetBtn.addEventListener('click', () => {
    brightness = 0; contrast = 0;
    p2iBrightnessSlider.value = 0; p2iBrightnessVal.textContent = '0';
    p2iContrastSlider.value   = 0; p2iContrastVal.textContent   = '0';
    applyPreviewFilter();
  });

  function applyPreviewFilter() {
    const b = (brightness + 100) / 100;
    const c = (contrast   + 100) / 100;
    p2iGrid.querySelectorAll('.p2i-thumb-img').forEach(img => {
      img.style.filter = `brightness(${b}) contrast(${c})`;
    });
  }

  /* ── download single page ── */
  async function downloadSinglePage(idx) {
    if (pages[idx].error || !pdfDoc) return;
    const padded   = padPage(idx + 1, totalPages);
    const base     = pdfFileName.replace(/\.pdf$/i, '');
    const filename = `${base}-page-${padded}.png`;
    const dataUrl  = await renderForDownload(idx + 1);
    triggerDownload(dataUrl, filename);
  }

  /* ── download all ── */
  p2iDownloadAllBtn.addEventListener('click', async () => {
    if (isPreparingDl || !pdfDoc) return;
    const selected = pages.map((p, i) => ({ ...p, idx: i })).filter(p => p.selected && !p.error);
    if (!selected.length) return;

    isPreparingDl = true;
    p2iDownloadAllBtn.disabled = true;
    p2iDownloadAllBtn.innerHTML =
      `<svg class="icon" viewBox="0 0 20 20" fill="none"><path d="M10 3v10M6 9l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 15h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Preparing…`;

    showProgress(true);
    const base      = pdfFileName.replace(/\.pdf$/i, '');
    const downloads = [];

    for (let i = 0; i < selected.length; i++) {
      if (renderCancelled) break;
      const page = selected[i];
      p2iProgressText.textContent = `Preparing page ${page.pageNum} of ${totalPages}…`;

      try {
        const dataUrl  = await renderForDownload(page.pageNum);
        const padded   = padPage(page.pageNum, totalPages);
        downloads.push({ dataUrl, filename: `${base}-page-${padded}.png` });
      } catch {
        if (renderCancelled) break;
      }

      p2iProgressFill.style.width = `${Math.round(((i + 1) / selected.length) * 100)}%`;
    }

    downloads.forEach(({ dataUrl, filename }) => triggerDownload(dataUrl, filename));

    showProgress(false);
    isPreparingDl = false;
    updateDownloadAllBtn();
  });

  /* ── render helpers ── */
  async function renderForDownload(pageNum) {
    const dpi   = parseInt(p2iDpiSelect.value, 10);
    const scale = dpi / 72;
    const raw   = await renderPageAtScale(pdfDoc, pageNum, scale);
    return applyAdjustments(raw, brightness, contrast);
  }

  function renderPageAtScale(doc, pageNum, scale) {
    return doc.getPage(pageNum).then(page => {
      const vp     = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width  = vp.width;
      canvas.height = vp.height;
      return page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise
        .then(() => canvas.toDataURL('image/png'));
    });
  }

  function applyAdjustments(dataUrl, b, c) {
    return new Promise(resolve => {
      if (b === 0 && c === 0) { resolve(dataUrl); return; }
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width  = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.filter = `brightness(${(b + 100) / 100}) contrast(${(c + 100) / 100})`;
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = dataUrl;
    });
  }

  function triggerDownload(dataUrl, filename) {
    const a = document.createElement('a');
    a.href     = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  /* ── close ── */
  p2iCloseBtn.addEventListener('click', closeModal);
  p2iModal.addEventListener('click', e => { if (e.target === p2iModal) closeModal(); });

  function closeModal() {
    renderCancelled = true;
    isPreparingDl   = false;
    p2iModal.classList.add('hidden');
    if (pdfDoc) { pdfDoc.destroy().catch(() => {}); pdfDoc = null; }
    pages = [];
    p2iGrid.innerHTML = '';
    showProgress(false);
    resetControls();
    updateDownloadAllBtn();
    updateSelectionBtns();
  }

  /* ── utilities ── */
  function padPage(num, total) {
    const digits = Math.max(String(total).length, 2);
    return String(num).padStart(digits, '0');
  }

  function showProgress(visible) {
    p2iProgress.classList.toggle('hidden', !visible);
    if (!visible) {
      p2iProgressFill.style.width = '0%';
      p2iProgressText.textContent = '';
    }
  }

  function resetControls() {
    brightness = 0; contrast = 0;
    p2iBrightnessSlider.value = 0; p2iBrightnessVal.textContent = '0';
    p2iContrastSlider.value   = 0; p2iContrastVal.textContent   = '0';
    p2iDpiSelect.value = '150';
  }

  function setBrowseBusy(busy) {
    p2iBrowseBtn.disabled = busy;
    p2iBrowseBtn.innerHTML = busy
      ? 'Loading…'
      : '<svg class="icon" viewBox="0 0 20 20" fill="none"><path d="M3 4h14M3 8h8M3 12h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Browse PDF';
  }

})();
