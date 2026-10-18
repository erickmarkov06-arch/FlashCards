# StudyDeck

A free study website for school: **flashcards, quizzes, typing practice, a matching game and spaced
repetition**. All the study content lives in simple JSON files in this repository, so anyone can add
decks from any device, by hand or by giving their notes to Claude Code.

- Works on phones, tablets and computers, and can be **installed like an app**
- **Works offline** after the first visit
- Progress is saved **on your own device**. No accounts, no sign-up.
- Hosted for free on **GitHub Pages**

> **No API key, server, database or paid service is needed.** The site is just static files.
> Claude Code is only an optional helper for *writing* decks on a contributor's own computer.
> The website itself never talks to any AI or any server except GitHub Pages.

---

## Contents

1. [What it can do](#1-what-it-can-do)
2. [Run it on your computer](#2-run-it-on-your-computer)
3. [Put it online with GitHub Pages](#3-put-it-online-with-github-pages)
4. [Folder structure](#4-folder-structure)
5. [The deck file format](#5-the-deck-file-format)
6. [Adding decks by hand](#6-adding-decks-by-hand)
7. [Adding decks with Claude Code from another device](#7-adding-decks-with-claude-code-from-another-device)
8. [Giving other people access](#8-giving-other-people-access)
9. [Installing it on a phone](#9-installing-it-on-a-phone)
10. [Where progress is stored, and export/import](#10-where-progress-is-stored-and-exportimport)
11. [Troubleshooting](#11-troubleshooting)
12. [Customising and scripts reference](#12-customising-and-scripts-reference)

---

## 1. What it can do

| Feature | What it does |
|---|---|
| **Home** | Browse decks by subject, search them, and filter by tag. |
| **Flashcards** | Tap to flip. Swipe right (or tap **Know it**) if you knew it, left (**Still learning**) if not. Shuffle, show the back first, or study **only the cards you got wrong**. |
| **Learn** (spaced repetition) | A Leitner box system: cards you know come back after longer and longer gaps (1, 2, 4, 7, then 14 days). Cards you miss go back to box 1. Adds up to 10 new cards per session. Language decks are also practised the other way round (e.g. English → Spanish) once you know a card; switch this off with **Both directions**. |
| **Study decks together** | "Study all" on a subject heading, or pick a tag and press **Study all**, to mix several decks into one session in any mode. Progress still counts for each card's own deck. |
| **Pictures** | Cards can show a diagram or photo on either side. |
| **Review** tab | All cards due today, from every deck, in one session. |
| **Quiz** | Multiple choice with instant feedback, explanations and a score. Uses the deck's own questions, or makes them from the flashcards. |
| **Write** | Type the answer. Matching is forgiving: it ignores capitals, spaces, punctuation, accents and small typos, and there's an "I was right" button. |
| **Match** | Pair terms with definitions against the clock by tapping or dragging. Your best time is saved. |
| **Stats** | Streaks, cards mastered, Leitner boxes, a 12-week activity chart, per-deck progress, and **export/import** of your progress. |
| **Read aloud** | For language decks: a speaker button on each card, and a "Read aloud" switch that reads cards automatically, using the device's own voices. |
| **Dark mode** | Follows your device. The sun/moon button switches it, and your choice is remembered. |
| **Offline / installable** | A Progressive Web App (PWA): add it to your home screen and it works without internet. |

Keyboard shortcuts on a computer: **Space** flips, **← / →** = didn't know / knew it, **S** reads the card aloud, **1–4** picks quiz answers, **Enter** = next.

---

## 2. Run it on your computer

The site needs to be opened through a small local web server. Double-clicking `index.html` won't work,
because browsers block loading the deck files from `file://` pages.

1. Download the code: click the green **Code** button on GitHub → **Download ZIP** and unzip it,
   or clone it with `git clone https://github.com/<your-username>/<repo-name>.git`.
2. Open a terminal in the project folder and start a server. Use **one** of these:

   ```bash
   python3 -m http.server 8000
   ```

   ```bash
   node scripts/serve.js
   ```

   (On Windows, Python is often `py -m http.server 8000`. `node scripts/serve.js` needs
   [Node.js](https://nodejs.org) but nothing else, no `npm install`.)
3. Open **http://localhost:8000** in your browser.
4. Press **Ctrl+C** in the terminal to stop the server.

If you add a deck locally and want to see it, run `node scripts/build-index.js` first (the online site does this automatically).

---

## 3. Put it online with GitHub Pages

You only do this once. It's free for **public** repositories. (Pages on private repositories needs a paid GitHub plan.)

1. **Create a GitHub account** at https://github.com if you don't have one.
2. **Create a new repository:** click **+** (top right) → **New repository**.
   - Name it, for example `studydeck` (this becomes part of the web address).
   - Choose **Public**.
   - Don't add a README, .gitignore or licence (this project already has them).
   - Click **Create repository**.
3. **Upload the files.** Either:
   - **With git** (recommended), in the project folder:
     ```bash
     git init
     git add .
     git commit -m "First version of StudyDeck"
     git branch -M main
     git remote add origin https://github.com/<your-username>/<repo-name>.git
     git push -u origin main
     ```
   - **Or in the browser:** on the new repo's page click **uploading an existing file**, drag in
     *everything inside* the project folder (including the hidden `.github` folder; on a Mac press
     **Cmd+Shift+.** in Finder to see hidden files), then **Commit changes**.
     Check afterwards that `.github/workflows/deploy.yml` exists in the repo, because the site won't publish without it.
4. **Turn on Pages:** in the repo go to **Settings → Pages**. Under **Build and deployment → Source**,
   choose **GitHub Actions**. There's nothing else to fill in on that page.
5. **Run the first deployment:** go to the **Actions** tab. If you see a button asking you to enable
   workflows, click it. Open **Build index and deploy site**, click **Run workflow** → **Run workflow**.
   (It also runs automatically on every push to `main`.) Wait for the green tick, about 1 minute.
6. **Visit your site** at `https://<your-username>.github.io/<repo-name>/`.
   The link is also shown in **Settings → Pages** and in the finished workflow run.

From now on, every change that reaches `main` automatically checks the decks, rebuilds `decks/index.json`,
and updates the live site.

**What the two Actions do**

| Workflow | When | What |
|---|---|---|
| `deploy.yml`, *Build index and deploy site* | every push to `main` | validates decks → rebuilds and commits `decks/index.json` → publishes to Pages |
| `validate.yml`, *Validate decks* | every pull request | validates decks so mistakes are caught before merging |

---

## 4. Folder structure

```
.
├── index.html               the single web page (the app draws everything inside it)
├── manifest.webmanifest     makes it installable as an app
├── sw.js                    service worker: offline support
├── css/styles.css           all the styling (light + dark themes)
├── js/
│   ├── app.js               starts the app, page routing, theme toggle
│   ├── data.js              loads decks/index.json and deck files
│   ├── store.js             saves progress in localStorage, export/import
│   ├── utils.js             helpers (answer matching, dates, icons…)
│   ├── flipcard.js          the flippable, swipeable card
│   └── views/               one file per page: home, deck, flashcards, quiz,
│                            write, match, review (Learn), stats
├── icons/                   app icons
├── decks/                   ← ALL STUDY CONTENT LIVES HERE
│   ├── _template.json       copy this to start a new deck
│   ├── index.json           generated automatically, don't edit
│   ├── <subject>/<deck>.json  one file per deck, e.g. biology/cell-structure.json
│   └── <subject>/images/      pictures used by that subject's cards
├── scripts/
│   ├── validate.js          checks every deck for mistakes
│   ├── build-index.js       regenerates decks/index.json
│   ├── serve.js             tiny local web server
│   └── lib.js               shared helpers for the scripts
├── .github/
│   ├── workflows/deploy.yml     push to main → validate, index, publish
│   ├── workflows/validate.yml   pull requests → validate
│   └── pull_request_template.md
├── CLAUDE.md                instructions Claude Code follows in this repo
├── CONTRIBUTING.md          short guide for contributors
└── package.json             shortcuts like `npm run validate` (no dependencies)
```

---

## 5. The deck file format

One JSON file per deck, at **`decks/<subject>/<deck-name>.json`**.

- `<subject>` is the subject in lowercase with hyphens: `Biology` → `biology`, `Religious Studies` → `religious-studies`. It **must match** the `subject` field inside the file.
- `<deck-name>` is lowercase with hyphens, e.g. `cell-structure.json`.

### Example

```json
{
  "title": "Cell Structure",
  "subject": "Biology",
  "description": "Organelles of animal, plant and bacterial cells.",
  "author": "Sam K.",
  "tags": ["gcse", "cells"],
  "cards": [
    {
      "front": "Mitochondria",
      "back": "Site of aerobic respiration, which releases energy for the cell.",
      "hint": "Often called the powerhouse of the cell.",
      "tags": ["organelles"]
    },
    {
      "front": "Ribosomes",
      "back": "Site of protein synthesis."
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

### Fields

| Field | Required? | Description |
|---|---|---|
| `title` | ✅ | Deck name shown on the site |
| `subject` | ✅ | Subject heading on the home page; must match the folder name |
| `description` | ✅ | One sentence about the deck |
| `author` | ✅ | Who made it (a name or initials is fine) |
| `tags` | optional | List of lowercase-hyphenated tags, used by the tag filter |
| `frontLang` | optional | Language of the card fronts, e.g. `"es"`. Turns on **read aloud** (see below) |
| `backLang` | optional | Language of the card backs, e.g. `"en"` |
| `cards` | ✅ | List of flashcards (at least one) |
| `cards[].front` | ✅ | Term or question. Must be unique in the deck. |
| `cards[].back` | ✅ | Definition or answer |
| `cards[].hint` | optional | Shown when you tap **Hint** |
| `cards[].tags` | optional | Extra tags for this card |
| `cards[].frontImage` | optional | A picture on the front, e.g. `"images/heart.png"` (see below) |
| `cards[].backImage` | optional | A picture on the back |
| `cards[].imageAlt` | optional | Short description of the picture, for screen readers |
| `questions` | optional | Multiple-choice questions for Quiz mode |
| `questions[].question` | ✅ | The question |
| `questions[].options` | ✅ | 2–6 possible answers |
| `questions[].answerIndex` | ✅ | Which option is right, **counting from 0** (`0` = first, `1` = second…) |
| `questions[].explanation` | optional | Shown after answering |

**Tips**

- Text is shown exactly as written (no HTML). Use `\n` for a line break.
- In Write mode, `"back": "to do / to make"` accepts either answer, and anything in `(brackets)` is optional.
- No `questions`? Quiz mode builds multiple-choice questions from the cards automatically.
- **Pictures:** save image files in an `images` folder next to the deck, e.g. `decks/biology/images/heart.png`,
  and point to them from a card with `"frontImage": "images/heart.png"` (or `"backImage"` if the picture is the
  answer). PNG, JPG, WebP, GIF and SVG work. Keep each file under about 500 KB so it loads fast on phones.
  The validator checks the file exists, and pictures are saved for offline use like everything else.
- **Language decks can be read aloud.** Add `"frontLang"` and/or `"backLang"` with a language code:
  `"es"` Spanish, `"fr"` French, `"de"` German, `"it"` Italian, `"pt"` Portuguese, `"en"` English,
  `"ja"` Japanese, `"zh-CN"` Chinese… Cards then get a speaker button, and Flashcards, Learn and Write
  get a **Read aloud** switch that reads each card automatically. It uses the voices built into the phone or
  computer, so it's free and works offline. Decks without these fields aren't read aloud, because the
  wrong voice would mispronounce them.
- Progress is linked to each card's **front** text. If you reword a front, that card starts fresh.
- Files starting with `_` (like `_template.json`) are not shown on the site. Use this for drafts.

---

## 6. Adding decks by hand

### On the GitHub website (no software needed)

1. Open the repo on GitHub, go into the `decks` folder, and open `_template.json`. Copy its contents.
2. Click **Add file → Create new file**. In the name box type the path, e.g.
   `decks/history/tudors.json` (typing `/` creates folders).
3. Paste the template and replace the example text with your cards.
4. Click **Commit changes…**
   - If you have write access, you can commit directly to `main`.
   - Otherwise (or to have it checked first) choose **Create a new branch… and start a pull request**.
5. On a pull request the **Validate decks** check runs. If it fails, click **Details** to see exactly
   what's wrong, edit the file, and commit again.
6. Once it reaches `main`, the site updates within a couple of minutes.

### On your computer

1. Copy `decks/_template.json` to `decks/<subject>/<deck-name>.json` and edit it.
2. Check it: `node scripts/validate.js`
3. Optional preview: `node scripts/build-index.js`, then run the site locally (section 2).
4. Commit **only your deck file** and push or open a pull request (see section 7, steps 6–7, for the commands).

You never need to edit `decks/index.json`: the Action regenerates it.

---

## 7. Adding decks with Claude Code from another device

This is the easiest way to turn your class notes into decks. Claude reads `CLAUDE.md`, which tells it
exactly how to format the deck, where to save it, how to check it, and how to submit it.

**What you need on that device (one time):**

- [Git](https://git-scm.com/downloads)
- [Claude Code](https://claude.com/claude-code) (the terminal app, desktop app or IDE extension), signed in with your own Claude account
- Optional, but it makes pull requests one step: the [GitHub CLI](https://cli.github.com) (`gh auth login`)
- A GitHub account that is a collaborator on the repo, or any GitHub account if you'll use a fork (see section 8)

**Steps:**

1. **Clone the repo:**
   ```bash
   git clone https://github.com/<owner>/<repo-name>.git
   cd <repo-name>
   ```
   (Already cloned? Run `git checkout main` and `git pull` to get the latest version.)
2. **Open it in Claude Code:** run `claude` in that folder, or open the folder in the Claude desktop app or your editor.
3. **Paste your notes and a request.** Copy-paste this prompt and fill in the blanks:

   ```text
   Here are my notes on <TOPIC> for <SUBJECT>. Turn them into a flashcard deck following
   CLAUDE.md. Add multiple-choice questions where they make sense. Use "<YOUR NAME>" as the
   author. Validate it, then submit it as a pull request.

   <PASTE YOUR NOTES HERE>
   ```

   More examples:
   - *"Turn the attached PDF of my history notes into decks (one per topic) following CLAUDE.md, validate them and open a pull request."*
   - *"Add these 10 cards to my existing Spanish verbs deck, following CLAUDE.md, and submit it."*
   - *"I have write access. Make a chemistry deck from these notes following CLAUDE.md and push it straight to main."*
4. **Claude creates** `decks/<subject>/<deck-name>.json`.
5. **Claude validates** it with `node scripts/validate.js` and fixes any problems. Have a quick look at the cards too.
6. **Claude submits** it: makes a branch, commits only the deck file, pushes, and opens a pull request
   (or pushes to `main` if you said to and you have write access).
7. **Merge:** the repo owner (or you, if you have access) reviews the pull request on GitHub and
   clicks **Merge**. The site updates a minute or two later.

You can also ask Claude questions like *"What decks exist already?"* or *"Check my deck for mistakes."*

---

## 8. Giving other people access

There are two ways for others to contribute.

| | **Collaborators** | **Forks and pull requests** |
|---|---|---|
| Good for | Friends or classmates you trust | Anyone at all |
| Setup | You invite them | None: anyone with a GitHub account can fork |
| They can | Push branches, and push directly to `main` | Suggest changes. Only you can merge them. |
| Their changes go live | Immediately if pushed to `main`, or when a PR is merged | When you merge their pull request |

**Add a collaborator:** repo → **Settings → Collaborators** → **Add people** → enter their GitHub
username or email. They must accept the email invitation.

**Fork and pull request (for anyone):** they click **Fork** on your repo, add a deck in their copy,
then click **Contribute → Open pull request**. Claude Code does this automatically (`gh repo fork`) if
they don't have write access. You review it under **Pull requests** and click **Merge**.

**Optional: require review for everything.** Settings → **Branches** (or **Rules → Rulesets**) → add a rule for `main`
that requires a pull request and the **Validate decks** check to pass. If you do this, also allow
**GitHub Actions** to bypass the rule (add it to the bypass list), because the deploy workflow commits the
regenerated `decks/index.json` to `main`.

---

## 9. Installing it on a phone

Open the site's address (`https://<your-username>.github.io/<repo-name>/`) on the phone first.

**iPhone / iPad (Safari):**
1. Tap the **Share** button (square with an arrow).
2. Scroll down and tap **Add to Home Screen** → **Add**.
3. Open StudyDeck from the new home-screen icon. It opens full screen, like an app.

**Android (Chrome):**
1. Tap the **⋮** menu (top right).
2. Tap **Install app** (or **Add to Home screen** → **Install**).
3. Open it from your home screen or app drawer.

Once opened online, every deck is saved for offline use. New decks download next time you open it with internet.

---

## 10. Where progress is stored, and export/import

- Progress (Leitner boxes, right/wrong counts, streaks, best Match times) is stored in your browser's
  **localStorage**. It stays **on that device, in that browser**, and is never uploaded anywhere.
- Different devices or browsers each have their own progress. On iPhone, the **home-screen app and
  Safari have separate storage** too.
- Clearing your browser's site data, or uninstalling the app, deletes the progress. Safari may also delete
  data for websites you haven't opened in a few weeks, so **installing the app and exporting now and then** is a good habit.

**Export / import (Stats page → "Back up or move your progress"):**
- **Export progress** downloads a file like `studydeck-progress-2026-10-18.json`.
- **Import progress** on another device (or after clearing data) loads that file. Importing **merges**:
  for each card the most recently studied record wins, and nothing that's already there is lost.
- **Reset everything** deletes all progress on this device (it asks first).

---

## 11. Troubleshooting

**The site isn't updating after I pushed / merged.**
- Go to the **Actions** tab. The *Build index and deploy site* run must have a green tick.
  A red ✗ usually means a deck failed validation: open the run, click the failed step, and read the error.
- Check **Settings → Pages → Source** is **GitHub Actions**.
- Your phone may be showing a saved copy. See "old version" below.

**My new deck doesn't appear.**
- It must be at `decks/<subject>/<name>.json` (one folder deep), and the name can't start with `_`.
- `decks/index.json` must list it. Online, the Action does this. Locally, run `node scripts/build-index.js`.

**A JSON error / validation failed.**
Run `node scripts/validate.js`. It prints the file, the line and column, and a likely cause. The most common mistakes:
- a **comma after the last item** in a list or object: `["a", "b",]` ✗
- a **missing comma** between two cards: `} {` should be `}, {`
- **single quotes** `'like this'` or **curly quotes** `“like this”` instead of straight double quotes `"like this"`
- `answerIndex` counted from 1 instead of 0
- the folder doesn't match the subject (`"subject": "Maths"` must be in `decks/maths/`)

**I'm seeing an old version of the site (service worker caching).**
The app normally fetches fresh files whenever you're online, but if something looks stuck:
- On a computer: press **Ctrl+Shift+R** (Windows/Linux) or **Cmd+Shift+R** (Mac). If that doesn't help, open
  DevTools → **Application** → **Service workers** → **Unregister**, then reload.
- On a phone: fully close the app or tab and reopen it while online (sometimes twice).
- Last resort: clear the site's data in browser settings. **Export your progress first.**
- If you change the website code, bump `CACHE_VERSION` in `sw.js` (e.g. `'v1'` → `'v2'`).

**The page is blank or says "opened as a file".** Use a local server (section 2). Don't double-click `index.html`.

**The Pages URL shows 404.** Wait a minute after the first deployment. Check the repo is public and that Pages
is set to **GitHub Actions**. The URL is case-sensitive: `/<repo-name>/` must match exactly.

**The workflow fails at "Commit the index if it changed" with a permission error.** A branch rule on `main`
blocks the bot. Add GitHub Actions to the rule's bypass list (section 8), or remove the rule.

**My progress disappeared.** Progress is per device and per browser (section 10). Check you're in the same browser
or app, and use Export/Import to move it.

**`git push` says permission denied.** You aren't a collaborator. Use a fork and pull request (section 8), or ask the owner to add you.

---

## 12. Customising and scripts reference

- **Name:** change `StudyDeck` in `index.html` and `manifest.webmanifest`.
- **Colours:** edit the variables at the top of `css/styles.css` (`--primary` etc.) for light and dark themes.
- **Icon:** replace the files in `icons/` (keep the same names and sizes: 180, 192 and 512 px PNGs, plus `icon.svg`).
- **Spaced-repetition timings:** `BOX_INTERVALS` and `NEW_CARDS_PER_SESSION` in `js/store.js`.
- If you add a new JavaScript file, add it to `APP_FILES` in `sw.js` and bump `CACHE_VERSION`.

| Command | What it does |
|---|---|
| `node scripts/validate.js` | Check every deck (also `npm run validate`) |
| `node scripts/validate.js decks/biology/cells.json` | Check just one file |
| `node scripts/build-index.js` | Rebuild `decks/index.json` (also `npm run build-index`) |
| `node scripts/serve.js [port]` | Run the site locally at http://localhost:8000 (also `npm start`) |

No `npm install` is ever needed. There are no dependencies.
