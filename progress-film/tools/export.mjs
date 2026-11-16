// Exports events.json (sound cues), chapters.json (Hub player) and out/srt.json (subtitles). Usage (from $LIB): node tools/export.mjs <project dir>
import fs from 'fs'; import path from 'path';
const P = path.resolve(process.argv[2]);
const { openDemo, closeServer } = await import(path.join(process.env.LIB || process.cwd(), 'core/render/page.mjs'));
const { browser, page } = await openDemo(P);
const r = await page.evaluate(() => ({ dur: window.DUR, ev: window.EV, subs: window.SUBS, ch: window.CHAPTERS, sc: window.SCENES }));
fs.mkdirSync(path.join(P, 'out'), { recursive: true });
fs.writeFileSync(path.join(P, 'events.json'), JSON.stringify({ dur: r.dur, ev: r.ev, scenes: r.sc }));
fs.writeFileSync(path.join(P, 'chapters.json'), JSON.stringify(r.ch));
fs.writeFileSync(path.join(P, 'out/srt.json'), JSON.stringify(r.subs, null, 1));
console.log('events', r.ev.length, 'dur', r.dur);
await browser.close(); closeServer();
