/**
 * Small helpers shared by validate.js and build-index.js.
 * Plain Node.js, no npm packages needed.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DECKS_DIR = path.join(ROOT, 'decks');

// Files inside decks/ that are NOT study decks.
const INDEX_FILE = path.join(DECKS_DIR, 'index.json');
const TEMPLATE_FILE = path.join(DECKS_DIR, '_template.json');

// "Religious Studies" -> "religious-studies"
function slugify(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove accents: "Español" -> "Espanol"
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// True for names like "cell-structure" or "year-9-maths".
function isKebabCase(text) {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(text);
}

// Recursively list every .json file under decks/ (except index.json).
function findJsonFiles(dir = DECKS_DIR) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findJsonFiles(full));
    else if (entry.name.endsWith('.json') && full !== INDEX_FILE) results.push(full);
  }
  return results.sort();
}

// Read a file as text, dropping the invisible "byte order mark" some Windows editors add.
function readText(file) {
  return fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
}

// Path relative to the repo root with forward slashes, e.g. "decks/biology/cells.json".
function relPath(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

module.exports = { ROOT, DECKS_DIR, INDEX_FILE, TEMPLATE_FILE, slugify, isKebabCase, findJsonFiles, readText, relPath };
