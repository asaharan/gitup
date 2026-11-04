// Shared logic: loads data/history.json, computes streaks (UTC days), renders Duo + page.
const FEED = "https://www.githubstatus.com/history.atom";
const SUMMARY = "https://www.githubstatus.com/api/v2/summary.json";
const DAY = 864e5;
const iso = t => new Date(t).toISOString().slice(0, 10);
const $ = s => document.querySelector(s);

function duo(mood) {
  const sad = mood === 'sad';
  const brows = sad
    ? '<path d="M62 62 L88 70 M138 62 L112 70" stroke="#3c3c3c" stroke-width="5" stroke-linecap="round"/>'
    : '';
  const mouth = sad
    ? '<path d="M90 98 Q100 90 110 98" fill="none" stroke="#c77a00" stroke-width="4" stroke-linecap="round"/>'
    : '';
  const tear = sad ? '<path d="M70 98 q-6 12 0 16 q6 -4 0 -16z" fill="#49c0f8"/>' : '';
  const wings = sad
    ? '<ellipse cx="38" cy="130" rx="14" ry="30" fill="#58a700" transform="rotate(12 38 130)"/><ellipse cx="162" cy="130" rx="14" ry="30" fill="#58a700" transform="rotate(-12 162 130)"/>'
    : '<ellipse cx="34" cy="108" rx="14" ry="30" fill="#58a700" transform="rotate(-35 34 108)"/><ellipse cx="166" cy="108" rx="14" ry="30" fill="#58a700" transform="rotate(35 166 108)"/>';
  const pupilY = sad ? 86 : 82;
  return `<svg class="duo" viewBox="0 0 200 200" role="img" aria-label="Duo the owl, looking ${sad ? 'sad' : 'happy'}">
  ${wings}
  <path d="M60 30 L72 56 L48 52z M140 30 L128 56 L152 52z" fill="#58cc02"/>
  <ellipse cx="100" cy="115" rx="64" ry="72" fill="#58cc02"/>
  <ellipse cx="100" cy="140" rx="40" ry="44" fill="#d7ffb8"/>
  <circle cx="72" cy="80" r="26" fill="#fff"/><circle cx="128" cy="80" r="26" fill="#fff"/>
  <circle cx="74" cy="${pupilY}" r="12" fill="#3c3c3c"/><circle cx="126" cy="${pupilY}" r="12" fill="#3c3c3c"/>
  <circle cx="78" cy="${pupilY - 5}" r="4" fill="#fff"/><circle cx="130" cy="${pupilY - 5}" r="4" fill="#fff"/>
  ${brows}${tear}
  <path d="M88 98 L112 98 L100 116z" fill="#ffc800"/>${mouth}
  <ellipse cx="80" cy="186" rx="16" ry="7" fill="#ff9600"/><ellipse cx="120" cy="186" rx="16" ry="7" fill="#ff9600"/>
  </svg>`;
}

const FLAME = `<svg class="flame" viewBox="0 0 72 90"><path d="M36 2C40 22 66 36 66 60a30 30 0 0 1-60 0c0-12 6-20 12-26 0 10 4 14 8 14C22 30 30 16 36 2z" fill="currentColor"/><path d="M36 44c4 10 14 14 14 26a14 14 0 0 1-28 0c0-8 6-12 8-18 2 4 4 5 6 5z" fill="#ffd44d"/></svg>`;

// ---- live feed: parse history.atom into {date: [incidents]} -------------------------
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function parseFeed(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const out = {};
  for (const e of doc.getElementsByTagName('entry')) {
    const q = n => e.getElementsByTagName(n)[0]?.textContent ?? '';
    const pub = Date.parse(q('published')); if (isNaN(pub)) continue;
    const link = e.getElementsByTagName('link')[0]?.getAttribute('href') ?? '';
    const id = link.split('/').pop();
    // content is escaped HTML; every update inside carries "Mon D, HH:MM UTC"
    const html = new DOMParser().parseFromString(q('content'), 'text/html');
    const pubD = new Date(pub);
    const times = [pub];
    for (const sm of html.querySelectorAll('small')) {
      const m = sm.textContent.match(/([A-Z][a-z]{2})\s+(\d{1,2})/); if (!m) continue;
      const mo = MON.indexOf(m[1]); if (mo < 0) continue;
      let y = pubD.getUTCFullYear();
      if (mo > pubD.getUTCMonth()) y--; // update was in the previous year
      times.push(Date.UTC(y, mo, +m[2]));
    }
    const from = Date.parse(iso(Math.min(...times))), to = Date.parse(iso(Math.max(...times)));
    for (let t = from; t <= to; t += DAY) {
      const list = (out[iso(t)] ??= []);
      if (!list.some(x => x.id === id)) list.push({ id, name: q('title'), impact: 'live' });
    }
  }
  return out;
}

function merge(history, live) {
  const days = structuredClone(history.incidentDays);
  for (const [d, list] of Object.entries(live)) {
    const cur = (days[d] ??= []);
    for (const i of list) if (!cur.some(x => x.id === i.id)) cur.push(i);
  }
  return { ...history, incidentDays: days };
}

function streaks(data) {
  const start = Date.parse(data.startDate), today = Date.parse(iso(Date.now()));
  const down = d => !!data.incidentDays[iso(d)];
  const runs = { up: [], down: [] };
  let cur = null;
  for (let t = start; t <= today; t += DAY) {
    const k = down(t) ? 'down' : 'up';
    if (cur && cur.k === k) cur.n++; else { cur = { k, n: 1, from: t }; runs[k].push(cur); }
  }
  const best = k => runs[k].reduce((m, r) => Math.max(m, r.n), 0);
  const total = k => runs[k].reduce((s, r) => s + r.n, 0);
  return { start, today, down, mode: cur.k, n: cur.n, best, total, runs };
}

function message(s) {
  const n = s.n;
  if (s.mode === 'up') {
    if (n === 1) return ["Day 1 without an incident! Every great streak starts somewhere. Keep it green, GitHub!", 'happy'];
    if (n < 7) return [`${n} days without an incident! Don't break it now, GitHub!`, 'happy'];
    if (n < 30) return [`${n} days up! Duo is so proud!`, 'happy'];
    if (n < 100) return [`${n} days up! Incredible. Please do not deploy on Friday.`, 'happy'];
    return [`${n} days up!! Legendary. Duo is running out of confetti.`, 'happy'];
  }
  if (n === 1) return ["An incident today. Duo is worried. Fix it before the streak grows!", 'sad'];
  return [`${n} days in a row with incidents. Duo is NOT happy. Please, GitHub, stabilise!`, 'sad'];
}

const esc = t => String(t).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const COMP = { operational: ['Operational', 'ok'], degraded_performance: ['Degraded Performance', 'warn'],
  partial_outage: ['Partial Outage', 'part'], major_outage: ['Major Outage', 'bad'], under_maintenance: ['Under Maintenance', 'maint'] };
const IND = { none: 'ok', minor: 'warn', major: 'part', critical: 'bad', maintenance: 'maint' };
const ago = t => { const m = Math.max(0, Math.round((Date.now() - Date.parse(t)) / 6e4));
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };

// Unresolved incidents from summary.json count as down days (start day -> today)
function activeDays(summary) {
  const out = {};
  for (const inc of summary?.incidents ?? []) {
    const from = Date.parse(iso(Date.parse(inc.started_at ?? inc.created_at))), to = Date.parse(iso(Date.now()));
    for (let t = from; t <= to; t += DAY) (out[iso(t)] ??= []).push({ id: inc.id, name: inc.name, impact: inc.impact });
  }
  return out;
}

let statusOpen = false; // survives the 60s re-render
function renderStatus(sum) {
  if (!sum) { $('#status').innerHTML = ''; return; }
  const comps = sum.components.filter(c => !c.group && !/^visit /i.test(c.name));
  const active = sum.incidents;
  // Banner must not say "operational" while an incident is open: the API indicator only reflects component health.
  let k = IND[sum.status.indicator] ?? 'warn', text = sum.status.description;
  if (active.length && k === 'ok') {
    const monitoring = active.every(i => i.status === 'monitoring' || i.status === 'resolved');
    k = 'warn';
    text = active.length > 1 ? `${active.length} ongoing incidents` : `Ongoing incident${monitoring ? ': fix deployed, monitoring' : ''}`;
  }
  const incs = active.map(i => {
    const u = i.incident_updates?.[0];
    return `<div class="incident ${IND[i.impact] ?? 'warn'}"><a href="${esc(i.shortlink ?? 'https://www.githubstatus.com')}" target="_blank" rel="noopener">${esc(i.name)}</a>
      <small>${esc(i.status)} · started ${ago(i.started_at ?? i.created_at)}</small>
      ${u ? `<p><b>${esc(u.status)}</b> · ${esc(u.body)} <small>${ago(u.display_at ?? u.created_at)}</small></p>` : ''}</div>`;
  }).join('');
  const maint = (sum.scheduled_maintenances ?? []).map(m =>
    `<div class="incident maint"><b>Scheduled maintenance:</b> ${esc(m.name)} <small>${esc(m.scheduled_for ?? '')}</small></div>`).join('');
  $('#status').innerHTML = `<details class="status" ${statusOpen ? 'open' : ''}>
    <summary class="banner ${k}"><span class="pulse"></span><span class="bt">${esc(text)}</span><span class="hint">Current status</span><span class="chev"></span></summary>
    ${incs}${maint}
    <div class="card comps">${comps.map(c => {
      const [label, ck] = COMP[c.status] ?? [c.status, 'warn'];
      return `<div class="comp"><span>${esc(c.name)}</span><span class="chip ${ck}">${label}</span></div>`;
    }).join('')}</div></details>`;
  $('#status details').addEventListener('toggle', e => { statusOpen = e.target.open; });
}

function render(data, liveOk, sum) {
  const s = streaks(data), up = s.mode === 'up';
  renderStatus(sum);
  const [msg, mood] = message(s);
  $('#hero').innerHTML = duo(mood) + `<div class="bubble">${msg}</div>`;

  // both streaks side by side; the inactive one shows how its last run went
  const lastRun = k => { const r = s.runs[k].filter(r => !(r.from + (r.n - 1) * DAY >= s.today)).pop(); return r; };
  const card = k => {
    const active = s.mode === k, n = active ? s.n : 0, prev = active ? null : lastRun(k);
    return `<div class="scard ${k} ${active ? 'active' : ''}">
      <div class="lbl">Current ${k} streak</div>
      <div class="num">${FLAME}<span>${n}</span></div>
      <div class="unit">${n === 1 ? 'day' : 'days'}</div>
      <div class="sub">${active ? `Best: ${s.best(k)} days` : prev ? `Last run: ${prev.n} days, ended ${iso(prev.from + prev.n * DAY - DAY)}` : 'None yet'}</div></div>`;
  };
  $('#streaks').innerHTML = card('up') + card('down');

  // week row (Mon-Sun, UTC)
  const dow = (new Date(s.today).getUTCDay() + 6) % 7, monday = s.today - dow * DAY;
  $('#week').innerHTML = ['M','T','W','T','F','S','S'].map((l, i) => {
    const t = monday + i * DAY, future = t > s.today, tracked = t >= s.start;
    const cls = future || !tracked ? '' : s.down(t) ? 'down' : 'up';
    const mark = cls === 'up' ? '✓' : cls === 'down' ? '✕' : '';
    return `<div class="wd">${l}<div class="dot ${cls} ${t === s.today ? 'today' : ''}">${mark}</div></div>`;
  }).join('');

  $('#stats').innerHTML = [
    [s.best('up'), 'longest up streak', 'up'],
    [s.best('down'), 'longest down streak', 'down'],
    [s.total('up'), 'up days', 'up'],
    [s.total('down'), 'incident days', 'down'],
  ].map(([v, l, k]) => `<div class="stat ${k}"><b>${v}</b><span>${l}</span></div>`).join('');

  const weeks = 26, first = monday - (weeks - 1) * 7 * DAY;
  let cal = '';
  for (let t = first; t < monday + 7 * DAY; t += DAY) {
    const cls = t > s.today || t < s.start ? 'pad' : s.down(t) ? 'down' : 'up';
    const n = cls === 'down' ? data.incidentDays[iso(t)].length : 0;
    cal += `<i class="${cls}" title="${iso(t)}${n ? ` · ${n} incident(s)` : ''}"></i>`;
  }
  $('#cal').innerHTML = cal;

  const recent = Object.keys(data.incidentDays).sort().reverse().slice(0, 8);
  $('#incidents').innerHTML = recent.map(d => {
    const i = data.incidentDays[d];
    return `<li>${esc(i[0].name)}${i.length > 1 ? ` <small>+${i.length - 1} more</small>` : ''}<small>${d}</small></li>`;
  }).join('');

  $('#updated').textContent = liveOk
    ? `Live from githubstatus.com · history since ${data.startDate}`
    : `Live data unavailable, showing saved history from ${data.generatedAt.slice(0, 16).replace('T', ' ')} UTC`;
}

const getJSON = u => fetch(u, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
let history;
async function refresh() {
  let live = {}, sum = null, ok = false;
  const [f, su] = await Promise.allSettled([
    fetch(FEED, { cache: 'no-store' }).then(r => { if (!r.ok) throw 0; return r.text(); }),
    getJSON(SUMMARY),
  ]);
  if (f.status === 'fulfilled') { live = parseFeed(f.value); ok = true; }
  if (su.status === 'fulfilled') { sum = su.value; ok = true; for (const [d, l] of Object.entries(activeDays(sum))) (live[d] ??= []).push(...l); }
  render(merge(history, live), ok, sum);
}
(async () => {
  try {
    history = await getJSON('data/history.json');
    await refresh();
    setInterval(refresh, 60000); // keep the status fresh while the tab is open
  } catch (e) {
    $('#hero').textContent = 'Could not load data/history.json. Serve this folder over HTTP (npm start).';
    console.error(e);
  }
})();
