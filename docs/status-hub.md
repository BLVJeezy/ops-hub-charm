# Status Hub

The **Status** tab in Hub OS shows, per client: whether the website is up, HTTPS, database reachability, important API endpoints, the latest Vercel production deploy, Resend delivery problems, last backup, active alerts and incident history.

## What gets checked

| Check | How | Fails when |
|---|---|---|
| Website | `GET` the site URL (10 s timeout, 1 retry) | network error, timeout, HTTP ≥ 400 |
| HTTPS | the same request — an invalid certificate makes the request fail | site unreachable over HTTPS |
| API endpoints | `GET` each configured URL | status ≠ expected (default 2xx/3xx), or JSON body says `ok:false` / `store:false` |
| Database | `GET` a **read-only** health URL with the **public** anon key | as above |
| Deploy | Vercel API, latest production deployment (needs `VERCEL_TOKEN`) | state `ERROR` / `CANCELED` |
| Email | Resend webhook events for the site's sending domain, last 24 h | ≥ 1 bounced / failed / complained / delayed |
| Backup | `last_backup_at` (set by each successful nightly off-site backup, see `backup/README.md`) | Riory and Villa Amano are covered; other sites show "Not set up yet" |

Site status: **Offline** if the website fails, **Issues** if any other check fails or the response is slower than 4 s, otherwise **Online**.

SSL **expiry dates** are not available: the Hub runs on Cloudflare Workers, which can't read certificate details. An expired or invalid certificate still shows up as a failed HTTPS check.

## Alerts

| Severity | When | Email |
|---|---|---|
| Critical | website offline; API/DB failure on a site marked *Booking / critical* | immediately, repeated every 6 h while open |
| Warning | API/DB failure on other sites, failed deploy, email delivery problems | once |
| Info | incident resolved | once |

There is one open incident per site per check type, so nothing gets duplicated. Alerts go out through Resend.

## Setup (one time)

### 1. Apply the database migration
`supabase/migrations/20261113150000_status_hub.sql` adds tables only. Lovable applies it after this branch is merged; it changes no existing tables.

### 2. Secrets (Lovable Cloud → Secrets)

| Name | Required | Value |
|---|---|---|
| `MONITOR_CRON_SECRET` | yes, for the schedule | random string, ≥ 24 chars (`openssl rand -hex 32`) |
| `RESEND_API_KEY` | already set | — |
| `ALERT_EMAIL_TO` | optional | default `jason@solynglobal.be` |
| `ALERT_EMAIL_FROM` | optional | default `Solyn Status <status@solynglobal.be>` (domain must be verified in Resend) |
| `HUB_PUBLIC_URL` | optional | e.g. `https://hub.solynglobal.be` — adds a link in alert emails |
| `VERCEL_TOKEN` | optional | read-only Vercel token, enables deploy status |
| `VERCEL_TEAM_ID` | optional | if the projects live in a Vercel team |

### 3. Add sites
Either use **Status → + Site**, or run `supabase/seeds/status_hub_sites.sql` in the SQL editor (Riory, Belgomed, Villa Amano). Then open each site → **Check now**.

Database health URL for Lovable Cloud / Supabase projects:
`https://<project-ref>.supabase.co/auth/v1/health` plus that project's **public** anon/publishable key.
The form and the database both refuse `sb_secret_…` and `service_role` keys.

### 4. Schedule (pg_cron) — changes production, needs your approval
Without this step checks only run when you press **Run checks**. Run this in the SQL editor, replacing the two placeholders:

```sql
select vault.create_secret('<MONITOR_CRON_SECRET>', 'monitor_cron_secret');

select cron.schedule('status-hub-monitor', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://<your-hub-domain>/api/public/hooks/monitor-run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'monitor_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);
```

The job runs every 5 minutes, but each site is only checked when its own interval (5 min – 24 h) has passed, which keeps request volume low.
To stop it: `select cron.unschedule('status-hub-monitor');`

### 5. Email delivery events
The existing Resend webhook (`/api/public/hooks/resend`) now also logs each event's **type and sending domain**. No recipient addresses or subjects are stored, and events are kept for 30 days.
For client sites that send from **their own** Resend account, add a webhook in that account pointing to the same URL and use the same signing secret.

## Data retention
- `health_checks` and `email_events`: 30 days, pruned on every run.
- `incidents`: kept, so the history stays reviewable.

## Tests
`npm test` runs the unit tests for the check, alert and incident logic (`src/lib/monitoring/checks.test.ts`).
