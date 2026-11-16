# Solyn Global progress film

A one-minute data film about Solyn Global itself (revenue, clients, services, margin, reach, forecast, points to act on),
made every Monday from the Hub's data. `sh build.sh week` for the weekly edition, `sh build.sh full` for the full company check.

- `snapshot.sql` — the read-only query; its single `snapshot` value is `data.json`.
- `tools/prepare.mts` — numbers (with the Hub's own fee and forecast code), the look of this edition and the voice lines → `plan.json`.
- `film.js` — the film, drawn on one canvas. Five themes, several chart forms and transitions; the plan picks them per edition.
- `mix.py` — generated score (key and tempo per edition), interface sounds, voice.

Needs the Lemo-Opuscar library (`LIB`), as the noon-scan film does. Output files are not kept in git.

## Client reports

`sh build.sh client` makes a client's monthly report film instead (Dutch on screen, no voice, in the client's own colour, logo from
`public/logos/<client id>.png`). `client-snapshot.sql` is its query: replace `{{CLIENT_ID}}`, `{{FROM}}`, `{{TO}}`, run it, save the
`snapshot` value as `data.json`. `tools/prepare-client.mts` leaves out scenes the client has no data for.

Rankings: when `data.json` also has `rankings` (`[{keyword, avg, top3, prev_avg, prev_top3}]`, from LeadSnap heatmaps: `avg` = the
heatmap's `average`, 20 = not found; `top3` = `top_3_percentage`), `rank_date` and `rank_prev_date`, the film gets a Google Maps scene.
