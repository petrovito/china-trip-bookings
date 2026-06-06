# china-trip-bookings

Personal travel tracker for a two-person trip through China, Jun 8–27 2026. Tracks bookings, expenses, QR passes, and todos. Live at [china-trip-bookings.vercel.app](https://china-trip-bookings.vercel.app).

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (Pages Router), React, inline styles |
| Backend | Next.js API routes on Vercel |
| Database | Supabase (Postgres) |
| MCP server | `pages/api/mcp.js` — Claude tool access |
| Deploy | Google Drive → Apps Script → GitHub → Vercel |

---

## Project structure

```
pages/
  index.js                  — full frontend (single page)
  api/
    mcp.js                  — MCP server (JSON-RPC)
    lib/
      auth.js               — shared write auth helper
      db.js                 — shared Supabase client
      bookings.js           — shared booking normalization
      segments.js           — shared getOrCreateSegment helper
      summary.js            — shared summary aggregation
    bookings/
      index.js              — GET list, POST create
      [id].js               — PUT update, PATCH partial, DELETE
    segments/
      index.js              — GET list, POST create
      [id].js               — PATCH rename/reorder, DELETE
    todos/
      index.js              — GET list, POST create
      [id].js               — PATCH update, DELETE
    unsplash.js             — hero image proxy
scripts/
  migrate-segments.mjs      — one-time DB migration (run locally)
```

---

## Database schema

### `bookings`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `type` | text | `flight \| hotel \| train \| ticket \| food` |
| `name` | text | |
| `date` | date | |
| `date_end` | date | checkout / end date |
| `time` | text | departure time |
| `time_end` | text | arrival time |
| `origin` | text | departure city (transits) |
| `location` | text | destination city |
| `price` | numeric | |
| `currency` | text | `USD \| CNY \| EUR \| KRW \| VND \| DKK` |
| `platform` | text | booking platform |
| `reference` | text | booking ref / flight number |
| `notes` | text | |
| `travelers` | text | `peter \| friend \| both` |
| `paid_by` | text | `peter \| friend \| null` |
| `settled` | boolean | default false |
| `segment_id` | uuid | FK → segments |
| `pass_code` | text | decoded QR / barcode value |
| `pass_format` | text | `QR_CODE`, `PDF_417`, etc. |
| `map_query` | text | address or search keyword for the 📍 maps button; a full street address is most reliable |
| `map_lat` | numeric | latitude in **GCJ-02** (Amap) coordinates — not WGS-84/GPS |
| `map_lng` | numeric | longitude in **GCJ-02** (Amap) coordinates — not WGS-84/GPS |
| `map_provider` | text | `amap` (default) — reserved for future Google Maps toggle |
| `map_place_id` | text | provider-specific place ID — stored, not yet used |
| `created_at` | timestamptz | |

### `segments`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `location` | text | unique city/region name |
| `sort_order` | integer | controls Trip tab order |
| `created_at` | timestamptz | |

### `todos`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `title` | text | |
| `category` | text | `pack \| book \| docs \| health \| tech \| do` |
| `assignee` | text | `peter \| friend` |
| `done` | boolean | default false |
| `deadline` | date | |
| `segment_id` | uuid | FK → segments (optional) |
| `created_at` | timestamptz | |

---

## API routes

All write routes require `Authorization: Bearer <WRITE_PASSWORD>`. GET routes are public.

| Method | Route | Description |
|---|---|---|
| GET | `/api/bookings` | List all bookings ordered by date |
| POST | `/api/bookings` | Create booking (auto-creates segment) |
| PUT | `/api/bookings/[id]` | Full update (auto-creates segment) |
| PATCH | `/api/bookings/[id]` | Partial update (settle, etc.) |
| DELETE | `/api/bookings/[id]` | Delete |
| GET | `/api/segments` | List all segments ordered by sort_order |
| POST | `/api/segments` | Create segment |
| PATCH | `/api/segments/[id]` | Rename or reorder |
| DELETE | `/api/segments/[id]` | Delete (blocked if bookings reference it) |
| GET | `/api/todos` | List all todos |
| POST | `/api/todos` | Create todo |
| PATCH | `/api/todos/[id]` | Update todo |
| DELETE | `/api/todos/[id]` | Delete |
| GET | `/api/summary` | Settlement snapshot for the UI |
| POST | `/api/mcp` | MCP JSON-RPC endpoint |

---

## MCP tools

Connected in Claude.ai as **"china expenses"** → `https://china-trip-bookings.vercel.app/api/mcp`

The MCP server talks directly to Supabase with the service key — it does not go through the REST routes and does not need `WRITE_PASSWORD`.

| Tool | Description |
|---|---|
| `add_booking` | Add a booking; auto-creates segment from `location` |
| `list_bookings` | List all bookings, optionally filtered by type |
| `update_booking` | Patch any fields on an existing booking, including `map_query` / `map_lat` / `map_lng` |
| `settle_booking` | Mark a booking as settled |
| `delete_booking` | Delete a booking |
| `set_pass` | Store a decoded QR / barcode for the pass viewer |
| `add_todo` | Add a todo; `assignee: "both"` creates one per person |
| `list_todos` | List todos, optionally filtered by done status |
| `complete_todo` | Mark a todo as done |
| `delete_todo` | Delete a todo |

---

## Environment variables

| Variable | Used by |
|---|---|
| `SUPABASE_URL` | All API routes + MCP |
| `SUPABASE_SERVICE_KEY` | All API routes + MCP (server-side only) |
| `WRITE_PASSWORD` | REST write routes |
| `NEXT_PUBLIC_FRIEND_NAME` | Frontend — travel companion's display name |
| `UNSPLASH_ACCESS_KEY` | Hero image fetching (optional) |

---

## Deploy pipeline

Files live in a Google Drive folder (`china-trip-sync/`) that mirrors the repo structure. A Google Apps Script (`syncToDrive()`) syncs them to GitHub, and Vercel auto-deploys on push.

**To deploy a change:**
1. Upload changed file(s) to the correct Drive subfolder
2. Run `syncToDrive()` in Apps Script
3. Vercel deploys automatically

`index.js` is uploaded to Drive manually (too large for MCP context). Small API files can be pushed via the Claude Drive integration.

---

## One-time DB migration

After adding the `segments` table and `segment_id` columns, back-fill existing bookings:

```bash
npm install dotenv          # if not already installed
node scripts/migrate-segments.mjs
```

Requires `.env.local` with `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`. Safe to re-run.

---

## Frontend features

- **Maps button** — every booking card with a `map_query`, `map_lat`, or `map_lng` shows a 📍 maps link. Tapping it tries to open the native Amap app (`androidamap://` deep link); if Amap isn't installed it falls back to `uri.amap.com` in the browser. Two resolution modes:
  - **Exact pin** — when `map_lat` + `map_lng` are set (must be **GCJ-02**, not WGS-84/GPS — Google Maps coords are ~100–500 m off in China)
  - **Search** — when only `map_query` is set; a full street address (preferably in Chinese) resolves reliably; a hotel name alone may return multiple results
- **Identity system** — first-load picker saves `peter` or friend's name to localStorage; personalises all views
- **Trip tab** — city segments pulled from DB, ordered by `sort_order`; transits interleaved by destination matching; Unsplash hero images per city
- **Todos** — per-person visibility, inline editing, deadlines with overdue badges, optimistic creation; "do" and "book" todos can be pinned to a segment and appear under that city in the Trip tab
- **Auto-todos** — computed suggestions (never stored): missing hotels, missing transport between cities, missing QR codes
- **Pass viewer** — full-screen QR / barcode renderer for offline boarding pass access
- **Summary tab** — server-side settlement snapshot, per-currency totals, by-category breakdown
- **Filters** — travelers, paid-by, status, type (multi-select); persisted to localStorage
- **Auth** — 🔒 button → password → stored as `wt` in localStorage; 401 shows toast


## Booking automation

Booking creation and booking edits now handle linked reminder todos on the server:
- creating a booking with `reminder` on creates the todo(s)
- changing a booking from unpaid to paid marks linked todos done
