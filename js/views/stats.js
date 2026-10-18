/**
 * Stats page: streaks, mastered cards, Leitner boxes, recent activity, per-deck progress,
 * and buttons to export, import or reset your progress.
 */
import { loadIndex } from '../data.js';
import { getAllProgress, getActivity, getStreaks, progressByDeck, exportData, importData, resetAll, MAX_BOX } from '../store.js';
import { esc, plural, pageHeader, todayKey, addDays, toast } from '../utils.js';

const WEEKS_SHOWN = 12;

export async function render(container) {
  container.dataset.title = 'Stats';
  const index = await loadIndex().catch(() => ({ decks: [] }));
  const known = new Set(index.decks.map((d) => d.id));

  // Only count cards from decks that still exist.
  const records = Object.entries(getAllProgress())
    .filter(([key]) => known.has(key.slice(0, key.lastIndexOf('#'))))
    .map(([, rec]) => rec);
  const streaks = getStreaks();
  const activity = getActivity();
  const today = todayKey();

  const inBoxes = records.filter((r) => r.box > 0);
  const mastered = inBoxes.filter((r) => r.box >= MAX_BOX).length;
  const due = inBoxes.filter((r) => r.due <= today).length;
  const right = records.reduce((n, r) => n + (r.correct || 0), 0);
  const wrong = records.reduce((n, r) => n + (r.wrong || 0), 0);
  const accuracy = right + wrong ? Math.round((right / (right + wrong)) * 100) + '%' : '–';

  const boxes = Array.from({ length: MAX_BOX }, (_, i) => inBoxes.filter((r) => r.box === i + 1).length);
  const biggestBox = Math.max(1, ...boxes);
  const perDeck = progressByDeck();

  container.innerHTML = `
    ${pageHeader({ title: 'Your progress', subtitle: 'Saved on this device only' })}

    <div class="stat-grid">
      ${tile(streaks.current, 'day streak',streaks.studiedToday ? 'You studied today' : streaks.current ? 'Study today to keep it going' : '')}
      ${tile(streaks.longest, 'longest streak (days)')}
      ${tile(mastered, 'cards mastered')}
      ${tile(due, 'cards due today')}
      ${tile(records.length, 'cards studied')}
      ${tile(accuracy, 'answers correct')}
    </div>

    <section class="section panel">
      <h2>Leitner boxes</h2>
      <p class="muted small">Cards you have studied in Learn mode, by box. Box ${MAX_BOX} means mastered.</p>
      <div class="box-chart">
        ${boxes
          .map(
            (n, i) => `
            <div class="box-row" title="Box ${i + 1}: ${plural(n, 'card')}">
              <span>Box ${i + 1}</span>
              <span class="track"><span class="fill" style="width:${(n / biggestBox) * 100}%"></span></span>
              <span class="num">${n}</span>
            </div>`
          )
          .join('')}
      </div>
    </section>

    <section class="section panel">
      <h2>Last ${WEEKS_SHOWN} weeks</h2>
      ${calendar(activity, today)}
      <div class="progress-legend" aria-hidden="true">
        <span>Less</span>
        <span class="calendar legend"><span></span><span class="l1"></span><span class="l2"></span><span class="l3"></span></span>
        <span>More</span>
      </div>
    </section>

    <section class="section">
      <h2>Decks</h2>
      <ul class="deck-progress-list">
        ${index.decks
          .map((d) => {
            const p = perDeck[d.id] || { reviewed: 0, mastered: 0, due: 0 };
            const total = Math.max(1, d.cardCount);
            return `
              <li class="panel">
                <a href="#/deck/${esc(d.id)}">${esc(d.title)}</a>
                <span class="muted small"> · ${esc(d.subject)}</span>
                <div class="progress" style="margin-top:8px">
                  <span class="mastered" style="width:${(p.mastered / total) * 100}%"></span>
                  <span class="learning" style="width:${((p.reviewed - p.mastered) / total) * 100}%"></span>
                </div>
                <div class="progress-legend">
                  <span><span class="dot mastered"></span>${p.mastered} mastered</span>
                  <span><span class="dot learning"></span>${p.reviewed - p.mastered} learning</span>
                  <span><span class="dot"></span>${Math.max(0, d.cardCount - p.reviewed)} new</span>
                  ${p.due ? `<span><strong>${p.due} due</strong></span>` : ''}
                </div>
              </li>`;
          })
          .join('')}
      </ul>
    </section>

    <section class="section panel">
      <h2>Back up or move your progress</h2>
      <p class="small">Progress is stored in this browser only. Nothing is uploaded anywhere.
        To move it to another phone or computer, export a file here and import it there.
        Importing merges with what's already on the device.</p>
      <div class="button-row">
        <button type="button" class="btn" id="export">Export progress</button>
        <label class="btn btn-ghost" for="import-file">Import progress</label>
        <input type="file" id="import-file" accept=".json,application/json" hidden>
        <button type="button" class="btn btn-bad" id="reset">Reset everything</button>
      </div>
    </section>`;

  container.querySelector('#export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `studydeck-progress-${today}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    toast('Progress exported.');
  });

  container.querySelector('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const count = importData(JSON.parse(await file.text()));
      toast(`Imported progress for ${plural(count, 'card')}.`);
      render(container);
    } catch (err) {
      alert(err instanceof SyntaxError ? "That file isn't valid JSON." : err.message);
    }
    e.target.value = '';
  });

  container.querySelector('#reset').addEventListener('click', () => {
    if (!confirm('Delete ALL progress, streaks and best times on this device? Export first if you might want it back.')) return;
    resetAll();
    toast('All progress deleted.');
    render(container);
  });
}

function tile(value, label, note = '') {
  return `
    <div class="stat-tile">
      <span class="value">${esc(value)}</span>
      <span class="label">${esc(label)}</span>
      ${note ? `<span class="label small">${esc(note)}</span>` : ''}
    </div>`;
}

/** A grid of small squares, one per day: rows are Monday–Sunday, columns are weeks. */
function calendar(activity, today) {
  const [y, m, d] = today.split('-').map(Number);
  const weekday = (new Date(y, m - 1, d).getDay() + 6) % 7; // Monday = 0
  const start = addDays(today, -weekday - (WEEKS_SHOWN - 1) * 7);
  const cells = [];
  for (let i = 0; i < WEEKS_SHOWN * 7; i++) {
    const day = addDays(start, i);
    if (day > today) {
      cells.push('<span style="visibility:hidden"></span>');
      continue;
    }
    const n = activity[day] || 0;
    const level = n === 0 ? '' : n < 10 ? 'l1' : n < 30 ? 'l2' : 'l3';
    cells.push(`<span class="${level} ${day === today ? 'today' : ''}" title="${day}: ${plural(n, 'answer')}"></span>`);
  }
  const studied = Object.keys(activity).filter((k) => k >= start && activity[k] > 0).length;
  return `<div class="calendar" role="img" aria-label="Studied on ${studied} of the last ${WEEKS_SHOWN * 7} days">${cells.join('')}</div>`;
}
