/**
 * Leaderboard page: signed-in users who chose "Show me on the leaderboard" on the Stats page,
 * ranked by answers this week, current streak or cards mastered.
 * The numbers are worked out by the database from each person's synced progress
 * (the leaderboard function in supabase/schema.sql). Only signed-in users can see it.
 */
import { syncEnabled, syncStatus, getLeaderboard } from '../sync.js';
import { esc, pageHeader } from '../utils.js';

const BOARDS = [
  { key: 'answers_week', name: 'This week', unit: 'answers in the last 7 days' },
  { key: 'streak', name: 'Streak', unit: 'days in a row' },
  { key: 'mastered', name: 'Mastered', unit: 'cards mastered' },
];
const SHOWN = 50;

let board = 'answers_week'; // kept while the app is open

export async function render(container) {
  container.dataset.title = 'Leaderboard';
  const header = pageHeader({ title: 'Leaderboard', eyebrow: 'StudyDeck', back: '#/stats', backLabel: 'Stats' });
  const sync = syncStatus();

  if (!syncEnabled || !sync.signedIn) {
    container.innerHTML = `${header}
      <div class="empty-state">
        <p>Sign in on the Stats page to see the leaderboard.</p>
        <p><a class="btn" href="#/stats">Go to Stats</a></p>
      </div>`;
    return;
  }

  let rows;
  try {
    rows = await getLeaderboard();
  } catch (err) {
    container.innerHTML = `${header}<p class="notice">Couldn't load the leaderboard: ${esc(err.message)}</p>`;
    return;
  }

  const draw = () => {
    const current = BOARDS.find((b) => b.key === board);
    // You always see your own row; other people only appear if they switched the leaderboard on.
    const ranked = rows
      .filter((r) => r[board] > 0 || r.is_me)
      .sort((a, b) => b[board] - a[board] || a.username.localeCompare(b.username));
    const top = ranked.slice(0, SHOWN);
    const meIndex = ranked.findIndex((r) => r.is_me);
    const meBelow = meIndex >= SHOWN ? ranked[meIndex] : null;
    const row = (r, i) => `
      <tr class="${r.is_me ? 'me' : ''}">
        <td class="rank">${i + 1}</td>
        <td>@${esc(r.username)}${r.is_me ? ' (you)' : ''}</td>
        <td class="num">${r[board]}</td>
      </tr>`;

    container.innerHTML = `${header}
      ${
        !sync.username
          ? `<p class="notice small">Choose a username on the <a href="#/stats">Stats page</a> to join the leaderboard.</p>`
          : !sync.onLeaderboard
            ? `<p class="notice small">Only you can see your own row. To appear for others, tick
                 <strong>Show me on the leaderboard</strong> on the <a href="#/stats">Stats page</a>.</p>`
            : ''
      }
      <div class="chip-row" role="group" aria-label="Rank by">
        ${BOARDS.map((b) => `<button type="button" class="chip" data-board="${b.key}" aria-pressed="${b.key === board}">${b.name}</button>`).join('')}
      </div>
      ${
        top.length
          ? `<table class="leaderboard">
               <thead><tr><th class="rank">#</th><th>User</th><th class="num">${esc(current.unit)}</th></tr></thead>
               <tbody>
                 ${top.map(row).join('')}
                 ${meBelow ? row(meBelow, meIndex) : ''}
               </tbody>
             </table>`
          : `<div class="empty-state"><p>Nobody is on this board yet. Study some cards to get on it!</p></div>`
      }
      <p class="small muted" style="margin-top:16px">Progress counts once it has synced. Only usernames are shown, never email addresses.</p>`;

    container.querySelector('.chip-row').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-board]');
      if (!chip) return;
      board = chip.dataset.board;
      draw();
    });
  };
  draw();
}
