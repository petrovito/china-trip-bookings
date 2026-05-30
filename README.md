# China Trip 2026

Personal travel companion app for **Peter + 1**, Jun 8–27, 2026.
Route: **Beijing → Yunnan (Kunming · Lijiang · Dali) → Zhangjiajie → Incheon**

Live at: https://china-trip-bookings.vercel.app

---

## What it does

Three modes in one app:

- **Pre-trip:** plan and track bookings, hotels, flights, trains, activities — plus a shared todo/checklist
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
  index.js                    ← Main UI (~1320 lines, single page)
  api/
    bookings/
      index.js                ← GET (list), POST (create)
      [id].js                 ← PUT (edit), PATCH (settle/pass), DELETE
    todos/
      index.js                ← GET (list), POST (create)
      [id].js                 ← PATCH (toggle done), DELETE
    mcp.js                    ← MCP server for Claude integration
    unsplash.js               ← Unsplash image proxy (server-side key)
```

---

## Environment Variables (Vercel)

```
SUPABASE_URL            Supabase project URL
SUPABASE_SERVICE_KEY    Service role key — server-side only, bypasses RLS
WRITE_PASSWORD          Bearer token for all write operations from the UI
UNSPLASH_ACCESS_KEY     Unsplash app access key for location vibe images
```

---

## Database

### Table: `bookings`

| Column      | Type        | Notes                                                       |
|-------------|-------------|-------------------------------------------------------------|
| id          | uuid        | Primary key, auto-generated                                 |
| type        | text        | flight · hotel · train · ticket · food · activity           |
| name        | text        | Description / booking name (required)                       |
| date        | date        | Start date (check-in for hotels)                            |
| date_end    | date        | End/checkout date — hotels and multi-day activities         |
| location    | text        | City or region e.g. "Beijing", "Lijiang"                    |
| price       | numeric     | Optional — activities may have no price                     |
| currency    | text        | USD · CNY · EUR · KRW · VND · DKK                           |
| platform    | text        | e.g. Trip.com, Booking.com, Klook                           |
| reference   | text        | Confirmation number or flight code                          |
| notes       | text        | Free-form notes                                             |
| travelers   | text        | peter · friend · both (default: both)                       |
| paid_by     | text        | peter · friend · null (null = unpaid)                       |
| settled     | boolean     | true = other person has reimbursed their share              |
| pass_code   | text        | Decoded barcode/QR text — stored for offline pass viewer    |
| pass_format | text        | Barcode format: QR_CODE, PDF_417, AZTEC, CODE_128, etc.     |
| created_at  | timestamptz | Auto-generated                                              |

**RLS:** Enabled with a permissive policy. All API routes use service role key server-side.

**`activity` type:** Excluded from all expense calculations and settlement. Use for hikes, sightseeing, free plans.

**Pass columns:** Added via `ALTER TABLE bookings ADD COLUMN pass_code text; ALTER TABLE bookings ADD COLUMN pass_format text;`

### Table: `todos`

| Column     | Type        | Notes                                           |
|------------|-------------|-------------------------------------------------|
| id         | uuid        | Primary key, auto-generated                     |
| title      | text        | Todo description (required)                     |
| done       | boolean     | Default false                                   |
| category   | text        | pack · book · docs · health · tech · do         |
| assignee   | text        | peter · friend · both (default: both)           |
| created_at | timestamptz | Auto-generated                                  |

```sql
CREATE TABLE public.todos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text NOT NULL,
  done       boolean DEFAULT false,
  category   text DEFAULT 'do',
  assignee   text DEFAULT 'both',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all" ON public.todos FOR ALL USING (true) WITH CHECK (true);
```

---

## Auth

Write operations (POST, PUT, PATCH, DELETE) require:
```
Authorization: Bearer <WRITE_PASSWORD>
```

Frontend stores the token in `localStorage` under key `wt`. The 🔒 button in the header triggers a password prompt; 🔓 clears it.

Read access (`GET /api/bookings`, `GET /api/todos`) is always public.

---

## API Routes

| Method | Path                   | Description                                        |
|--------|------------------------|-----------------------------------------------------|
| GET    | `/api/bookings`        | List all bookings, ordered by date. Public.         |
| POST   | `/api/bookings`        | Create a new booking.                               |
| PUT    | `/api/bookings/:id`    | Full update of a booking.                           |
| PATCH  | `/api/bookings/:id`    | Partial update — settle, or set pass_code.          |
| DELETE | `/api/bookings/:id`    | Delete a booking.                                   |
| GET    | `/api/todos`           | List all todos, ordered by category. Public.        |
| POST   | `/api/todos`           | Create a new todo.                                  |
| PATCH  | `/api/todos/:id`       | Toggle done or update fields.                       |
| DELETE | `/api/todos/:id`       | Delete a todo.                                      |
| GET    | `/api/unsplash`        | Proxy Unsplash image by `?location=`. Cached 24h.   |

---

## MCP Server

`/api/mcp` — Model Context Protocol server so Claude can read and write bookings directly from chat.

**URL:** `https://china-trip-bookings.vercel.app/api/mcp`  
**Version:** 1.2.0  
**Connected in Claude.ai as:** "china expenses"

### Tools

| Tool              | Description                                                                       |
|-------------------|-----------------------------------------------------------------------------------|
| `add_booking`     | Add a booking. Supports all fields incl. `date_end`, `location`, `activity` type. |
| `list_bookings`   | List all bookings, optionally filtered by type. Shows 🎫 if pass is stored.       |
| `settle_booking`  | Mark a booking as settled by ID.                                                  |
| `delete_booking`  | Delete a booking by ID.                                                           |
| `set_pass`        | Store a decoded barcode/QR string for a booking (`pass_code` + `pass_format`).    |

MCP uses Supabase service key directly — does not go through REST routes, no `WRITE_PASSWORD` needed.

---

## Frontend — Tabs

### ✦ Trip tab (default)
- Bookings grouped by **location region**, each with an Unsplash vibe hero image
- Active location has a pulsing blue dot; past locations are dimmed
- **Auto-scrolls to today** on tab open
- Hotels shown as a persistent banner across their full stay span
- Day-by-day breakdown per location; non-food items expand on tap for ref/notes/links
- **Food entries collapsed to a one-liner per day** — e.g. `🍜 3 meals · 245 CNY` — expandable
- Google Maps and platform deep-links in expanded cards
- Location groups are collapsible; state persists in `localStorage`
- **🎫 pass button** on flight/train/ticket/hotel cards — tap to upload a screenshot, decodes the barcode/QR with `@zxing/browser`, stores the text in Postgres. Subsequent taps open a full-screen white modal rendered live by `bwip-js`. Works offline after first decode. Synced across both devices.

### ✓ Todos tab
- Shared checklist for both travelers — pre-trip packing, booking tasks, docs, health, tech
- Categories: 🧳 Pack · 📋 Book · 🛂 Docs · 💊 Health · 📱 Tech · 🎯 Do
- Progress bar showing done/total
- Filter by category and assignee (peter / friend / both)
- Optimistic toggle (instant UI update, syncs to Supabase)
- Offline read — last known state served from `localStorage` cache if network unavailable
- Filter state persisted in `localStorage`

### Expenses tab
- Full list of all bookings with filters (type, travelers, paid-by, settled status)
- **¥ summary button** opens a bottom-sheet modal with settlement snapshot, per-currency totals, and category breakdown
- Add / edit / delete / settle actions (write mode only, revealed on hover)
- Filter state persists in `localStorage`

### Summary modal (inside Expenses)
- Settlement snapshot across all currencies with DKK conversion
- Live exchange rates from open.er-api.com, refreshable
- Per-category breakdown (activity type excluded)

---

## Pass Viewer

Boarding passes, train ticket QR codes, and event tickets can be stored and viewed offline.

**How it works:**
1. At check-in, tap the dim 🎫 on any flight/train/ticket card (write mode)
2. Pick a screenshot from your camera roll
3. `@zxing/browser` decodes the barcode/QR client-side — supports QR_CODE, PDF_417, AZTEC, CODE_128, and more
4. Decoded text is saved to `pass_code` / `pass_format` columns in Postgres via PATCH
5. 🎫 turns bright — tap to open full-screen white modal
6. `bwip-js` re-renders the barcode live from the stored string — crisp, any screen size
7. Works offline after first decode (data cached in `bookings_cache` localStorage)
8. Synced between both devices via Postgres

**Via MCP:** Claude can also set a pass directly — useful if you have the raw barcode string from a confirmation email.

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

---

## Theme

Automatically matches Android/iOS system setting via CSS `prefers-color-scheme`. All colors defined as CSS variables in the `<style>` block — no JS state needed for theme switching.

---

## localStorage Keys

| Key              | Value                                      |
|------------------|--------------------------------------------|
| `wt`             | Write token                                |
| `ft`             | Filter types (JSON array)                  |
| `fs`             | Filter settled                             |
| `ftr`            | Filter travelers                           |
| `fp`             | Filter paid-by                             |
| `sf`             | Show filters toggle                        |
| `tab`            | Active tab (`trip`, `todos`, `expenses`)   |
| `cg`             | Collapsed location groups (JSON)           |
| `tfc`            | Todo filter category                       |
| `tfa`            | Todo filter assignee                       |
| `bookings_cache` | Last known bookings list (JSON) — offline  |
| `todos_cache`    | Last known todos list (JSON) — offline     |

---

## Deploy Pipeline

Files in Google Drive `china-trip-sync/` mirror the repo:

```
china-trip-sync/
  package.json
  pages/
    index.js              ← TOO LARGE for Drive sync — upload manually
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
# Create .env.local with the four env vars listed above
npm run dev
# Open http://localhost:3000
```
