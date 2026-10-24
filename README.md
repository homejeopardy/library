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
- **Browse by genre** — the station's home screen shows a tile per genre with a live count
  of what's actually on the shelf, so a student with nothing in mind can start there.
- **Book requests** — students can ask for a book the library doesn't have. A second student
  asking for the same title adds their name to it rather than making a second entry.
- **Stocktake** — the Shelves tab shows how much of the room is on a shelf, which shelves have
  never been filed, and which haven't been touched in a month.
- **Returns box** — scan a pile of books back in one after another, in one list, with a tally.
- **Who did what** — every save carries the name of whoever made it.
- **Rewind** — every save is a version you can read back. See what changed between two
  versions in plain words, and put back one book or the whole library.
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

## Shelves

A shelf is a physical place that holds one genre — and a genre may fill several shelves,
each with its own code and, if you like, a stretch of the alphabet.

**Shelves → Add a shelf**, give it a code like `A3`, say where it is and which genre lives
there, then **Print shelf cards** and stick each card on its shelf. A card is 3&Prime; × 1&Prime;:
the code large enough to read across the room, the genre and location beside it, and a
scannable Code 39 of `SHELF-A3`.

### Filing a shelf

Stand at the shelf with the scanner and **scan the shelf card** — from the Shelves tab or
the circulation desk, either works. Then scan every book on the shelf. Each scan files the
book there and plays a sound:

- a quiet click when all is well;
- a buzz when something wants looking at — a book from another genre, a book the app
  thought was checked out, one marked lost that has turned up, a repeat scan, or call
  letters outside the shelf's range;
- a rougher tone for a barcode that isn't in the library at all, with an **Add it** link.

Everything is keyboard-driven and the window can be narrow, for working off a laptop at the
shelf. Scanning a different shelf card moves you to that shelf. **Sound off** is there for
a quiet room.

Once books are filed, the catalog shows where each one lives: a shelf code beside its
status, which filters the list to that shelf when clicked, plus a shelf menu in the toolbar
(including **Not on a shelf**). Typing a shelf code in the search box finds its books. A
book that is checked out shows its **home** shelf, and checking it in says which shelf it
goes back on — which is the moment that matters. Students see the shelf code too.

**Filing never changes a book's genre.** A stray is reported so you can move it, not quietly
relabelled. The session also offers a list of books the app expects on that shelf which you
haven't scanned — checked out, mis-shelved, or simply not reached yet.

### A shelf's own page

Click a shelf code to open it: its books **in shelf order** with the call letters beside
each, strays marked, when it was last filed, and buttons to file it, shelf-read it, print
its card, or print its list as a paper checklist.

**Shelf-read** is the second scanning mode. Scan the books left to right and each one is
checked against the one before it, so a book out of alphabetical order is flagged as you go.

**Move it all** sends every book on a shelf to another shelf, for when the room is
rearranged. **Split it** is for a genre that has outgrown its shelf: give a letter and a new
code, and everything sorting at or after that letter moves across, with both letter ranges
set to match.

### Keeping shelves honest

The Shelves tab counts **books not on a shelf**, **books in the wrong genre** (every book
whose genre differs from its shelf's, with a list), and **cards to reprint**. A card goes
out of date when you change a shelf's code, place, genre or letters after printing it —
**Print only the out-of-date cards** does just those.

### What students see

Returning a book at the station answers "where does this go?" in large type: the shelf code,
the genre and its picture, and where the shelf is. Scanning a book that is already checked
in says the same thing, so a student holding a stray can put it away without asking.

### Stocktake

The top of the Shelves tab says how many of your books are on a shelf, as a count and a bar.
Under it: shelves that have **never been filed**, and shelves **not filed in a month**, each
named. It is the fastest way to see what is left to do without walking the room.

While you are shelf-reading, the shelf's own tally shows how many you have scanned, how many
need looking at, and how many belong on that shelf — and **n books not seen yet** lists the
ones you haven't reached.

## The returns box

**Circulation → Returns box.** For the pile that builds up overnight. Scan them one after
another without clearing between each; every book lands in one list with a running tally,
and anything that needs you — a hold, a book marked lost, a book that wasn't out — is
flagged in place rather than interrupting the next scan.

## Books students have asked for

The station's home screen has an **Ask for a book** tile. A student types a title and it
lands in **Reports → Books students have asked for**, newest first, with the names of
everyone who asked. A second student asking for the same title adds their name and a vote
instead of creating a second row, so a book five people want sorts to the top.

Tick one off when you've ordered or found it, and it leaves the list.

## Rewind

**Settings → Earlier versions.** Every sync writes a version, so the library has a history.
Pick a version and the app says what changed between then and now in plain words — *"Legend
was deleted"*, *"The Giver: title changed from The Givre"* — rather than showing you JSON.

From there you can put back **one book** or **the whole library**. Putting the whole library
back is itself a save, so it too can be rewound; nothing is ever lost by going back.

Each version is labelled with who saved it, which is also what makes a shared library
readable later — see below.

## Who did what

Every save is signed with the name of whoever is signed in on that device, so the history
reads *"Catherine: update catalog"* rather than a row of identical entries. The station
signs its saves as **Student station**.

## Browsing by genre at the station

Under the name box, students see a tile per genre with the genre's picture and a count of
how many are **on the shelf right now** — books that are out, lost or damaged aren't
counted. Tapping one lists up to twelve, best rated first, with books the student has
already read pushed to the bottom, and each one's shelf code so they know where to walk.

## How printing works

Every print button opens the sheet in **a tab of its own** and brings up the print box
for it. The tab holds nothing but what you are printing, so what you see is what comes
out, and **Save as PDF** in the print box keeps a copy. Closing the tab changes nothing.

It works this way because the earlier approach — keeping the sheet hidden on the page and
revealing it only for printing — left the browser to swap the whole app over to print
media, and not every browser does that faithfully. Opera showed a correct preview and
then printed an empty job. A plain page avoids the question.

Two things follow:

- If your browser blocks pop-ups for the site, the sheet can't open in a tab. The app
  falls back to the old way and says so; allowing pop-ups for the site restores it.
- Printing from File → Print or Cmd-P on the app's own page doesn't print what's on
  screen — it prints a short note listing the buttons that do print.

## Printing spine labels

**Catalog → Print labels.** Each label is 0.66&Prime; wide and 1&Prime; tall, and carries, top to
bottom: the genre picture, the genre name in small type, the first three letters of the
title in large type, and the book's barcode number.

A range matches on the number inside a barcode, so `42`, `0042` and `CL-0042` all mean the
same book, and a barcode that is really an ISBN sits far outside any small range.

The three letters skip the small words a library files past — *The Lion, the Witch and the
Wardrobe* becomes `LIO`, *Of Mice and Men* becomes `MIC`. Two books can end up with the
same letters; the barcode number underneath tells them apart.

Sorting by genre also offers **start each genre on a new page**, so a sheet only ever holds
one bin's labels and no cut row belongs to two genres. The last sheet of each genre is
part-used, which costs a few labels.

**Which books:** the ones currently listed in the catalog, **the ones with no label printed
yet**, or every book — then narrow by barcode range and by **added on or after**, so
"everything I catalogued this week" is two clicks.

Printing records the date on each book it printed, which is what makes "no label printed
yet" work across several sittings. Untick **remember that these have been printed** for a
test run, and if the printer jams there's an **Undo "marked as labelled"** button on the
toolbar afterwards. A book's own record shows when its label was printed.

**Presets** keep a set of these choices under a name — "New books", "Rebuild a bin" — and
sit along the top of the dialog. They live in the library's settings, so they follow you
to every device.

**Printing:** choose the books currently listed in the catalog (so the search box and the
genre filter decide what you get) or every book, narrow that to a **range of barcode
numbers** — leave either end blank for "no limit", and the dialog says how many books fall
in the range as you type — and pick the order they come off the sheet:
**barcode number** (the order you catalogued them, so labels match a stack of books),
**genre then title** (one bin at a time), **title**, or **author then title**. Print onto full-sheet label paper — 11
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

## The staff way in, on a shared device

The student station carries a small **Staff** link in the corner. It asks for your name and
password — the same account you sign in with anywhere — and then opens the admin pages.

That sign-in is **temporary on purpose**: leaving the admin page signs you straight out
again, so the classroom device is never left open behind you. The top bar says **Done —
back to students** rather than Sign out, and pressing it returns to the student screen.

On your own computer nothing changes: go straight to the admin address and stay signed in
until you sign out.

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

## Changing many books at once

Tick books in the catalog — or the box in the header to take everything the filters are
showing — and a bar appears offering to set the **genre**, put them **on a shelf**, change
their **condition**, or print their labels. The dialog says how many books it will change
before it does anything.

## Classes

A student's class is used, not just stored: the Students tab filters by it, and
**Reports → By class** shows how many students each class has, what they have out, what is
overdue and how much each class borrows per student.

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

## Holds waiting somewhere

**Settings → Where held books wait** takes a phrase like "the hold shelf by the door". When
a held book is returned, the desk says to put it there, and the student who asked for it is
told where to look instead of being sent to find you.

Students can also **keep a book longer** from the station — the same renewal rules apply, so
it refuses once the limit is reached or somebody else is waiting, and says which.

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
js/lookup.js        ISBN → book data (Open Library, then Google Books), and genre hints
js/app.js           admin page: routing, views, and the circulation desk
js/accounts.js      password-locked copies of the key, so a cleared browser can recover
js/shelving.js      shelves, shelf-reading, stocktake and shelf cards
js/barcode.js       Code 39 barcodes as SVG
genre-icons/        one SVG per genre (source for js/genre-art.js)
dev/mock_github_api.py  a local stand-in for GitHub's API, for testing sync
dev/build_genre_art.py  regenerates js/genre-art.js from genre-icons/
dev/genre-icons.html    every icon at icon, tag and label size
dev/serve.py            a no-cache dev server for the local copy
dev/shelf-labels.html   the shelf card layouts, to compare on paper
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
