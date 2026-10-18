#!/usr/bin/env node
/**
 * build-index.js — writes decks/index.json, the list of every deck the website shows.
 *
 * Usage:
 *   node scripts/build-index.js
 *
 * You normally never run this yourself: a GitHub Action runs it on every push to main
 * and commits the result. Run it locally only if you want to preview new decks.
 *
 * Files that are not valid JSON are skipped with a warning (validate.js explains why).
 * The output has no timestamps, so it only changes when the decks actually change.
 */
const fs = require('fs');
const path = require('path');
const { DECKS_DIR, INDEX_FILE, TEMPLATE_FILE, slugify, findJsonFiles, readText, relPath } = require('./lib');

function buildIndex() {
  const decks = [];
  const skipped = [];

  for (const file of findJsonFiles()) {
    if (file === TEMPLATE_FILE || path.basename(file).startsWith('_')) continue; // templates/drafts

    let deck;
    try {
      deck = JSON.parse(readText(file));
    } catch (err) {
      skipped.push(`${relPath(file)} (invalid JSON)`);
      continue;
    }
    if (!deck || typeof deck !== 'object' || !Array.isArray(deck.cards) || typeof deck.title !== 'string') {
      skipped.push(`${relPath(file)} (missing title or cards)`);
      continue;
    }

    // "decks/biology/cell-structure.json" -> id "biology/cell-structure"
    const id = path.relative(DECKS_DIR, file).split(path.sep).join('/').replace(/\.json$/, '');
    const subject = String(deck.subject || 'Other').trim();
    const questions = Array.isArray(deck.questions) ? deck.questions : [];

    // Collect every tag used anywhere in the deck, so the home page can filter by any of them.
    const tags = new Set();
    const addTags = (list) => Array.isArray(list) && list.forEach((t) => typeof t === 'string' && tags.add(t));
    addTags(deck.tags);
    deck.cards.forEach((c) => c && addTags(c.tags));
    questions.forEach((q) => q && addTags(q.tags));

    // List the deck's pictures (relative to decks/) so the app can save them for offline use.
    const folder = id.slice(0, id.lastIndexOf('/') + 1);
    const images = new Set();
    for (const c of deck.cards) {
      for (const p of [c && c.frontImage, c && c.backImage]) {
        const safe = typeof p === 'string' && p && !p.includes('..') && !/^[a-z]+:|^\//i.test(p);
        if (safe && fs.existsSync(path.join(DECKS_DIR, folder, p))) images.add(folder + p); // only real files
      }
    }

    decks.push({
      id,
      path: `${id}.json`,
      title: deck.title.trim(),
      subject,
      subjectSlug: slugify(subject),
      description: String(deck.description || '').trim(),
      author: String(deck.author || '').trim(),
      tags: [...tags].sort(),
      cardCount: deck.cards.length,
      questionCount: questions.length,
      ...(images.size ? { images: [...images].sort() } : {}),
    });
  }

  // Sort by subject, then title, so the file is stable and easy to read.
  decks.sort((a, b) => a.subject.localeCompare(b.subject) || a.title.localeCompare(b.title));

  const subjects = [];
  for (const d of decks) {
    let s = subjects.find((x) => x.slug === d.subjectSlug);
    if (!s) subjects.push((s = { name: d.subject, slug: d.subjectSlug, deckCount: 0 }));
    s.deckCount++;
  }

  return { index: { version: 1, subjects, decks }, skipped };
}

function main() {
  const { index, skipped } = buildIndex();
  const json = JSON.stringify(index, null, 2) + '\n';
  const old = fs.existsSync(INDEX_FILE) ? fs.readFileSync(INDEX_FILE, 'utf8') : '';

  for (const s of skipped) console.warn(`⚠ Skipped ${s}. Run node scripts/validate.js for details.`);

  if (old === json) {
    console.log(`decks/index.json is already up to date (${index.decks.length} decks).`);
  } else {
    fs.writeFileSync(INDEX_FILE, json);
    console.log(`Wrote decks/index.json with ${index.decks.length} decks in ${index.subjects.length} subjects.`);
  }
}

if (require.main === module) main();

module.exports = { buildIndex };
