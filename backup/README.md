# Off-site backups

Runs from the private repo **solyn-backups** (GitHub Actions, nightly at 03:07 Brussels).
That repo holds the runner (`backup.mjs`), the restore tool (`restore.mjs`) and `RESTORE.md`.

What lives here:
- `sql/export_function.sql`: the read-only, token-protected `backup_export` function. Installed in
  the Hub (see migration `20261114010000_backups.sql`) and in Riory's database, each with the sha256
  of the shared backup token. Credential columns are stripped at the source.
- Villa Amano exposes the same contract at `/api/ops?a=backup-export` (repo hotel-bilzen).

Each run is encrypted with age (public key only in the repo), published as a release
`backup-YYYY-MM-DD`, and reported to `backup_runs`. You can see it on the Status page
(Off-site backups) and in the noon briefing, where a failed or overdue backup gives "Aandacht nodig".
