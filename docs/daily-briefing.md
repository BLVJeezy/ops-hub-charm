# Daily noon briefing ("Noon scan")

Every day Hub OS checks all client sites and turns the result into a short animated film (Sci-fi Hologram HUD style) plus an email.

| Brussels time | What | Where |
|---|---|---|
| 11:30 | Snapshot of every site (health 24 h, incidents, visitors, new requests, bookings) + invoices → `daily_briefings` | pg_cron `briefing-snapshot` → `/api/public/hooks/daily-briefing` `{action:"snapshot"}` (SQL: `briefing_snapshot()`) |
| 11:35 | Film rendered from the snapshot (voice, score, picture), stored, row updated with `video_path` + `chapters` | scheduled cloud task "Hub OS – Noon scan video" (`briefing-film/build.sh`) |
| 12:00 | Email with status, per-site table and a link to `/briefing` | pg_cron `briefing-mail` → same hook `{action:"mail"}` (Resend) |

Each cron runs at two UTC times; the hook ignores the run that is not the right Brussels hour, so DST needs no change.

## Where the films are kept

The render task pushes each film to the private repo `BLVJeezy/mission-control-hub`, branch `noon-scan` (the render workspace can only
reach GitHub). A GitHub Action there (`.github/workflows/noon-scan-to-hub.yml`) then POSTs the mp4 to
`/api/public/hooks/briefing-video?day=<day>` with the shared backup token (`BACKUP_TOKEN` secret), and the Hub keeps it in its own private
storage bucket `briefings` (`<day>/noon-scan.mp4`). The `/briefing` page plays it through a 6-hour signed link: no GitHub token needed.
If a film is not in storage yet, the page falls back to reading it from GitHub with an optional `GITHUB_TOKEN` secret.

## The page

`/briefing` (Briefing in the menu): status, the film, clickable chapters (one per site, problems first), totals, and one card per site
linking to its client folder; "in video" jumps to that site's chapter. Days are kept; pick an older one in the date strip.

## Status rules (`src/lib/briefing.ts`, `briefing-film/plan.js`)

- **down**: last check down, or an open critical incident → film verdict "CRITICAL", ending powers down to that site.
- **warn**: degraded, any open incident, or uptime 24 h < 99 % → "WARNING".
- otherwise **ok** → "ALL SYSTEMS NOMINAL", ending "ALL CLEAR".
