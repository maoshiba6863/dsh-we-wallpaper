import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { createMediaBackend } from '../media/index.js';
import { bodyReader } from '../http-body.js';
import { sendJson } from '../json-response.js';
export function registerNowPlayingRoutes(webServer, c) {
  const { disposers, base: BASE, appendDiagLine, configPath, cacheBaseDir, readConfig, serveFile, CONTROL_JSON_MAX_BYTES, log } = c;
  const mediaBackend = createMediaBackend({
    dataDir: dirname(configPath()),
    cacheBaseDir,
    log: (m, level) => log(m, level),
    diag: appendDiagLine,
  });
  disposers.push(() => mediaBackend.stop());
  const ensureMedia = () => {
    let st = {};
    try {
      const cfg = readConfig();
      st = cfg && cfg.settings ? cfg.settings : {};
    } catch {   }
    if (st.audioSource === 'off' && st.mediaIntegration === false) return;
    mediaBackend.start({
      audio: st.audioSource !== 'off' && process.env.DSH_WE_MEDIA_NO_AUDIO !== '1',
      online: st.mediaLyricsOnline === true,
    });
  };
  disposers.push(webServer.register({
    kind: 'exact',
    path: `${BASE}/media-status`,
    handler: (req, res) => {
      ensureMedia();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ ok: true, ...mediaBackend.status() }));
    },
  }));
  disposers.push(webServer.register({
    kind: 'exact',
    path: `${BASE}/audio-spectrum`,
    handler: (req, res) => {
      ensureMedia();
      const st = mediaBackend.status();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({
        ok: true,
        bands: Array.from(mediaBackend.spectrum()),
        running: st.audio.status === 'running',
      }));
    },
  }));
  disposers.push(webServer.register({
    kind: 'exact',
    path: `${BASE}/now-playing`,
    handler: (req, res) => {
      ensureMedia();
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({
        ok: true,
        media: mediaBackend.nowPlaying(),
        hasArtwork: Boolean(mediaBackend.artworkFile()),
      }));
    },
  }));
  disposers.push(webServer.register({
    kind: 'exact',
    path: `${BASE}/now-playing/artwork`,
    handler: (req, res) => {
      const f = mediaBackend.artworkFile();
      if (!f || !existsSync(f)) { res.statusCode = 404; res.end('no-artwork'); return; }
      res.setHeader('Cache-Control', 'no-store');
      serveFile(f, req, res, false);
    },
  }));
  disposers.push(webServer.register({
    kind: 'exact',
    path: `${BASE}/media-control`,
    handler: (req, res) => {
      const method = (req.method || 'GET').toUpperCase();
      if (method !== 'POST') { res.statusCode = 405; res.end('method not allowed'); return; }
      const json = (code, o) => sendJson(res, code, o);
      let tooLarge = false;
      const reader = bodyReader(req, {
        maxBytes: CONTROL_JSON_MAX_BYTES,
        onOverflow: () => { tooLarge = true; json(413, { ok: false, error: 'payload too large' }); },
      });
      req.on('data', reader.onData);
      req.on('end', () => {
        if (tooLarge) return;
        const body = reader.text();
        let action = '';
        try { action = String((JSON.parse(body || '{}') || {}).action || ''); } catch {   }
        if (!action) { json(400, { ok: false, error: 'missing-action' }); return; }
        Promise.resolve(mediaBackend.control(action)).then((r) => json(200, r && typeof r === 'object' ? r : { ok: false }));
      });
      req.on('error', () => { if (tooLarge) return; res.statusCode = 400; res.end('request error'); });
    },
  }));
}