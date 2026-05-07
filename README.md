# China Trip 2026 — Bookings Tracker

## Setup

### 1. Supabase
1. Create a free project at https://supabase.com
2. Go to SQL Editor and run the contents of `setup.sql`
3. Go to Project Settings → API and copy:
   - Project URL
   - `anon` public key

### 2. Environment variables
Create a `.env.local` file in the project root:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Deploy to Vercel
```bash
npm install
npx vercel
```
When prompted, add the two environment variables above.

Or connect your GitHub repo to Vercel and it deploys automatically on push.

### 4. Give Claude API access
Share your Supabase Project URL and anon key with Claude.
Claude can then insert rows directly via the Supabase REST API.

## Claude API access
Claude calls this endpoint to add bookings:
```
POST https://your-project.supabase.co/rest/v1/bookings
Authorization: Bearer YOUR_ANON_KEY
apikey: YOUR_ANON_KEY
Content-Type: application/json
```
