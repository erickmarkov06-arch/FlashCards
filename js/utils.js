/**
 * utils.js — small helper functions used all over the app.
 */

/** Makes text safe to put inside HTML (stops "<b>" in a card from becoming real HTML). */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Returns a shuffled copy of an array (Fisher–Yates shuffle). */
export function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** "1 card", "2 cards" */
export function plural(count, word, pluralWord = word + 's') {
  return `${count} ${count === 1 ? word : pluralWord}`;
}

/** Turns any text into a short stable ID (FNV-1a hash). Used to remember progress per card. */
export function hashString(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

// ---------- Dates (always the device's local calendar day, as "YYYY-MM-DD") ----------

export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(dayKey, days) {
  const [y, m, d] = dayKey.split('-').map(Number);
  return todayKey(new Date(y, m - 1, d + days));
}

/** "today", "tomorrow", "in 3 days", or a date for anything further away. */
export function describeDay(dayKey) {
  const today = todayKey();
  if (dayKey <= today) return 'today';
  if (dayKey === addDays(today, 1)) return 'tomorrow';
  for (let i = 2; i <= 6; i++) if (dayKey === addDays(today, i)) return `in ${i} days`;
  const [y, m, d] = dayKey.split('-').map(Number);
  return 'on ' + new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// ---------- Forgiving answer checking (used by Write mode) ----------

/**
 * Compares what the student typed with the correct answer.
 * Returns "correct", "close" (right apart from a small typo or accent), or "wrong".
 *
 * It ignores: capital letters, spaces, punctuation, a leading "the/a/an",
 * and anything in (brackets). Answers written as "to do / to make" accept either part.
 */
export function checkAnswer(typed, answer) {
  const typedStrict = normaliseAnswer(typed);
  if (!typedStrict) return 'wrong';
  const typedLoose = stripAccents(typedStrict);

  let result = 'wrong';
  for (const variant of answerVariants(answer)) {
    if (typedStrict === variant) return 'correct';
    const loose = stripAccents(variant);
    if (typedLoose === loose || editDistance(typedLoose, loose) <= typoAllowance(loose.length)) {
      result = 'close';
    }
  }
  return result;
}

// All the forms of an answer we accept: the whole thing, without brackets, and each " / " part.
function answerVariants(answer) {
  const text = String(answer);
  const withoutBrackets = text.replace(/\([^)]*\)/g, ' ');
  const parts = [text, withoutBrackets, ...withoutBrackets.split(/\s+\/\s+|\s*\|\s*/)];
  const variants = new Set(parts.map(normaliseAnswer));
  variants.delete('');
  return [...variants];
}

// Lower-case, drop punctuation, a leading article and ALL spaces: " The Cell-Wall. " -> "cellwall"
function normaliseAnswer(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/^(the|a|an) /, '')
    .replace(/\s+/g, '');
}

function stripAccents(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '');
}

// How many typing mistakes we forgive, based on the answer's length.
function typoAllowance(length) {
  if (length <= 3) return 0;
  if (length <= 6) return 1;
  if (length <= 12) return 2;
  return Math.floor(length * 0.15);
}

/** Number of single-letter edits (insert, delete, change, swap neighbours) between two strings. */
export function editDistance(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d = Array.from({ length: rows }, (_, i) => [i, ...new Array(cols - 1).fill(0)]);
  for (let j = 0; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); // swapped letters, e.g. "teh"
      }
    }
  }
  return d[a.length][b.length];
}

// ---------- Little UI helpers ----------

/** Shows a short message at the bottom of the screen. */
export function toast(message) {
  const box = document.getElementById('toast');
  if (!box) return;
  box.textContent = message;
  box.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => box.classList.remove('show'), 2600);
}

/** The header at the top of most pages: an optional back link, a small label (eyebrow) and a title. */
export function pageHeader({ title, eyebrow = '', back = '', backLabel = 'Back' }) {
  return `
    <div class="page-header">
      ${back ? `<a class="back-link" href="${esc(back)}">${icons.back}<span>${esc(backLabel)}</span></a>` : ''}
      ${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ''}
      <h1>${esc(title)}</h1>
    </div>`;
}

/** Text with line breaks kept. Long text gets a smaller font class. */
export function cardText(text) {
  const t = String(text ?? '');
  const size = t.length > 220 ? 'text-xs' : t.length > 110 ? 'text-sm' : t.length > 40 ? 'text-md' : 'text-lg';
  return `<div class="card-text ${size}">${esc(t)}</div>`;
}

/** One side of a card: its text, language (for read-aloud) and picture URL. */
export function cardSide(card, side) {
  return side === 'front'
    ? { text: card.front, lang: card.frontLang || '', image: card.frontImageUrl || '' }
    : { text: card.back, lang: card.backLang || '', image: card.backImageUrl || '' };
}

/** A card's picture. `draggable=false` so dragging it swipes the card instead. */
export function cardImage(url, alt = '') {
  return url ? `<img class="card-image" src="${esc(url)}" alt="${esc(alt)}" draggable="false" decoding="async">` : '';
}

/** True if a keyboard event came from a text box (so keyboard shortcuts should ignore it). */
export function isTypingTarget(event) {
  const el = event.target;
  return el instanceof HTMLElement && el.closest('input, textarea, select, [contenteditable="true"]') !== null;
}

/** True if a keyboard event came from a button or link, where Space/Enter already "click" it. */
export function isButtonTarget(event) {
  const el = event.target;
  return el instanceof HTMLElement && el.closest('button, a') !== null;
}

// Simple inline SVG icons (no icon font or external files needed).
const svg = (body) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  chevron: svg('<path d="M9 18l6-6-6-6"/>'),
  cards: svg('<rect x="3" y="6" width="14" height="14" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v12"/>'),
  repeat: svg('<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>'),
  quiz: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7"/><path d="M12 17h.01"/>'),
  write: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  match: svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><path d="M14 6.5h3.5V10M10 17.5H6.5V14"/>'),
  stats: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  bookmark: svg('<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: svg('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
  shuffle: svg('<path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/>'),
  check: svg('<path d="M20 6L9 17l-5-5"/>'),
  x: svg('<path d="M18 6L6 18M6 6l12 12"/>'),
  swap: svg('<path d="M7 16V4M3 8l4-4 4 4"/><path d="M17 8v12M21 16l-4 4-4-4"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
  speaker: svg('<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
};
