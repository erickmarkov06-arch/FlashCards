/**
 * app.js — starts the app: theme toggle, page routing, offline support.
 *
 * Pages are chosen by the part of the URL after "#", for example:
 *   #/                              home (all decks)
 *   #/mydecks                       the decks you added to My decks
 *   #/deck/biology/cell-structure   one deck's page
 *   #/flashcards/biology/cell-structure  (also quiz, write, match, review)
 *   #/review                        review due cards from every deck
 *   #/stats                         progress, export/import, sign-in and username
 *   #/leaderboard                   rankings of signed-in users who chose to appear
 * Using "#" means GitHub Pages never needs special server settings.
 */
import { icons, esc, toast } from './utils.js';
import { setSetting, progressByDeck } from './store.js';
import { loadIndex } from './data.js';
import { startSync, onSyncChange, finishSignInFromLink, syncStatus, syncEnabled } from './sync.js';

import * as home from './views/home.js';
import * as deck from './views/deck.js';
import * as flashcards from './views/flashcards.js';
import * as quiz from './views/quiz.js';
import * as write from './views/write.js';
import * as match from './views/match.js';
import * as review from './views/review.js';
import * as stats from './views/stats.js';
import * as leaderboard from './views/leaderboard.js';
import * as mydecks from './views/mydecks.js';
import * as welcome from './views/welcome.js';

const routes = { '': home, mydecks, deck, flashcards, quiz, write, match, review, stats, leaderboard };

const main = document.getElementById('app');
let cleanup = null; // function the current page gave us to remove its listeners/timers
let renderCount = 0;

// ---------- routing ----------

/** "#/flashcards/biology/cells?wrong=1" -> { view: "flashcards", deckId: "biology/cells", query: {wrong: "1"} } */
function parseHash() {
  const [path, queryString = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [view = '', ...rest] = path.split('/').filter(Boolean);
  return {
    view: decodeURIComponent(view),
    deckId: rest.map(decodeURIComponent).join('/'),
    query: Object.fromEntries(new URLSearchParams(queryString)),
  };
}

/**
 * Everyone signs in and picks a username before using the app (when accounts are set up in
 * config.js). The sign-in is saved on the device, so this only happens once per device.
 * While the username hasn't been fetched yet (e.g. offline), the app is let through.
 * Returns the welcome step to show: 'sign-in', 'username', or '' for none.
 */
function welcomeStep() {
  if (!syncEnabled) return '';
  const s = syncStatus();
  if (!s.signedIn) return 'sign-in';
  if (s.profileLoaded && !s.username) return 'username';
  return '';
}
let gate = ''; // the welcome step on screen ('sign-in' or 'username'), or '' once into the app

async function router() {
  const route = parseHash();
  gate = welcomeStep();
  document.body.classList.toggle('gated', Boolean(gate));
  const page = gate ? welcome : routes[route.view] || null;
  const thisRender = ++renderCount;

  if (cleanup) {
    try {
      cleanup();
    } catch (err) {
      console.error(err);
    }
    cleanup = null;
  }

  // Each page draws into a fresh container. If the user navigates away while a page is
  // still loading, its container is simply thrown away.
  const container = document.createElement('div');
  container.className = 'view';
  main.replaceChildren(container);
  window.scrollTo(0, 0);
  updateNav(route.view);

  if (!page) {
    container.innerHTML = `<div class="empty-state"><h1>Page not found</h1><p><a class="btn" href="#/">Go to all decks</a></p></div>`;
    return;
  }

  container.innerHTML = `<div class="loading" aria-live="polite">Loading…</div>`;
  try {
    const result = await page.render(container, route);
    if (thisRender !== renderCount) {
      if (typeof result === 'function') result(); // user already moved on
      return;
    }
    cleanup = typeof result === 'function' ? result : null;
    document.title = container.dataset.title ? `${container.dataset.title} · StudyDeck` : 'StudyDeck';
  } catch (err) {
    console.error(err);
    if (thisRender !== renderCount) return;
    container.innerHTML = `
      <div class="empty-state">
        <h1>Something went wrong</h1>
        <p>${esc(err.message || err)}</p>
        <p><button class="btn" type="button" onclick="location.reload()">Try again</button>
           <a class="btn btn-ghost" href="#/">All decks</a></p>
      </div>`;
  }
  updateDueBadge();
}

function updateNav(view) {
  const section = view === 'mydecks' ? 'mydecks' : view === 'stats' || view === 'leaderboard' ? 'stats' : view === 'review' && !parseHash().deckId ? 'review' : 'home';
  document.querySelectorAll('.bottom-nav a').forEach((a) => {
    if (a.dataset.nav === section) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

/** Shows how many cards are due on the Review tab. */
export function updateDueBadge() {
  const badge = document.getElementById('due-badge');
  loadIndex()
    .then((index) => {
      const known = new Set(index.decks.map((d) => d.id));
      const due = Object.entries(progressByDeck())
        .filter(([id]) => known.has(id))
        .reduce((sum, [, p]) => sum + p.due, 0);
      badge.hidden = due === 0;
      badge.textContent = due > 99 ? '99+' : String(due);
    })
    .catch(() => (badge.hidden = true));
}

// ---------- light / dark theme ----------

function currentTheme() {
  return document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

function applyThemeUi() {
  const theme = currentTheme();
  const button = document.getElementById('theme-toggle');
  button.innerHTML = theme === 'dark' ? icons.sun : icons.moon;
  button.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  document.querySelector('meta[name="theme-color"]').setAttribute('content', theme === 'dark' ? '#161512' : '#f6f4ef');
}

document.getElementById('theme-toggle').addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  setSetting('theme', next);
  applyThemeUi();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyThemeUi);

// ---------- offline support (service worker) ----------

function setUpOffline() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;

  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Offline mode unavailable:', err));

  // Ask the service worker to save every deck, so they all work offline (not only the ones opened).
  loadIndex()
    .then(async (index) => {
      const reg = await navigator.serviceWorker.ready;
      const urls = [
        'decks/index.json',
        ...index.decks.map((d) => `decks/${d.path}`),
        ...index.decks.flatMap((d) => (d.images || []).map((p) => `decks/${p}`)), // card pictures
      ];
      reg.active?.postMessage({ type: 'cache-urls', urls });
    })
    .catch(() => {});

  // Ask the browser not to clear our saved progress when space runs low.
  navigator.storage?.persist?.().catch(() => {});
}

// ---------- syncing progress between devices (optional, see sync.js) ----------

/** Pages that only show progress, so they can be redrawn safely when new progress arrives. */
const REDRAW_ON_SYNC = new Set(['', 'mydecks', 'deck']);

/** "@username" in the top bar while signed in. */
function updateAccountChip() {
  const chip = document.getElementById('account-chip');
  const { signedIn, username } = syncStatus();
  chip.hidden = !signedIn || !username;
  chip.textContent = username ? `@${username}` : 'Choose a username';
  chip.setAttribute('aria-label', username ? `Signed in as ${username}` : 'Choose a username');
}

onSyncChange((changed) => {
  updateAccountChip();
  // Signed in, signed out, or picked a username: move between the welcome steps and the app.
  if (welcomeStep() !== gate) return router();
  if (gate) return;
  const { view, deckId } = parseHash();
  // The Stats page also shows sign-in and "last synced", so it is redrawn after every sync.
  // Study sessions are never interrupted; they read the latest progress as you go.
  // Nor is "Add decks" (#/mydecks/add), which would lose the decks you've ticked.
  const picking = view === 'mydecks' && deckId === 'add';
  if (view === 'stats' || (changed && REDRAW_ON_SYNC.has(view) && !picking)) router();
  else if (changed) updateDueBadge();
});

// ---------- start ----------

document.querySelectorAll('[data-icon]').forEach((el) => (el.innerHTML = icons[el.dataset.icon] || ''));
applyThemeUi();
window.addEventListener('hashchange', router);
window.addEventListener('online', () => toast("You're back online."));
window.addEventListener('offline', () => toast("You're offline. Saved decks still work."));
const signInMessage = finishSignInFromLink(); // arriving from the link in a sign-in email
router();
if (signInMessage) toast(signInMessage);
updateAccountChip();
setUpOffline();
startSync();
