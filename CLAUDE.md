# CLAUDE.md: instructions for Claude working in this repository

This repo is **StudyDeck**, a static study website (flashcards, quizzes, spaced repetition) hosted on
GitHub Pages. All study content lives in JSON files under `decks/`. There is no backend, no database
and no API key. Never add any.

The most common request here is: **"Here are my notes, turn them into a deck and submit it."**
Follow the steps below exactly.

---

## Ground rules

1. **Only create or edit files inside `decks/`** unless the user explicitly asks for something else.
   Do not touch `index.html`, `js/`, `css/`, `sw.js`, `scripts/`, `.github/` or this file unasked.
2. **Never edit `decks/index.json` by hand, and don't commit it.** A GitHub Action rebuilds it on
   every push to `main`. (If you ran `node scripts/build-index.js` to preview, undo it before
   committing: `git checkout -- decks/index.json`.)
3. **Always run `node scripts/validate.js` and get 0 errors before committing.**
4. **Use only facts from the user's notes.** Don't invent facts. If something in the notes looks
   wrong or unclear, keep it out of the deck and tell the user, rather than silently "correcting" it.
5. Never force-push, rewrite history, commit secrets, or delete other people's decks.
6. Plain JSON only: double quotes, no comments, no trailing commas, UTF-8.

---

## Step 1: Understand the request and look at what exists

- Read the user's notes. Work out the **subject** (e.g. Biology) and the **topic(s)**.
- List existing decks: `ls decks/*/` (or look in `decks/index.json`).
- If a deck on the same topic already exists, ask whether to **add cards to it** or **make a new deck**.
- Big notes covering several topics → make **one deck per topic** (aim for roughly 10–40 cards each).

## Step 2: Create the deck file

**Where it goes:** `decks/<subject-folder>/<deck-name>.json`

| Part | Rule | Examples |
|---|---|---|
| `<subject-folder>` | The `subject` field in lowercase, words joined by hyphens, accents removed, `&` becomes `and`. **Must match the subject exactly** or validation fails. | `Biology` → `biology`, `Religious Studies` → `religious-studies`, `Español` → `espanol` |
| `<deck-name>` | Short topic name, lowercase, hyphens, no spaces, ends in `.json` | `cell-structure.json`, `world-war-one-causes.json` |

Reuse an existing subject folder (and its exact `subject` spelling) when there is one.
Copy `decks/_template.json` as a starting point. Files starting with `_` are ignored by the site.

### Deck schema

```json
{
  "title": "Cell Structure",
  "subject": "Biology",
  "description": "Organelles of animal, plant and bacterial cells.",
  "author": "Sam K.",
  "tags": ["gcse", "cells"],
  "cards": [
    { "front": "Mitochondria", "back": "Site of aerobic respiration, which releases energy." },
    {
      "front": "Chloroplasts",
      "back": "Contain chlorophyll and are the site of photosynthesis.",
      "hint": "They make plants green.",
      "tags": ["plant-cells"]
    }
  ],
  "questions": [
    {
      "question": "Which organelle is the site of aerobic respiration?",
      "options": ["Nucleus", "Mitochondria", "Ribosome", "Chloroplast"],
      "answerIndex": 1,
      "explanation": "Mitochondria carry out aerobic respiration."
    }
  ]
}
```

**Deck fields**

| Field | Required | Type | Notes |
|---|---|---|---|
| `title` | yes | string | Short and specific: "Cell Structure", not "Biology notes" |
| `subject` | yes | string | Must match the folder (see above) |
| `description` | yes | string | One sentence |
| `author` | yes | string | Ask the user what name or initials to use. If they don't say, use their git `user.name`. |
| `tags` | no | string[] | lowercase-with-hyphens, no duplicates |
| `frontLang` | no | string | Language of the card **fronts**, as a code: `"es"`, `"fr"`, `"de"`, `"en"`, `"en-GB"`, `"zh-CN"`… Switches on read-aloud for that side. |
| `backLang` | no | string | Language of the card **backs**, same format |
| `cards` | yes | array | At least 1 card |
| `questions` | no | array | Multiple-choice questions for Quiz mode |

**Card fields**

| Field | Required | Notes |
|---|---|---|
| `front` | yes | Term or question. Keep it short. Must be unique within the deck (case-insensitive). |
| `back` | yes | Answer or definition. Aim for under ~200 characters. |
| `hint` | no | A nudge that doesn't give the answer away |
| `tags` | no | lowercase-with-hyphens |
| `frontImage` | no | Picture shown on the front, e.g. `"images/heart-diagram.png"` (path relative to the deck file's folder) |
| `backImage` | no | Picture shown on the back, same format |
| `imageAlt` | no | Short description of the picture for screen readers |

**Question fields**

| Field | Required | Notes |
|---|---|---|
| `question` | yes | Unique within the deck |
| `options` | yes | 2 to 6 different strings (4 is best) |
| `answerIndex` | yes | Position of the correct option, **counting from 0** (so `1` = 2nd option) |
| `explanation` | no | Why the answer is right. Strongly recommended. |
| `tags` | no | lowercase-with-hyphens |

Any other field name is a typo and triggers a warning.

### Writing good cards

- **One fact per card.** Split long paragraphs into several cards.
- Front = the cue (term, question, date, formula name). Back = the answer.
- Keep the back short enough to type, because Write mode asks students to type it.
  Write mode ignores case, spaces, punctuation, accents, a leading "the/a/an", text in
  `(brackets)` and small typos. Put accepted alternatives with ` / ` between them:
  `"back": "to do / to make"` accepts either. Put extra detail in brackets:
  `"back": "to be (permanent / identity)"` accepts "to be".
- **Language decks** (vocabulary, phrases): always set `frontLang` and `backLang`, e.g.
  `"frontLang": "es", "backLang": "en"` for Spanish → English. The site then reads cards aloud with
  the device's built-in voice. Put only the word or phrase itself on a side that will be read aloud.
  Put grammar notes in `hint` or in `(brackets)`. Leave both fields out for non-language decks.
- **Pictures.** If the user gives you image files (diagrams, maps, labelled photos), copy each one to
  `decks/<subject-folder>/images/` with a lowercase-hyphen name (`heart-diagram.png`) and reference it
  from the card: `"frontImage": "images/heart-diagram.png"`. Use `backImage` when the picture is the answer.
  The card still needs `front` and `back` text, e.g. front "Name the chamber labelled A", back "Left ventricle".
  Two cards may share the same front text if their `frontImage` differs. Allowed types: PNG, JPG, WebP, GIF and SVG.
  Keep each file under ~500 KB. Never link to images on other websites; always save the file in the repo.
  Remember to `git add` the image files along with the deck.
- Line breaks are allowed with `\n`. No HTML or Markdown: it is shown as plain text.
- Use `hint` for memory tricks from the notes.
- Add `questions` when the notes suit multiple choice: 4 options, believable wrong answers,
  and the correct answer in a **varied position** (not always first). Always add an `explanation`.
- If a deck has no `questions`, Quiz mode makes them from the cards automatically, so questions are optional.

## Step 3: Validate (required)

```bash
node scripts/validate.js decks/<subject>/<deck-name>.json   # just your file
node scripts/validate.js                                    # everything, must end with 0 errors
```

Fix every **error**. Read every **warning** and fix it unless there's a good reason not to.
The messages say exactly what's wrong and on which card or line.

Optional preview: `node scripts/build-index.js`, then `node scripts/serve.js` (or `python3 -m http.server 8000`)
and open http://localhost:8000. Afterwards run `git checkout -- decks/index.json`.

## Step 4: Submit the changes

First make sure the working copy is up to date and clean:

```bash
git checkout main
git pull
git status
```

### Default: branch and pull request (works for everyone)

```bash
git checkout -b add-deck/<subject>-<deck-name>
git add decks/<subject>/<deck-name>.json            # add only the deck files you made
git add decks/<subject>/images/                      # ...and any pictures they use
git commit -m "Add <Subject> deck: <Title>"
git push -u origin add-deck/<subject>-<deck-name>
```

Then open a pull request:

- With the GitHub CLI: `gh pr create --fill` (the PR template will be filled in. Tick the checklist honestly.)
- Without it: give the user the link that `git push` printed (`https://github.com/<owner>/<repo>/pull/new/<branch>`).

**If `git push` is refused (403 / permission denied)**, the user doesn't have write access. Use a fork:

```bash
gh repo fork --remote=true            # creates your fork and adds it as the "origin" remote
git push -u origin add-deck/<subject>-<deck-name>
gh pr create --fill
```

(Without `gh`: the user forks the repo on github.com, then
`git remote add fork https://github.com/<their-username>/<repo>.git` and `git push -u fork <branch>`,
then opens the PR on the website.)

### Only if the user says so: push straight to main

If the user explicitly asks to skip the pull request **and** has write access:

```bash
git add decks/<subject>/<deck-name>.json
git commit -m "Add <Subject> deck: <Title>"
git pull --rebase
git push origin main
```

## Step 5: Tell the user what happened

Report: the file path(s), number of cards and questions, the PR link (or that it was pushed to main),
and anything from the notes you left out or were unsure about. The live site updates a minute or two
after the change reaches `main` (when the "Build index and deploy site" Action finishes).

---

## Repo map (for reference, don't edit unless asked)

```
decks/                 study content (the only place contributors normally change)
  _template.json       example deck to copy
  index.json           GENERATED list of decks, don't edit
  <subject>/<deck>.json
  <subject>/images/    pictures used by that subject's cards
scripts/validate.js    checks every deck (run before committing)
scripts/build-index.js regenerates decks/index.json
scripts/serve.js       tiny local web server
index.html, css/, js/  the website (plain HTML/CSS/JS, no build step)
sw.js                  service worker for offline use
.github/workflows/     deploy.yml (push to main) and validate.yml (pull requests)
```

When asked to change the website code: keep it dependency-free with no build step, keep paths relative
(the site lives under `https://<user>.github.io/<repo>/`), and add any new file in `js/` to the `APP_FILES`
list in `sw.js`, then bump `CACHE_VERSION`.
