const BASE = '/wallpaper-engine';

function apiUrl(path) {
  const p = String(path == null ? '' : path);

  if (/^[a-z][a-z0-9+.-]*:/i.test(p) || p.startsWith('data:') || p.startsWith('blob:')) return p;
  if (p.startsWith(BASE)) return p;
  return BASE + (p.startsWith('/') ? p : '/' + p);
}

function pickFetch(injected) {
  if (typeof injected === 'function') return injected;
  if (typeof fetch === 'function') return fetch;
  return null;
}

async function apiFetch(path, options) {
  const o = options || {};
  const doFetch = pickFetch(o.fetch);
  const url = apiUrl(path);
  if (!doFetch) return { ok: false, status: 0, data: null, error: 'no-fetch', url };
  const init = { method: o.method || 'GET', cache: o.cache || 'no-store' };
  if (o.signal) init.signal = o.signal;
  if (o.headers) init.headers = o.headers;
  if (o.body !== undefined) init.body = o.body;

  if (o.keepalive) init.keepalive = true;
  if (o.credentials) init.credentials = o.credentials;
  if (o.mode) init.mode = o.mode;
  if (o.integrity) init.integrity = o.integrity;
  let response;
  try {
    response = await doFetch(url, init);
  } catch (e) {

    return { ok: false, status: 0, data: null, error: String((e && e.name) || (e && e.message) || e), url };
  }
  const status = (response && response.status) || 0;
  const ok = status >= 200 && status < 300;
  let data = null;
  let error = null;

  if (o.parse === 'always' || (o.parse !== false && ok && o.parse !== 'none')) {
    try {

      if (typeof response.json === 'function') {
        data = await response.json();
      } else if (typeof response.text === 'function') {
        const text = await response.text();
        data = text ? JSON.parse(text) : null;
      }
    } catch (e) {

      data = null;
      error = 'parse:' + String((e && e.message) || e);
    }
  }
  return { ok, status, data, error, response, url };
}

const apiJson = (path, options) => apiFetch(path, Object.assign({ method: 'GET' }, options));

const apiHead = (path, options) => apiFetch(path, Object.assign({ method: 'HEAD', parse: false }, options));

const apiPostJson = (path, payload, options) => apiFetch(path, Object.assign({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload === undefined ? {} : payload),
}, options));

const apiDelete = (path, options) => apiFetch(path, Object.assign({ method: 'DELETE', parse: false }, options));

export { BASE, apiUrl, apiFetch, apiJson, apiHead, apiPostJson, apiDelete };
