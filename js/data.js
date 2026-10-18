/**
 * data.js — loads the deck list (decks/index.json) and individual deck files.
 *
 * All paths are relative, so the site works at https://you.github.io/your-repo/
 * as well as at http://localhost:8000/.
 */

let indexPromise = null;
const deckCache = new Map();

/** Loads decks/index.json once and reuses it. */
export function loadIndex() {
  if (!indexPromise) {
    indexPromise = fetchJson('decks/index.json')
      .then((index) => ({
        subjects: Array.isArray(index.subjects) ? index.subjects : [],
        decks: Array.isArray(index.decks) ? index.decks : [],
      }))
      .catch((err) => {
        indexPromise = null; // allow a retry next time
        throw err;
      });
  }
  return indexPromise;
}

/** Loads one deck by its ID, e.g. "biology/cell-structure". */
export async function loadDeck(id) {
  if (deckCache.has(id)) return deckCache.get(id);

  const index = await loadIndex();
  const entry = index.decks.find((d) => d.id === id);
  if (!entry) throw new Error(`There is no deck called "${id}". It may have been renamed or removed.`);

  const raw = await fetchJson(`decks/${entry.path}`);
  const deck = cleanDeck(raw, entry);
  deckCache.set(id, deck);
  return deck;
}

/** Keeps only well-formed cards and questions, so one bad entry can't break a study mode. */
function cleanDeck(raw, entry) {
  const isText = (v) => typeof v === 'string' && v.trim() !== '';
  const cards = (Array.isArray(raw.cards) ? raw.cards : []).filter((c) => c && isText(c.front) && isText(c.back));
  const questions = (Array.isArray(raw.questions) ? raw.questions : []).filter(
    (q) =>
      q &&
      isText(q.question) &&
      Array.isArray(q.options) &&
      q.options.length >= 2 &&
      q.options.every(isText) &&
      Number.isInteger(q.answerIndex) &&
      q.answerIndex >= 0 &&
      q.answerIndex < q.options.length
  );
  // Language codes like "es" or "en-GB" switch on read-aloud for that side of the cards.
  const lang = (v) => (typeof v === 'string' && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(v) ? v : '');
  return {
    id: entry.id,
    title: raw.title || entry.title,
    subject: raw.subject || entry.subject,
    description: raw.description || '',
    author: raw.author || '',
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    frontLang: lang(raw.frontLang),
    backLang: lang(raw.backLang),
    cards,
    questions,
  };
}

async function fetchJson(url) {
  let response;
  try {
    response = await fetch(url, { cache: 'no-cache' });
  } catch {
    if (location.protocol === 'file:') {
      throw new Error('This page was opened as a file. Start a local web server instead (see the README, "Run it locally").');
    }
    throw new Error("Couldn't load study content. Check your internet connection and try again.");
  }
  if (!response.ok) throw new Error(`Couldn't load ${url} (error ${response.status}).`);
  try {
    return await response.json();
  } catch {
    throw new Error(`${url} is not valid JSON. Run "node scripts/validate.js" to find the mistake.`);
  }
}
