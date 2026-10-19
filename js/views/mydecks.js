/**
 * My decks tab: the decks you added with "Add to My decks" on a deck page, or several at once
 * with "Add decks" (#/mydecks/add), which lists every deck with a tick box.
 * Each one has a remove (×) button, with an Undo in case it was tapped by accident.
 * Stored on this device (store.js) and synced to your account when you're signed in.
 */
import { loadIndex } from '../data.js';
import { progressByDeck, getMyDecks, setMyDeck, addMyDecks } from '../store.js';
import { esc, plural, pageHeader, icons, toast } from '../utils.js';
import { deckRow } from './home.js';

export async function render(container, route = {}) {
  const index = await loadIndex();
  if (route.deckId === 'add') return renderPicker(container, index);

  container.dataset.title = 'My decks';
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
    const allAdded = decks.length === index.decks.length;

    if (!decks.length) {
      container.innerHTML = `
        ${undoBanner}
        ${pageHeader({ title: 'My decks' })}
        <div class="empty-state">
          <h2>No decks here yet</h2>
          <p>Pick several decks at once, or open any deck and press <strong>Add to My decks</strong>.</p>
          <p><a class="btn" href="#/mydecks/add">Add decks</a></p>
        </div>`;
    } else {
      container.innerHTML = `
        ${undoBanner}
        <div class="page-header with-action">
          <div>
            <p class="eyebrow">${plural(decks.length, 'deck')}</p>
            <h1>My decks</h1>
          </div>
          ${allAdded ? '' : '<a class="btn btn-small" href="#/mydecks/add">Add decks</a>'}
        </div>
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
        </ul>`;
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

/** "Add decks": every deck with a tick box, grouped by subject, then one button adds them all. */
function renderPicker(container, index) {
  container.dataset.title = 'Add decks';
  const mine = getMyDecks();
  const available = index.decks.filter((d) => !(d.id in mine));
  const picked = new Set();
  let search = '';

  container.innerHTML = `
    ${pageHeader({ title: 'Add decks', back: '#/mydecks', backLabel: 'My decks' })}
    ${
      available.length
        ? `<div class="filters">
             <div class="search-box">
               ${icons.search}
               <input id="search" class="input" type="search" placeholder="Search decks" aria-label="Search decks"
                      autocomplete="off" enterkeyhint="search">
             </div>
           </div>
           <div id="results"></div>
           <div class="pick-bar">
             <span id="pick-count" class="muted" aria-live="polite"></span>
             <button type="button" class="btn" id="add-picked" disabled>Add decks</button>
           </div>`
        : `<div class="empty-state">
             <h2>You've added every deck</h2>
             <p><a class="btn" href="#/mydecks">Back to My decks</a></p>
           </div>`
    }`;
  if (!available.length) return;

  const results = container.querySelector('#results');
  const addButton = container.querySelector('#add-picked');
  const count = container.querySelector('#pick-count');

  const updateBar = () => {
    addButton.disabled = !picked.size;
    addButton.textContent = picked.size ? `Add ${plural(picked.size, 'deck')}` : 'Add decks';
    count.textContent = picked.size ? `${picked.size} selected` : 'Tick decks to add';
  };

  const draw = () => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    const matching = available.filter((d) => {
      const haystack = [d.title, d.description, d.subject, ...(d.tags || [])].join(' ').toLowerCase();
      return words.every((w) => haystack.includes(w));
    });
    if (!matching.length) {
      results.innerHTML = `<div class="empty-state"><h2>No decks match</h2></div>`;
      return;
    }

    const groups = new Map();
    for (const d of matching) {
      if (!groups.has(d.subjectSlug)) groups.set(d.subjectSlug, { name: d.subject, list: [] });
      groups.get(d.subjectSlug).list.push(d);
    }
    results.innerHTML = [...groups]
      .map(([slug, { name, list }]) => {
        const all = list.every((d) => picked.has(d.id));
        return `
          <section>
            <h2 class="section-label with-action">
              <span>${esc(name)}</span>
              <button type="button" class="link-btn" data-group="${esc(slug)}">${all ? 'Clear' : `Select all ${list.length}`}</button>
            </h2>
            <ul class="pick-list">
              ${list
                .map(
                  (d) => `
                  <li>
                    <label class="pick-row">
                      <input type="checkbox" value="${esc(d.id)}" ${picked.has(d.id) ? 'checked' : ''}>
                      <span class="title">${esc(d.title)}</span>
                      <span class="meta">${plural(d.cardCount, 'card')}</span>
                      ${d.description ? `<span class="desc">${esc(d.description)}</span>` : ''}
                    </label>
                  </li>`
                )
                .join('')}
            </ul>
          </section>`;
      })
      .join('');

    // Ticking only updates the labels and the bar (no redraw), so focus stays where it is.
    const updateGroup = (button) => {
      const list = groups.get(button.dataset.group).list;
      const all = list.every((d) => picked.has(d.id));
      button.textContent = all ? 'Clear' : `Select all ${list.length}`;
    };
    results.querySelectorAll('section').forEach((section) => {
      const button = section.querySelector('[data-group]');
      const boxes = [...section.querySelectorAll('input[type=checkbox]')];
      boxes.forEach((box) =>
        box.addEventListener('change', () => {
          if (box.checked) picked.add(box.value);
          else picked.delete(box.value);
          updateGroup(button);
          updateBar();
        })
      );
      button.addEventListener('click', () => {
        const all = boxes.every((box) => box.checked);
        boxes.forEach((box) => {
          box.checked = !all;
          if (all) picked.delete(box.value);
          else picked.add(box.value);
        });
        updateGroup(button);
        updateBar();
      });
    });
    updateBar();
  };

  container.querySelector('#search').addEventListener('input', (e) => {
    search = e.target.value;
    draw();
  });
  addButton.addEventListener('click', () => {
    addMyDecks([...picked]);
    toast(`Added ${plural(picked.size, 'deck')} to My decks`);
    location.hash = '#/mydecks';
  });
  draw();
}
