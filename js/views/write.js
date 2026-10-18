/**
 * Write mode: see one side of a card and type the other.
 * Matching is forgiving (see checkAnswer in utils.js): case, spacing, punctuation,
 * accents and small typos don't count against you. "I was right" overrides a wrong mark.
 */
import { loadDeck } from '../data.js';
import { recordAnswer, markLastAnswerCorrect, getSetting, setSetting } from '../store.js';
import { esc, shuffle, plural, pageHeader, cardText, cardImage, checkAnswer } from '../utils.js';
import { deckCanSpeak, readAloudChip, toggleAutoSpeak, attachSpeakButtons, speakButton, speak, stopSpeaking, autoSpeakOn } from '../speech.js';

export async function render(container, { deckId }) {
  const deck = await loadDeck(deckId);
  container.dataset.title = `Write · ${deck.title}`;
  const speakable = deckCanSpeak(deck);

  // Default direction: for long definitions it's easier to type the short term.
  const avgBack = deck.cards.reduce((n, c) => n + c.back.length, 0) / deck.cards.length;
  const directions = getSetting('writeDirection', {});
  let answerWith = directions[deck.id] || (avgBack > 40 ? 'front' : 'back');

  let queue = [];
  let pos = 0;
  let results = []; // { card, correct }
  let state = 'asking'; // or 'feedback'

  container.innerHTML = `
    <div class="study">
      ${pageHeader({ title: deck.title, eyebrow: 'Write', back: `#/deck/${deck.id}`, backLabel: 'Deck' })}
      <div class="chip-row">
        ${speakable ? readAloudChip() : ''}
        <button type="button" class="chip" data-dir="back">Type the back</button>
        <button type="button" class="chip" data-dir="front">Type the front</button>
      </div>
      <div id="stage"></div>
    </div>`;
  const stage = container.querySelector('#stage');
  attachSpeakButtons(stage);
  container.querySelector('[data-opt="autoSpeak"]')?.addEventListener('click', (e) => {
    toggleAutoSpeak(e.currentTarget, () => {
      const card = queue[pos];
      if (!card) return;
      if (state === 'asking') speak(promptOf(card), promptLang(card));
      else speak(answerOf(card), answerLang(card));
    });
  });

  container.querySelectorAll('[data-dir]').forEach((b) =>
    b.addEventListener('click', () => {
      answerWith = b.dataset.dir;
      directions[deck.id] = answerWith;
      setSetting('writeDirection', directions);
      startRound();
    })
  );

  const promptOf = (card) => (answerWith === 'back' ? card.front : card.back);
  const answerOf = (card) => (answerWith === 'back' ? card.back : card.front);
  const promptLang = (card) => (answerWith === 'back' ? card.frontLang : card.backLang);
  const answerLang = (card) => (answerWith === 'back' ? card.backLang : card.frontLang);

  function startRound(cards = deck.cards) {
    container.querySelectorAll('[data-dir]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.dir === answerWith)));
    queue = shuffle(cards);
    pos = 0;
    results = [];
    drawCard();
  }

  function drawCard() {
    const card = queue[pos];
    state = 'asking';
    stage.innerHTML = `
      <div class="study-top"><span>Card ${pos + 1} of ${queue.length}</span><span>${results.filter((r) => r.correct).length} correct</span></div>
      <div class="bar"><span style="width:${(pos / queue.length) * 100}%"></span></div>
      <div class="panel question-box">
        <p class="muted small">Type the ${answerWith === 'back' ? 'answer' : 'term'} for:</p>
        ${speakButton(promptOf(card), promptLang(card))}
        ${cardImage(answerWith === 'back' ? card.frontImageUrl : card.backImageUrl, card.imageAlt)}
        ${cardText(promptOf(card))}
      </div>
      <form id="form" autocomplete="off">
        <label class="muted small" for="answer">Your answer</label>
        <input id="answer" class="input" type="text" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done">
        <div id="hint-area"></div>
        <div id="after" aria-live="polite"></div>
        <div class="button-row split" style="margin-top:12px" id="buttons">
          <button type="button" class="btn btn-ghost" id="hint">Hint</button>
          <button type="button" class="btn btn-ghost" id="skip">Don't know</button>
          <button type="submit" class="btn" id="submit">Check</button>
        </div>
      </form>`;

    const input = stage.querySelector('#answer');
    input.focus({ preventScroll: true });
    if (autoSpeakOn()) speak(promptOf(card), promptLang(card));
    stage.querySelector('#form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (state === 'asking') check(input.value);
      else next();
    });
    stage.querySelector('#skip').addEventListener('click', () => check(''));
    stage.querySelector('#hint').addEventListener('click', () => {
      const answer = answerOf(card);
      // Use the card's hint when typing the back; otherwise show the first letter.
      const hint = answerWith === 'back' && card.hint ? card.hint : `It starts with "${answer.trim().charAt(0)}" and has ${answer.trim().length} characters.`;
      stage.querySelector('#hint-area').innerHTML = `<p class="hint-box" style="margin-top:12px"><strong>Hint:</strong> ${esc(hint)}</p>`;
    });
  }

  function check(typed) {
    const card = queue[pos];
    const answer = answerOf(card);
    const result = typed.trim() ? checkAnswer(typed, answer) : 'wrong';
    const correct = result !== 'wrong';
    state = 'feedback';

    recordAnswer(deck.id, card, correct);
    results.push({ card, correct });

    const input = stage.querySelector('#answer');
    input.readOnly = true;
    const after = stage.querySelector('#after');
    const say = speakButton(answer, answerLang(card), 'Hear the answer');
    const answerImage = cardImage(answerWith === 'back' ? card.backImageUrl : card.frontImageUrl, card.imageAlt);
    if (result === 'correct') {
      after.innerHTML = `<div class="feedback good"><strong>Correct!</strong><p>${esc(answer)} ${say}</p>${answerImage}</div>`;
    } else if (result === 'close') {
      after.innerHTML = `<div class="feedback close"><strong>Almost! Counted as correct.</strong><p>Check the spelling: <b>${esc(answer)}</b> ${say}</p>${answerImage}</div>`;
    } else {
      after.innerHTML = `
        <div class="feedback bad">
          <strong>${typed.trim() ? 'Not quite.' : 'The answer is:'}</strong>
          <p><b>${esc(answer)}</b> ${say}</p>
          ${answerImage}
          ${typed.trim() ? `<p class="small">You wrote: ${esc(typed)}</p>` : ''}
        </div>`;
    }
    if (autoSpeakOn()) speak(answer, answerLang(card));

    const last = pos === queue.length - 1;
    stage.querySelector('#buttons').innerHTML = `
      ${result === 'wrong' && typed.trim() ? `<button type="button" class="btn btn-ghost" id="override">I was right</button>` : ''}
      <button type="submit" class="btn" id="submit">${last ? 'See results' : 'Next'}</button>`;
    stage.querySelector('#override')?.addEventListener('click', () => {
      markLastAnswerCorrect(deck.id, card);
      results[results.length - 1].correct = true;
      next();
    });
    // Keep focus in the input so the phone keyboard stays open; Enter goes to the next card.
    input.focus({ preventScroll: true });
  }

  function next() {
    pos++;
    if (pos < queue.length) drawCard();
    else drawResults();
  }

  function drawResults() {
    const missed = results.filter((r) => !r.correct).map((r) => r.card);
    const correct = results.length - missed.length;
    stage.innerHTML = `
      <div class="panel center">
        <h2>Round complete</h2>
        <div class="result-score">${correct}/${results.length}</div>
        <p>${missed.length ? `${plural(missed.length, 'card')} to practise again.` : 'Every answer right. Excellent!'}</p>
        <div class="button-row" style="justify-content:center">
          ${missed.length ? `<button type="button" class="btn" id="retry">Retry the ${plural(missed.length, 'card')} I missed</button>` : ''}
          <button type="button" class="btn ${missed.length ? 'btn-ghost' : ''}" id="restart">Start again</button>
          <a class="btn btn-ghost" href="#/deck/${esc(deck.id)}">Back to deck</a>
        </div>
      </div>
      ${
        missed.length
          ? `<ul class="missed-list">${missed
              .map((c) => `<li><strong>${esc(promptOf(c))}</strong><div class="small muted">${esc(answerOf(c))}</div></li>`)
              .join('')}</ul>`
          : ''
      }`;
    stage.querySelector('#retry')?.addEventListener('click', () => startRound(missed));
    stage.querySelector('#restart').addEventListener('click', () => startRound());
  }

  startRound();
  return stopSpeaking;
}
