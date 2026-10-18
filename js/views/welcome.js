/**
 * Welcome screen: shown instead of every page until you're signed in and have a username
 * (see needsWelcome in app.js). Three steps: email → code from the email → username.
 * Once done, the sign-in is saved on this device (sync.js), so it only appears again after
 * signing out, deleting the account, or clearing the browser's data.
 */
import { syncStatus, sendCode, verifyCode, saveProfile } from '../sync.js';
import { esc, toast } from '../utils.js';

export async function render(container) {
  container.dataset.title = 'Welcome';
  const sync = syncStatus();
  if (sync.signedIn) return usernameStep(container);
  emailStep(container);
}

const intro = `
  <div class="page-header center">
    <img src="icons/icon.svg" alt="" width="56" height="56">
    <h1>Welcome to StudyDeck</h1>
    <p class="muted">Flashcards, quizzes and spaced repetition. Sign in to start.</p>
  </div>`;

const finePrint = `
  <p class="small muted center" style="margin-top:24px">
    We only store your email address, a username and your study progress.
    <a href="privacy.html">Privacy notice</a>.<br>If you're under 13, ask a parent or carer first.
  </p>`;

function busy(button, on) {
  button.disabled = on;
  button.setAttribute('aria-busy', String(on));
}

function emailStep(container, email = '') {
  container.innerHTML = `
    <div class="welcome">
      ${intro}
      <form class="sync-form" id="email-form">
        <label class="section-label" for="email">Your email</label>
        <div class="button-row">
          <input class="input" type="email" id="email" name="email" required autocomplete="email"
            placeholder="you@example.com" value="${esc(email)}">
          <button type="submit" class="btn">Email me a code</button>
        </div>
        <p class="small muted">No password: we email you a code each time you sign in on a new device.</p>
      </form>
      ${finePrint}
    </div>`;

  const form = container.querySelector('#email-form');
  form.email.focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = form.querySelector('button');
    const address = form.email.value.trim();
    busy(button, true);
    try {
      await sendCode(address);
      codeStep(container, address);
    } catch (err) {
      alert(err.message === 'email rate limit exceeded' ? 'Too many sign-in emails were sent just now. Please try again in a few minutes.' : err.message);
      busy(button, false);
    }
  });
}

function codeStep(container, email) {
  container.innerHTML = `
    <div class="welcome">
      ${intro}
      <form class="sync-form" id="code-form">
        <label class="section-label" for="code">Code from the email</label>
        <p class="small">We sent a code to <strong>${esc(email)}</strong>. It can take a minute; check your spam folder too.</p>
        <div class="button-row">
          <input class="input" type="text" id="code" name="code" required inputmode="numeric" autocomplete="one-time-code"
            pattern="[0-9]{6,10}" maxlength="10" placeholder="123456">
          <button type="submit" class="btn">Sign in</button>
        </div>
        <p><button type="button" class="btn btn-ghost btn-small" id="back">Use a different email</button></p>
      </form>
      ${finePrint}
    </div>`;

  const form = container.querySelector('#code-form');
  form.code.focus();
  container.querySelector('#back').addEventListener('click', () => emailStep(container, email));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = form.querySelector('button[type=submit]');
    busy(button, true);
    try {
      await verifyCode(email, form.code.value.replace(/\s/g, ''));
      // app.js notices the sign-in and shows the username step or the app.
    } catch (err) {
      alert(err.status === 403 || err.status === 400 ? 'That code is wrong or has expired. Check it, or go back and ask for a new one.' : err.message);
      busy(button, false);
    }
  });
}

function usernameStep(container) {
  container.innerHTML = `
    <div class="welcome">
      ${intro.replace('Sign in to start.', "You're signed in. One last step.")}
      <form class="sync-form" id="username-form">
        <label class="section-label" for="username">Choose a username</label>
        <div class="button-row">
          <input class="input" type="text" id="username" name="username" required minlength="3" maxlength="20"
            pattern="[a-z0-9_]{3,20}" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="e.g. maths_fox">
          <button type="submit" class="btn">Continue</button>
        </div>
        <p class="small muted">3–20 characters: lowercase letters, numbers and _. Other people may see it on the
          leaderboard (only if you switch that on), so <strong>don't use your real name</strong>.</p>
      </form>
      ${finePrint}
    </div>`;

  const form = container.querySelector('#username-form');
  form.username.focus();
  form.username.addEventListener('input', () => {
    form.username.value = form.username.value.toLowerCase().replace(/\s+/g, '_');
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = form.querySelector('button');
    busy(button, true);
    try {
      await saveProfile({ username: form.username.value.trim() });
      toast(`Welcome, @${syncStatus().username}!`);
      // app.js notices the username and shows the app.
    } catch (err) {
      alert(err.message);
      busy(button, false);
    }
  });
}
