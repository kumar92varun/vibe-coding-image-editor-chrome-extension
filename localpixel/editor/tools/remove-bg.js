/* Remove Background — ES module (deferred, runs after DOM is ready) */
import './bg-model.js';   /* installs fetch interceptor — must be first */
import * as ort from '../../vendor/ort.min.mjs';
import { removeBackground } from '../../vendor/bg-removal.mjs';

/*
 * Point ORT at the extension's own WASM files.
 * Same-origin extension URLs let ORT use new Worker(url) directly,
 * avoiding the fetch→blob→import() path that MV3 CSP blocks.
 */
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths  = {
  mjs:  chrome.runtime.getURL('vendor/wasm/ort-wasm-simd-threaded.mjs'),
  wasm: chrome.runtime.getURL('vendor/wasm/ort-wasm-simd-threaded.wasm'),
};

/* ── DOM refs ── */
const browseBtn      = document.getElementById('removeBgBrowseBtn');
const fileInput      = document.getElementById('removeBgInput');
const modal          = document.getElementById('removeBgModal');
const processingDiv  = document.getElementById('removeBgProcessing');
const resultDiv      = document.getElementById('removeBgResult');
const progressLabel  = document.getElementById('removeBgProgressLabel');
const progressBar    = document.getElementById('removeBgProgressBar');
const origImg        = document.getElementById('removeBgOrigImg');
const canvas         = document.getElementById('removeBgCanvas');
const downloadBtn    = document.getElementById('removeBgDownloadBtn');
const overwriteBtn   = document.getElementById('removeBgOverwriteBtn');
const closeBtn       = document.getElementById('removeBgCloseBtn');
const fillToggle     = document.getElementById('removeBgFillToggle');
const fillColorInput = document.getElementById('removeBgFillColor');
const overwriteHint  = document.getElementById('removeBgOverwriteHint');

/* ── state ── */
let currentHandle = null;   // FileSystemFileHandle or null
let currentName   = '';
let resultBitmap  = null;   // ImageBitmap of removed-bg PNG

/* ── browse ── */
browseBtn.addEventListener('click', async () => {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{
          description: 'Images',
          accept: {
            'image/jpeg': ['.jpg', '.jpeg'],
            'image/png':  ['.png'],
            'image/webp': ['.webp'],
          },
        }],
      });
      currentHandle = handle;
      startProcessing(await handle.getFile());
    } catch (err) {
      if (err.name !== 'AbortError') console.error(err);
    }
  } else {
    fileInput.click();
  }
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  currentHandle = null;
  startProcessing(file);
  fileInput.value = '';
});

/* ── main processing ── */
async function startProcessing(file) {
  currentName = file.name;

  /* show modal in processing state */
  processingDiv.classList.remove('hidden');
  resultDiv.classList.add('hidden');
  downloadBtn.classList.add('hidden');
  overwriteBtn.classList.add('hidden');
  overwriteHint.classList.add('hidden');
  progressLabel.textContent = 'Preparing…';
  progressBar.style.width = '0%';
  modal.classList.remove('hidden');

  /* load original preview */
  const origUrl = URL.createObjectURL(file);
  origImg.onload = () => URL.revokeObjectURL(origUrl);
  origImg.src = origUrl;

  try {
    const resultBlob = await removeBackground(file, {
      device: 'cpu',
      proxyToWorker: false,
      model: 'isnet_quint8',
      progress: (key, current, total) => {
        if (!total) return;
        const pct = Math.round((current / total) * 100);
        progressBar.style.width = pct + '%';
        progressLabel.textContent = /fetch|download/i.test(key)
          ? `Downloading model… ${pct}%`
          : `Processing… ${pct}%`;
      },
    });

    resultBitmap = await createImageBitmap(resultBlob);
    showResult();
  } catch (err) {
    console.error('Background removal failed:', err);
    progressLabel.textContent = `Error: ${err.message || 'Processing failed. Check console for details.'}`;
  }
}

/* ── show result ── */
function showResult() {
  processingDiv.classList.add('hidden');
  resultDiv.classList.remove('hidden');
  downloadBtn.classList.remove('hidden');

  /* overwrite: only for PNG files opened with a file handle */
  const isPng = /\.png$/i.test(currentName);
  if (currentHandle && isPng) {
    overwriteBtn.classList.remove('hidden');
    overwriteHint.classList.add('hidden');
  } else {
    overwriteBtn.classList.add('hidden');
    if (currentHandle && !isPng) {
      overwriteHint.textContent = 'Overwrite not available for non-PNG files — use Download PNG instead';
      overwriteHint.classList.remove('hidden');
    }
  }

  /* reset options */
  fillToggle.checked = false;
  fillColorInput.classList.add('hidden');

  renderCanvas();
}

/* ── canvas render (respects fill color) ── */
function renderCanvas() {
  if (!resultBitmap) return;
  const w = resultBitmap.width;
  const h = resultBitmap.height;
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  if (fillToggle.checked) {
    ctx.fillStyle = fillColorInput.value;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(resultBitmap, 0, 0);
}

fillToggle.addEventListener('change', () => {
  fillColorInput.classList.toggle('hidden', !fillToggle.checked);
  renderCanvas();
});
fillColorInput.addEventListener('input', renderCanvas);

/* ── download ── */
downloadBtn.addEventListener('click', () => {
  canvas.toBlob(blob => {
    const a = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = currentName.replace(/\.[^.]+$/, '') + '-no-bg.png';
    a.click();
    URL.revokeObjectURL(a.href);
  }, 'image/png');
});

/* ── overwrite original ── */
overwriteBtn.addEventListener('click', async () => {
  if (!currentHandle) return;
  const origHTML = overwriteBtn.innerHTML;
  overwriteBtn.disabled = true;
  overwriteBtn.textContent = 'Saving…';
  try {
    const blob     = await new Promise(res => canvas.toBlob(res, 'image/png'));
    const writable = await currentHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    overwriteBtn.textContent = 'Saved!';
    setTimeout(() => { overwriteBtn.innerHTML = origHTML; overwriteBtn.disabled = false; }, 1500);
  } catch (err) {
    console.error('Overwrite failed:', err);
    overwriteBtn.innerHTML = origHTML;
    overwriteBtn.disabled = false;
  }
});

/* ── close ── */
function closeModal() {
  modal.classList.add('hidden');
  origImg.src = '';
  if (resultBitmap) { resultBitmap.close(); resultBitmap = null; }
}
closeBtn.addEventListener('click', closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
});
