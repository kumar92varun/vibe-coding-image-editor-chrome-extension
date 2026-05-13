/* Background-removal model — cache manager */

const CACHE_NAME = 'localpixel-bg-model-v1';
const BASE_URL   = 'https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/';
const MODEL_KEY  = '/models/isnet_quint8';

/*
 * Intercept fetch calls that target the model CDN.
 * If the file is in Cache API, serve it without touching the network.
 * Everything else falls through to the real fetch unchanged.
 */
const _origFetch = window.fetch.bind(window);
window.fetch = async function patchedFetch(input, init) {
  const url = input instanceof Request ? input.url : String(input);
  if (url.startsWith(BASE_URL)) {
    try {
      const cache = await caches.open(CACHE_NAME);
      const hit   = await cache.match(url);
      if (hit) return hit;
    } catch (_) { /* fall through to network on any cache error */ }
  }
  return _origFetch(input, init);
};

/* True when resources.json + all model chunks are in cache. */
export async function isModelCached() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const mf = await cache.match(BASE_URL + 'resources.json');
    if (!mf) return false;
    const manifest = await mf.json();
    const model = manifest[MODEL_KEY];
    if (!model?.chunks?.length) return false;
    /* spot-check first and last chunks — avoids 11 cache lookups on every page load */
    const [first, last] = await Promise.all([
      cache.match(BASE_URL + model.chunks[0].name),
      cache.match(BASE_URL + model.chunks.at(-1).name),
    ]);
    return !!(first && last);
  } catch {
    return false;
  }
}

/*
 * Download the isnet_quint8 model from the CDN and store every chunk in
 * Cache API.  onProgress(bytesDownloaded, totalBytes) is called after each
 * chunk so the caller can render a progress bar.
 */
export async function downloadModel(onProgress) {
  const cache = await caches.open(CACHE_NAME);

  /* Step 1 — manifest */
  const mfUrl  = BASE_URL + 'resources.json';
  const mfResp = await _origFetch(mfUrl);
  if (!mfResp.ok) throw new Error('Failed to fetch model manifest');
  const manifest = await mfResp.json();
  await cache.put(mfUrl, new Response(JSON.stringify(manifest), {
    headers: { 'Content-Type': 'application/json' },
  }));

  const model = manifest[MODEL_KEY];
  if (!model) throw new Error('isnet_quint8 not found in manifest');

  /* Step 2 — chunks (sequential so progress is meaningful) */
  const total = model.size;
  let done = 0;
  for (const chunk of model.chunks) {
    const url  = BASE_URL + chunk.name;
    const resp = await _origFetch(url);
    if (!resp.ok) throw new Error(`Failed to fetch chunk: ${chunk.name}`);
    const blob = await resp.blob();
    await cache.put(url, new Response(blob, {
      headers: {
        'Content-Type':   'application/octet-stream',
        'Content-Length': String(blob.size),
      },
    }));
    done += chunk.offsets[1] - chunk.offsets[0];
    onProgress?.(done, total);
  }
}
