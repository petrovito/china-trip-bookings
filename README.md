# China Trip 2026

Personal travel companion app for **Peter + 1**, Jun 8–27, 2026.
Route: **Beijing → Yunnan (Kunming · Lijiang · Dali) → Zhangjiajie → Incheon**

Live at: https://china-trip-bookings.vercel.app

---

## What it does

Three modes in one app:

- **Pre-trip:** plan and track bookings, hotels, flights, trains, activities
- **During trip:** live itinerary view grouped by location, auto-scrolls to today
- **Post-trip:** expense settlement and memory (photos planned)

---

## Stack

| Layer     | Tech                                          |
|-----------|-----------------------------------------------|
| Framework | Next.js 14 — Pages Router                     |
| Hosting   | Vercel                                        |
| Database  | Supabase (PostgreSQL)                         |
| Auth      | Bearer token (`WRITE_PASSWORD`) for writes    |
| Theme     | System light/dark via CSS `prefers-color-scheme` |
| Fonts     | Playfair Display, Source Code Pro             |

---

## Project Structure

```
pages/
  index.js               ← Main UI (~980 lines, single page)
  api/
    bookings/
      index.js           ← GET (list), POST (create)
      [id].js            ← PUT (edit), PATCH (settle), DELETE
    mcp.js               ← MCP server for Claude integration
    unsplash.js          ← Unsplash image proxy (server-side key)
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

| Column      | Type        | Notes                                               |
|-------------|-------------|-----------------------------------------------------|
| id          | uuid        | Primary key, auto-generated                         |
| type        | text        | flight · hotel · train · ticket · food · activity   |
| name        | text        | Description / booking name (required)               |
| date        | date        | Start date (check-in for hotels)                    |
| date_end    | date        | End/checkout date — hotels and multi-day activities |
| location    | text        | City or region e.g. "Beijing", "Lijiang"            |
| price       | numeric     | Optional — activities may have no price             |
| currency    | text        | USD · CNY · EUR · KRW · VND · DKK                   |
| platform    | text        | e.g. Trip.com, Booking.com, Klook                   |
| reference   | text        | Confirmation number or flight code                  |
| notes       | text        | Free-form notes                                     |
| travelers   | text        | peter · friend · both (default: both)               |
| paid_by     | text        | peter · friend · null (null = unpaid)               |
| settled     | boolean     | true = other person has reimbursed their share      |
| created_at  | timestamptz | Auto-generated                                      |

**RLS:** Enabled with a permissive policy. All API routes use service role key server-side.

**`activity` type:** Excluded from all expense calculations and settlement. No travelers/paid_by fields. Use for hikes, sightseeing, free plans.

---

## Auth

Write operations (POST, PUT, PATCH, DELETE) require:
```
Authorization: Bearer <WRITE_PASSWORD>
```

Frontend stores the token in `localStorage` under key `wt`. The 🔒 button in the header triggers a password prompt; 🔓 clears it.

Read access (`GET /api/bookings`) is always public.

---

## API Routes

| Method | Path                   | Description                        |
|--------|------------------------|------------------------------------|
| GET    | `/api/bookings`        | List all, ordered by date. Public. |
| POST   | `/api/bookings`        | Create a new booking.              |
| PUT    | `/api/bookings/:id`    | Full update of a booking.          |
| PATCH  | `/api/bookings/:id`    | Partial update — used for settle.  |
| DELETE | `/api/bookings/:id`    | Delete a booking.                  |
| GET    | `/api/unsplash`        | Proxy Unsplash image by `?location=`. Cached 24h. |

---

## MCP Server

`/api/mcp` — Model Context Protocol server so Claude can read and write bookings directly from chat.

**URL:** `https://china-trip-bookings.vercel.app/api/mcp`  
**Version:** 1.1.0  
**Connected in Claude.ai as:** "china expenses"

### Tools

| Tool             | Description                                                          |
|------------------|----------------------------------------------------------------------|
| `add_booking`    | Add a booking. Supports all fields incl. `date_end`, `location`, `activity` type. |
| `list_bookings`  | List all bookings, optionally filtered by type.                      |
| `settle_booking` | Mark a booking as settled by ID.                                     |
| `delete_booking` | Delete a booking by ID.                                              |

MCP uses Supabase service key directly — does not go through REST routes, no `WRITE_PASSWORD` needed.

---

## Frontend — Tabs

### ✦ Trip tab (default)
- Bookings grouped by **location region**, each with a Unsplash vibe hero image
- Active location has a pulsing blue dot; past locations are dimmed
- **Auto-scrolls to today** on tab open
- Hotels shown as a persistent banner across their full stay span
- Day-by-day breakdown per location; non-food items expand on tap for ref/notes/links
- **Food entries collapsed to a one-liner per day** — e.g. `🍜 3 meals · 245 CNY` — expandable to see individual items
- Google Maps and platform deep-links in expanded cards
- Location groups are collapsible; state persists in `localStorage`

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

| Key  | Value                          |
|------|--------------------------------|
| `wt` | Write token                    |
| `ft` | Filter types (JSON array)      |
| `fs` | Filter settled                 |
| `ftr`| Filter travelers               |
| `fp` | Filter paid-by                 |
| `sf` | Show filters toggle            |
| `tab`| Active tab (`trip` or `expenses`) |
| `cg` | Collapsed location groups (JSON) |

---

## Deploy Pipeline

Files in Google Drive `china-trip-sync/` mirror the repo:

```
china-trip-sync/
  pages/
    index.js           ← TOO LARGE for Drive sync — upload manually
    api/
      mcp.js
      unsplash.js
      bookings/
        index.js
        [id].js
```

**Drive folder IDs:**
- `pages/` → `1UMmqfu9ElFojFem7fMtVE512kwX3AIJw`
- `pages/api/` → `1Clz8BK6ZzVTPsKG04HzrobNm3frvaWf-`
- `pages/api/bookings/` → `1VAwKI0VK2vJJ4D_g4ayNtiRsVF2vQxwH`

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

---

## Planned

- [ ] Personal photo uploads per location (Supabase Storage)
- [ ] Photo grid in Trip tab — personal shots + Unsplash vibe mixed
- [ ] Post-trip memory view
