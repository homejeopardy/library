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
- **Lost and damaged** — a book can be set aside without deleting it. It keeps its history,
  stops being checked out, and shows in Reports with who had it last.
- **Star ratings** — students rate a book out of five as they return it at the station.
  Averages show in the catalog, in student search, and in Reports.
- **Needs attention** — a repair list. The book still goes out as normal; students can add
  to the list themselves when they return something with a torn page.
- **What to read next** — returning a book at the station suggests others in the same
  genre that are on the shelf right now, best rated first.
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
  clearing browsing data erases it for good, and **Settings → Download backup** is your
  only safety net.
- **With sync**, every change also goes to two files in a private GitHub repository, and
  every device picks up the others' changes. GitHub keeps every earlier version.

### If a browser's data is cleared

No website can survive this on its own: **clearing "cookies and other site data" empties
everything a page has stored**, in every browser, by design. What differs is how much work
it is to get back.

- **Clearing only the cache changes nothing.** Cached files and site data are separate
  boxes in every browser's dialog; the library lives in the second one.
- **With sync on, the books are never at risk** — they are in GitHub too, with history.
  A cleared browser loses its copy and forgets the key, and both come back the moment you
  open a setup link.
- **Keep a way back in.** Any one of these is enough, and all three are free:
  - let your browser **save the key** when it offers — saved passwords are kept separately
    from site data and survive the clear;
  - **bookmark** a setup link from **Set up another device**;
  - press **File** there to save a small `open-classroom-library.html`. Keep it in
    Documents; double-clicking it opens the app already set up. It holds the key, so keep
    it off shared drives.
- The app also asks the browser to mark the library as **persistent storage**, which stops
  it being tidied away automatically when disk runs short. Settings says whether the
  browser agreed. That is separate from a deliberate clear, which nothing can prevent.

## Syncing across devices

Everything is stored as two JSON files — `catalog.json` (books, settings) and
`circulation.json` (students, loans, holds) — in a **private** repository. Private
matters: those files hold students' names and what each of them has borrowed, and the
app's own repository is public.

### One-time setup (about 10 minutes)

1. **Create two repositories.** On GitHub: **New repository** → `library-data` →
   **Private** → **Create repository**. Then another → `library-accounts` → **Public**.
   Nothing needs to go in either. The private one holds the library; the public one holds
   each person's password-locked copy of the access key, which is useless without the
   password.
2. **Create an access key.** GitHub → your profile picture → **Settings** →
   **Developer settings** → **Personal access tokens** → **Fine-grained tokens** →
   **Generate new token**:
   - Name: `Classroom Library`
   - Expiration: the longest it offers — and put a reminder in your calendar for the day before
   - Repository access: **Only select repositories** → `library-data` **and**
     `library-accounts`
   - Permissions → Repository permissions → **Contents: Read and write**
   - **Generate token**, and copy it (it starts `github_pat_`). GitHub shows it once.
3. **Your main computer** — the one that already has your library. Open the app, choose
   **Use the access key instead**, paste the key, **Connect**. Your books and students
   upload. **This is the only time the key is ever typed.**
4. **Make your account.** Type your name on the sign-in screen and pick a password (at
   least 8 characters). From now on, that name and password open the library on any
   computer — you never touch the key again.
5. **Every other computer:** go to the site, sign in with your name and password. That's
   the whole setup. If the browser's data is ever cleared, sign in again and everything
   comes back.
6. **The student station** is different: it runs without anyone signed in, so it keeps its
   own one-time setup. On your computer, **Settings → Sync across devices → Set up another
   device** gives a station link with a **Copy** button, a **QR** code and a **File**
   button. Open the link on the classroom device and bookmark it there.

The link carries the key in the part of a web address browsers never send to a server, and
the receiving page wipes it out of the address bar before it does anything else. Still,
**anyone holding a link can read and change the library**, so treat them like the key
itself: your own devices, never posted anywhere.

The student page and the admin page on the *same browser* share one key automatically, so
that computer only ever needs setting up once.

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

Devices show **"GitHub rejected the access key"**. Make a new key (step 2) and paste it in
**Settings → Replace access key** on your main computer — then re-open the setup links on
the others, exactly as in step 4, so you still only type it once. Nothing is lost; changes
made in the meantime upload as soon as the key works.

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

## Printing spine labels

**Catalog → Print labels.** Each label is 0.66&Prime; wide and 1&Prime; tall, and carries, top to
bottom: the genre picture, the genre name in small type, the first three letters of the
title in large type, and the book's barcode number.

The three letters skip the small words a library files past — *The Lion, the Witch and the
Wardrobe* becomes `LIO`, *Of Mice and Men* becomes `MIC`. Two books can end up with the
same letters; the barcode number underneath tells them apart.

**Printing:** choose the books currently listed in the catalog (so the search box and the
genre filter decide what you get) or every book. Print onto full-sheet label paper — 11
labels across, 10 down, 110 to a sheet — and cut along the hairline guides. Labels sit
edge to edge, so one pass with a paper trimmer cuts both neighbours. To use the rest of a
part-cut sheet, set **skip this many spaces**.

**Books with no genre** print without a picture. The dialog offers to guess them from
their ISBNs; anything it fills in is marked as a guess, so it's worth a look in the
catalog afterwards.

### The genre pictures

`genre-icons/` holds one SVG per genre — line drawings, black and white, each built around
a single idea so it survives being printed at label size. They use `currentColor`, so the
same file prints black and turns light in the app's dark mode.

`js/genre-art.js` is generated from that folder, and is what the app actually draws from
(no network, nothing to load). After editing an icon, regenerate it:

```bash
python3 dev/build_genre_art.py
```

Open `dev/genre-icons.html` to see every icon at icon, tag and real label size.

## Lost and damaged books

From the circulation desk (**Lost or damaged…**), from a book's Edit dialog, or from the
Reports list. Marking a book that is **currently checked out** closes that loan, so the
student stops owing a book nobody expects back — the loan keeps the reason, and the book
remembers who had it last.

A marked book stays in the catalog with all its history. It will not be checked out (the
desk can still override), will not fill a hold, and the student station tells anyone who
scans it to give it to you. **Back on the shelf** undoes all of that.

## Who can sign in

**Settings → Who can sign in** lists the accounts. A new person signs in on a computer
that is already connected, types their name, and picks a password — the app locks a copy
of the access key with it. **Reset password** removes their locked copy; they pick a new
one next time they sign in on a connected computer. Nobody, including you, can look up an
existing password.

Accounts live in the public `library-accounts` repository. Each entry is the access key
encrypted with that person's password (AES-GCM, with the password stretched by PBKDF2 at
310,000 iterations), so the file gives nothing away on its own. Because it is public,
**password strength is what protects the library** — eight characters is the floor, and a
few unrelated words beat a short clever one.

## Needs attention

Lighter than lost or damaged: the book still lends normally, it just wants taping,
re-covering or replacing before long. Flag it from the circulation desk, from a book's
Edit dialog (type what needs doing; clear the box when it's done), or from
**Reports → Needs attention**, which lists everything outstanding with a **Mark it fixed**
button.

Students can add to the list too. When they return a book at the station there's a
**Something's wrong with this book** link; they pick from four plain options, and it lands
on your list with their name and the date. The book keeps circulating meanwhile.

The catalog's **Needs a look** filter covers all three: lost, damaged, and needs attention.

## What to read next

When a student returns a book at the station, up to three suggestions appear underneath:
same genre, on the shelf right now, nothing they have borrowed before, best rated first.
A tie goes to whichever has gone out least, so a good book nobody has tried gets a turn.
If the genre has nothing left to offer, it falls back to the whole collection.

## Star ratings

When a student returns a book at the station, it asks "How was it?" and they tap one to
five stars. One rating per student per book; tapping again replaces it. Ratings are never
shown with a name attached — students only ever see the average.

They appear in the catalog under each title, in the student station's search results (so
students pick books other students liked), and in **Reports → What students thought**.

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

Every book gets one of nine genres:

Adventure · Biography · Dystopian · Fantasy / Sci-Fi · Graphic Novels ·
Historical Fiction · Nonfiction · Plays & Poems · Realistic Fiction

Where the in-between kinds of books go:

| Kind of book | Genre |
| --- | --- |
| Mystery, funny books, sports stories, picture books | Realistic Fiction |
| Plays, poetry collections, epic poems | Plays & Poems |
| Novels told in verse — the story decides, not the form | their story's genre |
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
js/genre-art.js     the genre drawings, inlined for printing
js/kiosk.js         the student page
js/lookup.js    ISBN → book data (Open Library, then Google Books), and genre hints
js/app.js           admin page: routing, views, and the circulation desk
genre-icons/        one SVG per genre (source for js/genre-art.js)
dev/mock_github_api.py  a local stand-in for GitHub's API, for testing sync
dev/build_genre_art.py  regenerates js/genre-art.js from genre-icons/
dev/genre-icons.html    every icon at icon, tag and label size
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
