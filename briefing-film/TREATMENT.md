# NOON SCAN — Solyn Hub OS daily briefing film

Style: Sci-fi Hologram HUD (Lemo-Opuscar `hologram-hud`). 1920×1080, 24 fps, ~60 s. English voice (Kokoro, offline), English HUD text.
Rendered **every day at 11:30 Europe/Brussels from that morning's Hub snapshot** (`data.json`), ready at 12:00. The structure is fixed; every word, number, order and the ending are driven by the data.

## 1. Three candidate structures

1. **Loop screen** — the network turns on the pad, each site's chip cycles, no story. Easy to automate, but it hides the one thing that matters: *is something wrong?* A loop never answers.
2. **Upgrade (yesterday → today)** — every value rolls from yesterday's (dim) to today's (accent). Strong for traffic, weak for health: an uptime of 100 → 100 is a non-event, and the critical case drowns in deltas.
3. **Inspection round with a verdict** — the whole network is scanned, the verdict is stated up front (hook), then the camera inspects site by site — **problems first** — and the ending depends on the verdict: all clear = the network ignites into a solid hologram; critical = everything powers down except the failing site, held at eye level with its one number.

**Chosen: 3.** It answers the user's question ("is everything OK?") in the first 8 seconds, gives each client its own reading time, and the two endings make the daily film *mean* something instead of being wallpaper.

## 2. Logline and arc

Every noon the Solyn network is scanned into light, site by site, until the Hub can say with numbers whether today is clear or critical.
- **Setup**: the network grows from the scan plane; verdict rolls in.
- **Turn**: the inspection — the first site locked is the one that needs attention (or the busiest, on a clear day).
- **Ending**: clear → solid hologram + beam ("ALL CLEAR"); critical → power-down to the one failing site at eye level.

## 3. Benchmark

- *Learn from* a spacecraft flight-director "go / no-go" poll (one station at a time, a verdict per station, a final call) and the *Oblivion* drone-repair interfaces (one hue, hairlines, space, a value per callout).
- *Don't take*: any layout, icon, font, colour or sound from them.

## 4. The subject

The Solyn network as one CAD object on the projector pad: a **central hub mast** (stacked rings + antenna, "SOLYN HUB OS") with **one node per client** on a ring around it, each node a plinth carrying an **extruded silhouette of its trade** (so a part reads as *that* client):
Riory = wrench · GiGi L Coiffure = scissors · Belgomed = medical cross · Horsey Valley = horseshoe · Villa Amano = house with arch · Solyn Global = "S" monogram. Every node is joined to the hub by a data conduit (tube) — physically connected, nothing floats.

Colour: hue **ice-cyan**, accent **amber** (locked values only). Critical sites: the node goes white-hot, glitches once; its status word is the accent (it is a locked value).

## 5. Shot list

| # | Section | Framing / angle | Move | Dur | Why |
|---|---|---|---|---|---|
| 1 | Boot | wide, high ¾ | slow orbit craning down while the scan plane grows the network | 6 s | "this is real data", hook: the whole network at once |
| 2 | Verdict | full, ¾ | slow push-in; verdict value rolls beside the subject | 4 s | the answer first |
| 3…n | Site k | medium on node k | whip following the target box to node k, local explode (plinth shell slides up, icon glows), leader → spec card, chip docks | 6 s each | look here now; one site = one reading beat |
| n+1 | Totals | top-down plan | crane up to plan view; pad becomes a dial; totals roll | 8 s | layout of the whole; the numbers that add up |
| n+2 | Ending | eye-level profile | crane down to eye level; ignite (clear) or power-down (critical) | 6 s | status change; echo of the boot |

Camera moves used: orbit/crane, push-in, whip-follow, crane to plan view, crane to eye level, slow drift during cards (≥ 4 kinds).

## 6. Beat sheet (6 sites; each extra/missing site adds/removes 6 s)

- 0.0–6.0 boot: grid, pad rings ignite (bar 1), scan plane rises (bars 2–3), title rolls "SOLYN // NOON SCAN", date code.
- 6.0–10.0 verdict: one beat of digital silence at 7.5, verdict locks on 8.0 (downbeat) in accent; "6/6 ONLINE".
- 10.0–46.0 inspection: per site — whip starts 0.5 s before the bar; lock on beat 1; explode beats 1–2; leader beat 3; card values roll beats 3–6 (status, uptime, response, visitors, new requests); chip docks on beat 1 of the next site.
- 46.0–54.0 totals: crane to plan; four totals roll (visitors yesterday, 7 days, new requests 24 h, open invoices).
- 54.0–60.0 ending: silence beat at 54.0; ignite or power-down at 55.0; final line holds ≥ 3 s.

## 7. Cue map

120 bpm, bar = 2 s (4 beats). Boot: pad + projector hum, arp enters bar 2. Verdict: true silence beat, then lock (thump + clack + two-tone beep) and the bass enters. Inspection: 8th bass + arp ping-pong + hats; one layer added per site (cap 3), lock on each downbeat, rolls tick at frame rate. Totals: half-time, pads only. Ending clear: drop (808 glide + wide saw chord) on the ignite; ending critical: everything stops but one sustained tone under the held value.

## 8. Sound design table

| Section | Ambience | Foley | Music |
|---|---|---|---|
| Boot | projector hum 40/80/120 Hz, room tone | scan-plane sweep, ring blips in key | arp from bar 2 |
| Verdict | hum | silence beat, lock thump + beep | bass enters |
| Sites | hum | whip whoosh, lock thump/clack/beep, roll ticks, servo slide on explode | arp + bass + hats, +layer per site |
| Totals | hum | roll ticks, dial clicks | half-time pads |
| Ending | hum | ignite swell / power-down | drop (clear) or single tone (critical) |

## 9. Subtitles & titles

HUD subtitles: dark plate, corner brackets, voiceprint bars, Rajdhani Medium near-white, bottom centre, in just before the voice, hold ≥ max(1.8 s, speech + 0.6 s). Title is a rolling value (no title card). Numbers in Share Tech Mono / Rajdhani with square decimal point.

## 10. Voice (template, filled from data)

1. "Noon scan for {weekday} {day} {month}. Six client sites."
2. Verdict: "All systems nominal." | "{n} site(s) need attention."
3. Per site (one short line each): "{Site}: online, {visitors} visitors yesterday{, {k} new requests}." / "{Site}: down since {time}. {reason}."
4. Totals: "{total} visitors yesterday, {week} this week. {new} new requests. {open} invoices open."
5. Ending: "All clear. Next scan tomorrow at noon." | "Action needed on {Site}."

## 11. What is automated

`data.json` comes from the Hub database at 11:30; `build.sh` renders voice (Kokoro), score + foley (numpy), picture (headless browser), mux to −14 LUFS. The Hub shows the film with clickable chapters per site and emails the link at 12:00.
