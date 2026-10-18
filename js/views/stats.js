/**
 * Stats page: streaks, mastered cards, Leitner boxes, recent activity, per-deck progress,
 * and buttons to export, import or reset your progress.
 */
import { loadIndex } from '../data.js';
import { getAllProgress, getActivity, getStreaks, progressByDeck, exportData, importData, resetAll, MAX_BOX, REVERSE } from '../store.js';
import { syncEnabled, syncStatus, sendCode, verifyCode, signOut, syncNow, deleteAccount } from '../sync.js';
import { esc, plural, pageHeader, todayKey, addDays, toast } from '../utils.js';

const WEEKS_SHOWN = 12;

export async function render(container) {
  container.dataset.title = 'Stats';
  const index = await loadIndex().catch(() => ({ decks: [] }));
  const known = new Set(index.decks.map((d) => d.id));

  // Only count cards from decks that still exist.
  const entries = Object.entries(getAllProgress()).filter(([key]) => known.has(key.slice(0, key.lastIndexOf('#'))));
  const allRecords = entries.map(([, rec]) => rec); // includes back → front practice of language cards
  const records = entries.filter(([key]) => !key.endsWith(REVERSE)).map(([, rec]) => rec); // one per card
  const streaks = getStreaks();
  const activity = getActivity();
  const today = todayKey();

  const inBoxes = records.filter((r) => r.box > 0);
  const mastered = inBoxes.filter((r) => r.box >= MAX_BOX).length;
  const due = allRecords.filter((r) => r.box > 0 && r.due <= today).length;
  const right = allRecords.reduce((n, r) => n + (r.correct || 0), 0);
  const wrong = allRecords.reduce((n, r) => n + (r.wrong || 0), 0);
  const accuracy = right + wrong ? Math.round((right / (right + wrong)) * 100) + '%' : '–';

  const boxes = Array.from({ length: MAX_BOX }, (_, i) => inBoxes.filter((r) => r.box === i + 1).length);
  const biggestBox = Math.max(1, ...boxes);
  const perDeck = progressByDeck();
  const sync = syncStatus();

  container.innerHTML = `
    ${pageHeader({ title: 'Progress', eyebrow: sync.signedIn ? 'Synced to your account' : 'Saved on this device' })}

    <div class="figures">
      ${tile(streaks.current, 'day streak', streaks.studiedToday ? 'You studied today' : streaks.current ? 'Study today to keep it going' : '')}
      ${tile(streaks.longest, 'longest streak (days)')}
      ${tile(mastered, 'cards mastered')}
      ${tile(due, 'cards due today')}
      ${tile(records.length, 'cards studied')}
      ${tile(accuracy, 'answers correct')}
    </div>

    <section class="section">
      <h2 class="section-label">Leitner boxes</h2>
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

    <section class="section">
      <h2 class="section-label">Last ${WEEKS_SHOWN} weeks</h2>
      ${calendar(activity, today)}
      <div class="progress-legend" aria-hidden="true">
        <span>Less</span>
        <span class="calendar legend"><span></span><span class="l1"></span><span class="l2"></span><span class="l3"></span></span>
        <span>More</span>
      </div>
    </section>

    <section class="section">
      <h2 class="section-label">Decks</h2>
      <ul class="deck-progress-list">
        ${index.decks
          .map((d) => {
            const p = perDeck[d.id] || { reviewed: 0, mastered: 0, due: 0 };
            const total = Math.max(1, d.cardCount);
            return `
              <li>
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

    ${syncEnabled ? syncSection(sync) : ''}

    <section class="section">
      <h2 class="section-label">Back up or move your progress</h2>
      <p class="small">${
        sync.signedIn
          ? 'You can also save your progress as a file, or load one in.'
          : 'Progress is stored in this browser only. To move it to another phone or computer, export a file here and import it there.'
      } Importing merges with what's already on the device.</p>
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
    const where = sync.signedIn ? 'on EVERY device signed in to your account' : 'on this device';
    if (!confirm(`Delete ALL progress, streaks and best times ${where}? Export first if you might want it back.`)) return;
    resetAll();
    toast('All progress deleted.');
    render(container);
  });

  if (syncEnabled) wireSync(container, sync);
}

// ---------- sync across devices (only when config.js is filled in) ----------

function syncSection(sync) {
  if (sync.signedIn) {
    const when = sync.syncing ? 'Syncing…' : sync.lastSynced ? `Last synced ${new Date(sync.lastSynced).toLocaleString()}.` : 'Not synced yet.';
    return `
      <section class="section">
        <h2 class="section-label">Sync across devices</h2>
        <p class="small">Signed in as <strong>${esc(sync.email)}</strong>. Your progress is saved online and kept
          the same on every device where you sign in. <span class="muted">${esc(when)}</span></p>
        ${sync.error ? `<p class="notice small" role="alert">${esc(sync.error)}</p>` : ''}
        <div class="button-row">
          <button type="button" class="btn" id="sync-now">Sync now</button>
          <button type="button" class="btn btn-ghost" id="sign-out">Sign out</button>
          <button type="button" class="btn btn-bad" id="delete-account">Delete my account</button>
        </div>
        <p class="small muted"><a href="privacy.html">Privacy notice</a></p>
      </section>`;
  }
  return `
    <section class="section">
      <h2 class="section-label">Sync across devices</h2>
      <p class="small">Sign in with your email to keep your progress the same on your phone, tablet and computer.
        There's no password: we email you a sign-in code. Progress already on this device is kept and added to your account.</p>
      <p class="small">We store your email address and your study progress, nothing else.
        <a href="privacy.html">Read the privacy notice</a>. If you're under 13, ask a parent or carer before signing in.</p>
      <form class="sync-form button-row" id="sync-email">
        <input class="input" type="email" name="email" required autocomplete="email" placeholder="you@example.com" aria-label="Email address">
        <button type="submit" class="btn">Email me a sign-in link</button>
      </form>
      <form class="sync-form" id="sync-code" hidden>
        <p class="small" id="sync-sent"></p>
        <div class="button-row">
          <input class="input" type="text" name="code" required inputmode="numeric" autocomplete="one-time-code"
            pattern="[0-9]{6,10}" maxlength="10" placeholder="Code from the email" aria-label="Code from the email">
          <button type="submit" class="btn">Sign in</button>
        </div>
        <p><button type="button" class="btn btn-ghost btn-small" id="sync-back">Use a different email</button></p>
      </form>
    </section>`;
}

function wireSync(container, sync) {
  const busy = (button, on) => {
    button.disabled = on;
    button.setAttribute('aria-busy', String(on));
  };

  if (sync.signedIn) {
    container.querySelector('#sync-now').addEventListener('click', (e) => {
      busy(e.currentTarget, true);
      // The page redraws itself when a sync finishes (see app.js); this just reports the result.
      syncNow().then(
        () => toast('Progress synced.'),
        (err) => toast(err.message)
      );
    });
    container.querySelector('#sign-out').addEventListener('click', () => {
      if (!confirm('Sign out on this device? Your progress stays on this device and in your account.')) return;
      signOut();
      toast('Signed out.');
    });
    container.querySelector('#delete-account').addEventListener('click', async (e) => {
      const ok = confirm(
        `Delete your account?\n\nThis permanently removes ${sync.email} and your progress saved online, on every device. ` +
          'Progress already on this device stays here (use "Reset everything" to remove that too).'
      );
      if (!ok) return;
      busy(e.currentTarget, true);
      try {
        await deleteAccount();
        toast('Your account has been deleted.');
      } catch (err) {
        alert(`Couldn't delete your account: ${err.message}`);
        busy(e.currentTarget, false);
      }
    });
    return;
  }

  const emailForm = container.querySelector('#sync-email');
  const codeForm = container.querySelector('#sync-code');
  let email = '';

  emailForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = emailForm.querySelector('button');
    email = emailForm.email.value.trim();
    busy(button, true);
    try {
      await sendCode(email);
      container.querySelector('#sync-sent').innerHTML = `We sent an email to <strong>${esc(email)}</strong>. Type the code from it below,
        or click its sign-in link in this browser. It can take a minute; check your spam folder too.`;
      emailForm.hidden = true;
      codeForm.hidden = false;
      codeForm.code.focus();
    } catch (err) {
      alert(err.message);
    }
    busy(button, false);
  });

  codeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = codeForm.querySelector('button[type=submit]');
    busy(button, true);
    try {
      await verifyCode(email, codeForm.code.value.replace(/\s/g, ''));
      toast('Signed in. Your progress now syncs.');
    } catch (err) {
      alert(err.status === 403 || err.status === 400 ? 'That code is wrong or has expired. Check it, or ask for a new one.' : err.message);
      busy(button, false);
    }
  });

  container.querySelector('#sync-back').addEventListener('click', () => {
    codeForm.hidden = true;
    codeForm.code.value = '';
    emailForm.hidden = false;
    emailForm.email.focus();
  });
}

function tile(value, label, note = '') {
  return `
    <div class="figure">
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
