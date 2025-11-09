# Sugar Glucose Tracker 🩸

A mobile-first Next.js dashboard for logging blood glucose readings, spotting trends, and exporting data. Entries sync to Supabase when credentials are provided, but the UI also works with local sample data so you can demo the experience instantly.

## Features

- **Quick logging form** with period presets (Fasting, Pre‑Meal, Post‑Meal), optional notes, and automatic timestamping.
- **Supabase sync** for create/update/delete actions using the `glucose_entries` table (id, value, reading_date, period, note).
- **Trend snapshot**: recent averages, deltas, and a Recharts area graph for the last 8 readings.
- **History tools**: search, filter by date range, period, and reading quality (low/on target/high), inline edit & delete.
- **CSV export** that respects the active filters and produces ISO date + 12‑hour time columns.
- **Reading badges** that highlight whether a value is low, on target, or high based on configurable thresholds (4.4–7.8 mmol/L by default).
- **Offline-friendly sample data** when Supabase credentials are missing, plus graceful status messaging.

## Tech Stack

- [Next.js 16 (App Router + Turbopack)](https://nextjs.org/)
- [React 19](https://react.dev/)
- [Tailwind CSS 4 (via `@tailwindcss/postcss` preset)](https://tailwindcss.com/)
- [Supabase JS v2](https://supabase.com/docs/reference/javascript/introduction)
- [Recharts](https://recharts.org/en-US/) for charting
- TypeScript + ESLint

## Getting Started

### 1. Prerequisites

- Node.js 18.18+ (Netlify build image currently uses Node 22.x)
- npm (ships with Node) or an alternative package manager
- A Supabase project (optional but recommended for persistence)

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create `.env.local` and supply your Supabase keys:

```bash
NEXT_PUBLIC_SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="public-anon-key"
```

If the variables are omitted the UI will still render using the bundled sample entries, but mutating actions will display a warning.

### 4. Prepare Supabase table

Run this SQL in the Supabase SQL editor (adjust types as needed):

```sql
create table if not exists public.glucose_entries (
  id uuid primary key default gen_random_uuid(),
  value numeric not null,
  reading_date timestamptz not null,
  period text not null check (period in ('Fasting','Pre-Meal','Post-Meal')),
  note text
);
```

You can insert a few seed rows to verify connectivity—the app orders by `reading_date` descending.

### 5. Start the dev server

```bash
npm run dev
```

Visit `http://localhost:3000`. The page hot-reloads on save.

## Useful Scripts

| Script          | Description                                |
|-----------------|--------------------------------------------|
| `npm run dev`   | Start Next.js in development mode          |
| `npm run build` | Production build (Next.js + TypeScript)    |
| `npm run start` | Serve the `.next` build                    |
| `npm run lint`  | Run ESLint with the Next.js config         |

## Deployment Notes

- **Netlify**: The repo is configured to work with the official `@netlify/plugin-nextjs`. Set the build command to `npm run build`, publish directory to `.next`, and add the Supabase env vars in the Netlify dashboard.
- **Vercel**: Works out of the box—import the repo, set the same env vars, and deploy.

## Customization Tips

- **Target range**: Adjust the `TARGET_RANGE` constants in `app/page.tsx` to change what counts as low/good/high.
- **Additional filters**: Extend the `filteredEntries` memo in `app/page.tsx` with new rules (e.g., tag-based filtering).
- **Styling**: Tailwind classes live directly inside the JSX so you can iterate fast without editing a separate stylesheet. Global tokens live in `app/globals.css`.

## Roadmap Ideas

- Generate a weekly PDF/email summary (the “Share summary” CTA is waiting for this).
- Add authentication to keep multiple users’ readings separate.
- Support mmol/L ↔ mg/dL conversion.
- Enhance offline caching with a service worker + IndexedDB.

---

Built with care to make daily glucose tracking feel calm, quick, and actionable. Contributions and feature ideas are welcome! Open an issue or PR on the GitHub repo to get involved.
