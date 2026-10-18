/**
 * My decks tab: the decks you added with "Add to My decks" on a deck page.
 * Stored on this device (store.js) and synced to your account when you're signed in.
 */
import { loadIndex } from '../data.js';
import { progressByDeck, getMyDecks } from '../store.js';
import { plural, pageHeader } from '../utils.js';
import { deckRow } from './home.js';

export async function render(container) {
  container.dataset.title = 'My decks';
  const index = await loadIndex();
  const mine = getMyDecks();
  const progress = progressByDeck();
  // Most recently added first. Decks that were removed from the site are skipped.
  const decks = index.decks.filter((d) => d.id in mine).sort((a, b) => mine[b.id].localeCompare(mine[a.id]));

  if (!decks.length) {
    container.innerHTML = `
      ${pageHeader({ title: 'My decks' })}
      <div class="empty-state">
        <h2>No decks here yet</h2>
        <p>Open any deck and press <strong>Add to My decks</strong> to keep it here.</p>
        <p><a class="btn" href="#/">Browse all decks</a></p>
      </div>`;
    return;
  }

  container.innerHTML = `
    ${pageHeader({ title: 'My decks', eyebrow: plural(decks.length, 'deck') })}
    <ul class="deck-list">${decks.map((d) => `<li>${deckRow(d, progress[d.id])}</li>`).join('')}</ul>
    <p class="muted small" style="margin-top:16px">To remove a deck, open it and press <strong>In My decks</strong>.
      <a href="#/">Browse all decks</a></p>`;
}
