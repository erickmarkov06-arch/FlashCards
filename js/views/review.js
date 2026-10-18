/**
 * Learn mode: spaced repetition with a simple Leitner box system.
 *
 * Every card sits in a box from 1 to 5. Know it -> it moves up a box and comes back later;
 * don't know it -> it goes back to box 1 and comes back today. The waiting time per box is
 * BOX_INTERVALS in store.js (1, 2, 4, 7 and 14 days). Cards in box 5 count as mastered.
 *
 * #/review/<deck>  due cards from one deck, plus up to 10 new ones
 * #/review         due cards from every deck
 */
import { loadDeck, loadIndex } from '../data.js';
import {
  getAllProgress, cardKey, recordReview, progressByDeck, pruneDeck,
  NEW_CARDS_PER_SESSION, MAX_BOX, BOX_INTERVALS,
} from '../store.js';
import { esc, shuffle, plural, pageHeader, todayKey, describeDay, icons, isTypingTarget, isButtonTarget } from '../utils.js';
import { flipCardHtml, flip, attachGestures, flyOut } from '../flipcard.js';

export async function render(container, { deckId }) {
  const today = todayKey();
  const progress = getAllProgress();
  const recordFor = (deck, card) => progress[cardKey(deck.id, card)];
  let decks = [];
  let items = []; // { deck, card } to review this session

  if (deckId) {
    const deck = await loadDeck(deckId);
    pruneDeck(deck.id, deck.cards);
    decks = [deck];
    const due = [];
    const fresh = [];
    for (const card of deck.cards) {
      const rec = recordFor(deck, card);
      if (!rec || !rec.box) fresh.push(card);
      else if (rec.due <= today) due.push(card);
    }
    items = [...shuffle(due), ...fresh.slice(0, NEW_CARDS_PER_SESSION)].map((card) => ({ deck, card }));
    container.dataset.title = `Learn · ${deck.title}`;
  } else {
    // Only download the decks that actually have something due.
    const index = await loadIndex();
    const counts = progressByDeck();
    const ids = index.decks.filter((d) => counts[d.id]?.due).map((d) => d.id);
    decks = (await Promise.all(ids.map((id) => loadDeck(id).catch(() => null)))).filter(Boolean);
    for (const deck of decks) {
      for (const card of deck.cards) {
        const rec = recordFor(deck, card);
        if (rec && rec.box && rec.due <= today) items.push({ deck, card });
      }
    }
    items = shuffle(items);
    container.dataset.title = 'Review';
  }

  const header = deckId
    ? pageHeader({ title: decks[0].title, subtitle: 'Learn · spaced repetition', back: `#/deck/${decks[0].id}`, backLabel: 'Deck' })
    : pageHeader({ title: 'Review', subtitle: 'Cards due today from all your decks' });

  container.innerHTML = `
    <div class="study">
      ${header}
      <div id="stage"></div>
      <details class="section small">
        <summary>How does Learn mode work?</summary>
        <p>Each card lives in one of ${MAX_BOX} boxes. When you know a card it moves up a box and you see it
        again later: box 2 after ${BOX_INTERVALS[2]} days, box 3 after ${BOX_INTERVALS[3]}, box 4 after ${BOX_INTERVALS[4]}
        and box 5 after ${BOX_INTERVALS[5]}. When you don't know it, it goes back to box 1 and comes back later in this session.
        Cards in box ${MAX_BOX} count as mastered. Each session adds up to ${NEW_CARDS_PER_SESSION} new cards.</p>
        <p>Your progress is saved on this device only.</p>
      </details>
    </div>`;
  const stage = container.querySelector('#stage');

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
            ? `<h2 class="section">Learn new cards</h2>
               <div class="deck-grid">${toStart
                 .map(
                   (d) => `
                   <a class="deck-card" href="#/review/${esc(d.id)}">
                     <h3>${esc(d.title)}</h3>
                     <div class="deck-meta"><span>${esc(d.subject)}</span>
                       <span>${plural(d.cardCount - (counts[d.id]?.reviewed || 0), 'new card')}</span></div>
                   </a>`
                 )
                 .join('')}</div>`
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
    const { deck, card } = queue[0];
    const rec = recordFor(deck, card);
    revealed = false;
    stage.innerHTML = `
      <div class="study-top">
        <span>${plural(queue.length, 'card')} left</span>
        <span>${rec && rec.box ? `Box ${rec.box} of ${MAX_BOX}` : 'New card'}</span>
      </div>
      <div class="bar"><span style="width:${(reviewed / (reviewed + queue.length)) * 100}%"></span></div>
      ${!deckId ? `<p class="muted small" style="margin:-8px 0 8px">${esc(deck.title)}</p>` : ''}
      ${flipCardHtml(card)}
      <div id="actions" style="margin-top:12px">
        <button type="button" class="btn btn-block" id="reveal">Show answer</button>
      </div>
      <p class="helper">Be honest. It only helps you!</p>`;

    const el = stage.querySelector('#card');
    attachGestures(el, {
      onTap: () => {
        if (flip(el)) reveal();
      },
      onSwipe: answer,
      canSwipe: () => revealed && !busy,
    });
    stage.querySelector('#reveal').addEventListener('click', () => {
      if (!el.classList.contains('flipped')) flip(el);
      reveal();
    });
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
    const key = cardKey(item.deck.id, item.card);
    const isRetry = failed.has(key);
    progress[key] = recordReview(item.deck.id, item.card, known, isRetry);

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

  // Keyboard: Space/Enter show answer, ← or 1 didn't know, → or 2 knew it.
  function onKey(e) {
    const el = stage.querySelector('#card');
    if (!el || isTypingTarget(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.key === ' ' || e.key === 'Enter') && !isButtonTarget(e)) {
      e.preventDefault();
      if (flip(el)) reveal();
    } else if (revealed && (e.key === 'ArrowLeft' || e.key === '1')) answer(false);
    else if (revealed && (e.key === 'ArrowRight' || e.key === '2')) answer(true);
  }
  document.addEventListener('keydown', onKey);

  drawCard();
  return () => document.removeEventListener('keydown', onKey);
}

/** "Next review: tomorrow." based on the earliest due date among the decks' cards. */
function nextDueText(decks) {
  const all = getAllProgress();
  let next = null;
  for (const deck of decks) {
    for (const card of deck.cards) {
      const rec = all[cardKey(deck.id, card)];
      if (rec && rec.box && (!next || rec.due < next)) next = rec.due;
    }
  }
  return next ? `Next review: ${describeDay(next)}.` : '';
}
