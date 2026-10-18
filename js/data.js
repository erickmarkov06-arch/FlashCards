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

/**
 * Loads one deck by its ID, e.g. "biology/cell-structure".
 * Also understands mixed decks (several decks studied together):
 *   "mix/subject/biology"  every Biology deck
 *   "mix/tag/paper-1"      every card tagged paper-1 (or in a deck tagged paper-1)
 */
export async function loadDeck(id) {
  if (deckCache.has(id)) return deckCache.get(id);
  if (id.startsWith('mix/')) {
    const mix = await loadMix(id);
    deckCache.set(id, mix);
    return mix;
  }

  const index = await loadIndex();
  const entry = index.decks.find((d) => d.id === id);
  if (!entry) throw new Error(`There is no deck called "${id}". It may have been renamed or removed.`);

  const raw = await fetchJson(`decks/${entry.path}`);
  const deck = cleanDeck(raw, entry);
  deckCache.set(id, deck);
  return deck;
}

/** Link IDs for mixed decks. */
export const mixId = {
  subject: (slug) => `mix/subject/${slug}`,
  tag: (tag) => `mix/tag/${tag}`,
};

/** Builds one combined deck out of several. Every card keeps its own deckId, so progress stays with its real deck. */
async function loadMix(id) {
  const [, kind, value] = id.split('/');
  const index = await loadIndex();
  let entries;
  let title;
  if (kind === 'subject') {
    entries = index.decks.filter((d) => d.subjectSlug === value);
    title = `All of ${entries[0]?.subject || value}`;
  } else if (kind === 'tag') {
    entries = index.decks.filter((d) => (d.tags || []).includes(value));
    title = `Everything tagged #${value}`;
  }
  if (!entries || !entries.length) throw new Error('There are no decks to mix here.');

  const decks = await Promise.all(entries.map((e) => loadDeck(e.id)));
  const matchesTag = (deck, item) => kind !== 'tag' || deck.tags.includes(value) || (item.tags || []).includes(value);
  const same = (key) => (decks.every((d) => d[key] === decks[0][key]) ? decks[0][key] : '');

  return {
    id,
    isMix: true,
    sources: decks.map((d) => ({ id: d.id, title: d.title })),
    title,
    subject: kind === 'subject' ? entries[0].subject : 'Mixed',
    description: `${decks.length} decks studied together.`,
    author: '',
    tags: [],
    frontLang: same('frontLang'),
    backLang: same('backLang'),
    cards: decks.flatMap((d) => d.cards.filter((c) => matchesTag(d, c))),
    questions: decks.flatMap((d) => d.questions.filter((q) => matchesTag(d, q))),
  };
}

/** Keeps only well-formed cards and questions, so one bad entry can't break a study mode. */
function cleanDeck(raw, entry) {
  const isText = (v) => typeof v === 'string' && v.trim() !== '';
  // Picture paths in a deck are relative to the deck's folder: "images/heart.png" -> "decks/biology/images/heart.png".
  const folder = entry.path.slice(0, entry.path.lastIndexOf('/') + 1);
  const imageUrl = (p) => (isText(p) && !p.includes('..') && !/^[a-z]+:|^\//i.test(p) ? `decks/${folder}${p}` : '');
  const lang = (v) => (typeof v === 'string' && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(v) ? v : '');
  const frontLang = lang(raw.frontLang);
  const backLang = lang(raw.backLang);

  const cards = (Array.isArray(raw.cards) ? raw.cards : [])
    .filter((c) => c && isText(c.front) && isText(c.back))
    // Each card remembers its deck, languages and picture URLs, so it still works when decks are mixed.
    .map((c) => ({
      ...c,
      deckId: entry.id,
      frontLang,
      backLang,
      frontImageUrl: imageUrl(c.frontImage),
      backImageUrl: imageUrl(c.backImage),
    }));
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
  return {
    id: entry.id,
    title: raw.title || entry.title,
    subject: raw.subject || entry.subject,
    description: raw.description || '',
    author: raw.author || '',
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    // Language codes like "es" or "en-GB" switch on read-aloud for that side of the cards.
    frontLang,
    backLang,
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
