/* Dropzone model-status UI — wires up the indicator and download button */
import { isModelCached, downloadModel } from './bg-model.js';

const dot         = document.getElementById('bgModelDot');
const statusText  = document.getElementById('bgModelStatusText');
const downloadBtn = document.getElementById('bgModelDownloadBtn');
const browseBtn   = document.getElementById('removeBgBrowseBtn');
const dlWrap      = document.getElementById('bgModelDlWrap');
const dlFill      = document.getElementById('bgModelDlFill');
const dlPct       = document.getElementById('bgModelDlPct');

async function refreshStatus() {
  const ready = await isModelCached();
  if (ready) {
    dot.className          = 'bg-model-dot ready';
    statusText.textContent = 'AI model ready';
    downloadBtn.classList.add('hidden');
    browseBtn.classList.remove('hidden');
  } else {
    dot.className          = 'bg-model-dot pending';
    statusText.textContent = 'Model not downloaded';
    downloadBtn.classList.remove('hidden');
    browseBtn.classList.add('hidden');
  }
}

downloadBtn.addEventListener('click', async () => {
  const origHTML        = downloadBtn.innerHTML;
  downloadBtn.disabled  = true;
  downloadBtn.textContent = 'Downloading…';
  dlWrap.classList.remove('hidden');
  dot.className          = 'bg-model-dot pending';
  statusText.textContent = 'Downloading…';

  try {
    await downloadModel((done, total) => {
      const pct = Math.round(done / total * 100);
      dlFill.style.width   = pct + '%';
      dlPct.textContent    = pct + '%';
      statusText.textContent = `Downloading… ${pct}%`;
    });
    dlWrap.classList.add('hidden');
    await refreshStatus();
  } catch (err) {
    console.error('Model download failed:', err);
    dlWrap.classList.add('hidden');
    downloadBtn.innerHTML = origHTML;
    downloadBtn.disabled  = false;
    dot.className          = 'bg-model-dot pending';
    statusText.textContent = 'Download failed — try again';
  }
});

refreshStatus();
