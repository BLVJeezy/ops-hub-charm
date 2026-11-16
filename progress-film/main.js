// Page entry: plan.json (tools/prepare.mts) + voices/dur.json → film. ?theme=… and ?t=… help when reviewing looks.
import { makeFilm } from './film.js';
const cv = document.getElementById('c'), g = cv.getContext('2d');
const Q = new URLSearchParams(location.search);
const get = async (u, d) => { try { const r = await fetch(u); return r.ok ? await r.json() : d; } catch { return d; } };
const plan = await get('plan.json');
for (const k of ['theme', 'transition', 'revenue', 'clients', 'services', 'reach', 'forecast']) if (Q.get(k)) plan.look[k] = Q.get(k);
await Promise.all(['Sora', 'Fraunces', 'Instrument Sans', 'JetBrains Mono', 'Archivo'].flatMap(f => [500, 700].map(w => document.fonts.load(`${w} 40px "${f}"`))));
// a client's film shows the client's logo on its title card, when there is one
if (plan.mode === 'client') plan._logo = await new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = 'logo.png'; });
const film = makeFilm(plan, await get('voices/dur.json', {}));
window.DUR = film.DUR; window.EV = film.events(); window.SUBS = film.subs(); window.CHAPTERS = film.chapters(); window.SCENES = film.scenes.map(s => ({ id: s.id, t0: s.t0, t1: s.t1 }));
window.render = t => film.render(g, t, { nosub: Q.has('nosub') });
window.READY = true;
