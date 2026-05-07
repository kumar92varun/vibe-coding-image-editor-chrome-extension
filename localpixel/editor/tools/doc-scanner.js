/* Document Scanner — perspective correction, crop, enhancement */
(function () {

  /* ── state ── */
  let scanFiles  = [];   // { name, dataUrl, outputDataUrl, corners, skipped }
  let currentIdx = 0;
  let origImg    = null;
  let dispScale  = 1;    // originalPx / displayPx
  let corners    = null; // [TL, TR, BR, BL] in original-image coords
  let dragIdx    = -1;

  /* ── refs ── */
  const scanInput    = document.getElementById('scanInput');
  const scanBrowseBtn= document.getElementById('scanBrowseBtn');
  const scanFileCount= document.getElementById('scanFileCount');
  const scanOpenBtn  = document.getElementById('scanOpenBtn');
  const scanModal    = document.getElementById('scanModal');
  const scanCloseBtn = document.getElementById('scanCloseBtn');
  const scanCanvas   = document.getElementById('scanCanvas');
  const scanPreview  = document.getElementById('scanPreviewCanvas');
  const scanAutoBtn  = document.getElementById('scanAutoDetectBtn');
  const scanApplyBtn = document.getElementById('scanApplyBtn');
  const scanSkipBtn  = document.getElementById('scanSkipBtn');
  const scanPrevBtn  = document.getElementById('scanPrevBtn');
  const scanNextBtn  = document.getElementById('scanNextBtn');
  const scanProgress = document.getElementById('scanProgress');
  const scanEnhance  = document.getElementById('scanEnhance');
  const scanDlBtn    = document.getElementById('scanDownloadAllBtn');

  const ctx  = scanCanvas.getContext('2d');
  const pCtx = scanPreview.getContext('2d');

  /* ── browse ── */
  scanBrowseBtn.addEventListener('click', () => scanInput.click());
  scanInput.addEventListener('change', () => {
    const files = Array.from(scanInput.files);
    if (!files.length) return;
    Promise.all(files.map(f => new Promise(res => {
      const fr = new FileReader();
      fr.onload = e => res({ name: f.name, dataUrl: e.target.result,
                             outputDataUrl: null, corners: null, skipped: false });
      fr.readAsDataURL(f);
    }))).then(items => {
      scanFiles = scanFiles.concat(items);
      updateCount();
    });
    scanInput.value = '';
  });

  function updateCount() {
    const n = scanFiles.length;
    scanFileCount.textContent = `${n} image${n !== 1 ? 's' : ''} loaded`;
    scanFileCount.classList.toggle('hidden', n === 0);
    scanOpenBtn.classList.toggle('hidden', n === 0);
  }

  /* ── open / close ── */
  scanOpenBtn.addEventListener('click', () => {
    scanModal.classList.remove('hidden');
    requestAnimationFrame(() => showImage(0));
  });
  scanCloseBtn.addEventListener('click', () => scanModal.classList.add('hidden'));

  /* ── navigation ── */
  scanPrevBtn.addEventListener('click', () => { if (currentIdx > 0) showImage(currentIdx - 1); });
  scanNextBtn.addEventListener('click', () => { if (currentIdx < scanFiles.length - 1) showImage(currentIdx + 1); });

  /* ── show image ── */
  function showImage(idx) {
    currentIdx = idx;
    const f = scanFiles[idx];
    scanProgress.textContent = `${idx + 1} of ${scanFiles.length}`;
    scanPrevBtn.disabled = idx === 0;
    scanNextBtn.disabled = idx === scanFiles.length - 1;

    origImg = new Image();
    origImg.onload = () => {
      sizeCanvases();
      if (f.corners) {
        corners = f.corners;
        drawCanvas();
        updatePreview();
      } else {
        autoDetect();
      }
      refreshApplyBtn();
    };
    origImg.src = f.dataUrl;
  }

  function sizeCanvases() {
    const wrap = document.getElementById('scanCanvasWrap');
    const maxW = Math.max(1, wrap.clientWidth  - 40);
    const maxH = Math.max(1, wrap.clientHeight - 40);
    const ratio = origImg.naturalWidth / origImg.naturalHeight;
    let w, h;
    if (maxW / ratio <= maxH) { w = maxW; h = maxW / ratio; }
    else                       { h = maxH; w = maxH * ratio; }
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    scanCanvas.width  = w;  scanCanvas.height  = h;
    scanPreview.width = w;  scanPreview.height = h;
    dispScale = origImg.naturalWidth / w;
  }

  function refreshApplyBtn() {
    scanApplyBtn.textContent = scanFiles[currentIdx].outputDataUrl
      ? 'Re-apply' : 'Apply & Next';
    scanApplyBtn.disabled = false;
  }

  window.addEventListener('resize', () => {
    if (scanModal.classList.contains('hidden') || !origImg) return;
    sizeCanvases();
    drawCanvas();
    updatePreview();
  });

  /* ── auto-detect ── */
  scanAutoBtn.addEventListener('click', autoDetect);

  function autoDetect() {
    const W = origImg.naturalWidth, H = origImg.naturalHeight;
    const procScale = Math.min(1, 800 / Math.max(W, H));
    const pw = Math.round(W * procScale), ph = Math.round(H * procScale);

    const off = document.createElement('canvas');
    off.width = pw; off.height = ph;
    off.getContext('2d').drawImage(origImg, 0, 0, pw, ph);
    const { data } = off.getContext('2d').getImageData(0, 0, pw, ph);

    const detected = findCorners(data, pw, ph);
    corners = detected.map(p => ({ x: p.x / procScale, y: p.y / procScale }));

    drawCanvas();
    updatePreview();
  }

  function findCorners(data, w, h) {
    const n = w * h;

    /* grayscale */
    const gray = new Uint8Array(n);
    for (let i = 0; i < n; i++)
      gray[i] = (77 * data[i*4] + 150 * data[i*4+1] + 29 * data[i*4+2]) >> 8;

    /* 3×3 gaussian blur */
    const blur = new Uint8Array(n);
    const K = [1,2,1,2,4,2,1,2,1];
    for (let y = 1; y < h-1; y++)
      for (let x = 1; x < w-1; x++) {
        let s = 0, ki = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            s += gray[(y+dy)*w+(x+dx)] * K[ki++];
        blur[y*w+x] = s >> 4;
      }

    /* sobel magnitude */
    const mag = new Float32Array(n);
    let maxMag = 0;
    for (let y = 1; y < h-1; y++)
      for (let x = 1; x < w-1; x++) {
        const tl=blur[(y-1)*w+(x-1)], tc=blur[(y-1)*w+x], tr=blur[(y-1)*w+(x+1)];
        const ml=blur[y*w+(x-1)],                          mr=blur[y*w+(x+1)];
        const bl=blur[(y+1)*w+(x-1)], bc=blur[(y+1)*w+x], br=blur[(y+1)*w+(x+1)];
        const gx = -tl + tr - 2*ml + 2*mr - bl + br;
        const gy = -tl - 2*tc - tr + bl + 2*bc + br;
        const m  = Math.sqrt(gx*gx + gy*gy);
        mag[y*w+x] = m;
        if (m > maxMag) maxMag = m;
      }

    /* find 4 extreme points among the top 15% edge pixels, ignoring a 4% margin */
    const thresh = maxMag * 0.15;
    const margin = Math.round(Math.min(w, h) * 0.04);
    let tl=null, tr=null, br=null, bl=null;
    let tlV=Infinity, trV=-Infinity, brV=-Infinity, blV=Infinity;

    for (let y = margin; y < h-margin; y++)
      for (let x = margin; x < w-margin; x++) {
        if (mag[y*w+x] < thresh) continue;
        const s = x+y, d = x-y;
        if (s < tlV) { tlV=s; tl={x,y}; }
        if (d > trV) { trV=d; tr={x,y}; }
        if (s > brV) { brV=s; br={x,y}; }
        if (d < blV) { blV=d; bl={x,y}; }
      }

    const m = margin;
    return [
      tl || {x:m,   y:m},
      tr || {x:w-m, y:m},
      br || {x:w-m, y:h-m},
      bl || {x:m,   y:h-m},
    ];
  }

  /* ── draw canvas (image + overlay + handles) ── */
  function drawCanvas() {
    ctx.clearRect(0, 0, scanCanvas.width, scanCanvas.height);
    ctx.drawImage(origImg, 0, 0, scanCanvas.width, scanCanvas.height);
    if (!corners) return;

    const dc = toDisp(corners);

    /* tinted quad fill */
    ctx.fillStyle = 'rgba(37,99,235,0.10)';
    ctx.beginPath();
    ctx.moveTo(dc[0].x, dc[0].y);
    dc.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.fill();

    /* dashed quad border */
    ctx.strokeStyle = '#2563EB';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(dc[0].x, dc[0].y);
    dc.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    /* corner handles */
    dc.forEach(p => {
      ctx.fillStyle   = '#fff';
      ctx.strokeStyle = '#2563EB';
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }

  function toDisp(pts) {
    return pts.map(p => ({ x: p.x / dispScale, y: p.y / dispScale }));
  }

  /* ── corner handle dragging ── */
  scanCanvas.addEventListener('pointerdown', e => {
    const {mx, my} = canvasPt(e);
    if (!corners) return;
    const dc = toDisp(corners);
    for (let i = 0; i < dc.length; i++) {
      if (ptDist(mx, my, dc[i].x, dc[i].y) < 14) {
        dragIdx = i;
        scanCanvas.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
    }
  });

  scanCanvas.addEventListener('pointermove', e => {
    const {mx, my} = canvasPt(e);

    if (dragIdx >= 0) {
      corners[dragIdx] = {
        x: clamp(mx * dispScale, 0, origImg.naturalWidth),
        y: clamp(my * dispScale, 0, origImg.naturalHeight),
      };
      drawCanvas();
      updatePreview();
      return;
    }

    if (corners) {
      const near = toDisp(corners).some(p => ptDist(mx, my, p.x, p.y) < 14);
      scanCanvas.style.cursor = near ? 'grab' : 'default';
    }
  });

  scanCanvas.addEventListener('pointerup', () => {
    dragIdx = -1;
    scanCanvas.style.cursor = 'default';
  });

  function canvasPt(e) {
    const r = scanCanvas.getBoundingClientRect();
    return {
      mx: (e.clientX - r.left) * (scanCanvas.width  / r.width),
      my: (e.clientY - r.top)  * (scanCanvas.height / r.height),
    };
  }

  /* ── live preview (display-resolution warp for speed) ── */
  function updatePreview() {
    if (!corners || !origImg) return;
    const dc = toDisp(corners);
    const {w: ow, h: oh} = outputSize(dc);
    if (ow < 1 || oh < 1) return;

    const tmp = document.createElement('canvas');
    tmp.width  = scanCanvas.width;
    tmp.height = scanCanvas.height;
    tmp.getContext('2d').drawImage(origImg, 0, 0, scanCanvas.width, scanCanvas.height);

    let result = warp(tmp, dc, Math.round(ow), Math.round(oh));
    if (scanEnhance.checked) result = enhance(result);

    const pw = scanPreview.width, ph = scanPreview.height;
    const s  = Math.min(pw / result.width, ph / result.height);
    const dw = result.width * s, dh = result.height * s;

    pCtx.clearRect(0, 0, pw, ph);
    pCtx.fillStyle = '#d5e8fa';
    pCtx.fillRect(0, 0, pw, ph);
    pCtx.drawImage(result, (pw-dw)/2, (ph-dh)/2, dw, dh);
  }

  scanEnhance.addEventListener('change', updatePreview);

  /* ── output size from 4 corners ── */
  function outputSize(pts) {
    const d = (a, b) => Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2);
    return {
      w: Math.max(d(pts[0],pts[1]), d(pts[3],pts[2])),
      h: Math.max(d(pts[0],pts[3]), d(pts[1],pts[2])),
    };
  }

  /* ── perspective warp (inverse mapping + bilinear interpolation) ── */
  function warp(srcCanvas, srcPts, outW, outH) {
    const dstPts = [{x:0,y:0},{x:outW,y:0},{x:outW,y:outH},{x:0,y:outH}];
    const H = homography(dstPts, srcPts); /* maps output px → source px */

    const sw = srcCanvas.width, sh = srcCanvas.height;
    const src = srcCanvas.getContext('2d').getImageData(0, 0, sw, sh).data;

    const out = document.createElement('canvas');
    out.width = outW; out.height = outH;
    const oCtx = out.getContext('2d');
    const od = oCtx.createImageData(outW, outH);
    const op = od.data;

    for (let oy = 0; oy < outH; oy++)
      for (let ox = 0; ox < outW; ox++) {
        const w  = H[6]*ox + H[7]*oy + 1;
        const sx = (H[0]*ox + H[1]*oy + H[2]) / w;
        const sy = (H[3]*ox + H[4]*oy + H[5]) / w;

        const x0 = sx|0, y0 = sy|0, x1 = x0+1, y1 = y0+1;
        if (x0 < 0 || y0 < 0 || x1 >= sw || y1 >= sh) continue;

        const fx = sx-x0, fy = sy-y0;
        const i00=(y0*sw+x0)*4, i10=(y0*sw+x1)*4;
        const i01=(y1*sw+x0)*4, i11=(y1*sw+x1)*4;
        const oi =(oy*outW+ox)*4;
        const w00=(1-fx)*(1-fy), w10=fx*(1-fy), w01=(1-fx)*fy, w11=fx*fy;

        op[oi]   = w00*src[i00]   + w10*src[i10]   + w01*src[i01]   + w11*src[i11]   |0;
        op[oi+1] = w00*src[i00+1] + w10*src[i10+1] + w01*src[i01+1] + w11*src[i11+1] |0;
        op[oi+2] = w00*src[i00+2] + w10*src[i10+2] + w01*src[i01+2] + w11*src[i11+2] |0;
        op[oi+3] = 255;
      }

    oCtx.putImageData(od, 0, 0);
    return out;
  }

  /* ── DLT homography (8-param, h22=1) ── */
  function homography(srcPts, dstPts) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const {x:sx,y:sy} = srcPts[i], {x:dx,y:dy} = dstPts[i];
      A.push([sx,sy,1,0,0,0,-dx*sx,-dx*sy]); b.push(dx);
      A.push([0,0,0,sx,sy,1,-dy*sx,-dy*sy]); b.push(dy);
    }
    return gaussElim(A, b); /* [h0..h7] */
  }

  function gaussElim(A, b) {
    const n = b.length;
    const M = A.map((r,i) => [...r, b[i]]);
    for (let c = 0; c < n; c++) {
      let pivot = c;
      for (let r = c+1; r < n; r++)
        if (Math.abs(M[r][c]) > Math.abs(M[pivot][c])) pivot = r;
      [M[c], M[pivot]] = [M[pivot], M[c]];
      for (let r = c+1; r < n; r++) {
        const f = M[r][c] / M[c][c];
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    const x = new Array(n).fill(0);
    for (let i = n-1; i >= 0; i--) {
      x[i] = M[i][n];
      for (let j = i+1; j < n; j++) x[i] -= M[i][j] * x[j];
      x[i] /= M[i][i];
    }
    return x;
  }

  /* ── enhancement (per-channel 1%/99% histogram stretch) ── */
  function enhance(srcCanvas) {
    const w = srcCanvas.width, h = srcCanvas.height, n = w * h;
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const oCtx = out.getContext('2d');
    oCtx.drawImage(srcCanvas, 0, 0);
    const id = oCtx.getImageData(0, 0, w, h);
    const d  = id.data;

    const hR = new Int32Array(256), hG = new Int32Array(256), hB = new Int32Array(256);
    for (let i = 0; i < n; i++) {
      hR[d[i*4]]++; hG[d[i*4+1]]++; hB[d[i*4+2]]++;
    }

    const pct = (hist, p) => {
      const target = n * p; let acc = 0;
      for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= target) return v; }
      return 255;
    };

    const [rLo,rHi] = [pct(hR,0.01), pct(hR,0.99)];
    const [gLo,gHi] = [pct(hG,0.01), pct(hG,0.99)];
    const [bLo,bHi] = [pct(hB,0.01), pct(hB,0.99)];
    const rR = Math.max(1, rHi-rLo), gR = Math.max(1, gHi-gLo), bR = Math.max(1, bHi-bLo);

    for (let i = 0; i < n; i++) {
      d[i*4]   = clamp255((d[i*4]   - rLo) * 255 / rR);
      d[i*4+1] = clamp255((d[i*4+1] - gLo) * 255 / gR);
      d[i*4+2] = clamp255((d[i*4+2] - bLo) * 255 / bR);
    }

    oCtx.putImageData(id, 0, 0);
    return out;
  }

  /* ── apply (full-resolution warp) ── */
  scanApplyBtn.addEventListener('click', () => {
    if (!corners || !origImg) return;
    scanApplyBtn.disabled = true;
    scanApplyBtn.textContent = 'Processing…';

    setTimeout(() => {
      /* cap at 3000px on the longest side to keep processing time reasonable */
      const MAX = 3000;
      const capScale = Math.min(1, MAX / Math.max(origImg.naturalWidth, origImg.naturalHeight));
      const cw = Math.round(origImg.naturalWidth  * capScale);
      const ch = Math.round(origImg.naturalHeight * capScale);

      const full = document.createElement('canvas');
      full.width = cw; full.height = ch;
      full.getContext('2d').drawImage(origImg, 0, 0, cw, ch);

      const scaledCorners = corners.map(p => ({ x: p.x * capScale, y: p.y * capScale }));
      const {w, h} = outputSize(scaledCorners);

      let result = warp(full, scaledCorners, Math.round(w), Math.round(h));
      if (scanEnhance.checked) result = enhance(result);

      scanFiles[currentIdx].outputDataUrl = result.toDataURL('image/jpeg', 0.92);
      scanFiles[currentIdx].corners = corners.map(p => ({...p}));

      refreshApplyBtn();

      if (currentIdx < scanFiles.length - 1) showImage(currentIdx + 1);
    }, 30);
  });

  /* ── skip ── */
  scanSkipBtn.addEventListener('click', () => {
    scanFiles[currentIdx].skipped = true;
    if (currentIdx < scanFiles.length - 1) showImage(currentIdx + 1);
  });

  /* ── download all ── */
  scanDlBtn.addEventListener('click', () => {
    let delay = 0;
    scanFiles.forEach(f => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href     = f.outputDataUrl || f.dataUrl;
        a.download = f.name.replace(/\.[^.]+$/, '') + '_scanned.jpg';
        a.click();
      }, delay);
      delay += 250;
    });
  });

  /* ── utils ── */
  function ptDist(ax, ay, bx, by) { return Math.sqrt((ax-bx)**2 + (ay-by)**2); }
  function clamp(v, lo, hi)        { return v < lo ? lo : v > hi ? hi : v; }
  function clamp255(v)              { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }

})();
