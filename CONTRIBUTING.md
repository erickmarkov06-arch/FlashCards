# Contributing to StudyDeck

Thanks for adding study material! Contributions are **deck files** in the `decks/` folder.

## The short version

1. Put each deck at `decks/<subject>/<deck-name>.json`: lowercase, hyphens, no spaces.
   The folder must match the deck's `subject` (`"subject": "Religious Studies"` → `decks/religious-studies/`).
2. Start from [`decks/_template.json`](decks/_template.json). The full format is in the
   [README](README.md#5-the-deck-file-format).
3. Run `node scripts/validate.js` and fix anything it reports (0 errors needed).
4. Commit **only your deck files**. Don't edit `decks/index.json`, which is rebuilt automatically.
5. Open a pull request (or push to `main` if you're a collaborator and the owner is happy with that).

## Using Claude Code

Clone the repo, open it in Claude Code and paste something like:

> Here are my notes on photosynthesis for Biology. Turn them into a flashcard deck following CLAUDE.md,
> validate it, and submit it as a pull request.
>
> *(your notes)*

Claude follows [`CLAUDE.md`](CLAUDE.md), which covers the format, naming, validation and submitting.
Check the cards it makes before the pull request is merged.

## Good decks

- One fact per card. Keep fronts short and backs brief enough to type.
- One topic per deck, roughly 10–40 cards.
- Only include facts you've checked (from your notes, textbook or teacher).
- Multiple-choice `questions` are optional but great for Quiz mode. Add an `explanation`.

## Changing the website itself

Code changes (HTML/CSS/JS, scripts, workflows) are welcome too. Please open a pull request and explain
what and why. Keep it plain HTML/CSS/JavaScript with no build step and no dependencies.
