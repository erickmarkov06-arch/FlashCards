/**
 * My decks tab: the decks you added with "Add to My decks" on a deck page.
 * Each one has a remove (×) button, with an Undo in case it was tapped by accident.
 * Stored on this device (store.js) and synced to your account when you're signed in.
 */
import { loadIndex } from '../data.js';
import { progressByDeck, getMyDecks, setMyDeck } from '../store.js';
import { esc, plural, pageHeader, icons } from '../utils.js';
import { deckRow } from './home.js';

export async function render(container) {
  container.dataset.title = 'My decks';
  const index = await loadIndex();
  let undo = null; // the deck that was just removed, so it can be put back

  const draw = () => {
    const mine = getMyDecks();
    const progress = progressByDeck();
    // Most recently added first. Decks that were removed from the site are skipped.
    const decks = index.decks.filter((d) => d.id in mine).sort((a, b) => mine[b.id].localeCompare(mine[a.id]));
    const undoBanner = undo
      ? `<div class="banner" role="status">
           <p>Removed "${esc(undo.title)}"</p>
           <button type="button" class="btn btn-small" id="undo">Undo</button>
         </div>`
      : '';

    if (!decks.length) {
      container.innerHTML = `
        ${undoBanner}
        ${pageHeader({ title: 'My decks' })}
        <div class="empty-state">
          <h2>No decks here yet</h2>
          <p>Open any deck and press <strong>Add to My decks</strong> to keep it here.</p>
          <p><a class="btn" href="#/">Browse all decks</a></p>
        </div>`;
    } else {
      container.innerHTML = `
        ${undoBanner}
        ${pageHeader({ title: 'My decks', eyebrow: plural(decks.length, 'deck') })}
        <ul class="deck-list">
          ${decks
            .map(
              (d) => `
              <li class="removable">
                ${deckRow(d, progress[d.id])}
                <button type="button" class="icon-btn" data-remove="${esc(d.id)}"
                  aria-label="Remove ${esc(d.title)} from My decks" title="Remove from My decks">${icons.x}</button>
              </li>`
            )
            .join('')}
        </ul>
        <p class="muted small" style="margin-top:16px"><a href="#/">Browse all decks</a> to add more.</p>`;
    }

    container.querySelector('#undo')?.addEventListener('click', () => {
      setMyDeck(undo.id, true);
      undo = null;
      draw();
    });
    container.querySelectorAll('[data-remove]').forEach((button) =>
      button.addEventListener('click', () => {
        const deck = index.decks.find((d) => d.id === button.dataset.remove);
        setMyDeck(deck.id, false);
        undo = deck;
        draw();
      })
    );
  };
  draw();
}
