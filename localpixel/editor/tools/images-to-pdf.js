/* Images-to-PDF secondary feature */
(function () {

  /* ── state ── */
  let imageFiles = [];   // { file, dataUrl, name, brightness, contrast }
  let selectedSet = new Set();
  let dragSrcIdx = null;

  /* ── element refs ── */
  const pdfImageInput      = document.getElementById('pdfImageInput');
  const pdfBrowseBtn       = document.getElementById('pdfBrowseBtn');
  const pdfFileCount       = document.getElementById('pdfFileCount');
  const pdfRenderBtn       = document.getElementById('pdfRenderBtn');
  const pdfModal           = document.getElementById('pdfModal');
  const pdfImageList       = document.getElementById('pdfImageList');
  const pdfDownloadBtn     = document.getElementById('pdfDownloadBtn');
  const pdfModalClose      = document.getElementById('pdfModalCloseBtn');

  const pdfBrightnessSlider  = document.getElementById('pdfBrightnessSlider');
  const pdfBrightnessVal     = document.getElementById('pdfBrightnessVal');
  const pdfContrastSlider    = document.getElementById('pdfContrastSlider');
  const pdfContrastVal       = document.getElementById('pdfContrastVal');
  const pdfAdjResetBtn       = document.getElementById('pdfAdjResetBtn');
  const pdfAdjScope          = document.getElementById('pdfAdjScope');
  const pdfClearSelectionBtn = document.getElementById('pdfClearSelectionBtn');

  const pdfPaddingModal = document.getElementById('pdfPaddingModal');
  const padChoiceNo     = document.getElementById('padChoiceNo');
  const padChoiceYes    = document.getElementById('padChoiceYes');
  const padInputs       = document.getElementById('padInputs');
  const padH            = document.getElementById('padH');
  const padV            = document.getElementById('padV');
  const padGenerateBtn  = document.getElementById('padGenerateBtn');
  const padCancelBtn    = document.getElementById('padCancelBtn');

  /* ── browse ── */
  pdfBrowseBtn.addEventListener('click', () => pdfImageInput.click());

  pdfImageInput.addEventListener('change', () => {
    const files = Array.from(pdfImageInput.files);
    if (!files.length) return;
    loadFiles(files);
    pdfImageInput.value = '';
  });

  function loadFiles(files) {
    const readers = files.map(file => new Promise(resolve => {
      const fr = new FileReader();
      fr.onload = e => resolve({
        file, dataUrl: e.target.result, name: file.name,
        brightness: 0, contrast: 0,
      });
      fr.readAsDataURL(file);
    }));
    Promise.all(readers).then(items => {
      imageFiles = imageFiles.concat(items);
      updateCount();
    });
  }

  function updateCount() {
    const n = imageFiles.length;
    pdfFileCount.textContent = n === 0 ? '0 images selected' : `${n} image${n > 1 ? 's' : ''} selected`;
    pdfFileCount.classList.toggle('hidden', false);
    pdfRenderBtn.classList.toggle('hidden', n === 0);
  }

  /* ── render modal ── */
  pdfRenderBtn.addEventListener('click', () => {
    selectedSet.clear();
    updateScopeUI();
    renderList();
    pdfModal.classList.remove('hidden');
  });

  pdfModalClose.addEventListener('click', () => pdfModal.classList.add('hidden'));

  pdfModal.addEventListener('click', e => {
    if (e.target === pdfModal) pdfModal.classList.add('hidden');
  });

  /* ── render image list ── */
  function renderList() {
    pdfImageList.innerHTML = '';
    imageFiles.forEach((img, idx) => {
      pdfImageList.appendChild(makeCard(img, idx));
    });
    applyPreviewFilter();
  }

  function makeCard(img, idx) {
    const card = document.createElement('div');
    card.className = 'pdf-image-card';
    card.dataset.idx = idx;
    if (selectedSet.has(idx)) card.classList.add('selected');

    /* selection indicator (top-left circle) */
    const indicator = document.createElement('div');
    indicator.className = 'pdf-card-select-indicator';
    indicator.textContent = '✓';
    card.appendChild(indicator);

    const wrap = document.createElement('div');
    wrap.className = 'pdf-card-thumb-wrap';

    const imgEl = document.createElement('img');
    imgEl.src = img.dataUrl;
    imgEl.alt = img.name;

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

    wrap.appendChild(imgEl);
    wrap.appendChild(removeBtn);

    const pageLabel = document.createElement('div');
    pageLabel.className = 'pdf-card-page';
    pageLabel.textContent = `Page ${idx + 1}`;

    const nameEl = document.createElement('div');
    nameEl.className = 'pdf-card-name';
    nameEl.textContent = img.name;

    card.appendChild(wrap);
    card.appendChild(pageLabel);
    card.appendChild(nameEl);

    /* ── selection click ── */
    card.addEventListener('click', e => {
      if (e.target.closest('.pdf-card-remove')) return;
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

    /* ── native drag-to-reorder ── */
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
    card.addEventListener('dragleave', () => {
      card.classList.remove('drop-before', 'drop-after');
    });
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

  /* when exactly one image is selected, snap sliders to its stored values */
  function syncSlidersToSelection() {
    if (selectedSet.size !== 1) return;
    const [i] = selectedSet;
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

  /* ── per-image preview filter ── */
  function applyPreviewFilter() {
    document.querySelectorAll('.pdf-image-card').forEach(card => {
      const i = parseInt(card.dataset.idx);
      const imgEl = card.querySelector('.pdf-card-thumb-wrap img');
      if (!imgEl || !imageFiles[i]) return;
      const b = (imageFiles[i].brightness + 100) / 100;
      const c = (imageFiles[i].contrast   + 100) / 100;
      imgEl.style.filter = `brightness(${b}) contrast(${c})`;
    });
  }

  /* apply slider value to selected images (or all if none selected) */
  function applySliderValues() {
    const targets = selectedSet.size > 0
      ? [...selectedSet]
      : imageFiles.map((_, i) => i);
    const b = parseInt(pdfBrightnessSlider.value, 10);
    const c = parseInt(pdfContrastSlider.value,   10);
    targets.forEach(i => {
      imageFiles[i].brightness = b;
      imageFiles[i].contrast   = c;
    });
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
    pdfBrightnessSlider.value = 0;  pdfBrightnessVal.textContent = '0';
    pdfContrastSlider.value   = 0;  pdfContrastVal.textContent   = '0';
    applySliderValues();
  });

  /* ── canvas adjustment (bakes filter into pixels for PDF output) ── */
  function applyAdjustments(dataUrl, brightness, contrast) {
    return new Promise(resolve => {
      if (brightness === 0 && contrast === 0) { resolve(dataUrl); return; }
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width  = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        const b = (brightness + 100) / 100;
        const c = (contrast   + 100) / 100;
        ctx.filter = `brightness(${b}) contrast(${c})`;
        ctx.drawImage(img, 0, 0);
        const isPng = dataUrl.startsWith('data:image/png');
        resolve(canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.92));
      };
      img.src = dataUrl;
    });
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

  /* ── PDF generation ── */
  function generatePDF(hPad, vPad) {
    if (!imageFiles.length) return;

    const { jsPDF } = window.jspdf;
    const pageW = 210, pageH = 297;
    const maxW = pageW - hPad * 2;
    const maxH = pageH - vPad * 2;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const loadImage = dataUrl => new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = dataUrl;
    });

    const processAll = async () => {
      for (let i = 0; i < imageFiles.length; i++) {
        const { dataUrl: rawUrl, brightness, contrast } = imageFiles[i];
        const dataUrl = await applyAdjustments(rawUrl, brightness, contrast);
        const img     = await loadImage(dataUrl);

        const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
        const drawW = img.naturalWidth  * scale;
        const drawH = img.naturalHeight * scale;
        const x = hPad + (maxW - drawW) / 2;
        const y = vPad + (maxH - drawH) / 2;

        if (i > 0) doc.addPage();

        const fmt = dataUrl.startsWith('data:image/png')  ? 'PNG'
                  : dataUrl.startsWith('data:image/webp') ? 'WEBP'
                  : 'JPEG';

        doc.addImage(dataUrl, fmt, x, y, drawW, drawH);
      }

      const safeName = imageFiles.length === 1
        ? imageFiles[0].name.replace(/\.[^.]+$/, '') + '.pdf'
        : 'images.pdf';

      doc.save(safeName);
    };

    processAll().catch(err => console.error('PDF generation failed:', err));
  }

})();
