import http from 'node:http';
import { readFile, mkdir, appendFile } from 'node:fs/promises';
const host = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const model = process.env.MODEL || 'qwen-local';
const port = Number(process.env.PORT || 3000);
const listenHost = process.env.HOST || '127.0.0.1';
const page = new URL('./index.html', import.meta.url);
const webHosts = (process.env.WEB_ALLOWED_HOSTS || `${listenHost}:${port},127.0.0.1:${port},localhost:${port}`).split(',');

const server = http.createServer(async (req, res) => {
  const controller = new AbortController();
  res.on('close', () => controller.abort());
  try {
    if (!webHosts.includes(req.headers.host)) { res.writeHead(403); res.end('Untrusted Host'); return; }
    if (req.method !== 'GET' && (req.headers['sec-fetch-site'] === 'cross-site' || req.headers.origin && !webHosts.some(h => req.headers.origin === `http://${h}`))) { res.writeHead(403); res.end('Untrusted Origin'); return; }
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(await readFile(page)); return;
    }
    if (req.method === 'GET' && ['/editor.mjs', '/inspector.mjs', '/markdown.mjs', '/completion-controller.mjs', '/completion-join.mjs'].includes(req.url)) {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      res.end(await readFile(new URL(`.${req.url}`, import.meta.url))); return;
    }
    if (req.method === 'GET' && req.url === '/workspace.css') {
      res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      res.end(await readFile(new URL(`.${req.url}`, import.meta.url))); return;
    }
    const vendors = { '/vendor/marked.mjs': 'marked.mjs', '/vendor/katex.mjs': 'katex.mjs', '/vendor/purify.mjs': 'purify.mjs', '/vendor/katex.css': 'katex.css' };
    const font = /^\/vendor\/fonts\/([A-Za-z0-9_-]+\.(?:woff2?|ttf))$/.exec(req.url);
    if (req.method === 'GET' && (vendors[req.url] || font)) {
      res.writeHead(200, { 'Content-Type': font ? (font[1].endsWith('.woff2') ? 'font/woff2' : font[1].endsWith('.woff') ? 'font/woff' : 'font/ttf') : req.url.endsWith('.css') ? 'text/css' : 'text/javascript' });
      res.end(await readFile(new URL('./vendor/' + (vendors[req.url] || 'fonts/' + font[1]), import.meta.url))); return;
    }
    if (req.method === 'GET' && ['/src/completion-controller.mjs', '/src/completion-join.mjs', '/src/input-session.mjs', '/src/prompt.mjs', '/src/context-marks.mjs', '/src/context-store.mjs', '/src/kernel.mjs', '/src/index.mjs', '/src/transports/http.mjs'].includes(req.url)) {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      res.end(await readFile(new URL(`../..${req.url}`, import.meta.url))); return;
    }
    if (req.method === 'POST' && req.url === '/api/interactions') {
      let body = '';
      req.setEncoding('utf8');
      for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 65536) { res.writeHead(413); res.end(); return; } }
      let event;
      try { event = JSON.parse(body); } catch { res.writeHead(400); res.end('Invalid JSON'); return; }
      if (!['accepted', 'dismissed', 'edited', 'disabled'].includes(event.action) || typeof event.prefix !== 'string' || typeof event.suffix !== 'string' || typeof event.suggestion !== 'string') {
        res.writeHead(400); res.end('Invalid interaction'); return;
      }
      await mkdir(new URL('./artifacts/', import.meta.url), { recursive: true });
      await appendFile(new URL('./artifacts/interactions.jsonl', import.meta.url), JSON.stringify({ ...event, timestamp: new Date().toISOString(), model }) + '\n');
      res.writeHead(204); res.end(); return;
    }
    if (req.method === 'GET' && req.url === '/api/status') {
      const upstream = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!upstream.ok) throw new Error(`Ollama returned ${upstream.status}`);
      const tags = await upstream.json();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ model, kernel: 'javascript', ready: tags.models?.some(m => m.name === model || m.name === `${model}:latest`) || false })); return;
    }
    if (req.method === 'POST' && ['/api/generate', '/api/complete'].includes(req.url)) {
      let body = '';
      req.setEncoding('utf8');
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 65536) { res.writeHead(413); res.end('Prompt too large'); return; }
      }
      let input;
      try { input = JSON.parse(body); } catch { res.writeHead(400); res.end('Invalid JSON'); return; }
      if (!input || typeof input.prompt !== 'string' || input.model !== model || input.raw !== true || input.stream !== true) { res.writeHead(400); res.end('Expected a fully assembled raw streaming model request'); return; }
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' });
      const upstream = await fetch(`${host}/api/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body,
      });
      if (!upstream.ok) throw new Error(await upstream.text());
      for await (const chunk of upstream.body) {
        if (!res.write(chunk)) await new Promise(resolve => { res.once('drain', resolve); res.once('close', resolve); });
        if (controller.signal.aborted) break;
      }
      res.end(); return;
    }
    res.writeHead(404); res.end('Not found');
  } catch (error) {
    if (controller.signal.aborted) return;
    if (!res.headersSent) { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
    else res.end(JSON.stringify({ error: error.message }) + '\n');
  }
});
server.listen(port, listenHost, () => console.log(`Streaming app: http://${listenHost}:${port} (model: ${model})`));
