/**
 * speech.js — reads card text out loud using the voices built into the phone or browser
 * (the Web Speech API). No internet, account or API key needed.
 *
 * A deck turns this on by saying which language each side is in, e.g.
 *   "frontLang": "es", "backLang": "en"
 * Without a language we don't read a side aloud, because the wrong voice would
 * mispronounce it (an English voice reading Spanish sounds wrong).
 */
import { getSetting, setSetting } from './store.js';
import { esc, icons } from './utils.js';

export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

// Browsers load their voice list in the background; ask early so it's ready when needed.
let voices = [];
function loadVoices() {
  voices = canSpeak ? speechSynthesis.getVoices() : [];
}
if (canSpeak) {
  loadVoices();
  speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
}

/** Best voice for a language code like "es" or "es-MX": exact match first, then the same base language. */
function pickVoice(lang) {
  if (!voices.length) loadVoices();
  const wanted = lang.toLowerCase().replace('_', '-');
  const base = wanted.split('-')[0];
  const sameLang = voices.filter((v) => v.lang.toLowerCase().replace('_', '-').split('-')[0] === base);
  return (
    sameLang.find((v) => v.lang.toLowerCase().replace('_', '-') === wanted) ||
    sameLang.find((v) => v.default) ||
    sameLang.find((v) => v.localService) || // on-device voices also work offline
    sameLang[0] ||
    null
  );
}

/** Reads text aloud in the given language. Stops anything already being read. */
export function speak(text, lang) {
  if (!canSpeak || !text || !lang) return;
  speechSynthesis.cancel();
  // "to do / to make" reads better as "to do, to make".
  const utterance = new SpeechSynthesisUtterance(String(text).replace(/\s+\/\s+|\s*\|\s*/g, ', '));
  utterance.lang = lang;
  const voice = pickVoice(lang);
  if (voice) utterance.voice = voice;
  utterance.rate = getSetting('speechRate', 0.9); // a little slower than normal helps learners
  speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  if (canSpeak) speechSynthesis.cancel();
}

/** True if any card in the deck has a language set and the device can speak. */
export function deckCanSpeak(deck) {
  return canSpeak && deck.cards.some((c) => c.frontLang || c.backLang);
}

/** The "read aloud automatically" preference, shared by all study modes. */
export function autoSpeakOn() {
  return getSetting('autoSpeak', false);
}
export function setAutoSpeak(on) {
  setSetting('autoSpeak', on);
}

/** The "Read aloud" toggle shown in study modes. */
export function readAloudChip() {
  return `<button type="button" class="chip" data-opt="autoSpeak" aria-pressed="${autoSpeakOn()}">${icons.speaker} Read aloud</button>`;
}

/**
 * Flips the "Read aloud" toggle. Returns the new state.
 * Turning it on reads something straight away, which also unlocks speech on iPhones
 * (they only allow speech that starts from a tap).
 */
export function toggleAutoSpeak(chip, readNow) {
  const on = !autoSpeakOn();
  setAutoSpeak(on);
  chip.setAttribute('aria-pressed', String(on));
  if (on) readNow();
  else stopSpeaking();
  return on;
}

/** A small speaker button. Clicks are handled by attachSpeakButtons(). */
export function speakButton(text, lang, label = 'Read aloud') {
  if (!canSpeak || !lang) return '';
  return `<button type="button" class="speak-btn" data-speak="${esc(text)}" data-lang="${esc(lang)}" aria-label="${esc(label)}" title="${esc(label)}">${icons.speaker}</button>`;
}

/** Makes every speaker button inside `root` work (one listener for all of them). */
export function attachSpeakButtons(root) {
  root.addEventListener('click', (e) => {
    const button = e.target.closest('.speak-btn');
    if (!button || !root.contains(button)) return;
    e.stopPropagation();
    speak(button.dataset.speak, button.dataset.lang);
  });
}
