#!/usr/bin/env node
/**
 * serve.js — a tiny local web server for previewing the site, for people without Python.
 *
 * Usage:
 *   node scripts/serve.js          then open http://localhost:8000
 *   node scripts/serve.js 3000     use a different port
 *
 * It only serves files from this folder and is meant for your own computer, not the internet.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.argv[2]) || Number(process.env.PORT) || 8000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8',
};

http
  .createServer((req, res) => {
    let urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (urlPath.endsWith('/')) urlPath += 'index.html';
    const file = path.join(ROOT, urlPath);

    // Refuse anything outside the project folder (e.g. /../../secret).
    if (!file.startsWith(ROOT + path.sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache', // always fetch the latest version while developing
      });
      res.end(data);
    });
  })
  .listen(PORT, () => console.log(`StudyDeck running at http://localhost:${PORT}  (press Ctrl+C to stop)`));
