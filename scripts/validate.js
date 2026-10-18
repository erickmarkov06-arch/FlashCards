#!/usr/bin/env node
/**
 * validate.js — checks every deck file for mistakes before it goes live.
 *
 * Usage:
 *   node scripts/validate.js                          check every deck in decks/
 *   node scripts/validate.js decks/biology/cells.json check only the files you name
 *
 * It checks that each file:
 *   - is valid JSON (and shows the exact line if it is not)
 *   - lives in decks/<subject-folder>/<deck-name>.json with lowercase-hyphen names
 *   - has the required fields (title, subject, description, author, cards)
 *   - has no duplicate cards or questions
 *   - has correctly shaped multiple-choice questions
 *
 * Errors make the script exit with code 1 (which fails the GitHub Action).
 * Warnings are printed but do not fail anything.
 */
const fs = require('fs');
const path = require('path');
const { DECKS_DIR, INDEX_FILE, TEMPLATE_FILE, slugify, isKebabCase, findJsonFiles, readText, relPath } = require('./lib');

// Fields each object is allowed to have. Anything else gets a warning (usually a typo).
const DECK_KEYS = ['title', 'subject', 'description', 'author', 'tags', 'frontLang', 'backLang', 'cards', 'questions'];
const CARD_KEYS = ['front', 'back', 'hint', 'tags', 'frontImage', 'backImage', 'imageAlt'];

// Pictures on cards: allowed file types, and the size above which we warn (big files are slow on phones).
const IMAGE_TYPES = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];
const IMAGE_WARN_BYTES = 500 * 1024;
const QUESTION_KEYS = ['question', 'options', 'answerIndex', 'explanation', 'tags'];

// Colours make the output easier to scan in a terminal. Turned off when not a terminal (e.g. CI logs still work).
const useColour = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (text) => (useColour ? `\x1b[${code}m${text}\x1b[0m` : text);
const red = paint(31), yellow = paint(33), green = paint(32), dim = paint(2), bold = paint(1);

/** Checks one file. Returns { errors: string[], warnings: string[], deck: object|null }. */
function validateFile(file) {
  const errors = [];
  const warnings = [];
  const images = []; // full paths of pictures this deck uses
  const isTemplate = path.resolve(file) === TEMPLATE_FILE;

  // ---- 1. Where the file lives and what it is called ----
  const rel = path.relative(DECKS_DIR, path.resolve(file)).split(path.sep);
  if (rel[0] === '..' || path.isAbsolute(rel.join('/'))) {
    errors.push('This file is not inside the decks/ folder.');
  } else if (!isTemplate) {
    if (rel.length === 1) {
      errors.push('Deck files must go inside a subject folder, e.g. decks/biology/' + rel[0]);
    } else if (rel.length > 2) {
      errors.push('Deck files must be exactly one folder deep, e.g. decks/biology/cells.json (no sub-folders).');
    } else {
      const [folder, fileName] = rel;
      const baseName = fileName.replace(/\.json$/, '');
      if (!isKebabCase(folder)) errors.push(`Folder name "${folder}" must be lowercase words joined by hyphens, e.g. "religious-studies".`);
      if (!isKebabCase(baseName)) errors.push(`File name "${fileName}" must be lowercase words joined by hyphens, e.g. "cell-structure.json".`);
    }
  }

  // ---- 2. Valid JSON? ----
  let text;
  try {
    text = readText(file);
  } catch (err) {
    errors.push(`Could not read the file: ${err.message}`);
    return { errors, warnings, deck: null };
  }

  let deck;
  try {
    deck = JSON.parse(text);
  } catch (err) {
    errors.push(describeJsonError(text, err));
    return { errors, warnings, deck: null };
  }

  // ---- 3. Top-level fields ----
  if (typeof deck !== 'object' || deck === null || Array.isArray(deck)) {
    errors.push('The file must contain a single JSON object: { "title": ..., "cards": [...] }');
    return { errors, warnings, deck: null };
  }

  for (const key of Object.keys(deck)) {
    if (!DECK_KEYS.includes(key)) warnings.push(`Unknown field "${key}" (allowed: ${DECK_KEYS.join(', ')}). Is it a typo?`);
  }
  for (const key of ['title', 'subject', 'description', 'author']) {
    checkRequiredString(deck[key], `"${key}"`, errors);
  }
  checkTags(deck.tags, 'Deck "tags"', errors);

  // Optional language codes that switch on read-aloud, e.g. "frontLang": "es", "backLang": "en".
  for (const key of ['frontLang', 'backLang']) {
    if (deck[key] === undefined) continue;
    if (typeof deck[key] !== 'string' || !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(deck[key])) {
      errors.push(`"${key}" must be a language code like "es", "fr", "de", "en" or "en-GB" (lowercase, no spaces). Got ${JSON.stringify(deck[key])}.`);
    }
  }

  // The subject must match the folder so decks are grouped consistently.
  if (!isTemplate && rel.length === 2 && typeof deck.subject === 'string' && deck.subject.trim()) {
    const expected = slugify(deck.subject);
    if (expected !== rel[0]) {
      errors.push(`"subject" is "${deck.subject}", so the file should be in decks/${expected}/ (it is in decks/${rel[0]}/). Change the folder or the subject so they match.`);
    }
  }

  // ---- 4. Cards ----
  if (!Array.isArray(deck.cards)) {
    errors.push('"cards" is missing or is not a list. It must look like "cards": [ { "front": "...", "back": "..." } ]');
  } else if (deck.cards.length === 0) {
    errors.push('"cards" is empty. Add at least one card.');
  } else {
    const seenFronts = new Map(); // normalised front text -> card number
    deck.cards.forEach((card, i) => {
      const label = `Card ${i + 1}`;
      if (typeof card !== 'object' || card === null || Array.isArray(card)) {
        errors.push(`${label} must be an object like { "front": "...", "back": "..." }.`);
        return;
      }
      const name = typeof card.front === 'string' && card.front.trim() ? `${label} ("${short(card.front)}")` : label;

      for (const key of Object.keys(card)) {
        if (!CARD_KEYS.includes(key)) warnings.push(`${name}: unknown field "${key}" (allowed: ${CARD_KEYS.join(', ')}).`);
      }
      checkRequiredString(card.front, `${name}: "front"`, errors);
      checkRequiredString(card.back, `${name}: "back"`, errors);
      if (card.hint !== undefined) checkRequiredString(card.hint, `${name}: "hint"`, errors, 'Remove "hint" or give it some text.');
      if (card.imageAlt !== undefined) checkRequiredString(card.imageAlt, `${name}: "imageAlt"`, errors, 'Remove "imageAlt" or describe the picture.');
      checkTags(card.tags, `${name}: "tags"`, errors);
      for (const key of ['frontImage', 'backImage']) {
        if (card[key] !== undefined) checkImage(card[key], `${name}: "${key}"`, file, errors, warnings, images);
      }

      if (typeof card.front === 'string' && card.front.trim()) {
        // Two cards may share a front (e.g. "What is labelled A?") if they show different pictures.
        const key = normalise(card.front) + (typeof card.frontImage === 'string' ? `|${card.frontImage}` : '');
        if (seenFronts.has(key)) {
          errors.push(`${name} is a duplicate: card ${seenFronts.get(key)} has the same front. Merge them or reword one.`);
        } else {
          seenFronts.set(key, i + 1);
        }
        if (typeof card.back === 'string' && normalise(card.back) === normalise(card.front)) {
          warnings.push(`${name}: the front and back are the same.`);
        }
        if (card.front.length > 300) warnings.push(`${name}: the front is very long (${card.front.length} characters). Consider splitting it.`);
      }
      if (typeof card.back === 'string' && card.back.length > 600) {
        warnings.push(`${name}: the back is very long (${card.back.length} characters). Consider splitting it.`);
      }
    });
  }

  // ---- 5. Optional multiple-choice questions ----
  if (deck.questions !== undefined) {
    if (!Array.isArray(deck.questions)) {
      errors.push('"questions" must be a list: "questions": [ { "question": "...", "options": [...], "answerIndex": 0 } ]');
    } else {
      const seenQuestions = new Map();
      deck.questions.forEach((q, i) => {
        const label = `Question ${i + 1}`;
        if (typeof q !== 'object' || q === null || Array.isArray(q)) {
          errors.push(`${label} must be an object like { "question": "...", "options": [...], "answerIndex": 0 }.`);
          return;
        }
        const name = typeof q.question === 'string' && q.question.trim() ? `${label} ("${short(q.question)}")` : label;

        for (const key of Object.keys(q)) {
          if (!QUESTION_KEYS.includes(key)) warnings.push(`${name}: unknown field "${key}" (allowed: ${QUESTION_KEYS.join(', ')}).`);
        }
        checkRequiredString(q.question, `${name}: "question"`, errors);
        if (q.explanation !== undefined) checkRequiredString(q.explanation, `${name}: "explanation"`, errors, 'Remove "explanation" or give it some text.');
        checkTags(q.tags, `${name}: "tags"`, errors);

        if (!Array.isArray(q.options)) {
          errors.push(`${name}: "options" must be a list of 2 to 6 answer strings.`);
        } else {
          if (q.options.length < 2 || q.options.length > 6) errors.push(`${name}: has ${q.options.length} options. It needs between 2 and 6.`);
          const seenOptions = new Set();
          q.options.forEach((opt, j) => {
            if (typeof opt !== 'string' || !opt.trim()) {
              errors.push(`${name}: option ${j + 1} must be some text.`);
            } else if (seenOptions.has(normalise(opt))) {
              errors.push(`${name}: option ${j + 1} ("${short(opt)}") appears twice.`);
            } else {
              seenOptions.add(normalise(opt));
            }
          });
          if (!Number.isInteger(q.answerIndex)) {
            errors.push(`${name}: "answerIndex" must be a whole number: the position of the correct option, counting from 0.`);
          } else if (q.answerIndex < 0 || q.answerIndex >= q.options.length) {
            errors.push(`${name}: "answerIndex" is ${q.answerIndex}, but there are only ${q.options.length} options (valid values are 0 to ${q.options.length - 1}). Remember it counts from 0.`);
          }
        }

        if (typeof q.question === 'string' && q.question.trim()) {
          const key = normalise(q.question);
          if (seenQuestions.has(key)) errors.push(`${name} is a duplicate of question ${seenQuestions.get(key)}.`);
          else seenQuestions.set(key, i + 1);
        }
      });
    }
  }

  return { errors, warnings, deck, images };
}

/** Checks a card picture path such as "images/heart.png" (relative to the deck file's folder). */
function checkImage(value, label, deckFile, errors, warnings, images) {
  if (typeof value !== 'string' || !value.trim()) {
    errors.push(`${label} must be the path of a picture, e.g. "images/heart.png".`);
    return;
  }
  if (/^[a-z]+:|^\/\//i.test(value)) {
    errors.push(`${label} is a web link. Download the picture into this deck's images/ folder and use a path like "images/heart.png", so it works offline and can't disappear.`);
    return;
  }
  if (value.startsWith('/') || value.split(/[\\/]/).includes('..')) {
    errors.push(`${label} must be a path inside this deck's folder, like "images/heart.png" (no leading "/" and no "..").`);
    return;
  }
  const ext = path.extname(value).toLowerCase();
  if (!IMAGE_TYPES.includes(ext)) {
    errors.push(`${label}: "${value}" isn't a supported picture type. Use ${IMAGE_TYPES.join(', ')}.`);
    return;
  }
  const full = path.join(path.dirname(path.resolve(deckFile)), value);
  if (!fs.existsSync(full)) {
    errors.push(`${label}: the picture ${relPath(full)} doesn't exist. Check the spelling and that the file was added.`);
    return;
  }
  images.push(full);
  if (!isKebabCase(path.basename(value, path.extname(value)))) {
    warnings.push(`${label}: rename "${path.basename(value)}" to lowercase words joined by hyphens (e.g. "heart-diagram.png") to avoid problems on some systems.`);
  }
  const size = fs.statSync(full).size;
  if (size > IMAGE_WARN_BYTES) {
    warnings.push(`${label}: ${relPath(full)} is ${Math.round(size / 1024)} KB. Pictures over ${IMAGE_WARN_BYTES / 1024} KB load slowly on phones. Try shrinking or compressing it.`);
  }
}

// ---------- helpers ----------

function checkRequiredString(value, label, errors, extra = '') {
  if (value === undefined) errors.push(`${label} is missing. ${extra}`.trim());
  else if (typeof value !== 'string') errors.push(`${label} must be text in "double quotes".`);
  else if (!value.trim()) errors.push(`${label} is empty. ${extra}`.trim());
}

function checkTags(tags, label, errors) {
  if (tags === undefined) return;
  if (!Array.isArray(tags)) {
    errors.push(`${label} must be a list, e.g. ["cells", "gcse"].`);
    return;
  }
  for (const tag of tags) {
    if (typeof tag !== 'string' || !isKebabCase(tag)) {
      errors.push(`${label}: tag ${JSON.stringify(tag)} must be lowercase words joined by hyphens, e.g. "plant-cells".`);
    }
  }
  if (new Set(tags).size !== tags.length) errors.push(`${label} contains the same tag twice.`);
}

// Used to spot duplicates: ignores case, extra spaces and trailing punctuation.
function normalise(text) {
  return String(text).toLowerCase().replace(/\s+/g, ' ').replace(/[.?!\s]+$/, '').trim();
}

function short(text, max = 40) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max - 1) + '…' : clean;
}

// Explains a JSON syntax error: what went wrong, the line and column, and a likely cause.
function describeJsonError(text, err) {
  const found = findJsonError(text);
  let message = `Invalid JSON: ${found ? found.reason : err.message.split('\n')[0]}`;
  if (found) {
    const pos = found.pos;
    const before = text.slice(0, pos);
    const line = before.split('\n').length;
    const column = pos - before.lastIndexOf('\n');
    const lineText = text.split('\n')[line - 1] || '';
    message += `\n      at line ${line}, column ${column}:\n      ${lineText.replace(/\t/g, ' ')}\n      ${' '.repeat(Math.max(0, column - 1))}^`;
  }
  // Common beginner mistakes, in rough order of likelihood.
  if (/,\s*[}\]]/.test(text)) message += '\n      Tip: there is a comma right before a } or ]. JSON does not allow trailing commas.';
  else if (/'[^']*'\s*:/.test(text)) message += '\n      Tip: JSON needs "double quotes", not \'single quotes\'.';
  else if (/[“”]/.test(text)) message += '\n      Tip: the file contains curly quotes (“ ”). Use straight double quotes (") around keys and values.';
  else message += '\n      Tip: check for a missing comma between items, or a missing closing } or ].';
  return message;
}

/**
 * A tiny JSON reader whose only job is to find WHERE a syntax error is
 * (newer Node versions no longer say). Returns { pos, reason } or null.
 */
function findJsonError(text) {
  let i = 0;
  const fail = (reason) => {
    throw { pos: i, reason };
  };
  const describe = () => (i >= text.length ? 'the file ended too early' : `unexpected ${JSON.stringify(text[i])}`);
  const skipSpace = () => {
    while (/\s/.test(text[i] || '')) i++;
  };
  const expect = (ch, what) => {
    skipSpace();
    if (text[i] !== ch) fail(`expected ${what} but found ${describe().replace('unexpected ', '')}`);
    i++;
  };

  function value() {
    skipSpace();
    const ch = text[i];
    if (ch === '{') return object();
    if (ch === '[') return array();
    if (ch === '"') return string();
    if (/[-0-9]/.test(ch || '')) return number();
    for (const word of ['true', 'false', 'null']) {
      if (text.startsWith(word, i)) {
        i += word.length;
        return;
      }
    }
    fail(`${describe()} where a value should be (text needs "double quotes")`);
  }
  function object() {
    i++; // {
    skipSpace();
    if (text[i] === '}') return void i++;
    for (;;) {
      skipSpace();
      if (text[i] !== '"') fail(`${describe()} where a "key" in double quotes should be`);
      string();
      expect(':', 'a colon ":"');
      value();
      skipSpace();
      if (text[i] === ',') {
        i++;
        skipSpace();
        if (text[i] === '}') fail('trailing comma before "}"');
        continue;
      }
      if (text[i] === '}') return void i++;
      fail(`${describe()}: probably a missing comma, or a missing "}"`);
    }
  }
  function array() {
    i++; // [
    skipSpace();
    if (text[i] === ']') return void i++;
    for (;;) {
      value();
      skipSpace();
      if (text[i] === ',') {
        i++;
        skipSpace();
        if (text[i] === ']') fail('trailing comma before "]"');
        continue;
      }
      if (text[i] === ']') return void i++;
      fail(`${describe()}: probably a missing comma, or a missing "]"`);
    }
  }
  function string() {
    i++; // opening "
    while (i < text.length && text[i] !== '"') {
      if (text[i] === '\n') fail('text in quotes runs onto a new line (missing closing ", or use \\n for a line break)');
      i += text[i] === '\\' ? 2 : 1;
    }
    if (i >= text.length) fail('a "quoted text" is never closed');
    i++; // closing "
  }
  function number() {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
    if (!m) fail(`${describe()} (not a valid number)`);
    i += m[0].length;
  }

  try {
    value();
    skipSpace();
    if (i < text.length) fail(`${describe()} after the end of the deck (extra text, or one "}" too many)`);
    return null;
  } catch (e) {
    return e && typeof e.pos === 'number' ? e : null;
  }
}

// ---------- main ----------

function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const files = args.length ? args.map((a) => path.resolve(a)) : findJsonFiles();

  let errorCount = 0;
  let warningCount = 0;
  let deckCount = 0;
  const titles = new Map(); // "subject|title" -> file, to warn about duplicate decks
  const usedImages = new Set(); // pictures referenced by any deck

  for (const file of files) {
    if (path.resolve(file) === INDEX_FILE) continue; // generated file, not a deck
    if (!fs.existsSync(file)) {
      console.log(red(`✖ ${file}: file not found`));
      errorCount++;
      continue;
    }
    const { errors, warnings, deck, images } = validateFile(file);
    images.forEach((img) => usedImages.add(img));
    if (path.resolve(file) !== TEMPLATE_FILE) deckCount++;

    if (deck && typeof deck.title === 'string' && typeof deck.subject === 'string' && path.resolve(file) !== TEMPLATE_FILE) {
      const key = `${slugify(deck.subject)}|${deck.title.trim().toLowerCase()}`;
      if (titles.has(key)) warnings.push(`Another deck in this subject has the same title: ${titles.get(key)}`);
      else titles.set(key, relPath(file));
    }

    const counts = deck && Array.isArray(deck.cards)
      ? dim(` (${deck.cards.length} cards${Array.isArray(deck.questions) ? `, ${deck.questions.length} questions` : ''})`)
      : '';
    if (errors.length) console.log(red(`✖ ${relPath(file)}`) + counts);
    else console.log(green(`✔ ${relPath(file)}`) + counts);
    for (const e of errors) console.log(red(`    error: ${e}`));
    for (const w of warnings) console.log(yellow(`    warning: ${w}`));

    errorCount += errors.length;
    warningCount += warnings.length;
  }

  // When checking everything: warn about files in decks/ the site never uses (stray notes, unused pictures).
  if (!args.length && fs.existsSync(DECKS_DIR)) {
    for (const f of listAll(DECKS_DIR)) {
      if (f.endsWith('.json') || path.basename(f) === '.gitkeep') continue;
      const isImage = IMAGE_TYPES.includes(path.extname(f).toLowerCase());
      if (isImage && usedImages.has(f)) continue;
      console.log(yellow(isImage ? `⚠ ${relPath(f)}: no card uses this picture.` : `⚠ ${relPath(f)}: not a .json file, so the site will ignore it.`));
      warningCount++;
    }
  }

  console.log('');
  const summary = `${deckCount} deck file(s) checked: ${errorCount} error(s), ${warningCount} warning(s).`;
  if (errorCount) {
    console.log(bold(red(summary)));
    console.log(red('Fix the errors above, then run `node scripts/validate.js` again.'));
    process.exit(1);
  }
  console.log(bold(green(summary)));
}

function listAll(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? listAll(full) : [full];
  });
}

if (require.main === module) main();

module.exports = { validateFile };
