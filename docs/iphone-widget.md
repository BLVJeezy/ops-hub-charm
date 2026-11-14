# iPhone widget

A home-screen widget (small, medium or large) that shows the Hub at a glance: sites online,
status, MRR, open invoices, visitors and new requests. It runs in the free app **Scriptable**.

- Data: `GET /api/public/widget` with `Authorization: Bearer <widget key>` (`src/routes/api/public/widget.ts`).
  Only the sha256 of the key is in the code. The response holds totals and site names, never customer data
  (`src/lib/widget.ts`, tested in `widget.test.ts`).
- Script: `solyn-hub-widget.js`, kept by BLV (it contains the key, so it is not in this repo).
- The widget refreshes about every 15 minutes (iOS decides the exact moment) and shows the last known
  numbers when the phone is offline.

To replace the key: generate a new random key, put its sha256 in `KEY_SHA256`, deploy, and update `KEY` in the script.
