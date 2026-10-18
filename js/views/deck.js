/**
 * Deck page: description, progress, buttons for each study mode, and the list of cards.
 */
import { loadDeck } from '../data.js';
import { deckSummary, pruneDeck, resetDeck, isMyDeck, setMyDeck, NEW_CARDS_PER_SESSION } from '../store.js';
import { esc, plural, icons, pageHeader, toast } from '../utils.js';
import { speakButton, attachSpeakButtons } from '../speech.js';

export async function render(container, { deckId }) {
  const deck = await loadDeck(deckId);
  if (!deck.isMix) pruneDeck(deck.id, deck.cards); // forget progress for cards that were removed or reworded
  container.dataset.title = deck.title;

  const s = deckSummary(deck.id, deck.cards);
  const pct = (n) => (s.total ? (n / s.total) * 100 : 0);
  const learnCount = s.due + Math.min(s.new, NEW_CARDS_PER_SESSION);
  const id = esc(deck.id);

  const modes = [
    { view: 'review', icon: icons.repeat, name: 'Learn', text: 'Spaced repetition: each card comes back when it is due.', count: learnCount ? `${learnCount} ready` : '' },
    { view: 'flashcards', icon: icons.cards, name: 'Flashcards', text: 'Flip through and sort into known and still learning.' },
    { view: 'quiz', icon: icons.quiz, name: 'Quiz', text: 'Multiple choice, with a score at the end.', disabled: !deck.questions.length && deck.cards.length < 2 },
    { view: 'write', icon: icons.write, name: 'Write', text: 'Type the answer. Small typos are forgiven.' },
    { view: 'match', icon: icons.match, name: 'Match', text: 'Pair terms with definitions against the clock.', disabled: deck.cards.length < 2 },
  ];
  if (s.wrong) {
    modes.push({ view: 'flashcards', query: '?wrong=1', icon: icons.x, name: 'Fix mistakes', text: `Flashcards with only the ${plural(s.wrong, 'card')} you last got wrong.` });
  }

  container.innerHTML = `
    ${pageHeader({ title: deck.title, eyebrow: deck.subject, back: '#/', backLabel: 'All decks' })}
    ${
      deck.isMix
        ? `<p>Mixed from ${deck.sources.map((src) => `<a href="#/deck/${esc(src.id)}">${esc(src.title)}</a>`).join(', ')}.
           Progress is saved to each card's own deck.</p>`
        : deck.description
          ? `<p>${esc(deck.description)}</p>`
          : ''
    }
    <p class="deck-meta-line">
      ${plural(deck.cards.length, 'card')}${deck.questions.length ? ` · ${plural(deck.questions.length, 'question')}` : ''}${deck.author ? ` · by ${esc(deck.author)}` : ''}
    </p>
    ${deck.isMix ? '' : `<p><button type="button" class="btn btn-small ${isMyDeck(deck.id) ? 'btn-ghost' : ''}" id="my-deck" aria-pressed="${isMyDeck(deck.id)}"></button></p>`}

    <div class="section">
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

    <h2 class="section-label">Study</h2>
    <ul class="mode-list" style="margin-top:12px">
      ${modes
        .map(
          (m) => `
          <li>
            <a class="mode-row ${m.disabled ? 'disabled' : ''}" href="#/${m.view}/${id}${m.query || ''}" ${m.disabled ? 'aria-disabled="true" tabindex="-1"' : ''}>
              <span class="icon">${m.icon}</span>
              <span><strong>${m.name}</strong><span class="text">${m.text}</span></span>
              ${m.count ? `<span class="count">${m.count}</span>` : `<span class="chev">${icons.chevron}</span>`}
            </a>
          </li>`
        )
        .join('')}
    </ul>

    <section class="section">
      <details ${deck.cards.length <= 15 ? 'open' : ''}>
        <summary class="section-label" style="margin:0">All ${plural(deck.cards.length, 'card')}</summary>
        <ul class="card-list">
          ${deck.cards
            .map(
              (c) => `
              <li>
                ${c.frontImageUrl ? `<img class="thumb" src="${esc(c.frontImageUrl)}" alt="" loading="lazy">` : ''}
                <span class="front">${esc(c.front)} ${speakButton(c.front, c.frontLang)}</span>
                <span class="back">${esc(c.back)} ${speakButton(c.back, c.backLang)}</span>
                ${c.backImageUrl ? `<img class="thumb" src="${esc(c.backImageUrl)}" alt="" loading="lazy">` : ''}
                ${c.tags?.length ? `<span>${c.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join(' ')}</span>` : ''}
              </li>`
            )
            .join('')}
        </ul>
      </details>
    </section>

    ${deck.isMix ? '' : `<p class="center"><button type="button" class="btn btn-ghost btn-small" id="reset">Reset progress for this deck</button></p>`}
  `;

  attachSpeakButtons(container);

  const myButton = container.querySelector('#my-deck');
  const drawMyButton = () => {
    const on = isMyDeck(deck.id);
    myButton.innerHTML = on ? `${icons.check} In My decks` : 'Add to My decks';
    myButton.classList.toggle('btn-ghost', on);
    myButton.setAttribute('aria-pressed', String(on));
  };
  if (myButton) {
    drawMyButton();
    myButton.addEventListener('click', () => {
      const on = !isMyDeck(deck.id);
      setMyDeck(deck.id, on);
      drawMyButton();
      toast(on ? 'Added to My decks.' : 'Removed from My decks.');
    });
  }

  container.querySelector('#reset')?.addEventListener('click', () => {
    if (!confirm(`Reset all progress for "${deck.title}"? This can't be undone.`)) return;
    resetDeck(deck.id);
    toast('Progress reset.');
    render(container, { deckId });
  });
}
