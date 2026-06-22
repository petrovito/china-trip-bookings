# china-trip-bookings — monorepo

```
/
  backend/    Go API server  →  Railway or Fly.io
  frontend/   Next.js UI     →  Vercel
```

---

## Backend (Go)

### Environment variables
| Var | Description |
|-----|-------------|
| `DATABASE_URL` | Supabase Postgres connection string (from Supabase → Settings → Database → Connection string → URI mode) |
| `WRITE_PASSWORD` | Shared secret for write-protected routes |
| `UNSPLASH_ACCESS_KEY` | Unsplash API key (optional) |
| `PORT` | Defaults to `8080` if not set |

### First-time setup (generate go.sum)
```bash
cd backend
go mod tidy   # generates go.sum — required before Docker build
```

### Railway
1. Create a new Railway service → "Deploy from GitHub repo"
2. In service settings → **Root Directory** → set to `backend`
3. Railway auto-detects the Dockerfile
4. Add the env vars above under **Variables**
5. The `railway.json` in `backend/` sets the health check path to `/health`

### Fly.io
```bash
cd backend
fly auth login
fly launch --no-deploy   # confirm app name in fly.toml matches
fly secrets set DATABASE_URL="..." WRITE_PASSWORD="..." UNSPLASH_ACCESS_KEY="..."
fly deploy
```

### Local dev
```bash
cd backend
go mod tidy
DATABASE_URL="..." WRITE_PASSWORD="..." go run ./cmd/server
# Server on :8080
```

---

## Frontend (Next.js)

### Environment variables
| Var | Description |
|-----|-------------|
| `NEXT_PUBLIC_API_URL` | Full URL of the deployed Go backend, e.g. `https://china-trip-backend.fly.dev` |
| `NEXT_PUBLIC_FRIEND_NAME` | Display name for the second traveler |

### Vercel
1. Import the repo in Vercel
2. In project settings → **Root Directory** → set to `frontend`
3. Add the env vars above under **Environment Variables**
4. Deploy

### Local dev
```bash
cd frontend
cp .env.local.example .env.local   # then fill in values
# .env.local:
#   NEXT_PUBLIC_API_URL=http://localhost:8080
npm install
npm run dev
# UI on :3000, talking to local Go server on :8080
```

---

## API routes (all served by Go backend)

| Method | Path | Auth |
|--------|------|------|
| GET | `/health` | — |
| GET | `/api/bookings` | — |
| POST | `/api/bookings` | ✓ |
| PUT | `/api/bookings/{id}` | ✓ |
| PATCH | `/api/bookings/{id}` | ✓ |
| DELETE | `/api/bookings/{id}` | ✓ |
| GET | `/api/transport` | — |
| POST | `/api/transport` | ✓ |
| PUT | `/api/transport/{id}` | ✓ |
| GET | `/api/accommodation` | — |
| POST | `/api/accommodation` | ✓ |
| PUT | `/api/accommodation/{id}` | ✓ |
| GET | `/api/experiences` | — |
| POST | `/api/experiences` | ✓ |
| PUT | `/api/experiences/{id}` | ✓ |
| GET | `/api/segments` | — |
| POST | `/api/segments` | ✓ |
| PATCH | `/api/segments/{id}` | ✓ |
| DELETE | `/api/segments/{id}` | ✓ |
| GET | `/api/todos` | — |
| POST | `/api/todos` | ✓ |
| PATCH | `/api/todos/{id}` | ✓ |
| DELETE | `/api/todos/{id}` | ✓ |
| GET | `/api/summary` | — |
| GET | `/api/unsplash?location=` | — |

Auth = `Authorization: Bearer <WRITE_PASSWORD>`
