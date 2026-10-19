export function registerMediaBytesRoutes(webServer, c) {
  const { disposers, base: BASE, serveFile, serveLayout, mediaMap, log, pinnedFaststartVariant } = c;
  for (const seg of ['media', 'preview']) {
    const prefix = `${BASE}/${seg}/`;
    disposers.push(webServer.register({
      kind: 'prefix',
      path: `${BASE}/${seg}`,
      handler: (req, res) => {
        const method = (req.method || 'GET').toUpperCase();
        if (method !== 'GET' && method !== 'HEAD') {
          res.statusCode = 405;
          res.setHeader('Allow', 'GET, HEAD');
          res.end('method not allowed');
          return;
        }
        const pathname = new URL(req.url || '/', 'http://x').pathname;
        const token = decodeURIComponent(pathname.slice(prefix.length));
        const abs = mediaMap.get(token);
        const pick = seg === 'media' ? pinnedFaststartVariant(abs, token, log) : null;
        if (pick) { serveLayout(pick.layout, pick.abs, req, res, method === 'HEAD'); return; }
        serveFile(abs, req, res, method === 'HEAD');
      },
    }));
  }
}