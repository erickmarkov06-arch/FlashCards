/**
 * flipcard.js — the flippable, swipeable card used by Flashcards and Learn mode.
 *
 *   flipCardHtml(card, { swap })   returns the HTML
 *   attachGestures(el, handlers)   tap = flip, swipe right = known, swipe left = unknown
 *   flyOut(el, known)              animates the card off screen
 */
import { cardText } from './utils.js';
import { speakButton, speak, autoSpeakOn } from './speech.js';

/** `langs` = { front: "es", back: "en" } from the deck; sides with a language get a speaker button. */
export function flipCardHtml(card, { swap = false, langs = {} } = {}) {
  const first = swap ? card.back : card.front;
  const second = swap ? card.front : card.back;
  const firstLang = swap ? langs.back : langs.front;
  const secondLang = swap ? langs.front : langs.back;
  return `
    <div class="card-stage">
      <div class="flashcard" id="card" role="button" tabindex="0"
           aria-label="Flashcard. Press Space or tap to flip.">
        <span class="swipe-label unknown">Still learning</span>
        <span class="swipe-label known">Know it</span>
        <div class="flashcard-inner">
          <div class="face front" aria-live="polite">
            <span class="face-label">${swap ? 'Back' : 'Front'}</span>
            ${speakButton(first, firstLang)}
            ${cardText(first)}
          </div>
          <div class="face back" aria-hidden="true">
            <span class="face-label">${swap ? 'Front' : 'Back'}</span>
            ${speakButton(second, secondLang)}
            ${cardText(second)}
          </div>
        </div>
      </div>
    </div>`;
}

/** The text and language on the side of the card currently showing (for reading it aloud). */
export function visibleSide(el) {
  const face = el.querySelector(el.classList.contains('flipped') ? '.face.back' : '.face.front');
  const button = face.querySelector('.speak-btn');
  return button ? { text: button.dataset.speak, lang: button.dataset.lang } : null;
}

/** Reads the side that's showing out loud (if it has a language). */
export function readVisibleSide(el) {
  const side = el && visibleSide(el);
  if (side) speak(side.text, side.lang);
}

/** Same, but only when the "Read aloud" toggle is on. Call after showing or flipping a card. */
export function autoRead(el) {
  if (autoSpeakOn()) readVisibleSide(el);
}

/** Flips the card over. Returns true if it is now showing the back. */
export function flip(el) {
  const flipped = el.classList.toggle('flipped');
  el.querySelector('.face.front').setAttribute('aria-hidden', String(flipped));
  el.querySelector('.face.back').setAttribute('aria-hidden', String(!flipped));
  return flipped;
}

/**
 * Tap to flip, drag sideways to swipe.
 * handlers.onTap() and handlers.onSwipe(known) are called; handlers.canSwipe() can block swiping.
 */
export function attachGestures(el, { onTap, onSwipe, canSwipe = () => true }) {
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let tracking = false;
  let dragging = false;
  const known = el.querySelector('.swipe-label.known');
  const unknown = el.querySelector('.swipe-label.unknown');

  const reset = () => {
    el.style.transition = '';
    el.style.transform = '';
    known.style.opacity = unknown.style.opacity = '0';
  };

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button')) return; // e.g. the speaker button: don't flip
    tracking = true;
    dragging = false;
    startX = e.clientX;
    startY = e.clientY;
    dx = 0;
  });

  el.addEventListener('pointermove', (e) => {
    if (!tracking) return;
    dx = e.clientX - startX;
    const dy = e.clientY - startY;
    // Only treat it as a swipe once it is clearly sideways (otherwise the page scrolls).
    if (!dragging && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) && canSwipe()) {
      dragging = true;
      el.setPointerCapture(e.pointerId);
      el.style.transition = 'none';
    }
    if (dragging) {
      el.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
      known.style.opacity = String(Math.max(0, Math.min(1, dx / 90)));
      unknown.style.opacity = String(Math.max(0, Math.min(1, -dx / 90)));
    }
  });

  el.addEventListener('pointerup', () => {
    if (!tracking) return;
    tracking = false;
    if (!dragging) {
      onTap();
      return;
    }
    dragging = false;
    const threshold = Math.min(100, el.offsetWidth * 0.25);
    if (Math.abs(dx) > threshold) {
      el.style.transition = '';
      onSwipe(dx > 0);
    } else {
      reset(); // not far enough: spring back
    }
  });

  el.addEventListener('pointercancel', () => {
    tracking = false;
    dragging = false;
    reset();
  });
}

/** Slides the card off to the right (known) or left (unknown). Resolves when finished. */
export function flyOut(el, known) {
  el.style.transition = 'transform 0.22s ease-in, opacity 0.22s ease-in';
  el.style.transform = `translateX(${known ? 130 : -130}%) rotate(${known ? 14 : -14}deg)`;
  el.style.opacity = '0';
  el.querySelector(known ? '.swipe-label.known' : '.swipe-label.unknown').style.opacity = '1';
  return new Promise((resolve) => setTimeout(resolve, 200));
}
