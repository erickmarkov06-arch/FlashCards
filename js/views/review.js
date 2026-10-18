/**
 * Learn mode: spaced repetition with a simple Leitner box system.
 *
 * Every card sits in a box from 1 to 5. Know it -> it moves up a box and comes back later;
 * don't know it -> it goes back to box 1 and comes back today. The waiting time per box is
 * BOX_INTERVALS in store.js (1, 2, 4, 7 and 14 days). Cards in box 5 count as mastered.
 *
 * Language cards (decks with frontLang/backLang) are also practised back → front, with their own
 * boxes, once the normal direction reaches box 2. The "Both directions" toggle turns this off.
 *
 * #/review/<deck>  due cards from one deck, plus up to 10 new ones
 * #/review         due cards from every deck
 */
import { loadDeck, loadIndex } from '../data.js';
import {
  getAllProgress, cardKey, recordReview, progressByDeck, pruneDeck, getSetting, setSetting,
  NEW_CARDS_PER_SESSION, MAX_BOX, BOX_INTERVALS,
} from '../store.js';
import { esc, shuffle, plural, pageHeader, todayKey, describeDay, icons, isTypingTarget, isButtonTarget } from '../utils.js';
import { flipCardHtml, flip, attachGestures, flyOut, autoRead, readVisibleSide } from '../flipcard.js';
import { deckCanSpeak, readAloudChip, toggleAutoSpeak, attachSpeakButtons, stopSpeaking } from '../speech.js';

/** Language cards (a language set on either side) can also be practised back → front. */
const isLanguageCard = (card) => Boolean(card.frontLang || card.backLang);
/** The back → front direction only starts once the normal direction has reached this box. */
const REVERSE_FROM_BOX = 2;

export async function render(container, { deckId }) {
  const today = todayKey();
  const progress = getAllProgress();
  const bothWays = getSetting('learnBothWays', true);
  const recordFor = (deck, card, reverse = false) => progress[cardKey(deck.id, card, reverse)];
  // Directions a card can be studied in: always front → back, plus back → front for language cards.
  const directions = (card) => (bothWays && isLanguageCard(card) ? [false, true] : [false]);
  let decks = [];
  let items = []; // { deck, card, reverse } to review this session

  if (deckId) {
    const deck = await loadDeck(deckId);
    if (!deck.isMix) pruneDeck(deck.id, deck.cards);
    decks = [deck];
    const due = [];
    const fresh = [];
    for (const card of deck.cards) {
      for (const reverse of directions(card)) {
        const rec = recordFor(deck, card, reverse);
        if (rec && rec.box) {
          if (rec.due <= today) due.push({ deck, card, reverse });
        } else if (!reverse || (recordFor(deck, card)?.box || 0) >= REVERSE_FROM_BOX) {
          fresh.push({ deck, card, reverse });
        }
      }
    }
    items = [...shuffle(due), ...fresh.slice(0, NEW_CARDS_PER_SESSION)];
    container.dataset.title = `Learn · ${deck.title}`;
  } else {
    // Only download the decks that actually have something due.
    const index = await loadIndex();
    const counts = progressByDeck();
    const ids = index.decks.filter((d) => counts[d.id]?.due).map((d) => d.id);
    decks = (await Promise.all(ids.map((id) => loadDeck(id).catch(() => null)))).filter(Boolean);
    for (const deck of decks) {
      for (const card of deck.cards) {
        for (const reverse of directions(card)) {
          const rec = recordFor(deck, card, reverse);
          if (rec && rec.box && rec.due <= today) items.push({ deck, card, reverse });
        }
      }
    }
    items = shuffle(items);
    container.dataset.title = 'Review';
  }
  const hasLanguageCards = decks.some((d) => d.cards.some(isLanguageCard));

  const header = deckId
    ? pageHeader({ title: decks[0].title, eyebrow: 'Learn · spaced repetition', back: `#/deck/${decks[0].id}`, backLabel: 'Deck' })
    : pageHeader({ title: 'Review', eyebrow: 'Due today, all decks' });

  container.innerHTML = `
    <div class="study">
      ${header}
      ${
        hasLanguageCards || decks.some(deckCanSpeak)
          ? `<div class="chip-row" id="learn-toolbar">
               ${decks.some(deckCanSpeak) ? readAloudChip() : ''}
               ${hasLanguageCards ? `<button type="button" class="chip" data-opt="bothWays" aria-pressed="${bothWays}">${icons.swap} Both directions</button>` : ''}
             </div>`
          : ''
      }
      <div id="stage"></div>
      <details class="section small">
        <summary>How does Learn mode work?</summary>
        <p>Each card lives in one of ${MAX_BOX} boxes. When you know a card it moves up a box and you see it
        again later: box 2 after ${BOX_INTERVALS[2]} days, box 3 after ${BOX_INTERVALS[3]}, box 4 after ${BOX_INTERVALS[4]}
        and box 5 after ${BOX_INTERVALS[5]}. When you don't know it, it goes back to box 1 and comes back later in this session.
        Cards in box ${MAX_BOX} count as mastered. Each session adds up to ${NEW_CARDS_PER_SESSION} new cards.</p>
        ${
          hasLanguageCards
            ? `<p>With <b>Both directions</b> on, language cards are also asked the other way round (back → front),
               in their own boxes. That starts once you know a card the normal way (box ${REVERSE_FROM_BOX} or higher).</p>`
            : ''
        }
        <p>Your progress is saved on this device only.</p>
      </details>
    </div>`;
  const stage = container.querySelector('#stage');

  // Toolbar: "Read aloud" and "Both directions" (only shown for decks with languages).
  container.querySelector('#learn-toolbar')?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-opt]');
    if (chip?.dataset.opt === 'autoSpeak') toggleAutoSpeak(chip, () => readVisibleSide(stage.querySelector('#card')));
    if (chip?.dataset.opt === 'bothWays') {
      setSetting('learnBothWays', !bothWays);
      window.dispatchEvent(new HashChangeEvent('hashchange')); // reload this page with the new setting
    }
  });

  // ---------- nothing to do ----------
  if (!items.length) {
    if (deckId) {
      stage.innerHTML = `
        <div class="panel center">
          <h2>All caught up!</h2>
          <p>${nextDueText(decks)}</p>
          <div class="button-row" style="justify-content:center">
            <a class="btn" href="#/flashcards/${esc(decks[0].id)}">Practise with flashcards</a>
            <a class="btn btn-ghost" href="#/deck/${esc(decks[0].id)}">Back to deck</a>
          </div>
        </div>`;
    } else {
      const index = await loadIndex();
      const counts = progressByDeck();
      const toStart = index.decks.filter((d) => (counts[d.id]?.reviewed || 0) < d.cardCount);
      stage.innerHTML = `
        <div class="panel center">
          <h2>Nothing due today</h2>
          <p>Cards you study in Learn mode will come back here when they're due.</p>
        </div>
        ${
          toStart.length
            ? `<h2 class="section-label">Learn new cards</h2>
               <ul class="deck-list">${toStart
                 .map(
                   (d) => `
                   <li><a class="deck-row" href="#/review/${esc(d.id)}">
                     <span class="title">${esc(d.title)}</span>
                     <span class="meta">${plural(d.cardCount - (counts[d.id]?.reviewed || 0), 'new card')}</span>
                     <span class="desc">${esc(d.subject)}</span>
                   </a></li>`
                 )
                 .join('')}</ul>`
            : ''
        }`;
    }
    return;
  }

  // ---------- the session ----------
  const queue = [...items];
  const failed = new Set(); // cards answered wrong this session
  let reviewed = 0;
  let firstTry = 0;
  let revealed = false;
  let busy = false;

  function drawCard() {
    const { deck, card, reverse } = queue[0];
    const rec = recordFor(deck, card, reverse);
    revealed = false;
    stage.innerHTML = `
      <div class="study-top">
        <span>${plural(queue.length, 'card')} left</span>
        <span>${rec && rec.box ? `Box ${rec.box} of ${MAX_BOX}` : 'New'}${reverse ? ` · ${esc(directionLabel(card))}` : ''}</span>
      </div>
      <div class="bar"><span style="width:${(reviewed / (reviewed + queue.length)) * 100}%"></span></div>
      ${!deckId ? `<p class="muted small" style="margin:-8px 0 8px">${esc(deck.title)}</p>` : ''}
      ${flipCardHtml(card, { swap: reverse })}
      <div id="actions" style="margin-top:12px">
        <button type="button" class="btn btn-block" id="reveal">Show answer</button>
      </div>
      <p class="helper">Tap the card or "Show answer" to check yourself.</p>`;

    const el = stage.querySelector('#card');
    attachGestures(el, {
      onTap: () => {
        if (flip(el)) reveal();
        autoRead(el);
      },
      onSwipe: answer,
      canSwipe: () => revealed && !busy,
    });
    stage.querySelector('#reveal').addEventListener('click', () => {
      if (!el.classList.contains('flipped')) flip(el);
      reveal();
      autoRead(el);
    });
    autoRead(el);
  }

  function reveal() {
    if (revealed) return;
    revealed = true;
    const { card } = queue[0];
    stage.querySelector('#actions').innerHTML = `
      ${card.hint ? `<p class="hint-box"><strong>Hint:</strong> ${esc(card.hint)}</p>` : ''}
      <div class="button-row split">
        <button type="button" class="btn btn-bad" id="no">${icons.x} Didn't know</button>
        <button type="button" class="btn btn-good" id="yes">${icons.check} Knew it</button>
      </div>`;
    stage.querySelector('#no').addEventListener('click', () => answer(false));
    stage.querySelector('#yes').addEventListener('click', () => answer(true));
    stage.querySelector('.helper').textContent = 'Swipe right if you knew it, left if not.';
  }

  async function answer(known) {
    if (busy || !revealed) return;
    busy = true;
    const item = queue.shift();
    const key = cardKey(item.deck.id, item.card, item.reverse);
    const isRetry = failed.has(key);
    progress[key] = recordReview(item.deck.id, item.card, known, isRetry, item.reverse);

    if (known) {
      if (!isRetry) firstTry++;
      reviewed++;
    } else {
      failed.add(key);
      queue.push(item); // see it again at the end of this session
    }
    await flyOut(stage.querySelector('#card'), known);
    busy = false;
    if (queue.length) drawCard();
    else drawDone();
  }

  function drawDone() {
    stage.innerHTML = `
      <div class="panel center">
        <h2>Session complete!</h2>
        <div class="result-score">${firstTry}/${reviewed}</div>
        <p>known first time. ${nextDueText(decks)}</p>
        <div class="button-row" style="justify-content:center">
          ${deckId ? `<a class="btn" href="#/deck/${esc(deckId)}">Back to deck</a>` : `<a class="btn" href="#/">All decks</a>`}
          <a class="btn btn-ghost" href="#/stats">See stats</a>
        </div>
      </div>`;
  }

  // Keyboard: Space/Enter show answer, ← or 1 didn't know, → or 2 knew it, S say it out loud.
  function onKey(e) {
    const el = stage.querySelector('#card');
    if (!el || isTypingTarget(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.key === ' ' || e.key === 'Enter') && !isButtonTarget(e)) {
      e.preventDefault();
      if (flip(el)) reveal();
      autoRead(el);
    } else if (revealed && (e.key === 'ArrowLeft' || e.key === '1')) answer(false);
    else if (revealed && (e.key === 'ArrowRight' || e.key === '2')) answer(true);
    else if (e.key.toLowerCase() === 's') readVisibleSide(el);
  }
  document.addEventListener('keydown', onKey);

  attachSpeakButtons(stage);
  drawCard();
  return () => {
    document.removeEventListener('keydown', onKey);
    stopSpeaking();
  };
}

/** "Next review: tomorrow." based on the earliest due date among the decks' cards. */
function nextDueText(decks) {
  const all = getAllProgress();
  let next = null;
  for (const deck of decks) {
    for (const card of deck.cards) {
      for (const rec of [all[cardKey(deck.id, card)], all[cardKey(deck.id, card, true)]]) {
        if (rec && rec.box && (!next || rec.due < next)) next = rec.due;
      }
    }
  }
  return next ? `Next review: ${describeDay(next)}.` : '';
}

/** "English → Spanish" for a card asked back → front (falls back to "Back → front"). */
function directionLabel(card) {
  const from = languageName(card.backLang);
  const to = languageName(card.frontLang);
  return from && to ? `${from} → ${to}` : 'Back → front';
}

/** "es" -> "Spanish", using the browser's built-in list of language names. */
function languageName(code) {
  if (!code) return '';
  try {
    return new Intl.DisplayNames([navigator.language || 'en'], { type: 'language' }).of(code) || code;
  } catch {
    return code;
  }
}
