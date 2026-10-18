/**
 * Home page: every deck, grouped by subject, with search, subject chips and a tag filter.
 */
import { loadIndex } from '../data.js';
import { progressByDeck } from '../store.js';
import { esc, plural, icons } from '../utils.js';

// Kept while the app is open, so coming back to Home keeps your filters.
const filters = { search: '', subject: '', tag: '' };

export async function render(container) {
  const index = await loadIndex();
  const progress = progressByDeck();
  const decks = index.decks;

  const totalDue = decks.reduce((sum, d) => sum + (progress[d.id]?.due || 0), 0);
  const allTags = [...new Set(decks.flatMap((d) => d.tags || []))].sort();
  if (filters.tag && !allTags.includes(filters.tag)) filters.tag = '';

  container.innerHTML = `
    ${
      totalDue
        ? `<div class="banner">
             <p>${plural(totalDue, 'card')} ready to review today</p>
             <a class="btn btn-small" href="#/review">Review now</a>
           </div>`
        : ''
    }
    <div class="page-header">
      <p class="eyebrow">${plural(decks.length, 'deck')} · ${plural(index.subjects.length, 'subject')}</p>
      <h1>Decks</h1>
    </div>

    <div class="filters">
      <div class="search-box">
        ${icons.search}
        <input id="search" class="input" type="search" placeholder="Search decks" aria-label="Search decks"
               autocomplete="off" enterkeyhint="search" value="${esc(filters.search)}">
      </div>
      <select id="tag-filter" class="select" aria-label="Filter by tag">
        <option value="">All tags</option>
        ${allTags.map((t) => `<option value="${esc(t)}" ${t === filters.tag ? 'selected' : ''}>#${esc(t)}</option>`).join('')}
      </select>
    </div>

    <div class="chip-row" role="group" aria-label="Filter by subject">
      <button type="button" class="chip" data-subject="">All subjects</button>
      ${index.subjects.map((s) => `<button type="button" class="chip" data-subject="${esc(s.slug)}">${esc(s.name)}</button>`).join('')}
    </div>

    <div id="results" aria-live="polite"></div>
  `;

  const results = container.querySelector('#results');

  function draw() {
    container.querySelectorAll('[data-subject]').forEach((chip) => {
      chip.setAttribute('aria-pressed', String(chip.dataset.subject === filters.subject));
    });

    const words = filters.search.toLowerCase().split(/\s+/).filter(Boolean);
    const matching = decks.filter((d) => {
      if (filters.subject && d.subjectSlug !== filters.subject) return false;
      if (filters.tag && !(d.tags || []).includes(filters.tag)) return false;
      const haystack = [d.title, d.description, d.subject, d.author, ...(d.tags || [])].join(' ').toLowerCase();
      return words.every((w) => haystack.includes(w));
    });

    if (!decks.length) {
      results.innerHTML = `<div class="empty-state"><h2>No decks yet</h2><p>Add a deck file to the <code>decks/</code> folder. The README explains how.</p></div>`;
      return;
    }
    if (!matching.length) {
      results.innerHTML = `<div class="empty-state"><h2>No decks match</h2><p><button type="button" class="btn btn-ghost" id="clear">Clear filters</button></p></div>`;
      results.querySelector('#clear').addEventListener('click', () => {
        Object.assign(filters, { search: '', subject: '', tag: '' });
        container.querySelector('#search').value = '';
        container.querySelector('#tag-filter').value = '';
        draw();
      });
      return;
    }

    // Group by subject, keeping the index's order.
    const groups = new Map();
    for (const d of matching) {
      if (!groups.has(d.subject)) groups.set(d.subject, []);
      groups.get(d.subject).push(d);
    }
    results.innerHTML = [...groups]
      .map(
        ([subject, list]) => `
          <section>
            <h2 class="section-label">${esc(subject)}</h2>
            <ul class="deck-list">${list.map((d) => `<li>${deckRow(d, progress[d.id])}</li>`).join('')}</ul>
          </section>`
      )
      .join('');
  }

  container.querySelector('#search').addEventListener('input', (e) => {
    filters.search = e.target.value;
    draw();
  });
  container.querySelector('#tag-filter').addEventListener('change', (e) => {
    filters.tag = e.target.value;
    draw();
  });
  container.querySelector('.chip-row').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-subject]');
    if (!chip) return;
    filters.subject = chip.dataset.subject;
    draw();
  });

  draw();
}

/** One deck in a list: title and description on the left, card count (and anything due) on the right. */
export function deckRow(deck, p = { reviewed: 0, mastered: 0, due: 0 }, href = `#/deck/${deck.id}`) {
  const total = Math.max(deck.cardCount, 1);
  const masteredPct = Math.min(100, (p.mastered / total) * 100);
  const learningPct = Math.min(100 - masteredPct, ((p.reviewed - p.mastered) / total) * 100);
  return `
    <a class="deck-row" href="${esc(href)}">
      <span class="title">${esc(deck.title)}</span>
      <span class="meta">
        ${plural(deck.cardCount, 'card')}
        ${p.due ? `<span class="due">${p.due} due</span>` : ''}
      </span>
      ${deck.description ? `<span class="desc">${esc(deck.description)}</span>` : ''}
      ${
        p.reviewed
          ? `<span class="progress" title="${p.mastered} mastered, ${p.reviewed - p.mastered} learning">
               <span class="mastered" style="width:${masteredPct}%"></span>
               <span class="learning" style="width:${learningPct}%"></span>
             </span>`
          : ''
      }
    </a>`;
}
