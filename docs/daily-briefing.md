# Daily noon briefing ("Noon scan")

Every day Hub OS checks all client sites and turns the result into a short animated film (Sci-fi Hologram HUD style) plus an email.

| Brussels time | What | Where |
|---|---|---|
| 11:30 | Snapshot of every site (health 24 h, incidents, visitors, new requests, bookings) + invoices → `daily_briefings` | pg_cron `briefing-snapshot` → `/api/public/hooks/daily-briefing` `{action:"snapshot"}` (SQL: `briefing_snapshot()`) |
| 11:35 | Film rendered from the snapshot (voice, score, picture), stored, row updated with `video_path` + `chapters` | scheduled cloud task "Hub OS – Noon scan video" (`briefing-film/build.sh`) |
| 12:00 | Email with status, per-site table and a link to `/briefing` | pg_cron `briefing-mail` → same hook `{action:"mail"}` (Resend) |

Each cron runs at two UTC times; the hook ignores the run that is not the right Brussels hour, so DST needs no change.

## Where the films are kept

`daily_briefings.video_path = github:BLVJeezy/mission-control-hub@noon-scan:<day>/noon-scan.mp4` — a private repo, branch `noon-scan`
(the render workspace can only push to GitHub). The `/briefing` page fetches the film through a server function with the
Lovable secret **`GITHUB_TOKEN`**: a fine-grained GitHub token, repository access "Only select repositories → mission-control-hub",
permission Contents: Read-only. Without it the page and email still work, only the player shows a notice.

## The page

`/briefing` (Briefing in the menu): status, the film, clickable chapters (one per site, problems first), totals, and one card per site
linking to its client folder; "in video" jumps to that site's chapter. Days are kept; pick an older one in the date strip.

## Status rules (`src/lib/briefing.ts`, `briefing-film/plan.js`)

- **down**: last check down, or an open critical incident → film verdict "CRITICAL", ending powers down to that site.
- **warn**: degraded, any open incident, or uptime 24 h < 99 % → "WARNING".
- otherwise **ok** → "ALL SYSTEMS NOMINAL", ending "ALL CLEAR".
