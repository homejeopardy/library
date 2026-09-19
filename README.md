# Classroom Library

A small, fast circulation system for a classroom or department book collection.
It runs entirely in the browser — no server, no database, no accounts, no cost.

**Live app:** https://homejeopardy.github.io/library/ *(after enabling GitHub Pages — see below)*

<sub>Built for a single-shelf collection: a few hundred books, one adult running the desk,
students who check books out under their own name.</sub>

## What it does

- **Circulation desk** — one box handles everything. Scan a barcode, or type an ISBN,
  a title, or a student's name, and press Enter. The app works out whether you're
  checking a book out, checking it in, or looking something up.
- **Students add themselves** — the first time a student types their name at checkout,
  they're created. After that they autocomplete. No cards, no ID numbers, no roster import.
- **Barcode scanning** — a USB scanner is just a fast keyboard, so it works out of the box.
  Books without a barcode get one generated (`CL-0001`, `CL-0002`, …) for label printing.
- **ISBN lookup** — type or scan an ISBN and the title, author, publisher, year and cover
  fill themselves in from Open Library (falling back to Google Books).
- **Genres** — every book can carry one genre from a list you control, with a starter set
  of fifteen. Filter the catalog by genre, print a shelf list grouped by genre for sorting
  bins, and see which genres actually get borrowed.
- **Holds** — a queue per book, with a "ready for pickup" list and a reminder at check-in
  when the returned book is spoken for.
- **Reports** — what's out, what's overdue, most borrowed, busiest readers, never borrowed.
  Printable overdue notices and a printable shelf list.
- **Undo** — the last few desk actions can be reversed with one click.
- **Exports** — catalog and loan history as CSV, plus a full JSON backup.

## Running it

Nothing to install or build. Either:

- **Open `index.html`** directly in a browser, or
- **Serve the folder** on the classroom machine:

```bash
python3 -m http.server 8777 --directory /path/to/library
```

then visit `http://localhost:8777`.

### Publishing it with GitHub Pages

In the repository: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save.**
A minute later the app is live at `https://homejeopardy.github.io/library/`, and any
device on any network can open it.

## Where the data lives — read this part

Everything is stored in **the browser's `localStorage`, on the computer you use it from**.
That's what makes it free and instant, and it has three consequences worth knowing:

1. **The data does not follow you between computers or browsers.** Chrome on the desk
   machine and Safari on your laptop are two separate libraries.
2. **Clearing "browsing data" or "cookies and site data" erases the library.**
3. **Publishing to GitHub Pages publishes the *app*, not your data.** Your books and
   students never leave your machine — nothing is uploaded anywhere.

So: **Settings → Download backup**, regularly. The JSON file it produces restores the whole
library on any machine (Settings → Restore from backup), which is also how you move it.

## Keyboard-only desk flow

The intended rhythm at the desk, with a scanner and no mouse:

| Key | What happens |
| --- | --- |
| Scan a book | Its record comes up, with the right action already focused |
| `Enter` | Confirms that action — check in, or move to the name box |
| Type a name, `Enter` | Checks the book out (creating the student if they're new) |
| `/` | Jumps back to the scan box from anywhere |
| `Esc` | Closes a dialog |

### Adding books with a scanner

**Add a book** opens with the cursor in ISBN, and each scan moves you on:

1. **Scan the ISBN** (the barcode on the back cover). The cursor jumps to Barcode straight
   away, and the title, author and cover fill in while you keep going.
2. **Scan your library label.** No label? Press Enter on the empty field and one is
   generated (`CL-0010`, …). A label that's already on another book is caught right there,
   so you can rescan.
3. **Pick a genre** — click a "Maybe:" suggestion or choose from the menu — and **press
   Enter** to save.

For a stack of books, use **Add & add another**: the next dialog opens ready for the next
ISBN, with the same genre already chosen.

## Settings worth setting

| Setting | Default | Notes |
| --- | --- | --- |
| Loan length | 14 days | Due at end of day |
| Grace days | 0 | Days past due before a book counts as overdue |
| Renewals allowed | 2 | A book with someone waiting can't be renewed |
| Books out at once | 3 | `0` removes the limit |
| Add students automatically | on | Turn off to require adding students by hand first |
| Barcode prefix | `CL` | Used for generated barcodes |

Limits and holds are *soft* — the app warns and asks before letting you override, so the
rules never stop you from doing the sensible thing in the moment.

## Genres

The starter list, chosen for a classroom collection:

Adventure · Biography & Memoir · Fantasy · Graphic Novels · Historical Fiction · Humor ·
Mystery · Mythology & Folktales · Nonfiction · Picture Books · Poetry & Novels in Verse ·
Realistic Fiction · Science Fiction · Scary Stories · Sports

Change it under **Settings → Genres**. Renaming a genre moves every book in it, and
renaming one onto an existing genre merges the two — so "Scary Stories" → "Horror", or
folding "Survival" into "Adventure", is one step. **Restore suggested genres** puts back
any of the starter set you deleted. A new genre can also be added straight from the
Genre menu while adding a book.

After an ISBN lookup the app shows up to two **"Maybe:"** genres drawn from the book's
subject headings. It never picks one for you: Open Library merges headings across every
edition of a book, adaptations included, so *The Giver* comes back tagged as a graphic
novel. Treat them as a shortcut, not an answer.

**Reports → By genre** ranks genres by how often they're borrowed, including a
per-book rate, which is the number to look at before buying more of something.

## Files

```
index.html      page shell
styles.css      all styling; light and dark
js/util.js      dates, formatting, CSV, toasts
js/store.js     the data model and every rule (loans, holds, limits, merges, backup)
js/lookup.js    ISBN → book data (Open Library, then Google Books), and genre hints
js/app.js       routing, views, and the circulation-desk interaction
```

Plain JavaScript with no framework and no build step, so the whole thing stays editable
by anyone who can read HTML. Every rule lives in `js/store.js` — loan length, overdue
logic, hold order, merge behavior — so that's the file to open when the policy changes.

If it ever outgrows one machine, `js/store.js` is also the only file that needs to change:
the views only ever talk to it through the functions it exports.

## Updating the app

`index.html` loads every file with a `?v=` number. **Bump it on every change you push**, or
browsers (and GitHub Pages' ten-minute cache) can pair a new page with old scripts, which
breaks the app until the cache expires.

## Trying it out

**Settings → Load sample data** fills an empty library with eight books across six genres, four students,
a live loan, an overdue one and a hold, so you can see how it behaves before committing
real books to it. **Settings → Erase everything** clears it when you're done.
