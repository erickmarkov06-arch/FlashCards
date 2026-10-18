/**
 * store.js — everything the app remembers, saved in this browser's localStorage.
 *
 * Nothing is ever sent to a server. Each device/browser keeps its own progress;
 * use Export / Import on the Stats page to move it between devices.
 *
 * What is saved (each under its own localStorage key):
 *   studydeck:progress  one record per card you have answered (see below)
 *   studydeck:activity  how many answers you gave on each day (for streaks)
 *   studydeck:match     your best Match-game time per deck
 *   studydeck:settings  theme and small preferences
 *
 * A card record looks like:
 *   { box: 2, due: "2026-10-20", seen: 5, correct: 4, wrong: 1, last: true, lastSeen: "2026-10-18T09:30:00.000Z" }
 *   box  = Leitner box 0-5 (0 = never reviewed in Learn mode, 5 = mastered)
 *   due  = the day it should next be reviewed in Learn mode
 *   last = whether the most recent answer (in any mode) was right
 */
import { hashString, todayKey, addDays } from './utils.js';

const KEYS = {
  progress: 'studydeck:progress',
  activity: 'studydeck:activity',
  match: 'studydeck:match',
  settings: 'studydeck:settings',
};

/** Days to wait before the next review, for each Leitner box (index = box number). */
export const BOX_INTERVALS = [0, 1, 2, 4, 7, 14];
export const MAX_BOX = 5;
/** How many never-seen cards Learn mode introduces per session. */
export const NEW_CARDS_PER_SESSION = 10;

// ---------- reading and writing localStorage safely ----------

function read(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value && typeof value === 'object' ? value : fallback;
  } catch {
    return fallback; // storage blocked (private mode) or corrupted
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn('Could not save progress:', err);
  }
}

// ---------- settings ----------

export function getSetting(name, fallback) {
  const settings = read(KEYS.settings, {});
  return name in settings ? settings[name] : fallback;
}

export function setSetting(name, value) {
  const settings = read(KEYS.settings, {});
  settings[name] = value;
  write(KEYS.settings, settings);
}

// ---------- card progress ----------

/** Added to a card's ID for the reverse direction (back → front) of language cards in Learn mode. */
export const REVERSE = '~r';

/**
 * A card's ID: its deck's ID plus a hash of its front (and front image, if any).
 * Editing the front starts that card fresh. Cards in a mixed deck carry their own
 * `deckId`, so progress always belongs to the card's real deck.
 */
export function cardKey(deckId, card, reverse = false) {
  const front = String(card.front).toLowerCase().replace(/\s+/g, ' ').trim();
  const image = card.frontImage ? `|${card.frontImage}` : '';
  return `${card.deckId || deckId}#${hashString(front + image)}${reverse ? REVERSE : ''}`;
}

const isReverseKey = (key) => key.endsWith(REVERSE);

export function getAllProgress() {
  return read(KEYS.progress, {});
}

export function getCardProgress(deckId, card, reverse = false) {
  return getAllProgress()[cardKey(deckId, card, reverse)] || null;
}

/** Records an answer from any study mode (does not move Leitner boxes). */
export function recordAnswer(deckId, card, correct, reverse = false) {
  const all = getAllProgress();
  const key = cardKey(deckId, card, reverse);
  const rec = all[key] || { box: 0, due: todayKey(), seen: 0, correct: 0, wrong: 0 };
  rec.seen++;
  if (correct) rec.correct++;
  else rec.wrong++;
  rec.last = correct;
  rec.lastSeen = new Date().toISOString();
  all[key] = rec;
  write(KEYS.progress, all);
  logActivity();
  return rec;
}

/** Turns the card's most recent wrong answer into a right one (Write mode's "I was right" button). */
export function markLastAnswerCorrect(deckId, card) {
  const all = getAllProgress();
  const rec = all[cardKey(deckId, card)];
  if (!rec || rec.last !== false) return;
  rec.wrong = Math.max(0, rec.wrong - 1);
  rec.correct++;
  rec.last = true;
  write(KEYS.progress, all);
}

/**
 * Records an answer in Learn (spaced repetition) mode and moves the card between Leitner boxes:
 *   right -> up one box, reviewed again after that box's interval
 *   wrong -> back to box 1, and due again today
 * If the card was already answered wrong earlier in this session (`isRetry`), getting it right
 * only schedules it for tomorrow, so a quick second try doesn't count as truly knowing it.
 * `reverse` = this was the back → front direction, which has its own box.
 */
export function recordReview(deckId, card, correct, isRetry = false, reverse = false) {
  recordAnswer(deckId, card, correct, reverse);
  const all = getAllProgress();
  const key = cardKey(deckId, card, reverse);
  const rec = all[key];
  const today = todayKey();

  if (!correct) {
    rec.box = 1;
    rec.due = today;
  } else if (isRetry) {
    rec.box = 1;
    rec.due = addDays(today, BOX_INTERVALS[1]);
  } else {
    rec.box = Math.min(MAX_BOX, Math.max(rec.box, 1) + 1);
    rec.due = addDays(today, BOX_INTERVALS[rec.box]);
  }
  write(KEYS.progress, all);
  return rec;
}

/**
 * Counts how a deck's cards are doing: new, learning, mastered, due today, and last-answer-wrong.
 * New/learning/mastered describe the normal direction; "due" also includes reverse reviews.
 */
export function deckSummary(deckId, cards) {
  const all = getAllProgress();
  const today = todayKey();
  const summary = { total: cards.length, new: 0, learning: 0, mastered: 0, due: 0, wrong: 0 };
  for (const card of cards) {
    const rec = all[cardKey(deckId, card)];
    if (!rec || !rec.box) summary.new++;
    else if (rec.box >= MAX_BOX) summary.mastered++;
    else summary.learning++;
    if (rec && rec.box && rec.due <= today) summary.due++;
    if (rec && rec.last === false) summary.wrong++;
    const back = all[cardKey(deckId, card, true)];
    if (back && back.box && back.due <= today) summary.due++;
  }
  return summary;
}

/**
 * Summary per deck using only saved records (no need to download the decks).
 * Returns { [deckId]: { reviewed, mastered, due } }. Reverse reviews only add to "due".
 */
export function progressByDeck() {
  const today = todayKey();
  const result = {};
  for (const [key, rec] of Object.entries(getAllProgress())) {
    const deckId = key.slice(0, key.lastIndexOf('#'));
    const r = (result[deckId] ||= { reviewed: 0, mastered: 0, due: 0 });
    if (rec.box) {
      if (!isReverseKey(key)) {
        r.reviewed++;
        if (rec.box >= MAX_BOX) r.mastered++;
      }
      if (rec.due <= today) r.due++;
    }
  }
  return result;
}

/** Removes saved records for cards that no longer exist in a deck (e.g. after a card was edited). */
export function pruneDeck(deckId, cards) {
  const all = getAllProgress();
  const keep = new Set(cards.flatMap((c) => [cardKey(deckId, c), cardKey(deckId, c, true)]));
  let changed = false;
  for (const key of Object.keys(all)) {
    if (key.startsWith(deckId + '#') && !keep.has(key)) {
      delete all[key];
      changed = true;
    }
  }
  if (changed) write(KEYS.progress, all);
}

export function resetDeck(deckId) {
  const all = getAllProgress();
  for (const key of Object.keys(all)) if (key.startsWith(deckId + '#')) delete all[key];
  write(KEYS.progress, all);
  const best = read(KEYS.match, {});
  delete best[deckId];
  write(KEYS.match, best);
}

// ---------- activity and streaks ----------

/** Counts one answer for today. Call this for answers that are not tied to a card (quiz questions). */
export function logActivity() {
  const activity = read(KEYS.activity, {});
  const today = todayKey();
  activity[today] = (activity[today] || 0) + 1;
  write(KEYS.activity, activity);
}

export function getActivity() {
  return read(KEYS.activity, {});
}

/** Current streak = days in a row with at least one answer, ending today (or yesterday, if not studied yet today). */
export function getStreaks() {
  const activity = getActivity();
  const today = todayKey();
  let current = 0;
  let day = activity[today] ? today : addDays(today, -1);
  while (activity[day]) {
    current++;
    day = addDays(day, -1);
  }

  let longest = 0;
  let run = 0;
  let previous = null;
  for (const d of Object.keys(activity).filter((k) => activity[k] > 0).sort()) {
    run = previous && addDays(previous, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = d;
  }
  return { current, longest, studiedToday: Boolean(activity[today]) };
}

// ---------- match game best times ----------

export function getBestMatchTime(deckId) {
  return read(KEYS.match, {})[deckId] ?? null;
}

/** Saves the time if it beats the old best. Returns true for a new record. */
export function saveMatchTime(deckId, seconds) {
  const best = read(KEYS.match, {});
  if (best[deckId] != null && best[deckId] <= seconds) return false;
  best[deckId] = seconds;
  write(KEYS.match, best);
  return true;
}

// ---------- export / import / reset ----------

export function exportData() {
  return {
    app: 'studydeck',
    version: 1,
    exportedAt: new Date().toISOString(),
    progress: getAllProgress(),
    activity: getActivity(),
    match: read(KEYS.match, {}),
  };
}

/**
 * Merges an exported file into this device's progress.
 * For each card the more recently studied record wins; day counts and best times keep the best value.
 * Returns the number of card records imported. Throws an Error with a friendly message if the file is wrong.
 */
export function importData(data) {
  if (!data || data.app !== 'studydeck' || typeof data.progress !== 'object') {
    throw new Error("That file doesn't look like a StudyDeck progress export.");
  }

  const progress = getAllProgress();
  let count = 0;
  for (const [key, rec] of Object.entries(data.progress || {})) {
    if (!rec || typeof rec !== 'object' || typeof rec.box !== 'number') continue;
    const mine = progress[key];
    if (!mine || String(rec.lastSeen || '') > String(mine.lastSeen || '')) {
      progress[key] = rec;
      count++;
    }
  }
  write(KEYS.progress, progress);

  const activity = getActivity();
  for (const [day, n] of Object.entries(data.activity || {})) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && Number(n) > 0) activity[day] = Math.max(activity[day] || 0, Number(n));
  }
  write(KEYS.activity, activity);

  const best = read(KEYS.match, {});
  for (const [deckId, secs] of Object.entries(data.match || {})) {
    if (typeof secs === 'number' && (best[deckId] == null || secs < best[deckId])) best[deckId] = secs;
  }
  write(KEYS.match, best);

  return count;
}

export function resetAll() {
  for (const key of [KEYS.progress, KEYS.activity, KEYS.match]) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}
