# NOON SCAN — daily briefing film

Rendered every day at 11:35 (Europe/Brussels) from that day's Hub snapshot (`daily_briefings.snapshot`, made at 11:30 by pg_cron),
in the Lemo-Opuscar "Sci-fi Hologram HUD" style. See `TREATMENT.md` for the direction and `docs/daily-briefing.md` for the pipeline.

    LIB=~/lemo-opuscar sh build.sh        # data.json → noon-scan.mp4, noon-scan.srt, chapters.json, poster.jpg

Needs the library (`setup.sh deps` + `deps voice`), Node 20+, Python 3.11+ and ffmpeg 7+ (build.sh falls back to imageio-ffmpeg).
