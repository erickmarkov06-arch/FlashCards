/**
 * Match game: pair each term with its definition as fast as you can.
 * Tap a tile and then its partner, or drag one tile onto the other.
 * A wrong pair adds a 1-second penalty. Best times are saved per deck.
 */
import { loadDeck } from '../data.js';
import { logActivity, getBestMatchTime, saveMatchTime } from '../store.js';
import { esc, shuffle, pageHeader } from '../utils.js';

const PAIRS = 6;
const PENALTY_SECONDS = 1;

export async function render(container, { deckId }) {
  const deck = await loadDeck(deckId);
  container.dataset.title = `Match · ${deck.title}`;

  // Skip cards whose front or back repeats another card's, so every pair is unambiguous.
  const fronts = new Set();
  const backs = new Set();
  const eligible = deck.cards.filter((c) => {
    const f = c.front.trim().toLowerCase();
    const b = c.back.trim().toLowerCase();
    if (fronts.has(f) || backs.has(b)) return false;
    fronts.add(f);
    backs.add(b);
    return true;
  });

  container.innerHTML = `
    ${pageHeader({ title: deck.title, subtitle: 'Match', back: `#/deck/${deck.id}`, backLabel: 'Deck' })}
    <div id="stage"></div>`;
  const stage = container.querySelector('#stage');

  let timer = null;
  let removeDragListeners = () => {};

  if (eligible.length < 2) {
    stage.innerHTML = `<div class="empty-state"><p>This deck needs at least two different cards to play Match.</p></div>`;
    return;
  }

  const fmt = (secs) => `${secs.toFixed(1)}s`;

  function drawStart() {
    const best = getBestMatchTime(deck.id);
    const n = Math.min(PAIRS, eligible.length);
    stage.innerHTML = `
      <div class="panel center">
        <h2>Match ${n} pairs</h2>
        <p>Tap a term, then its definition, or drag one onto the other. Each wrong pair adds ${PENALTY_SECONDS} second.</p>
        ${best != null ? `<p class="muted">Your best: <strong>${fmt(best)}</strong></p>` : ''}
        <button type="button" class="btn" id="start">Start game</button>
      </div>`;
    stage.querySelector('#start').addEventListener('click', play);
  }

  function play() {
    const cards = shuffle(eligible).slice(0, PAIRS);
    const tiles = shuffle([
      ...cards.map((c, i) => ({ pair: i, side: 'term', text: c.front })),
      ...cards.map((c, i) => ({ pair: i, side: 'def', text: c.back })),
    ]);

    stage.innerHTML = `
      <div class="study-top">
        <span><span id="left">${cards.length}</span> pairs left</span>
        <span class="timer" id="time">0.0s</span>
      </div>
      <div class="match-grid" id="grid">
        ${tiles
          .map((t) => `<button type="button" class="tile ${t.side}" data-pair="${t.pair}" data-side="${t.side}">${esc(t.text)}</button>`)
          .join('')}
      </div>
      <p class="helper">Tap two tiles to pair them, or drag one onto its partner.</p>`;

    const grid = stage.querySelector('#grid');
    const timeEl = stage.querySelector('#time');
    const leftEl = stage.querySelector('#left');
    const startedAt = performance.now();
    let penalty = 0;
    let matched = 0;
    let selected = null;
    let suppressClick = false;

    const elapsed = () => (performance.now() - startedAt) / 1000 + penalty;
    timer = setInterval(() => (timeEl.textContent = fmt(elapsed())), 100);

    function select(tile) {
      if (tile.classList.contains('matched')) return;
      if (!selected) {
        selected = tile;
        tile.classList.add('selected');
      } else if (selected === tile) {
        tile.classList.remove('selected');
        selected = null;
      } else if (selected.dataset.side === tile.dataset.side) {
        selected.classList.remove('selected'); // two terms: switch to the new one
        selected = tile;
        tile.classList.add('selected');
      } else {
        tryPair(selected, tile);
      }
    }

    function tryPair(a, b) {
      a.classList.remove('selected');
      b.classList.remove('selected');
      selected = null;
      if (a.dataset.side === b.dataset.side || a.classList.contains('matched') || b.classList.contains('matched')) return;

      if (a.dataset.pair === b.dataset.pair) {
        a.classList.add('matched');
        b.classList.add('matched');
        a.disabled = b.disabled = true;
        matched++;
        leftEl.textContent = String(cards.length - matched);
        logActivity();
        if (matched === cards.length) finish(elapsed());
      } else {
        penalty += PENALTY_SECONDS;
        for (const t of [a, b]) {
          t.classList.remove('wrong');
          void t.offsetWidth; // restart the shake animation
          t.classList.add('wrong');
          setTimeout(() => t.classList.remove('wrong'), 450);
        }
      }
    }

    // Tapping (or Enter/Space on a keyboard) fires "click".
    grid.addEventListener('click', (e) => {
      const tile = e.target.closest('.tile');
      if (!tile || suppressClick) return;
      select(tile);
    });

    // Dragging, with pointer events so it works with both mouse and touch.
    grid.addEventListener('pointerdown', (e) => {
      const tile = e.target.closest('.tile');
      if (!tile || tile.classList.contains('matched') || e.button !== 0) return;
      const startX = e.clientX;
      const startY = e.clientY;
      let dragging = false;
      let target = null;

      const move = (ev) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!dragging && Math.hypot(dx, dy) > 8) {
          dragging = true;
          tile.classList.add('dragging');
        }
        if (!dragging) return;
        tile.style.transform = `translate(${dx}px, ${dy}px) scale(1.04)`;
        const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.tile');
        const valid = under && under !== tile && !under.classList.contains('matched') ? under : null;
        if (valid !== target) {
          target?.classList.remove('drop-target');
          valid?.classList.add('drop-target');
          target = valid;
        }
      };
      const finishDrag = (drop) => {
        removeDragListeners();
        if (!dragging) return; // it was a tap; the click handler deals with it
        tile.classList.remove('dragging');
        tile.style.transform = '';
        target?.classList.remove('drop-target');
        if (drop && target) tryPair(tile, target);
        suppressClick = true; // ignore the click that follows the drag
        setTimeout(() => (suppressClick = false), 50);
      };
      const up = () => finishDrag(true);
      const cancel = () => finishDrag(false); // e.g. the browser decided you were scrolling
      removeDragListeners = () => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        document.removeEventListener('pointercancel', cancel);
        removeDragListeners = () => {};
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
      document.addEventListener('pointercancel', cancel);
    });
  }

  function finish(seconds) {
    clearInterval(timer);
    const isRecord = saveMatchTime(deck.id, Math.round(seconds * 10) / 10);
    const best = getBestMatchTime(deck.id);
    setTimeout(() => {
      stage.innerHTML = `
        <div class="panel center">
          <h2>${isRecord ? 'New best time!' : 'All matched!'}</h2>
          <div class="result-score">${fmt(seconds)}</div>
          <p class="muted">Best: ${fmt(best)}</p>
          <div class="button-row" style="justify-content:center">
            <button type="button" class="btn" id="again">Play again</button>
            <a class="btn btn-ghost" href="#/deck/${esc(deck.id)}">Back to deck</a>
          </div>
        </div>`;
      stage.querySelector('#again').addEventListener('click', play);
    }, 350); // let the last pair fade out first
  }

  drawStart();
  return () => {
    clearInterval(timer);
    removeDragListeners();
  };
}
