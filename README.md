# China Trip 2026 — Bookings Tracker

Personal travel bookings tracker for **Peter + 1**, covering the Jun 8–27, 2026 route:
**Beijing → Yunnan (Kunming · Lijiang · Dali) → Zhangjiajie → Incheon**

Live at: https://china-trip-bookings.vercel.app

---

## Stack

| Layer     | Tech                              |
|-----------|-----------------------------------|
| Framework | Next.js 14 — Pages Router         |
| Hosting   | Vercel                            |
| Database  | Supabase (PostgreSQL)             |
| Auth      | Bearer token (`WRITE_PASSWORD`)   |
| Fonts     | Playfair Display, Source Code Pro |

---

## Project Structure

```
pages/
  index.js          ← Main UI (single page, ~900 lines)
  api/
    bookings/
      index.js      ← GET (list), POST (create)
      [id].js       ← PUT (edit), PATCH (settle), DELETE
    mcp.js          ← MCP server for Claude integration
```

---

## Environment Variables (Vercel)

```
SUPABASE_URL          Supabase project URL
SUPABASE_SERVICE_KEY  Service role key — used by API routes and MCP server (bypasses RLS)
WRITE_PASSWORD        Bearer token required for all write operations from the UI
```

---

## Database

### Table: `bookings`

| Column      | Type      | Notes                                               |
|-------------|-----------|-----------------------------------------------------|
| id          | uuid      | Primary key, auto-generated                         |
| type        | text      | flight · hotel · train · ticket · food · activity   |
| name        | text      | Description / booking name (required)               |
| date        | date      | Start date (check-in for hotels)                    |
| date_end    | date      | End/checkout date — used for hotels and activities  |
| location    | text      | City or region e.g. "Beijing", "Lijiang"            |
| price       | numeric   | Optional — activities may have no price             |
| currency    | text      | USD · CNY · EUR · KRW · VND · DKK                   |
| platform    | text      | e.g. Trip.com, Booking.com, Klook                   |
| reference   | text      | Confirmation number or flight code                  |
| notes       | text      | Free-form notes                                     |
| travelers   | text      | peter · friend · both (default: both)               |
| paid_by     | text      | peter · friend · null (null = unpaid)               |
| settled     | boolean   | true = the other person has paid back their share   |
| created_at  | timestamp | Auto-generated                                      |

**RLS:** Enabled with a permissive policy. All API routes use the service role key server-side.

**Notes on `activity` type:** Activities are excluded from all expense calculations and settlement logic. Use for plans, hikes, sightseeing — anything that doesn't need cost tracking.

---

## Auth

Write operations (POST, PUT, PATCH, DELETE) require:
```
Authorization: Bearer <WRITE_PASSWORD>
```

The frontend stores the token in `localStorage` under the key `wt`. The 🔒 button triggers an inline password prompt; 🔓 locks (clears) the token.

Read access (`GET /api/bookings`) is public — no token needed.

---

## API Routes

### `GET /api/bookings`
Returns all bookings ordered by date ascending. Public.

### `POST /api/bookings`
Creates a new booking. Body: any booking fields (see table above).

### `PUT /api/bookings/:id`
Full replacement of a booking's fields.

### `PATCH /api/bookings/:id`
Partial update — used primarily to toggle `settled`.

### `DELETE /api/bookings/:id`
Deletes a booking by ID.

---

## MCP Server

`/api/mcp` exposes a Model Context Protocol server so Claude can read and write bookings directly from chat.

**MCP URL:** `https://china-trip-bookings.vercel.app/api/mcp`
**Version:** 1.1.0

### Tools

| Tool              | Description                                          |
|-------------------|------------------------------------------------------|
| `add_booking`     | Add a new booking — supports all fields incl. `date_end`, `location`, `activity` type |
| `list_bookings`   | List all bookings, optionally filtered by type       |
| `settle_booking`  | Mark a booking as settled by ID                      |
| `delete_booking`  | Delete a booking by ID                               |

The MCP server calls Supabase directly with the service key — it does not go through the REST routes and does not require `WRITE_PASSWORD`.

---

## Frontend — Tabs

### Bookings tab
- Full list of all bookings with filters
- **Booking types:** Flight ✈ · Hotel 🏨 · Train 🚄 · Ticket 🎟 · Food 🍜 · Activity 📍
- Multi-select type filter + filters for travelers / paid-by / settled status
- Filter state persisted in `localStorage`
- Add / edit / delete / settle actions (write mode only, hover to reveal)
- Cards show `date_end` as a range when present, and `location` as a meta field

### Trip tab (✦ trip)
- Location-grouped view for use during the trip
- Each location has a **hero banner** with a vibe photo auto-fetched from Unsplash
- Active location gets a pulsing blue dot; past locations are dimmed
- **Auto-scrolls to today** on tab open
- Hotels shown as a persistent banner across their stay span
- Day-by-day breakdown within each location; tap any card to expand details
- Expanded cards show reference, platform, notes, and links (Google Maps, booking platform)
- Location groups are collapsible

### Summary tab
- Per-currency totals across all expense types (activity excluded)
- Pending payment amounts
- Settlement balance (who owes whom), with DKK conversion via open.er-api.com
- Breakdown by category

---

## Settlement Logic

For unsettled bookings where `paid_by` is set:

```
pOwes += peterShare(booking) - amountPeterFronted
```

- `travelers = "both"` → Peter's share is 50%
- `travelers = "peter"` → Peter's share is 100%
- `travelers = "friend"` → Peter's share is 0%
- If `pOwes > 0`: Peter owes friend
- If `pOwes < 0`: Friend owes Peter
- Settled bookings and `activity` type bookings are excluded from the balance

---

## Deploy Pipeline

Files live in Google Drive folder `china-trip-sync/`, mirroring the repo structure:

```
china-trip-sync/
  pages/
    index.js
    api/
      mcp.js
      bookings/
        index.js
        [id].js
```

**To deploy a change:** upload file to Drive → run `syncToDrive()` in Apps Script → Vercel auto-deploys from GitHub (`petrovito/china-trip-bookings`).

**Exception:** `index.js` is too large to push via Drive/Apps Script. Upload it manually to GitHub or via the Vercel CLI.

---

## Local Development

```bash
npm install
# Create .env.local with the three env vars above
npm run dev
```

Open http://localhost:3000.

---

## Planned / In Progress

- [ ] Personal photo uploads per location (Supabase Storage)
- [ ] Photo grid per location in Trip tab (mix of personal + Unsplash vibe)
- [ ] Trip memory view post-trip
