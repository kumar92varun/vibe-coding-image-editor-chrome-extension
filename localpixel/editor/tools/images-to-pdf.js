/* Images / PDFs to PDF secondary feature */
(function () {

  /* ── state ── */
  // image entry : { type:'image',    file, handle, dataUrl, name, brightness, contrast }
  // pdf-page entry: { type:'pdf-page', sourceName, sourceBuffer, pageIndex, thumbnailDataUrl, name }
  let imageFiles = [];
  let selectedSet = new Set();
  let dragSrcIdx = null;

  /* ── element refs ── */
  const pdfImageInput        = document.getElementById('pdfImageInput');
  const pdfBrowseBtn         = document.getElementById('pdfBrowseBtn');
  const pdfFileCount         = document.getElementById('pdfFileCount');
  const pdfModal             = document.getElementById('pdfModal');
  const pdfImageList         = document.getElementById('pdfImageList');
  const pdfDownloadBtn       = document.getElementById('pdfDownloadBtn');
  const pdfModalClose        = document.getElementById('pdfModalCloseBtn');
  const pdfBulkDownloadBtn   = document.getElementById('pdfBulkDownloadBtn');
  const pdfOverwriteBtn      = document.getElementById('pdfOverwriteBtn');

  const pdfBrightnessSlider  = document.getElementById('pdfBrightnessSlider');
  const pdfBrightnessVal     = document.getElementById('pdfBrightnessVal');
  const pdfContrastSlider    = document.getElementById('pdfContrastSlider');
  const pdfContrastVal       = document.getElementById('pdfContrastVal');
  const pdfAdjResetBtn       = document.getElementById('pdfAdjResetBtn');
  const pdfAdjScope          = document.getElementById('pdfAdjScope');
  const pdfClearSelectionBtn = document.getElementById('pdfClearSelectionBtn');

  const pdfAddMoreBtn        = document.getElementById('pdfAddMoreBtn');

  const pdfPaddingModal = document.getElementById('pdfPaddingModal');
  const padChoiceNo     = document.getElementById('padChoiceNo');
  const padChoiceYes    = document.getElementById('padChoiceYes');
  const padInputs       = document.getElementById('padInputs');
  const padH            = document.getElementById('padH');
  const padV            = document.getElementById('padV');
  const padGenerateBtn  = document.getElementById('padGenerateBtn');
  const padCancelBtn    = document.getElementById('padCancelBtn');

  /* ── PDF.js setup ── */
  const pdfjsLib = window.pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('vendor/pdf.worker.min.js');

  /* ── browse ── */
  pdfBrowseBtn.addEventListener('click', async () => {
    if (window.showOpenFilePicker) {
      try {
        const handles = await window.showOpenFilePicker({
          multiple: true,
          types: [{
            description: 'Images & PDFs',
            accept: {
              'image/jpeg': ['.jpg', '.jpeg'],
              'image/png':  ['.png'],
              'image/webp': ['.webp'],
              'application/pdf': ['.pdf'],
            },
          }],
        });
        const entries = await Promise.all(handles.map(async h => ({ file: await h.getFile(), handle: h })));
        loadFiles(entries);
      } catch (err) {
        if (err.name !== 'AbortError') console.error(err);
      }
    } else {
      pdfImageInput.click();
    }
  });

  pdfImageInput.addEventListener('change', () => {
    const files = Array.from(pdfImageInput.files);
    if (!files.length) return;
    loadFiles(files.map(f => ({ file: f, handle: null })));
    pdfImageInput.value = '';
  });

  /* ── Add More Files (inside modal) ── */
  pdfAddMoreBtn.addEventListener('click', async () => {
    if (window.showOpenFilePicker) {
      try {
        const handles = await window.showOpenFilePicker({
          multiple: true,
          types: [{
            description: 'Images & PDFs',
            accept: {
              'image/jpeg': ['.jpg', '.jpeg'],
              'image/png':  ['.png'],
              'image/webp': ['.webp'],
              'application/pdf': ['.pdf'],
            },
          }],
        });
        const entries = await Promise.all(handles.map(async h => ({ file: await h.getFile(), handle: h })));
        loadFiles(entries);
      } catch (err) {
        if (err.name !== 'AbortError') console.error(err);
      }
    } else {
      pdfImageInput.click();
    }
  });

  function loadFiles(entries) {
    setBrowseBusy(true);
    const loaders = entries.map(({ file, handle }) =>
      (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))
        ? loadPdfEntry(file)
        : loadImageEntry(file, handle)
    );

    Promise.all(loaders)
      .then(results => {
        imageFiles = imageFiles.concat(results.flat());
        updateCount();
        selectedSet.clear();
        updateScopeUI();
        renderList();
        pdfModal.classList.remove('hidden');
      })
      .catch(err => console.error('Load failed:', err))
      .finally(() => setBrowseBusy(false));
  }

  function setBrowseBusy(busy) {
    pdfBrowseBtn.disabled = busy;
    pdfBrowseBtn.textContent = busy ? 'Loading…' : '';
    if (!busy) {
      pdfBrowseBtn.innerHTML =
        '<svg class="icon" viewBox="0 0 20 20" fill="none"><path d="M3 4h14M3 8h8M3 12h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Browse Files';
    }
  }

  function loadImageEntry(file, handle) {
    return new Promise(resolve => {
      const fr = new FileReader();
      fr.onload = e => resolve([{
        type: 'image', file, handle,
        dataUrl: e.target.result,
        name: file.name,
        brightness: 0, contrast: 0,
      }]);
      fr.readAsDataURL(file);
    });
  }

  async function loadPdfEntry(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer.slice() }).promise;
    const pageCount = pdfDoc.numPages;
    const pages = [];
    for (let i = 0; i < pageCount; i++) {
      const thumbnailDataUrl = await renderPageThumbnail(pdfDoc, i + 1);
      pages.push({
        type: 'pdf-page',
        sourceName: file.name,
        sourceBuffer: arrayBuffer,
        pageIndex: i,
        thumbnailDataUrl,
        name: pageCount === 1 ? file.name : `${file.name} — p.${i + 1}`,
      });
    }
    return pages;
  }

  async function renderPageThumbnail(pdfDoc, pageNumber) {
    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 0.35 });
    const canvas = document.createElement('canvas');
    canvas.width  = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.75);
  }

  function updateCount() {
    const total = imageFiles.length;
    if (total === 0) {
      pdfFileCount.classList.add('hidden');
      return;
    }
    const imgs = imageFiles.filter(f => f.type === 'image').length;
    const pages = total - imgs;
    let text;
    if (imgs > 0 && pages > 0) {
      text = `${imgs} image${imgs > 1 ? 's' : ''} + ${pages} PDF page${pages > 1 ? 's' : ''}`;
    } else if (imgs > 0) {
      text = `${imgs} image${imgs > 1 ? 's' : ''} selected`;
    } else {
      text = `${pages} PDF page${pages > 1 ? 's' : ''} selected`;
    }
    pdfFileCount.textContent = text;
    pdfFileCount.classList.remove('hidden');
  }

  pdfModalClose.addEventListener('click', () => pdfModal.classList.add('hidden'));
  pdfModal.addEventListener('click', e => {
    if (e.target === pdfModal) pdfModal.classList.add('hidden');
  });

  /* ── bulk download — images only ── */
  pdfBulkDownloadBtn.addEventListener('click', async () => {
    const imageItems = imageFiles.filter(f => f.type === 'image');
    if (!imageItems.length) return;
    const origHTML = pdfBulkDownloadBtn.innerHTML;
    pdfBulkDownloadBtn.textContent = 'Downloading…';
    pdfBulkDownloadBtn.disabled = true;
    for (const img of imageItems) {
      const dataUrl = await applyAdjustments(img.dataUrl, img.brightness, img.contrast);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = img.name;
      a.click();
      await new Promise(r => setTimeout(r, 150));
    }
    pdfBulkDownloadBtn.innerHTML = origHTML;
    pdfBulkDownloadBtn.disabled = false;
  });

  /* ── bulk overwrite — images with handles only ── */
  pdfOverwriteBtn.addEventListener('click', async () => {
    const withHandles = imageFiles.filter(f => f.type === 'image' && f.handle);
    const origHTML = pdfOverwriteBtn.innerHTML;
    if (!withHandles.length) {
      pdfOverwriteBtn.textContent = 'Use Browse to enable overwrite';
      pdfOverwriteBtn.disabled = true;
      setTimeout(() => { pdfOverwriteBtn.innerHTML = origHTML; pdfOverwriteBtn.disabled = false; }, 2000);
      return;
    }
    pdfOverwriteBtn.textContent = 'Saving…';
    pdfOverwriteBtn.disabled = true;
    for (const img of withHandles) {
      const dataUrl = await applyAdjustments(img.dataUrl, img.brightness, img.contrast);
      const blob = await (await fetch(dataUrl)).blob();
      try {
        const writable = await img.handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } catch (err) {
        console.error('Failed to overwrite', img.name, err);
      }
    }
    const n = withHandles.length;
    pdfOverwriteBtn.textContent = `Saved ${n} file${n > 1 ? 's' : ''}!`;
    setTimeout(() => { pdfOverwriteBtn.innerHTML = origHTML; pdfOverwriteBtn.disabled = false; }, 1500);
  });

  /* ── render list ── */
  function renderList() {
    pdfImageList.innerHTML = '';
    imageFiles.forEach((item, idx) => pdfImageList.appendChild(makeCard(item, idx)));
    applyPreviewFilter();
  }

  function makeCard(item, idx) {
    const card = document.createElement('div');
    card.className = 'pdf-image-card';
    if (item.type === 'pdf-page') card.classList.add('pdf-page-card');
    card.dataset.idx = idx;
    if (selectedSet.has(idx)) card.classList.add('selected');

    const indicator = document.createElement('div');
    indicator.className = 'pdf-card-select-indicator';
    indicator.textContent = '✓';
    card.appendChild(indicator);

    const wrap = document.createElement('div');
    wrap.className = 'pdf-card-thumb-wrap';

    const imgEl = document.createElement('img');
    imgEl.src = item.type === 'image' ? item.dataUrl : item.thumbnailDataUrl;
    imgEl.alt = item.name;
    wrap.appendChild(imgEl);

    if (item.type === 'pdf-page') {
      const badge = document.createElement('div');
      badge.className = 'pdf-page-badge';
      badge.textContent = `p.${item.pageIndex + 1}`;
      wrap.appendChild(badge);
    }

    const removeBtn = document.createElement('button');
    removeBtn.className = 'pdf-card-remove';
    removeBtn.title = 'Remove';
    removeBtn.innerHTML = '&times;';
    removeBtn.addEventListener('click', e => {
      e.stopPropagation();
      selectedSet.delete(idx);
      imageFiles.splice(idx, 1);
      updateCount();
      selectedSet.clear();
      updateScopeUI();
      renderList();
      if (imageFiles.length === 0) pdfModal.classList.add('hidden');
    });
    wrap.appendChild(removeBtn);

    /* clicking the thumb area opens lightbox; remove btn is excluded */
    wrap.addEventListener('click', e => {
      if (e.target.closest('.pdf-card-remove')) return;
      e.stopPropagation();
      openLightbox(item);
    });

    const pageLabel = document.createElement('div');
    pageLabel.className = 'pdf-card-page';
    pageLabel.textContent = `Page ${idx + 1}`;

    const nameEl = document.createElement('div');
    nameEl.className = 'pdf-card-name';
    nameEl.textContent = item.type === 'pdf-page'
      ? `${item.sourceName} p.${item.pageIndex + 1}`
      : item.name;

    card.appendChild(wrap);
    card.appendChild(pageLabel);
    card.appendChild(nameEl);

    /* selection — thumb area is handled by wrap listener above */
    card.addEventListener('click', e => {
      if (e.target.closest('.pdf-card-remove')) return;
      if (e.target.closest('.pdf-card-thumb-wrap')) return;
      if (selectedSet.has(idx)) {
        selectedSet.delete(idx);
        card.classList.remove('selected');
      } else {
        selectedSet.add(idx);
        card.classList.add('selected');
      }
      updateScopeUI();
      syncSlidersToSelection();
    });

    /* drag-to-reorder */
    card.draggable = true;
    card.addEventListener('dragstart', e => {
      dragSrcIdx = idx;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      document.querySelectorAll('.pdf-image-card').forEach(c =>
        c.classList.remove('drop-before', 'drop-after'));
    });
    card.addEventListener('dragover', e => {
      e.preventDefault();
      if (dragSrcIdx === idx) return;
      document.querySelectorAll('.pdf-image-card').forEach(c =>
        c.classList.remove('drop-before', 'drop-after'));
      const rect = card.getBoundingClientRect();
      card.classList.add(e.clientX < rect.left + rect.width / 2 ? 'drop-before' : 'drop-after');
    });
    card.addEventListener('dragleave', () => card.classList.remove('drop-before', 'drop-after'));
    card.addEventListener('drop', e => {
      e.preventDefault();
      if (dragSrcIdx === null || dragSrcIdx === idx) return;
      const rect = card.getBoundingClientRect();
      let insertIdx = e.clientX < rect.left + rect.width / 2 ? idx : idx + 1;
      const moved = imageFiles.splice(dragSrcIdx, 1)[0];
      if (dragSrcIdx < insertIdx) insertIdx--;
      imageFiles.splice(insertIdx, 0, moved);
      dragSrcIdx = null;
      selectedSet.clear();
      updateScopeUI();
      renderList();
      updateCount();
    });

    return card;
  }

  /* ── selection helpers ── */
  function updateScopeUI() {
    const n = selectedSet.size;
    const scopeItems = n === 0
      ? imageFiles
      : [...selectedSet].map(i => imageFiles[i]);
    const adjustable = scopeItems.filter(f => f.type === 'image').length;

    pdfBrightnessSlider.disabled = adjustable === 0;
    pdfContrastSlider.disabled   = adjustable === 0;
    pdfAdjResetBtn.disabled      = adjustable === 0;

    if (n === 0) {
      pdfAdjScope.textContent = 'All images';
      pdfAdjScope.classList.remove('has-selection');
      pdfClearSelectionBtn.classList.add('hidden');
    } else {
      pdfAdjScope.textContent = `${n} selected`;
      pdfAdjScope.classList.add('has-selection');
      pdfClearSelectionBtn.classList.remove('hidden');
    }
  }

  function syncSlidersToSelection() {
    if (selectedSet.size !== 1) return;
    const [i] = selectedSet;
    if (imageFiles[i].type !== 'image') return;
    pdfBrightnessSlider.value = imageFiles[i].brightness;
    pdfBrightnessVal.textContent = imageFiles[i].brightness;
    pdfContrastSlider.value = imageFiles[i].contrast;
    pdfContrastVal.textContent = imageFiles[i].contrast;
  }

  pdfClearSelectionBtn.addEventListener('click', () => {
    selectedSet.clear();
    document.querySelectorAll('.pdf-image-card').forEach(c => c.classList.remove('selected'));
    updateScopeUI();
  });

  /* ── preview filter (images only) ── */
  function applyPreviewFilter() {
    document.querySelectorAll('.pdf-image-card').forEach(card => {
      const i = parseInt(card.dataset.idx);
      const item = imageFiles[i];
      if (!item || item.type !== 'image') return;
      const imgEl = card.querySelector('img');
      if (!imgEl) return;
      const b = (item.brightness + 100) / 100;
      const c = (item.contrast   + 100) / 100;
      imgEl.style.filter = `brightness(${b}) contrast(${c})`;
    });
  }

  function applySliderValues() {
    const targets = selectedSet.size > 0
      ? [...selectedSet].filter(i => imageFiles[i].type === 'image')
      : imageFiles.map((f, i) => f.type === 'image' ? i : -1).filter(i => i >= 0);
    const b = parseInt(pdfBrightnessSlider.value, 10);
    const c = parseInt(pdfContrastSlider.value,   10);
    targets.forEach(i => { imageFiles[i].brightness = b; imageFiles[i].contrast = c; });
    applyPreviewFilter();
  }

  pdfBrightnessSlider.addEventListener('input', () => {
    pdfBrightnessVal.textContent = pdfBrightnessSlider.value;
    applySliderValues();
  });
  pdfContrastSlider.addEventListener('input', () => {
    pdfContrastVal.textContent = pdfContrastSlider.value;
    applySliderValues();
  });
  pdfAdjResetBtn.addEventListener('click', () => {
    pdfBrightnessSlider.value = 0; pdfBrightnessVal.textContent = '0';
    pdfContrastSlider.value   = 0; pdfContrastVal.textContent   = '0';
    applySliderValues();
  });

  /* ── canvas filter bake ── */
  function applyAdjustments(dataUrl, brightness, contrast) {
    return new Promise(resolve => {
      if (brightness === 0 && contrast === 0) { resolve(dataUrl); return; }
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width  = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.filter = `brightness(${(brightness + 100) / 100}) contrast(${(contrast + 100) / 100})`;
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL(dataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg', 0.92));
      };
      img.src = dataUrl;
    });
  }

  /* convert WebP / GIF to JPEG so pdf-lib can embed it */
  function normalizeToEmbeddable(dataUrl) {
    return new Promise(resolve => {
      if (dataUrl.startsWith('data:image/png') || dataUrl.startsWith('data:image/jpeg')) {
        resolve(dataUrl); return;
      }
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      };
      img.src = dataUrl;
    });
  }

  function dataUrlToBytes(dataUrl) {
    const raw = atob(dataUrl.split(',')[1]);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }

  /* ── padding dialog ── */
  let wantPadding = false;

  function openPaddingDialog() {
    wantPadding = false;
    padChoiceNo.classList.add('active');
    padChoiceYes.classList.remove('active');
    padInputs.classList.add('hidden');
    pdfPaddingModal.classList.remove('hidden');
  }

  pdfDownloadBtn.addEventListener('click', openPaddingDialog);

  padChoiceNo.addEventListener('click', () => {
    wantPadding = false;
    padChoiceNo.classList.add('active');
    padChoiceYes.classList.remove('active');
    padInputs.classList.add('hidden');
  });
  padChoiceYes.addEventListener('click', () => {
    wantPadding = true;
    padChoiceYes.classList.add('active');
    padChoiceNo.classList.remove('active');
    padInputs.classList.remove('hidden');
  });
  padCancelBtn.addEventListener('click', () => pdfPaddingModal.classList.add('hidden'));
  padGenerateBtn.addEventListener('click', () => {
    const hPad = wantPadding ? Math.max(0, parseFloat(padH.value) || 0) : 0;
    const vPad = wantPadding ? Math.max(0, parseFloat(padV.value) || 0) : 0;
    pdfPaddingModal.classList.add('hidden');
    generatePDF(hPad, vPad);
  });

  /* ── PDF generation via pdf-lib (lossless for PDF pages) ── */
  async function generatePDF(hPadMm, vPadMm) {
    if (!imageFiles.length) return;

    const origHTML = pdfDownloadBtn.innerHTML;
    pdfDownloadBtn.textContent = 'Generating…';
    pdfDownloadBtn.disabled = true;

    try {
      const { PDFDocument } = window.PDFLib;
      const MM_TO_PT = 2.8346;
      const PAGE_W   = 595.28; // A4 portrait in points
      const PAGE_H   = 841.89;
      const hPad     = hPadMm * MM_TO_PT;
      const vPad     = vPadMm * MM_TO_PT;

      const dest     = await PDFDocument.create();
      const pdfCache = new Map(); // sourceBuffer → loaded PDFDocument

      for (const f of imageFiles) {
        if (f.type === 'pdf-page') {
          let srcDoc = pdfCache.get(f.sourceBuffer);
          if (!srcDoc) {
            srcDoc = await PDFDocument.load(f.sourceBuffer);
            pdfCache.set(f.sourceBuffer, srcDoc);
          }
          const [page] = await dest.copyPages(srcDoc, [f.pageIndex]);
          dest.addPage(page);
        } else {
          let dataUrl = await applyAdjustments(f.dataUrl, f.brightness, f.contrast);
          dataUrl = await normalizeToEmbeddable(dataUrl);
          const bytes = dataUrlToBytes(dataUrl);
          const isPng = dataUrl.startsWith('data:image/png');
          const img   = isPng ? await dest.embedPng(bytes) : await dest.embedJpg(bytes);

          const availW = PAGE_W - hPad * 2;
          const availH = PAGE_H - vPad * 2;
          const { width, height } = img.scaleToFit(availW, availH);

          const page = dest.addPage([PAGE_W, PAGE_H]);
          page.drawImage(img, {
            x: hPad + (availW - width) / 2,
            y: vPad + (availH - height) / 2,
            width, height,
          });
        }
      }

      const bytes = await dest.save();
      const blob  = new Blob([bytes], { type: 'application/pdf' });
      const url   = URL.createObjectURL(blob);
      const a     = document.createElement('a');
      a.href      = url;
      a.download  = imageFiles.length === 1
        ? (imageFiles[0].type === 'pdf-page' ? imageFiles[0].sourceName : imageFiles[0].name)
            .replace(/\.[^.]+$/, '') + '.pdf'
        : 'merged.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF generation failed:', err);
    } finally {
      pdfDownloadBtn.innerHTML = origHTML;
      pdfDownloadBtn.disabled = false;
    }
  }

  /* ── Lightbox ── */
  const lbOverlay  = document.getElementById('pdfLightbox');
  const lbStage    = document.getElementById('pdfLbStage');
  const lbImg      = document.getElementById('pdfLbImg');
  const lbScaleLbl = document.getElementById('pdfLbScale');

  let lbState = { scale: 1, x: 0, y: 0 };
  let lbDrag  = null; // { startX, startY, tx, ty } while panning

  function lbSetTransform() {
    lbImg.style.transform = `translate(${lbState.x}px,${lbState.y}px) scale(${lbState.scale})`;
    lbScaleLbl.textContent = Math.round(lbState.scale * 100) + '%';
  }

  function lbFitToStage() {
    const sw = lbStage.clientWidth, sh = lbStage.clientHeight;
    const iw = lbImg.naturalWidth,   ih = lbImg.naturalHeight;
    if (!iw || !ih) return;
    const s = Math.min(sw / iw, sh / ih);
    lbState.scale = s;
    lbState.x = (sw - iw * s) / 2;
    lbState.y = (sh - ih * s) / 2;
    lbSetTransform();
  }

  async function openLightbox(item) {
    let src;
    if (item.type === 'image') {
      src = item.dataUrl;
    } else {
      /* re-render PDF page at 2× for crisp preview */
      if (!item._fullDataUrl) {
        const pdfDoc = await pdfjsLib.getDocument({ data: item.sourceBuffer.slice() }).promise;
        const page   = await pdfDoc.getPage(item.pageIndex + 1);
        const vp     = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        item._fullDataUrl = canvas.toDataURL('image/jpeg', 0.95);
      }
      src = item._fullDataUrl;
    }

    lbState = { scale: 1, x: 0, y: 0 };
    lbImg.src = '';
    lbOverlay.classList.remove('hidden');

    lbImg.onload = lbFitToStage;
    lbImg.src = src;
  }

  function closeLightbox() {
    lbOverlay.classList.add('hidden');
    lbImg.src = '';
  }

  document.getElementById('pdfLbClose').addEventListener('click', closeLightbox);
  lbOverlay.addEventListener('click', e => { if (e.target === lbOverlay) closeLightbox(); });

  document.addEventListener('keydown', e => {
    if (!lbOverlay.classList.contains('hidden') && e.key === 'Escape') closeLightbox();
  });

  function lbZoomAt(factor, pivotX, pivotY) {
    const newScale = Math.min(10, Math.max(0.05, lbState.scale * factor));
    lbState.x = pivotX - (pivotX - lbState.x) * (newScale / lbState.scale);
    lbState.y = pivotY - (pivotY - lbState.y) * (newScale / lbState.scale);
    lbState.scale = newScale;
    lbSetTransform();
  }

  function lbZoomCenter(factor) {
    lbZoomAt(factor, lbStage.clientWidth / 2, lbStage.clientHeight / 2);
  }

  document.getElementById('pdfLbZoomIn').addEventListener('click',  () => lbZoomCenter(1.25));
  document.getElementById('pdfLbZoomOut').addEventListener('click', () => lbZoomCenter(1 / 1.25));
  document.getElementById('pdfLbFit').addEventListener('click', lbFitToStage);

  lbStage.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = lbStage.getBoundingClientRect();
    lbZoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - rect.left, e.clientY - rect.top);
  }, { passive: false });

  lbStage.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    lbDrag = { startX: e.clientX, startY: e.clientY, tx: lbState.x, ty: lbState.y };
    lbStage.classList.add('dragging');
  });
  window.addEventListener('mousemove', e => {
    if (!lbDrag) return;
    lbState.x = lbDrag.tx + (e.clientX - lbDrag.startX);
    lbState.y = lbDrag.ty + (e.clientY - lbDrag.startY);
    lbSetTransform();
  });
  window.addEventListener('mouseup', () => {
    lbDrag = null;
    lbStage.classList.remove('dragging');
  });

})();

