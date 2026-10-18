/**
 * Flashcards mode: tap to flip, then swipe (or use the buttons) to say whether you knew it.
 * Options: shuffle, swap sides (show the back first), and only the cards you last got wrong.
 */
import { loadDeck } from '../data.js';
import { recordAnswer, getCardProgress, getSetting, setSetting } from '../store.js';
import { esc, shuffle, plural, icons, pageHeader, isTypingTarget, isButtonTarget, toast } from '../utils.js';
import { flipCardHtml, flip, attachGestures, flyOut, autoRead, readVisibleSide } from '../flipcard.js';
import { deckCanSpeak, readAloudChip, toggleAutoSpeak, attachSpeakButtons, stopSpeaking } from '../speech.js';

export async function render(container, { deckId, query }) {
  const deck = await loadDeck(deckId);
  container.dataset.title = `Flashcards · ${deck.title}`;
  const langs = { front: deck.frontLang, back: deck.backLang };
  const speakable = deckCanSpeak(deck);

  const options = {
    shuffle: getSetting('flashShuffle', true),
    swap: getSetting('flashSwap', false),
    onlyWrong: query.wrong === '1',
  };

  let queue = []; // cards in this round
  let pos = 0; // which card we're on
  let results = []; // { card, known } for this round
  let busy = false; // true while a card is animating away

  container.innerHTML = `
    <div class="study">
      ${pageHeader({ title: deck.title, eyebrow: 'Flashcards', back: `#/deck/${deck.id}`, backLabel: 'Deck' })}
      <div class="chip-row" id="toolbar"></div>
      <div id="stage"></div>
    </div>`;
  const toolbar = container.querySelector('#toolbar');
  const stage = container.querySelector('#stage');
  attachSpeakButtons(stage);

  const wrongCards = () => deck.cards.filter((c) => getCardProgress(deck.id, c)?.last === false);

  function drawToolbar() {
    const wrongCount = wrongCards().length;
    toolbar.innerHTML = `
      ${speakable ? readAloudChip() : ''}
      <button type="button" class="chip" data-opt="shuffle" aria-pressed="${options.shuffle}">${icons.shuffle} Shuffle</button>
      <button type="button" class="chip" data-opt="swap" aria-pressed="${options.swap}">${icons.swap} Back first</button>
      <button type="button" class="chip" data-opt="onlyWrong" aria-pressed="${options.onlyWrong}" ${wrongCount || options.onlyWrong ? '' : 'disabled'}>
        ${icons.x} Only wrong (${wrongCount})
      </button>`;
  }

  toolbar.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-opt]');
    if (!chip) return;
    const name = chip.dataset.opt;
    if (name === 'autoSpeak') {
      toggleAutoSpeak(chip, () => readVisibleSide(stage.querySelector('#card')));
      return; // doesn't restart the round
    }
    options[name] = !options[name];
    if (name === 'shuffle') setSetting('flashShuffle', options.shuffle);
    if (name === 'swap') setSetting('flashSwap', options.swap);
    startRound(); // changing an option starts the round again
  });

  function startRound(cards) {
    let pool = cards || (options.onlyWrong ? wrongCards() : deck.cards);
    if (!pool.length) {
      toast('No cards marked wrong. Showing all cards.');
      options.onlyWrong = false;
      pool = deck.cards;
    }
    queue = options.shuffle ? shuffle(pool) : [...pool];
    pos = 0;
    results = [];
    drawToolbar();
    drawCard();
  }

  function drawCard() {
    const card = queue[pos];
    const knownCount = results.filter((r) => r.known).length;
    stage.innerHTML = `
      <div class="study-top">
        <span>Card ${pos + 1} of ${queue.length}</span>
        <span class="tally">
          <span class="good" aria-label="known">${icons.check} ${knownCount}</span>
          <span class="bad" aria-label="still learning">${icons.x} ${results.length - knownCount}</span>
        </span>
      </div>
      <div class="bar"><span style="width:${(pos / queue.length) * 100}%"></span></div>
      ${flipCardHtml(card, { swap: options.swap, langs })}
      ${card.hint ? `<div id="hint-area"><button type="button" class="btn btn-ghost btn-small" id="hint">Show hint</button></div>` : ''}
      <div class="button-row split" style="margin-top:12px">
        <button type="button" class="btn btn-bad" id="unknown">${icons.x} Still learning</button>
        <button type="button" class="btn btn-good" id="known">${icons.check} Know it</button>
      </div>
      <p class="helper">Tap the card to flip it. Swipe right if you knew it, left if not.</p>`;

    const el = stage.querySelector('#card');
    const flipAndRead = () => {
      flip(el);
      autoRead(el);
    };
    attachGestures(el, { onTap: flipAndRead, onSwipe: answer, canSwipe: () => !busy });
    stage.querySelector('#known').addEventListener('click', () => answer(true));
    stage.querySelector('#unknown').addEventListener('click', () => answer(false));
    stage.querySelector('#hint')?.addEventListener('click', showHint);
    autoRead(el);
  }

  function showHint() {
    const area = stage.querySelector('#hint-area');
    if (area) area.innerHTML = `<p class="hint-box"><strong>Hint:</strong> ${esc(queue[pos].hint)}</p>`;
  }

  async function answer(known) {
    if (busy) return;
    busy = true;
    const card = queue[pos];
    recordAnswer(deck.id, card, known);
    results.push({ card, known });
    await flyOut(stage.querySelector('#card'), known);
    busy = false;
    pos++;
    if (pos < queue.length) drawCard();
    else drawResults();
  }

  function drawResults() {
    const unknown = results.filter((r) => !r.known).map((r) => r.card);
    const knownCount = results.length - unknown.length;
    drawToolbar();
    stage.innerHTML = `
      <div class="panel center">
        <h2>Round complete!</h2>
        <div class="result-score">${knownCount}/${results.length}</div>
        <p>${knownCount === results.length ? 'You knew every card. Brilliant!' : `You knew ${knownCount} and are still learning ${plural(unknown.length, 'card')}.`}</p>
        <div class="button-row" style="justify-content:center">
          ${unknown.length ? `<button type="button" class="btn" id="again-unknown">Study the ${plural(unknown.length, 'card')} I didn't know</button>` : ''}
          <button type="button" class="btn ${unknown.length ? 'btn-ghost' : ''}" id="restart">Start again</button>
          <a class="btn btn-ghost" href="#/deck/${esc(deck.id)}">Back to deck</a>
        </div>
      </div>`;
    stage.querySelector('#again-unknown')?.addEventListener('click', () => startRound(unknown));
    stage.querySelector('#restart').addEventListener('click', () => startRound());
  }

  // Keyboard shortcuts: Space/Enter flip, → knew it, ← didn't, H hint, S say it out loud.
  function onKey(e) {
    const el = stage.querySelector('#card');
    if (!el || isTypingTarget(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.key === ' ' || e.key === 'Enter') && !isButtonTarget(e)) {
      e.preventDefault();
      flip(el);
      autoRead(el);
    } else if (e.key === 'ArrowRight') answer(true);
    else if (e.key === 'ArrowLeft') answer(false);
    else if (e.key.toLowerCase() === 'h' && queue[pos]?.hint) showHint();
    else if (e.key.toLowerCase() === 's') readVisibleSide(el);
  }
  document.addEventListener('keydown', onKey);

  startRound();
  return () => {
    document.removeEventListener('keydown', onKey);
    stopSpeaking();
  };
}
