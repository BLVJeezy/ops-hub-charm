// Snapshot (Hub briefing_snapshot()) → film plan: verdict, site order, card values, voice lines, chapters.
// Pure ES module, used by the page (browser) and by the Node tools.

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
export function words(n) {
  n = Math.round(Number(n) || 0);
  if (n < 0) return 'minus ' + words(-n);
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
  if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' and ' + words(n % 100) : '');
  if (n < 1e6) return words(Math.floor(n / 1000)) + ' thousand' + (n % 1000 ? (n % 1000 < 100 ? ' and ' : ' ') + words(n % 1000) : '');
  return String(n);
}
const ORD = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' };
export function ordinal(n) {
  const w = words(n), parts = w.split('-'), last = parts.pop();
  const o = ORD[last] || (last.endsWith('y') ? last.slice(0, -1) + 'ieth' : last + 'th');
  return [...parts, o].join('-');
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const plural = (n, one, many) => (n === 1 ? one : many);
// what TTS reads for a site name
const SAY = { 'GiGi L Coiffure': 'Gigi L Coiffure' };

// icon per client (the node's silhouette); unknown sites get a hexagon
export const ICON = {
  riory: 'wrench', 'gigi l coiffure': 'scissors', belgomed: 'cross', 'horsey valley': 'horseshoe',
  'villa amano': 'house', 'solyn global': 'monogram',
};
export const iconOf = name => ICON[String(name || '').toLowerCase()] || 'hex';

export function siteState(s) {
  const open = (s.incidents || []).filter(i => i.status === 'open');
  if (s.last_status === 'down' || open.some(i => i.severity === 'critical')) return 'down';
  if (s.last_status === 'degraded' || open.length || (s.uptime24 != null && s.uptime24 < 99)) return 'warn';
  return 'ok';
}

export function makePlan(S) {
  const day = new Date(`${S.day}T12:00:00Z`);
  const sites = (S.sites || []).map((s, i) => ({ ...s, idx: i, state: siteState(s), icon: iconOf(s.name), say: SAY[s.name] || s.name }));
  const rank = { down: 0, warn: 1, ok: 2 };
  const order = [...sites].sort((a, b) => rank[a.state] - rank[b.state] || (b.visitors_yesterday || 0) - (a.visitors_yesterday || 0) || a.name.localeCompare(b.name));
  const down = order.filter(s => s.state === 'down'), warn = order.filter(s => s.state === 'warn');
  const status = down.length ? 'critical' : warn.length ? 'warning' : 'ok';
  const n = sites.length, online = sites.filter(s => s.state !== 'down').length;
  const sum = k => sites.reduce((a, s) => a + (Number(s[k]) || 0), 0);
  const totals = {
    visitors: sum('visitors_yesterday'), week: sum('visitors_7d'), fresh: sum('new_24h'), upcoming: sum('upcoming_7d'),
    open: S.invoices?.open_count || 0, overdue: S.invoices?.overdue_count || 0, drafts: S.invoices?.draft_count || 0,
  };

  const verdict = status === 'ok' ? { word: 'ALL SYSTEMS NOMINAL', sub: `${online}/${n} ONLINE`, vo: 'All systems nominal.' }
    : status === 'critical' ? { word: down.length === 1 ? 'CRITICAL · 1 SITE DOWN' : `CRITICAL · ${down.length} SITES DOWN`, sub: `${online}/${n} ONLINE`,
      vo: down.length === 1 ? `Critical. ${down[0].say} is down.` : `Critical. ${words(down.length)} sites are down.` }
    : { word: `WARNING · ${warn.length} ${plural(warn.length, 'SITE', 'SITES')}`, sub: `${online}/${n} ONLINE`,
      vo: `Warning. ${words(warn.length)} ${plural(warn.length, 'site needs', 'sites need')} attention.` };

  const siteLine = s => {
    if (s.state === 'down') {
      const why = (s.incidents || []).find(i => i.status === 'open')?.title || s.last_error || 'no response';
      return { text: `${s.say} is down. ${shortWhy(why)}.`, sub: `${s.name} is down · ${shortWhy(why)}` };
    }
    const v = s.visitors_yesterday || 0, f = s.new_24h || 0;
    const parts = [];
    if (s.state === 'warn') parts.push(s.uptime24 != null && s.uptime24 < 99 ? `uptime ${speakPct(s.uptime24)}` : 'unstable');
    else parts.push('online');
    parts.push(`${words(v)} ${plural(v, 'visitor', 'visitors')} yesterday`);
    if (f) parts.push(`${words(f)} new ${plural(f, 'request', 'requests')}`);
    const subParts = [s.state === 'warn' ? 'needs attention' : 'online', `${v} ${plural(v, 'visitor', 'visitors')} yesterday`];
    if (f) subParts.push(`${f} new ${plural(f, 'request', 'requests')}`);
    return { text: `${s.say}: ${parts.join(', ')}.`, sub: `${s.name}: ${subParts.join(', ')}.` };
  };

  const dateSay = `${DAYS[day.getUTCDay()]} the ${ordinal(day.getUTCDate())} of ${MONTHS[day.getUTCMonth()]}`;
  const lines = [
    { id: 'intro', text: `Noon scan, ${dateSay}. ${capital(words(n))} client ${plural(n, 'site', 'sites')} checked.`,
      sub: `Noon scan · ${DAYS[day.getUTCDay()]} ${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]} · ${n} client ${plural(n, 'site', 'sites')} checked.` },
    { id: 'verdict', text: verdict.vo, sub: verdict.vo.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/g, m => String(ONES.indexOf(m))) },
    ...order.map((s, k) => ({ id: 's' + k, ...siteLine(s) })),
    { id: 'totals', text: `${capital(words(totals.visitors))} ${plural(totals.visitors, 'visitor', 'visitors')} yesterday, ${words(totals.week)} this week. ${totals.fresh ? capital(words(totals.fresh)) + ' new ' + plural(totals.fresh, 'request', 'requests') : 'No new requests'}. ${totals.overdue ? capital(words(totals.overdue)) + ' ' + plural(totals.overdue, 'invoice', 'invoices') + ' overdue' : 'No invoices overdue'}.`,
      sub: `${totals.visitors} visitors yesterday, ${totals.week} this week · ${totals.fresh} new ${plural(totals.fresh, 'request', 'requests')} · ${totals.overdue ? totals.overdue + ' invoices overdue' : 'no invoices overdue'}.` },
    { id: 'end', text: status === 'ok' ? 'All clear. Next scan tomorrow at noon.' : status === 'critical' ? `Action needed on ${down.map(s => s.say).join(' and ')}.` : `Keep an eye on ${warn.map(s => s.say).join(' and ')}.`,
      sub: status === 'ok' ? 'All clear · next scan tomorrow at 12:00.' : status === 'critical' ? `Action needed on ${down.map(s => s.name).join(' and ')}.` : `Keep an eye on ${warn.map(s => s.name).join(' and ')}.` },
  ];
  return { status, verdict, sites, order, totals, lines, day: S.day, n, online, dateCode: fmtDate(day), generated: S.generated_at };
}

const capital = s => s.charAt(0).toUpperCase() + s.slice(1);
function shortWhy(t) { return String(t).replace(/\s+/g, ' ').replace(/[.]+$/, '').slice(0, 60); }
function speakPct(p) { const r = Math.round(p * 10) / 10; const [a, b] = String(r).split('.'); return `${words(+a)}${b ? ' point ' + words(+b) : ''} percent`; }
function fmtDate(d) { return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`; }
