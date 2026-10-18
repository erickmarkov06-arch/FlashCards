/**
 * Deck page: description, progress, buttons for each study mode, and the list of cards.
 */
import { loadDeck } from '../data.js';
import { deckSummary, pruneDeck, resetDeck, NEW_CARDS_PER_SESSION } from '../store.js';
import { esc, plural, icons, pageHeader, toast } from '../utils.js';

export async function render(container, { deckId }) {
  const deck = await loadDeck(deckId);
  pruneDeck(deck.id, deck.cards); // forget progress for cards that were removed or reworded
  container.dataset.title = deck.title;

  const s = deckSummary(deck.id, deck.cards);
  const pct = (n) => (s.total ? (n / s.total) * 100 : 0);
  const learnCount = s.due + Math.min(s.new, NEW_CARDS_PER_SESSION);
  const id = esc(deck.id);

  const modes = [
    { view: 'flashcards', icon: icons.cards, name: 'Flashcards', text: 'Flip cards and sort them into known and unknown.' },
    { view: 'review', icon: icons.repeat, name: 'Learn', text: 'Spaced repetition: review each card at the right time.', count: learnCount },
    { view: 'quiz', icon: icons.quiz, name: 'Quiz', text: 'Multiple-choice questions with a score.', disabled: !deck.questions.length && deck.cards.length < 2 },
    { view: 'write', icon: icons.write, name: 'Write', text: 'Type the answer. Small typos are forgiven.' },
    { view: 'match', icon: icons.match, name: 'Match', text: 'Pair terms with definitions against the clock.', disabled: deck.cards.length < 2 },
  ];

  container.innerHTML = `
    ${pageHeader({ title: deck.title, subtitle: deck.subject, back: '#/', backLabel: 'All decks' })}
    ${deck.description ? `<p>${esc(deck.description)}</p>` : ''}
    <p class="muted small">
      ${plural(deck.cards.length, 'card')}${deck.questions.length ? ` · ${plural(deck.questions.length, 'question')}` : ''}
      ${deck.author ? ` · by ${esc(deck.author)}` : ''}
    </p>

    <div class="panel section">
      <div class="progress" aria-hidden="true">
        <span class="mastered" style="width:${pct(s.mastered)}%"></span>
        <span class="learning" style="width:${pct(s.learning)}%"></span>
      </div>
      <div class="progress-legend">
        <span><span class="dot mastered"></span>${s.mastered} mastered</span>
        <span><span class="dot learning"></span>${s.learning} learning</span>
        <span><span class="dot"></span>${s.new} new</span>
        ${s.due ? `<span><strong>${s.due} due today</strong></span>` : ''}
      </div>
    </div>

    <h2>Study</h2>
    <div class="mode-grid">
      ${modes
        .map(
          (m) => `
          <a class="mode-btn ${m.disabled ? 'disabled' : ''}" href="#/${m.view}/${id}" ${m.disabled ? 'aria-disabled="true" tabindex="-1"' : ''}>
            ${m.icon}
            <strong>${m.name}</strong>
            <span>${m.text}</span>
            ${m.count ? `<em class="count">${m.count}</em>` : ''}
          </a>`
        )
        .join('')}
      ${
        s.wrong
          ? `<a class="mode-btn" href="#/flashcards/${id}?wrong=1">
               ${icons.x}<strong>Fix mistakes</strong><span>Flashcards with only the ${plural(s.wrong, 'card')} you last got wrong.</span>
             </a>`
          : ''
      }
    </div>

    <section class="section">
      <details ${deck.cards.length <= 15 ? 'open' : ''}>
        <summary>All ${plural(deck.cards.length, 'card')}</summary>
        <ul class="card-list">
          ${deck.cards
            .map(
              (c) => `
              <li>
                <span class="front">${esc(c.front)}</span>
                <span class="back">${esc(c.back)}</span>
                ${c.tags?.length ? `<span>${c.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join(' ')}</span>` : ''}
              </li>`
            )
            .join('')}
        </ul>
      </details>
    </section>

    <p class="center"><button type="button" class="btn btn-ghost btn-small" id="reset">Reset progress for this deck</button></p>
  `;

  container.querySelector('#reset').addEventListener('click', () => {
    if (!confirm(`Reset all progress for "${deck.title}"? This can't be undone.`)) return;
    resetDeck(deck.id);
    toast('Progress reset.');
    render(container, { deckId });
  });
}
