# China Trip 2026

Personal travel companion app for **Peter + 1**, Jun 8–27, 2026.
Route: **Beijing → Yunnan (Kunming · Lijiang · Dali) → Zhangjiajie → Incheon**

Live at: https://china-trip-bookings.vercel.app

---

## What it does

Three modes in one app:

- **Pre-trip:** plan and track bookings, hotels, flights, trains, activities — plus a personal todo/checklist per traveler
- **During trip:** live itinerary view grouped by location, auto-scrolls to today, offline pass viewer for QR codes and boarding passes
- **Post-trip:** expense settlement

---

## Stack

| Layer     | Tech                                              |
|-----------|---------------------------------------------------|
| Framework | Next.js 14 — Pages Router                         |
| Hosting   | Vercel                                            |
| Database  | Supabase (PostgreSQL)                             |
| Auth      | Bearer token (`WRITE_PASSWORD`) for writes        |
| Theme     | System light/dark via CSS `prefers-color-scheme`  |
| Fonts     | Playfair Display, Source Code Pro                 |
| Barcode   | `@zxing/browser` (decode) · `bwip-js` (render)   |

---

## Project Structure

```
pages/
  index.js                    ← Main UI (~1650 lines, single page)
  api/
    bookings/
      index.js                ← GET (list), POST (create)
      [id].js                 ← PUT (edit), PATCH (settle/passes), DELETE
    todos/
      index.js                ← GET (list), POST (create)
      [id].js                 ← PATCH (toggle done / edit fields), DELETE
    mcp.js                    ← MCP server for Claude integration
    unsplash.js               ← Unsplash image proxy (server-side key)
```

---

## Environment Variables (Vercel)

```
SUPABASE_URL                Supabase project URL
SUPABASE_SERVICE_KEY        Service role key — server-side only, bypasses RLS
WRITE_PASSWORD              Bearer token for all write operations from the UI
UNSPLASH_ACCESS_KEY         Unsplash app access key for location vibe images
NEXT_PUBLIC_FRIEND_NAME     Display name for the second traveler (e.g. "Anna")
                            Falls back to "friend" if not set. Must be NEXT_PUBLIC_
                            so it's bundled into the client at build time.
```

---

## Database

### Table: `bookings`

| Column      | Type        | Notes                                                              |
|-------------|-------------|--------------------------------------------------------------------|
| id          | uuid        | Primary key, auto-generated                                        |
| type        | text        | flight · hotel · train · ticket · food · activity                  |
| name        | text        | Description / booking name (required)                              |
| date        | date        | Start date (check-in for hotels)                                   |
| date_end    | date        | End/checkout date — hotels and multi-day activities                |
| time        | text        | Departure / check-in / start time (HH:MM)                         |
| time_end    | text        | Arrival / check-out / end time (HH:MM)                            |
| origin      | text        | Departure city or airport — flights and trains only                |
| location    | text        | Destination city / region e.g. "Beijing", "Lijiang"               |
| price       | numeric     | Optional — activities may have no price                            |
| currency    | text        | USD · CNY · EUR · KRW · VND · DKK                                  |
| platform    | text        | e.g. Trip.com, Booking.com, Klook                                  |
| reference   | text        | Confirmation number or flight code                                 |
| notes       | text        | Free-form notes                                                    |
| travelers   | text        | peter · friend · both (default: both)                              |
| paid_by     | text        | peter · friend · null (null = unpaid)                              |
| settled     | boolean     | true = other person has reimbursed their share                     |
| passes      | jsonb       | Array of `{ who, code, format }` — one entry per traveler per leg  |
| pass_code   | text        | **Legacy** — single decoded barcode. Kept for backward compat.     |
| pass_format | text        | **Legacy** — barcode format for pass_code. Kept for backward compat.|
| created_at  | timestamptz | Auto-generated                                                     |

**RLS:** Enabled with a permissive policy. All API routes use service role key server-side.

**`activity` type:** Excluded from all expense calculations and settlement. Use for hikes, sightseeing, free plans.

**`passes` column:** Each entry is `{ who: "peter"|"friend", code: string, format: string }`. Multiple entries per person are supported (multi-leg flights). `getBookingPasses()` in the frontend falls back to the legacy `pass_code`/`pass_format` columns transparently.

**SQL to add new columns:**
```sql
ALTER TABLE public.bookings ADD COLUMN passes   jsonb DEFAULT '[]';
ALTER TABLE public.bookings ADD COLUMN time      text;
ALTER TABLE public.bookings ADD COLUMN time_end  text;
ALTER TABLE public.bookings ADD COLUMN origin    text;
```

### Table: `todos`

| Column     | Type        | Notes                                           |
|------------|-------------|-------------------------------------------------|
| id         | uuid        | Primary key, auto-generated                     |
| title      | text        | Todo description (required)                     |
| done       | boolean     | Default false                                   |
| category   | text        | pack · book · docs · health · tech · do         |
| assignee   | text        | peter · friend (no shared "both" — see below)  |
| deadline   | date        | Optional deadline date                          |
| created_at | timestamptz | Auto-generated                                  |

```sql
CREATE TABLE public.todos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text NOT NULL,
  done       boolean DEFAULT false,
  category   text DEFAULT 'do',
  assignee   text DEFAULT 'peter',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all" ON public.todos FOR ALL USING (true) WITH CHECK (true);

-- Add deadline column (migration):
ALTER TABLE public.todos ADD COLUMN IF NOT EXISTS deadline date;
```

**No shared todos:** There is no `assignee = "both"`. Selecting "both ×2" in the UI (or passing `assignee: "both"` to the MCP) creates two separate rows — one for peter, one for friend. This ensures each person's todo list is fully personal.

---

## Auth

Write operations (POST, PUT, PATCH, DELETE) require:
```
Authorization: Bearer <WRITE_PASSWORD>
```

Frontend stores the token in `localStorage` under key `wt`. The 🔒 button in the header triggers a password prompt; 🔓 clears it.

Read access (`GET /api/bookings`, `GET /api/todos`) is always public.

Pass viewing does not require write access — it only requires identity to be set (see Identity System below).

---

## Identity System

A lightweight "who are you on this device?" setting stored in `localStorage` under the key `who`. Values: `"peter"` or `"friend"`.

- **Auto-popup on first visit** — picker appears automatically if no identity is set when the app loads
- A `P` / `F` / `?` badge in the header shows current identity; tap to open the picker
- "clear identity" link in the picker (subtle, for testing) resets to unset
- The displayed name for `"friend"` comes from the `NEXT_PUBLIC_FRIEND_NAME` env var

**Personalized view:** when identity is set, the app filters to show only bookings and todos relevant to you (`travelers = identity` or `travelers = "both"` for bookings; `assignee = identity` for todos). The Trip timeline and hotel banners are filtered the same way.

**Settlement wording:** the summary modal adapts — "You owe [name]" / "[name] owes you" instead of third-person.

---

## API Routes

| Method | Path                   | Description                                         |
|--------|------------------------|-----------------------------------------------------|
| GET    | `/api/bookings`        | List all bookings, ordered by date. Public.         |
| POST   | `/api/bookings`        | Create a new booking.                               |
| PUT    | `/api/bookings/:id`    | Full update of a booking.                           |
| PATCH  | `/api/bookings/:id`    | Partial update — settle, update passes, etc.        |
| DELETE | `/api/bookings/:id`    | Delete a booking.                                   |
| GET    | `/api/todos`           | List all todos, ordered by created_at. Public.      |
| POST   | `/api/todos`           | Create a new todo.                                  |
| PATCH  | `/api/todos/:id`       | Toggle done or update title/category/assignee/deadline. |
| DELETE | `/api/todos/:id`       | Delete a todo.                                      |
| GET    | `/api/unsplash`        | Proxy Unsplash image by `?location=`. Cached 24h.   |

---

## MCP Server

`/api/mcp` — Model Context Protocol server so Claude can read and write bookings and todos directly from chat.

**URL:** `https://china-trip-bookings.vercel.app/api/mcp`
**Version:** 1.3.0
**Connected in Claude.ai as:** "china expenses"

### Tools

| Tool              | Description                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------------|
| `add_booking`     | Add a booking. Supports all fields incl. `time`, `time_end`, `origin`, `date_end`, `location`.      |
| `list_bookings`   | List all bookings, optionally filtered by type.                                                      |
| `settle_booking`  | Mark a booking as settled by ID.                                                                     |
| `delete_booking`  | Delete a booking by ID.                                                                              |
| `set_pass`        | Append a decoded barcode to a booking's `passes` array. Requires `who` (`peter` or `friend`).       |
| `add_todo`        | Add a todo. `assignee: "both"` creates two rows (one per person). Supports `deadline`.              |
| `list_todos`      | List todos, optionally filtered by `done: true/false`.                                               |
| `complete_todo`   | Mark a todo as done by ID.                                                                           |
| `delete_todo`     | Delete a todo by ID.                                                                                 |

MCP uses Supabase service key directly — does not go through REST routes, no `WRITE_PASSWORD` needed.

---

## Frontend — Tabs

### ✦ Trip tab (default)
- Bookings grouped by **location region**, each with an Unsplash vibe hero image
- Active location has a pulsing blue dot; past locations are dimmed
- **Auto-scrolls to today** on tab open
- **Multiple hotel banners per location** — each hotel in `myBookings` for that location group is shown (e.g. a personal pre-arrival hotel + a shared main hotel both appear)
- **Flights and trains** show `origin → destination · HH:MM → HH:MM` inline
- **Tickets and activities** show start/end times if set
- Day-by-day breakdown per location; non-food items expand on tap for ref/notes/links
- **Food entries collapsed to a one-liner per day** — e.g. `🍜 3 meals · 245 CNY` — expandable
- **Maps link on all booking types** — flights link to departure airport, trains to departure station, others to venue
- Location groups are collapsible; state persists in `localStorage`
- **🎫 pass button** — identity-aware: tapping opens your pass directly. When unlocked, expanded cards show per-person `+ P` / `+ F` upload buttons
- **Identity-filtered:** when identity is set, only bookings for `travelers = identity` or `travelers = "both"` are shown

### ✓ Todos tab
- Personal checklist — each traveler sees only their own todos
- Categories: 🧳 Pack · 📋 Book · 🛂 Docs · 💊 Health · 📱 Tech · 🎯 Do
- **Deadlines** — optional per-todo deadline date; overdue items shown with a red "overdue" badge, upcoming with a short date. Pending todos sorted by deadline (soonest first, no deadline last)
- **Editable todos** — ✎ button opens an inline edit form (title, category, assignee, deadline)
- **"Both ×2"** — creating a todo for "both" creates two separate tasks, one per person
- **Suggested section** — auto-computed from bookings at render time (not stored):
  - Missing hotel per future location group (priority 1)
  - Missing transport between consecutive city groups (priority 2)
  - Missing QR for future bookings with no uploaded pass (priority 3, identity required)
- Progress bar showing done/total
- Filter by category (shown always); "for" filter only shown when no identity is set
- **Optimistic UI** — modal closes and todo appears instantly; API call happens in background; rolls back on error
- Offline read — last known state served from `localStorage` cache
- Filter state persisted in `localStorage`

### Expenses tab
- Full list of bookings filtered to current identity (`myBookings`)
- Filters: type, travelers, paid-by, settled status
- **¥ summary button** opens a bottom-sheet with settlement snapshot (identity-aware wording), per-currency totals, and category breakdown
- Add / edit / delete / settle actions (write mode only, revealed on hover)
- Filter state persists in `localStorage`

### Summary modal (inside Expenses)
- Settlement snapshot across all currencies with DKK conversion — uses **all** bookings regardless of identity filter (settlement is shared accounting)
- Wording adapts to identity: "You owe [name]" / "[name] owes you" / third-person when no identity
- Live exchange rates from open.er-api.com, refreshable
- Per-category breakdown (activity type excluded)

---

## Pass Viewer

Boarding passes, train ticket QR codes, and event tickets stored per traveler, viewable offline.

**How it works:**
1. Set your identity (tap `?` badge in header → pick your name) — one-time setup per device
2. When unlocked, expand any flight/train/ticket card to see `+ P` / `+ F` upload buttons
3. Pick a screenshot from your camera roll; `@zxing/browser` decodes the barcode client-side
4. Decoded pass is appended to the `passes` JSONB array in Postgres tagged with `who`
5. Tapping 🎫 opens your pass directly — no picker needed
6. Multiple legs (connecting flights): `‹ 1/2 ›` arrows to navigate between passes for the same traveler
7. `bwip-js` re-renders the barcode live — crisp at any screen size
8. Works offline after first decode (data cached in `bookings_cache` localStorage)
9. Synced across both devices via Postgres

**Backward compatibility:** Old `pass_code` / `pass_format` single-pass records are read transparently and displayed as a Peter pass.

**Via MCP:** `set_pass(id, code, format, who)` appends directly to the passes array.

---

## Settlement Logic

For unsettled bookings where `paid_by` is set and type is not `activity`:

```
pOwes += peterShare(booking) - amountPeterFronted
```

- `travelers = "both"` → Peter's share is 50%
- `travelers = "peter"` → Peter's share is 100%
- `travelers = "friend"` → Peter's share is 0%
- `pOwes > 0` → Peter owes friend · `pOwes < 0` → Friend owes Peter

Settlement always uses the full unfiltered bookings list — identity filtering only affects the Trip and Expenses display views.

---

## Theme

Automatically matches Android/iOS system setting via CSS `prefers-color-scheme`. All colors defined as CSS variables in the `<style>` block — no JS state needed for theme switching.

---

## localStorage Keys

| Key              | Value                                        |
|------------------|----------------------------------------------|
| `wt`             | Write token                                  |
| `who`            | Identity: `"peter"` or `"friend"`            |
| `ft`             | Filter types (JSON array)                    |
| `fs`             | Filter settled                               |
| `ftr`            | Filter travelers                             |
| `fp`             | Filter paid-by                               |
| `sf`             | Show filters toggle                          |
| `tab`            | Active tab (`trip`, `todos`, `expenses`)     |
| `cg`             | Collapsed location groups (JSON)             |
| `tfc`            | Todo filter category                         |
| `tfa`            | Todo filter assignee (no-identity mode only) |
| `bookings_cache` | Last known bookings list (JSON) — offline    |
| `todos_cache`    | Last known todos list (JSON) — offline       |

---

## Deploy Pipeline

Files in Google Drive `china-trip-sync/` mirror the repo:

```
china-trip-sync/
  package.json
  pages/
    index.js              ← TOO LARGE for Drive sync — upload manually to GitHub
    api/
      mcp.js
      unsplash.js
      bookings/
        index.js
        [id].js
      todos/
        index.js
        [id].js
```

**Drive folder IDs:**
- `pages/` → `1UMmqfu9ElFojFem7fMtVE512kwX3AIJw`
- `pages/api/` → `1Clz8BK6ZzVTPsKG04HzrobNm3frvaWf-`
- `pages/api/bookings/` → `1VAwKI0VK2vJJ4D_g4ayNtiRsVF2vQxwH`
- `pages/api/todos/` → `1prOB-1yVMNco4biPodtsssnSW5YopiHa`

**To deploy small API files:** upload to Drive → run `syncToDrive()` in Apps Script → Vercel auto-deploys from GitHub (`petrovito/china-trip-bookings`).

**`index.js`:** upload manually to GitHub — too large for the Drive/Apps Script pipeline.

---

## Local Development

```bash
npm install
# Create .env.local with the env vars listed above
npm run dev
# Open http://localhost:3000
```
