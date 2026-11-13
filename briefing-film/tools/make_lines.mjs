// data.json → lines.json (Kokoro input). Usage: node tools/make_lines.mjs <project dir>
import fs from 'fs'; import path from 'path';
import { makePlan } from '../plan.js';
const P = path.resolve(process.argv[2] || '.');
const plan = makePlan(JSON.parse(fs.readFileSync(path.join(P, 'data.json'), 'utf8')));
const L = plan.lines.map(l => ({ id: l.id, text: l.text, voice: 'bm_george', speed: 0.98 }));
fs.writeFileSync(path.join(P, 'lines.json'), JSON.stringify(L, null, 1));
console.log(plan.status, L.length, 'lines');
