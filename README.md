# Classroom Library

A small, fast circulation system for a classroom or department book collection.
It runs entirely in the browser — no server and no cost; the optional sync uses a private
GitHub repository as its database.

**Admin:** https://lib.catherine-crump.com/ · **Students:** https://lib.catherine-crump.com/student/

<sub>Built for a single-shelf collection: a few hundred books, one adult running the desk,
students who check books out under their own name.</sub>

Two pages, one library:

- **Admin page** — `/` — the circulation desk, catalog, students, holds, reports and settings.
- **Student page** — `/student/` — for a classroom device. Students type their name (new
  names are added on the spot), then scan to check out and return books, find books and
  get in line for ones that are out. It never shows who has a book, and signs the student
  out after 90 seconds without a touch.

With sync turned on, every device — your computers and the student station — shares one
library, kept in a private GitHub repository.

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

## Where the data lives

Each device keeps its own working copy in the browser, so the app is instant and keeps
working when the Wi-Fi drops.

- **Without sync**, that copy is the only one. It doesn't follow you to another computer,
  clearing browsing data erases it, and **Settings → Download backup** is your safety net.
- **With sync**, every change also goes to two files in a private GitHub repository, and
  every device picks up the others' changes. GitHub keeps every earlier version.

## Syncing across devices

Everything is stored as two JSON files — `catalog.json` (books, settings) and
`circulation.json` (students, loans, holds) — in a **private** repository. Private
matters: those files hold students' names and what each of them has borrowed, and the
app's own repository is public.

### One-time setup (about 10 minutes)

1. **Create the data repository.** On GitHub: **New repository** → name it
   `library-data` → choose **Private** → **Create repository**. Nothing needs to go in it.
2. **Create an access key.** GitHub → your profile picture → **Settings** →
   **Developer settings** → **Personal access tokens** → **Fine-grained tokens** →
   **Generate new token**:
   - Name: `Classroom Library`
   - Expiration: the longest it offers — and put a reminder in your calendar for the day before
   - Repository access: **Only select repositories** → `library-data`
   - Permissions → Repository permissions → **Contents: Read and write**
   - **Generate token**, and copy it (it starts `github_pat_`). GitHub shows it once.
3. **Your main computer first** — the one that already has your library. Admin page →
   **Settings → Sync across devices** → paste the key → **Connect**. Your books and
   students upload.
4. **Any other computer:** same thing. It downloads the shared library.
5. **The student station:** open `/student/` on the classroom device, paste the same key,
   **Connect**. Bookmark it or make it the home page.

If a device that already had its own library connects to a shared library that also has
one, it asks whether to keep both (merge) or use only the shared one — and in the second
case downloads the device's old library as a backup file first.

### Day to day

- A change shows up on the other devices within about 20 seconds, and immediately when you
  switch back to the tab. Background tabs don't check, to save GitHub requests; your own
  changes always upload straight away.
- The indicator in the top bar says **Synced**, **Saving…**, **Offline**, or **Sync problem**
  (click it for details). The student page shows it only when something's wrong.
- **Offline**, everything keeps working and catches up when the connection returns.
- **Two devices saving at the same moment** is fine: GitHub refuses the second write, and
  the app merges record by record and tries again. If the *same* record was changed on
  both, the device that saved last wins.
- **History:** every change is a commit in `library-data`, one record per line, so you can
  see exactly what changed when — and restore any earlier version of a file.

### When the key expires

Devices show **"GitHub rejected the access key"**. Make a new key (step 2), then paste it
in **Settings → Replace access key** on each computer, and on the student station's
setup screen. Nothing is lost — changes made in the meantime upload once the key works.

### What the key can and can't protect

Anyone holding the key can read and change `library-data` (and nothing else). It's stored
in the browser of each device you paste it into. The student station hides the admin page
behind the key, but a student who knows how to use the browser's developer tools could
dig the key out. If that ever happens: GitHub → the token → **Delete**, make a new one,
and paste it on your devices. The history lets you undo any changes made with the old key.

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

For a stack of books, use **Add & add another**: the next dialog opens blank, ready for the
next ISBN, and suggests a genre for that book.

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

Every book gets one of eight genres:

Adventure · Biography · Dystopian · Fantasy / Sci-Fi · Graphic Novels ·
Historical Fiction · Nonfiction · Realistic Fiction

Where the in-between kinds of books go:

| Kind of book | Genre |
| --- | --- |
| Mystery, funny books, sports stories, novels in verse, picture books | Realistic Fiction |
| Mythology, folktales, scary and ghost stories, science fiction | Fantasy / Sci-Fi |
| Memoir | Biography |

The list can be changed under **Settings → Genres**. Renaming a genre moves every book in
it, and renaming one onto an existing genre merges the two. **Restore default genres** puts
back any of the eight that were deleted.

After an ISBN lookup the app shows up to two **"Maybe:"** genres drawn from the book's
subject headings — it offered the right one for 15 of 16 well-known titles tested. It never
picks one on its own, because Open Library merges headings across every edition of a book,
adaptations included: *The Giver* comes back looking like a graphic novel.

**Reports → By genre** ranks genres by how often they're borrowed, including a
per-book rate, which is the number to look at before buying more of something.

### Libraries set up before these eight

A library saved with the earlier fifteen-genre list converts itself on first load, using
the table above. Wherever a book's genre name changes, the old name is kept as a tag
(a mystery lands in Realistic Fiction tagged "Mystery"), so searching for it still works.
A genre someone invented has no known home, so it's cleared and kept as a tag instead.

## Files

```
index.html          admin page
student/index.html  student page
styles.css          all styling; light and dark
kiosk.css           student-page layout (big type, big targets)
js/config.js        which GitHub repository holds the shared data
js/util.js          dates, formatting, CSV, toasts
js/store.js         the data model and every rule (loans, holds, limits, merges, backup)
js/sync.js          GitHub sync: fetch, three-way merge, write, retry
js/kiosk.js         the student page
js/lookup.js    ISBN → book data (Open Library, then Google Books), and genre hints
js/app.js           admin page: routing, views, and the circulation desk
dev/mock_github_api.py  a local stand-in for GitHub's API, for testing sync
```

Plain JavaScript with no framework and no build step, so the whole thing stays editable
by anyone who can read HTML. Every rule lives in `js/store.js` — loan length, overdue
logic, hold order, merge behavior — so that's the file to open when the policy changes.

Sync sits beside the store rather than inside it: `js/store.js` announces each change, and
`js/sync.js` merges and uploads. Neither page knows how sync works.

To test sync without a GitHub account, run `python3 dev/mock_github_api.py`, then on the
local copy of the app set `localStorage['classroom-library-dev-api'] = 'http://localhost:8788'`
and connect with the key `test-key`.

## Updating the app

`index.html` and `student/index.html` load every file with a `?v=` number. **Bump it in both on every change you push**, or
browsers (and GitHub Pages' ten-minute cache) can pair a new page with old scripts, which
breaks the app until the cache expires.

## Trying it out

**Settings → Load sample data** fills an empty library with eight books across six genres, four students,
a live loan, an overdue one and a hold, so you can see how it behaves before committing
real books to it. **Settings → Erase everything** clears it when you're done.
