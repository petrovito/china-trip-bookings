# China Trip 2026 — Bookings Tracker

Personal travel bookings tracker for **Peter + 1**, covering the Jun 8–27, 2026 route:
**Beijing → Yunnan → Zhangjiajie → Incheon**

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
  index.js                  ← Main UI (single page)
  api/
    bookings/
      index.js              ← GET (list), POST (create)
      [id].js               ← PUT (edit), PATCH (settle), DELETE
    mcp.js                  ← MCP server for Claude integration
```

---

## Environment Variables (Vercel)

```
SUPABASE_URL              Supabase project URL
SUPABASE_SERVICE_KEY      Service role key — used by API routes (bypasses RLS)
WRITE_PASSWORD            Bearer token required for all write operations
```

---

## Database

### Table: `bookings`

| Column      | Type      | Notes                                      |
|-------------|-----------|--------------------------------------------|
| id          | uuid      | Primary key, auto-generated                |
| type        | text      | flight · hotel · train · ticket · food     |
| name        | text      | Description / booking name (required)      |
| date        | date      | Optional                                   |
| price       | numeric   | Optional                                   |
| currency    | text      | USD · CNY · EUR · KRW · VND · DKK          |
| platform    | text      | e.g. Trip.com, Booking.com, Klook          |
| reference   | text      | Confirmation number or flight code         |
| notes       | text      | Free-form notes                            |
| travelers   | text      | peter · friend · both (default: both)      |
| paid_by     | text      | peter · friend · null (null = unpaid)      |
| settled     | boolean   | true = the other person has paid back      |
| created_at  | timestamp | Auto-generated                             |

**RLS:** Disabled — all access goes through API routes authenticated with the service role key.

---

## Auth

Write operations (POST, PUT, PATCH, DELETE) require:
```
Authorization: Bearer <WRITE_PASSWORD>
```

The frontend stores the token in `localStorage` under the key `wt`. The 🔒 button in the UI triggers an inline password prompt; 🔓 locks (clears) the token.

Read access (`GET /api/bookings`) is public — no token needed.

---

## API Routes

### `GET /api/bookings`
Returns all bookings ordered by date ascending.

### `POST /api/bookings`
Creates a new booking. Body: booking fields (see table above).

### `PUT /api/bookings/:id`
Replaces all fields of a booking.

### `PATCH /api/bookings/:id`
Partial update — used primarily to set `settled: true`.

### `DELETE /api/bookings/:id`
Deletes a booking.

---

## MCP Server

`/api/mcp` exposes a Model Context Protocol server for Claude integration.

**MCP URL:** `https://china-trip-bookings.vercel.app/api/mcp`

### Tools

| Tool            | Description                                      |
|-----------------|--------------------------------------------------|
| `add_booking`   | Add a new booking (type + name required)         |
| `list_bookings` | List all bookings, optionally filtered by type   |
| `settle_booking`| Mark a booking as settled by ID                 |
| `delete_booking`| Delete a booking by ID                          |

---

## Frontend Features

- **Booking types:** Flight ✈ · Hotel 🏨 · Train 🚄 · Ticket 🎟 · Food 🍜
- **Multi-select type filter** + filters for travelers / paid-by / settled status
- **Filter state** persisted in `localStorage`
- **Summary tab:** per-currency totals, pending amounts, settlement balance (who owes whom), breakdown by category
- **Settlement logic:** `peterShare()` splits costs 50/50 for "both" bookings; full amount for solo bookings
- **Toast notifications** on add / edit / delete / settle
- **Build date** displayed in footer (`BUILD` constant in `index.js`)

---

## Settlement Logic

For unsettled bookings where `paid_by` is set:

```
pOwes += peterShare(booking) - amountPeterFronted
```

- If `pOwes > 0`: Peter owes friend
- If `pOwes < 0`: Friend owes Peter
- Settled bookings are excluded from the running balance

---

## Local Development

```bash
npm install
# Create .env.local with the three env vars above
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deployment

Push to `main` → Vercel auto-deploys. No build config needed beyond the env vars.
