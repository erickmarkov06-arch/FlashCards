/**
 * Quiz mode: multiple-choice questions with instant feedback, a score and explanations.
 * Questions come from the deck's "questions" list, or are made from the flashcards
 * (the card's front is the question; its back plus 3 other cards' backs are the options).
 */
import { loadDeck } from '../data.js';
import { recordAnswer, logActivity } from '../store.js';
import { esc, shuffle, plural, pageHeader, cardText, isTypingTarget, isButtonTarget } from '../utils.js';

const LETTERS = 'ABCDEF';

export async function render(container, { deckId }) {
  const deck = await loadDeck(deckId);
  container.dataset.title = `Quiz · ${deck.title}`;

  const uniqueBacks = new Set(deck.cards.map((c) => c.back.trim().toLowerCase()));
  const sources = [];
  if (deck.questions.length) sources.push({ id: 'written', label: `Written questions (${deck.questions.length})` });
  if (uniqueBacks.size >= 2) sources.push({ id: 'cards', label: `From the flashcards (${deck.cards.length})` });

  container.innerHTML = `
    <div class="study">
      ${pageHeader({ title: deck.title, subtitle: 'Quiz', back: `#/deck/${deck.id}`, backLabel: 'Deck' })}
      <div id="stage"></div>
    </div>`;
  const stage = container.querySelector('#stage');

  if (!sources.length) {
    stage.innerHTML = `<div class="empty-state"><p>This deck needs at least two cards with different answers to make a quiz.</p></div>`;
    return;
  }

  const settings = { source: sources[0].id, length: '10' };
  let questions = []; // the questions in this quiz
  let pos = 0;
  let score = 0;
  let answered = false;
  let missed = []; // { q, chosen }

  // ---------- setup screen ----------
  function drawSetup() {
    const lengths = [
      ['10', '10 questions'],
      ['20', '20 questions'],
      ['all', 'All'],
    ];
    stage.innerHTML = `
      <div class="panel">
        ${
          sources.length > 1
            ? `<div class="option-group" role="group" aria-label="Questions">
                 <span class="label">Questions</span>
                 <div class="segmented">${sources
                   .map((s) => `<button type="button" class="chip" data-source="${s.id}" aria-pressed="${s.id === settings.source}">${esc(s.label)}</button>`)
                   .join('')}</div>
               </div>`
            : `<p class="muted">${esc(sources[0].label)}</p>`
        }
        <div class="option-group" role="group" aria-label="Length">
          <span class="label">Length</span>
          <div class="segmented">${lengths
            .map(([v, label]) => `<button type="button" class="chip" data-length="${v}" aria-pressed="${v === settings.length}">${label}</button>`)
            .join('')}</div>
        </div>
        <button type="button" class="btn btn-block" id="start">Start quiz</button>
      </div>`;

    stage.querySelectorAll('[data-source]').forEach((b) =>
      b.addEventListener('click', () => {
        settings.source = b.dataset.source;
        drawSetup();
      })
    );
    stage.querySelectorAll('[data-length]').forEach((b) =>
      b.addEventListener('click', () => {
        settings.length = b.dataset.length;
        drawSetup();
      })
    );
    stage.querySelector('#start').addEventListener('click', () => start());
  }

  // ---------- building questions ----------
  function buildQuestions() {
    const pool = settings.source === 'written' ? deck.questions.map(fromWritten) : deck.cards.map(fromCard);
    const count = settings.length === 'all' ? pool.length : Number(settings.length);
    return shuffle(pool).slice(0, count);
  }

  function fromWritten(q) {
    // Shuffle the options, unless one of them refers to the others ("All of the above").
    const keepOrder = q.options.some((o) => /of the above|both of these|neither of these/i.test(o));
    const order = keepOrder ? q.options.map((_, i) => i) : shuffle(q.options.map((_, i) => i));
    return {
      prompt: q.question,
      options: order.map((i) => q.options[i]),
      answer: order.indexOf(q.answerIndex),
      explanation: q.explanation || '',
      card: null,
    };
  }

  function fromCard(card) {
    const correct = card.back;
    const seen = new Set([correct.trim().toLowerCase()]);
    const wrong = [];
    for (const other of shuffle(deck.cards)) {
      const key = other.back.trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        wrong.push(other.back);
      }
      if (wrong.length === 3) break;
    }
    const options = shuffle([correct, ...wrong]);
    return { prompt: card.front, subtitle: 'Choose the matching answer', options, answer: options.indexOf(correct), explanation: '', card };
  }

  // ---------- playing ----------
  function start(list) {
    questions = list || buildQuestions();
    pos = 0;
    score = 0;
    missed = [];
    drawQuestion();
  }

  function drawQuestion() {
    const q = questions[pos];
    answered = false;
    stage.innerHTML = `
      <div class="study-top"><span>Question ${pos + 1} of ${questions.length}</span><span>Score: ${score}</span></div>
      <div class="bar"><span style="width:${(pos / questions.length) * 100}%"></span></div>
      <div class="panel question-box">
        ${q.subtitle ? `<p class="muted small">${esc(q.subtitle)}</p>` : ''}
        ${cardText(q.prompt)}
      </div>
      <div class="options">
        ${q.options
          .map((o, i) => `<button type="button" class="option" data-i="${i}"><span class="letter">${LETTERS[i]}</span><span>${esc(o)}</span></button>`)
          .join('')}
      </div>
      <div id="after" aria-live="polite"></div>`;
    stage.querySelectorAll('.option').forEach((b) => b.addEventListener('click', () => choose(Number(b.dataset.i))));
  }

  function choose(i) {
    if (answered) return;
    answered = true;
    const q = questions[pos];
    const right = i === q.answer;
    if (right) score++;
    else missed.push({ q, chosen: i });

    if (q.card) recordAnswer(deck.id, q.card, right);
    else logActivity();

    stage.querySelectorAll('.option').forEach((b, j) => {
      b.disabled = true;
      if (j === q.answer) b.classList.add('correct');
      else if (j === i) b.classList.add('incorrect');
    });

    const last = pos === questions.length - 1;
    stage.querySelector('#after').innerHTML = `
      <div class="feedback ${right ? 'good' : 'bad'}">
        <strong>${right ? 'Correct!' : `Not quite. The answer is ${LETTERS[q.answer]}.`}</strong>
        ${q.explanation ? `<p>${esc(q.explanation)}</p>` : ''}
      </div>
      <button type="button" class="btn btn-block" id="next">${last ? 'See results' : 'Next question'}</button>`;
    const next = stage.querySelector('#next');
    next.addEventListener('click', goNext);
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function goNext() {
    pos++;
    if (pos < questions.length) drawQuestion();
    else drawResults();
  }

  function drawResults() {
    const pct = Math.round((score / questions.length) * 100);
    const message = pct === 100 ? 'Perfect score!' : pct >= 80 ? 'Great work!' : pct >= 50 ? 'Good effort. Keep practising.' : 'Keep going. Try the ones you missed again.';
    stage.innerHTML = `
      <div class="panel center">
        <h2>Quiz complete</h2>
        <div class="result-score">${score}/${questions.length}</div>
        <p>${pct}% · ${message}</p>
        <div class="button-row" style="justify-content:center">
          ${missed.length ? `<button type="button" class="btn" id="retry">Retry the ${plural(missed.length, 'question')} I missed</button>` : ''}
          <button type="button" class="btn ${missed.length ? 'btn-ghost' : ''}" id="again">New quiz</button>
          <button type="button" class="btn btn-ghost" id="setup">Change settings</button>
        </div>
      </div>
      ${
        missed.length
          ? `<h2 class="section">Questions you missed</h2>
             <ul class="missed-list">${missed
               .map(
                 ({ q, chosen }) => `
                 <li>
                   <strong>${esc(q.prompt)}</strong>
                   <div class="small" style="color:var(--bad)">Your answer: ${esc(q.options[chosen])}</div>
                   <div class="small" style="color:var(--good)">Correct answer: ${esc(q.options[q.answer])}</div>
                   ${q.explanation ? `<div class="small muted">${esc(q.explanation)}</div>` : ''}
                 </li>`
               )
               .join('')}</ul>`
          : ''
      }`;
    stage.querySelector('#retry')?.addEventListener('click', () => start(shuffle(missed.map((m) => m.q))));
    stage.querySelector('#again').addEventListener('click', () => start());
    stage.querySelector('#setup').addEventListener('click', drawSetup);
  }

  // Keyboard: 1-6 or A-F pick an option, Enter goes to the next question.
  function onKey(e) {
    if (isTypingTarget(e) || e.ctrlKey || e.metaKey || e.altKey || !stage.querySelector('.option')) return;
    const key = e.key.toUpperCase();
    const index = /^[1-6]$/.test(key) ? Number(key) - 1 : LETTERS.indexOf(key);
    if (!answered && key.length === 1 && index >= 0 && index < questions[pos].options.length) choose(index);
    else if (answered && e.key === 'Enter' && !isButtonTarget(e)) goNext();
  }
  document.addEventListener('keydown', onKey);

  drawSetup();
  return () => document.removeEventListener('keydown', onKey);
}
