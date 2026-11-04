// Shared logic: loads data/history.json, computes streaks (UTC days), renders Duo + page.
const SITE = "https://gitup.lol";
const xShare = text => `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(SITE)}&via=iamamitsaharan`;
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
const ud = down => `<b class="ud ${down ? 'down' : 'up'}">${down ? 'down' : 'up'}</b>`; // green "up" / red "down"
const isMaintenance = (name = '', impact = '') => impact === 'maintenance' || /^\[scheduled\]/i.test(name);
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function parseFeed(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const out = {};
  for (const e of doc.getElementsByTagName('entry')) {
    const q = n => e.getElementsByTagName(n)[0]?.textContent ?? '';
    const pub = Date.parse(q('published')); if (isNaN(pub)) continue;
    if (isMaintenance(q('title'))) continue;
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
  // Stats always use the last 365 days (or all data if we have less)
  const wStart = Math.max(start, today - 364 * DAY);
  const wr = { up: [], down: [] }, wdUp = Array(7).fill(0), wdDown = Array(7).fill(0);
  let wc = null, wDays = 0;
  for (let t = wStart; t <= today; t += DAY) {
    const k = down(t) ? 'down' : 'up', wd = new Date(t).getUTCDay();
    (k === 'down' ? wdDown : wdUp)[wd]++; wDays++;
    if (wc && wc.k === k) wc.n++; else { wc = { k, n: 1 }; wr[k].push(wc); }
  }
  const w = { days: wDays, from: wStart, wdUp, wdDown,
    best: k => wr[k].reduce((m, r) => Math.max(m, r.n), 0),
    total: k => wr[k].reduce((a, r) => a + r.n, 0) };
  return { start, today, down, mode: cur.k, n: cur.n, best, total, runs, w };
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
    if (isMaintenance(inc.name, inc.impact)) continue;
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
  $('#shareTop').href = xShare(up
    ? `GitHub has been up ${s.n} day${s.n === 1 ? '' : 's'} in a row 🟢🔥`
    : `GitHub has had incidents ${s.n} day${s.n === 1 ? '' : 's'} in a row 🔴 Duo is not happy.`);
  $('#hero').innerHTML = duo(mood) + `<div class="bubble">${msg}</div>`;

  // both streaks side by side; the inactive one shows how its last run went
  const lastRun = k => { const r = s.runs[k].filter(r => !(r.from + (r.n - 1) * DAY >= s.today)).pop(); return r; };
  const card = k => {
    const active = s.mode === k, n = active ? s.n : 0, prev = active ? null : lastRun(k);
    return `<div class="scard ${k} ${active ? 'active' : ''}">
      <div class="lbl">Current ${k} streak</div>
      <div class="num">${FLAME}<span>${n}</span></div>
      <div class="unit">${n === 1 ? 'day' : 'days'}</div>
      <div class="sub">${active ? `Best (365d): ${s.w.best(k)} days` : prev ? `Last run: ${prev.n} days, ended ${iso(prev.from + prev.n * DAY - DAY)}` : 'None yet'}</div></div>`;
  };
  $('#streaks').innerHTML = card('up') + card('down');

  const dow = (new Date(s.today).getUTCDay() + 6) % 7, monday = s.today - dow * DAY;

  const W = s.w, tu = W.total('up'), td = W.total('down'), pct = n => Math.round(100 * n / (W.days || 1)) + '%';
  const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const top = arr => arr.indexOf(Math.max(...arr));
  const wdD = top(W.wdDown), wdU = top(W.wdUp);
  $('#statsnote').textContent = `Stats: last ${W.days} days`;
  $('#stats').innerHTML = [
    [W.best('up'), 'longest up streak', 'up', 'days'],
    [W.best('down'), 'longest down streak', 'down', 'days'],
    [tu, 'up days', 'up', pct(tu) + ' of days'],
    [td, 'down days', 'down', pct(td) + ' of days'],
    [WD[wdU], 'most up days', 'up wd', `${W.wdUp[wdU]} of ${W.wdUp[wdU] + W.wdDown[wdU]} ${WD[wdU]}s`],
    [WD[wdD], 'most down days', 'down wd', `${W.wdDown[wdD]} of ${W.wdUp[wdD] + W.wdDown[wdD]} ${WD[wdD]}s`],
  ].map(([v, l, k, p]) => `<div class="stat ${k}"><b>${v}</b><span>${l}</span><em>${p}</em></div>`).join('');

  // fit the grid to the screen: ~20px per week column; keep the count fixed while a round is running
  if (G.mode === 'idle' || !G.weeks) G.weeks = calcWeeks();
  const weeks = G.weeks, first = monday - (weeks - 1) * 7 * DAY;
  $('#tl-title').textContent = `Last ${weeks} weeks`;
  LAST = [data, liveOk, sum];
  G.cur = data;
  G.allDays = []; for (let t = first; t < s.today; t += DAY) if (t >= s.start) G.allDays.push(iso(t));
  G.redraw = () => renderGame(data, s, first, monday);
  renderGame(data, s, first, monday);

  const recent = Object.keys(data.incidentDays).sort().reverse().slice(0, 8);
  $('#incidents').innerHTML = recent.map(d => {
    const i = data.incidentDays[d];
    return `<li>${esc(i[0].name)}${i.length > 1 ? ` <small>+${i.length - 1} more</small>` : ''}<small>${d}</small></li>`;
  }).join('');

  $('#updated').textContent = liveOk
    ? `Live from githubstatus.com · history since ${data.startDate}`
    : `Live data unavailable, showing saved history from ${data.generatedAt.slice(0, 16).replace('T', ' ')} UTC`;
}


// ---- Last 26 weeks timeline + 10-day guess game --------------------------------------
const ROUND = 10;
let LAST = null;
function calcWeeks() {
  const w = $('#game').clientWidth || 600;
  return Math.max(8, Math.min(26, Math.floor((w - 12 + 4) / 20)));
}
addEventListener('resize', () => {
  clearTimeout(calcWeeks.t);
  calcWeeks.t = setTimeout(() => { if (LAST && G.mode === 'idle' && calcWeeks() !== G.weeks) render(...LAST); }, 150);
});
const G = { weeks: 0, mode: 'idle', picks: [], i: 0, res: [], best: 0, cur: null, redraw: null };
try { G.best = +localStorage.getItem('gs-best10') || 0; } catch {}
const niceDate = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortDate = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const verdict = n => n >= 9 ? 'Duo wants to hire you.' : n >= 7 ? 'Solid. You read the status page a lot.' : n >= 5 ? 'Coin-flip energy.' : 'Did you even open githubstatus.com?';

function renderGame(data, s, first, monday) {
  const days = [];
  for (let t = first; t < s.today; t += DAY) if (t >= s.start) days.push(iso(t));
  const play = G.mode !== 'idle', done = G.mode === 'done';
  const answered = Object.fromEntries(G.res.map(r => [r.date, r]));
  const target = G.mode === 'play' ? G.picks[G.i] : null;

  let grid = '';
  for (let t = first; t < monday + 7 * DAY; t += DAY) {
    const d = iso(t);
    let cls;
    if (!play && t >= s.start && t <= s.today) cls = s.down(t) ? 'down' : 'up';   // plain timeline (incl. today)
    else if (!days.includes(d)) cls = 'pad';
    else if (d in answered) cls = (s.down(t) ? 'down' : 'up') + ' pick';
    else cls = 'unk' + (d === target ? ' target' : '');   // everything grayed out during the game
    const known = cls !== 'pad' && (!play || d in answered);   // never leak unanswered days during the game
    grid += `<i class="${cls}" ${known ? `data-d="${d}"` : ''}></i>`;
  }
  const legend = `<div class="legend"><span><i style="background:var(--up)"></i>up</span><span><i style="background:var(--down)"></i>incident</span></div>`;
  const L = G.res[G.res.length - 1];
  const last = L && !done ? `<div class="gres ${L.ok ? 'ok' : 'no'}"><b>${L.ok ? 'Correct!' : 'Not quite.'}</b> ${esc(shortDate(L.date))} was ${ud(L.down)}${L.down ? `: ${esc(L.name)}` : ''}.</div>` : '';
  let top = '', bottom = '';

  if (!play) {
    bottom = `${legend}<button class="gb up gstart" data-g="start">Play the guess game</button>
      <div class="ghint">Guess ${ROUND} random days: up or down?${G.best ? ` Best score: <b>${G.best}/${ROUND}</b>` : ''}</div>`;
  } else if (!done) {
    top = `<div class="gtop"><div class="gduo">${duo(L && !L.ok ? 'sad' : 'happy')}</div>
      <div class="gq"><small>Day ${G.i + 1} of ${ROUND} · score ${G.res.filter(r => r.ok).length}</small><br>Was GitHub ${ud(false)} or ${ud(true)} on</div>${calIcon(target, 'sm')}</div>`;
    bottom = `<div class="gbtns"><button data-g="up" class="gb up">Up</button><button data-g="down" class="gb down">Down</button></div>${last}
      <button class="glink" data-g="quit">Quit game</button>`;
  } else {
    const score = G.res.filter(r => r.ok).length;
    top = `<div class="gtop"><div class="gduo">${duo(score >= 5 ? 'happy' : 'sad')}</div>
      <div class="gq"><small>Your score</small><br><span class="gscore">${score}/${ROUND}</span><br>${verdict(score)}</div></div>`;
    bottom = `<ul class="inc gl">${G.res.map(r => `<li><span class="${r.ok ? 'gok' : 'gno'}">${r.ok ? '✓' : '✕'}</span> ${esc(shortDate(r.date))}: was ${ud(r.down)}${r.down ? ` <small>${esc(r.name)}</small>` : ''}</li>`).join('')}</ul>
      <div class="gbtns"><button data-g="start" class="gb up">Play again</button><button data-g="quit" class="gb gray">Back to timeline</button></div>`;
  }
  $('#game').innerHTML = `${top}<div class="cal gcal ${play ? 'playing' : ''}">${grid}</div>${bottom}`;
}

$('#game').addEventListener('click', e => {
  const b = e.target.closest('button[data-g]'); if (!b || !G.cur) return;
  const act = b.dataset.g;
  if (act === 'start') {
    const days = G.allDays ?? [];
    const pick = [...days].sort(() => Math.random() - .5).slice(0, ROUND);
    Object.assign(G, { mode: 'play', picks: pick, i: 0, res: [] });
  } else if (act === 'quit') {
    Object.assign(G, { mode: 'idle', picks: [], i: 0, res: [] });
  } else if (G.mode === 'play') {
    const d = G.picks[G.i], inc = G.cur.incidentDays[d], down = !!inc, ok = (act === 'down') === down;
    G.res.push({ date: d, ok, down, name: inc?.[0]?.name ?? '' });
    G.i++;
    if (G.i >= ROUND) {
      G.mode = 'done';
      const score = G.res.filter(r => r.ok).length;
      if (score > G.best) { G.best = score; try { localStorage.setItem('gs-best10', score); } catch {} }
    }
  }
  G.redraw();
});

// ---- hover / tap tooltip on the timeline ---------------------------------------------------
const tip = document.createElement('div');
tip.className = 'tip'; tip.hidden = true; document.body.appendChild(tip);
function showTip(cell) {
  const d = cell.dataset.d, list = G.cur?.incidentDays[d] ?? [];
  const names = list.slice(0, 3).map(i => `<li>${esc(i.name)}</li>`).join('') + (list.length > 3 ? `<li>+${list.length - 3} more</li>` : '');
  tip.innerHTML = `<div class="tdate">${esc(niceDate(d))}</div>
    <div>${ud(list.length > 0)}${list.length ? `: ${list.length} incident${list.length > 1 ? 's' : ''}` : ': no incidents'}</div>${names ? `<ul>${names}</ul>` : ''}`;
  tip.hidden = false;
  const r = cell.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
  let x = r.left + r.width / 2 - tw / 2; x = Math.max(8, Math.min(x, innerWidth - tw - 8));
  let y = r.top - th - 10; if (y < 8) y = r.bottom + 10;
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
}
const hideTip = () => { tip.hidden = true; };
const cellOf = e => e.target.closest?.('.gcal i[data-d]');
$('#game').addEventListener('mouseover', e => { const c = cellOf(e); c ? showTip(c) : hideTip(); });
$('#game').addEventListener('mouseleave', hideTip);
$('#game').addEventListener('click', e => { const c = cellOf(e); if (c) showTip(c); });   // tap on touch screens
addEventListener('scroll', hideTip, { passive: true });
document.addEventListener('click', e => { if (!e.target.closest?.('.gcal')) hideTip(); });

// ---- Full-screen guess modal (mobile friendly): one day at a time ----------------------
const REVEAL_MS = 4500;      // result screen length (any tap skips it)
const TAP_GUARD_MS = 300;    // ignore taps right after answering so a double-tap doesn't skip the result
// Generic lines, keyed `${actual}_${yourGuess}`
const JOKES = {
  down_down: ["You're goddamn right.", "Say my name. 'GitHub is down.'", 'I am the one who clicks refresh.', 'Heisenberg of uptime. Nobody calls it like you.', 'Of course it was down. Was there ever a doubt?'],
  up_up: ['A green day. Frame this one, it is rare.', 'Up! Someone at GitHub must have had a good coffee.', 'Correct. A rare unicorn-free day.', 'Up. Nobody touched prod. Probably.'],
  down_up: ['Up? On GitHub? That is adorable.', 'Optimism is not a monitoring strategy.', "Down was the safe guess. It's always the safe guess.", 'Bold of you to assume 100% uptime.', 'The unicorn would like a word.'],
  up_down: ['Cynical. And, annoyingly, wrong: it was up.', 'It was up! Stop jinxing them.', 'Down? They actually had a good day. Let them have it.', 'Trust issues? Same. But this was a clean day.'],
};

// Contextual lines: only used when the day actually matches (weekday, special date, or what broke)
const WEEKDAY = {
  1: { // Monday
    down_down: ['Monday blues, now with downtime.', 'Monday: coffee, standup, outage. Tradition.'],
    down_up: ['Monday blues hit GitHub too. Never guess up on a Monday.', "It's Monday. Everything is down, including morale."],
    up_up: ['Up on a Monday. A small mercy.', 'Monday and no incident. Enjoy it; the week has not finished yet.'],
    up_down: ['Even GitHub woke up on time this Monday.', 'Monday blues? Not for GitHub today.'],
  },
  2: { // Tuesday
    down_down: ['Tuesday: the week finally remembered to break something.', 'Patch Tuesday energy. Microsoft owns GitHub, after all.'],
    down_up: ['Tuesday: the day the Monday deploys finally land.', 'Patch Tuesday vibes. You should have known.'],
    up_up: ['A calm Tuesday. Suspicious.', 'Tuesday, up. Nothing to see here, move along.'],
    up_down: ['A quiet Tuesday, no Monday hangover for GitHub.'],
  },
  3: { // Wednesday
    down_down: ['Hump day, hump incident.', 'Midweek outage. Peak "have you tried turning it off and on".'],
    down_up: ['Midweek is where deploys go to die.', 'Hump day. Always a coin flip.'],
    up_up: ['Hump day, and no hump. Nice.', 'A smooth Wednesday. Did anyone check on the on-call?'],
    up_down: ['Midweek and still up. GitHub is in its prime.'],
  },
  4: { // Thursday
    down_down: ['Thursday: everyone rushing to ship before Friday.', 'Thursday deploys: Friday fires, started early.'],
    down_up: ['Thursday: shipping before the weekend panic. You were warned.', 'A "quick fix before tomorrow" got through.'],
    up_up: ['Thursday and up. The weekend rush has not started.', 'Quiet Thursday. Savour it.'],
    up_down: ['Thursday and up. They deployed on Wednesday instead.'],
  },
  5: { // Friday
    down_down: ['Friday deploy. Classic. You saw it coming.', 'Down on a Friday: somebody said "quick fix before the weekend".', 'Friday incident. Somebody is cancelling their plans.'],
    down_up: ['It was a Friday. What did you expect, a quiet one?', 'Friday deploy energy. You should have known better.'],
    up_up: ['A Friday with no incident? Nobody deployed. Respect.', 'Up on a Friday. The "no deploy Fridays" rule actually works.'],
    up_down: ['A Friday and up? They did not deploy. A Friday miracle.', 'Friday and no incident. Rare. Someone has discipline.'],
  },
  6: { // Saturday
    down_down: ['A Saturday outage: somebody on call is not happy.', 'Down on a Saturday. Their weekend, officially cancelled.'],
    down_up: ['A weekend deploy. Brave. Also wrong.', 'Saturday: someone deployed anyway.'],
    up_up: ['A quiet Saturday. Developers were outside. Or not pushing.', 'Weekend, up. Nobody is working, nobody breaks anything.'],
    up_down: ['Saturday: fewer pushes, fewer incidents. Basic maths.'],
  },
  0: { // Sunday
    down_down: ['A Sunday outage. Someone is deploying for Monday. Bold.', 'Down on a Sunday. Tomorrow standup will be fun.'],
    down_up: ['Sunday deploy for "a clean Monday". Spoiler: no.', 'Sunday incident. Somebody had "just one small fix".'],
    up_up: ['A peaceful Sunday. Nobody pushed. Good for them.', 'Sunday, up. Even the servers rested.'],
    up_down: ['Sunday and up. The best day for infrastructure is a day nobody touches it.'],
  },
};
const FRI13 = {
  down: ['Friday the 13th. Of course it was down.', 'Friday the 13th and a Friday deploy? Chaos.'],
  up: ['Friday the 13th and still up. Impressive.', 'Friday the 13th: GitHub dared the universe, and won.'],
};
const SPECIAL = { // "month-day" -> by actual state
  '12-25': { down: ['An outage on Christmas Day. Santa uses git too.'], up: ['Up on Christmas. Even the servers took the day off.'] },
  '12-24': { down: ['Christmas Eve outage. The last deploy before the holidays, as ever.'], up: ['Christmas Eve, and up. No last-minute fixes.'] },
  '12-31': { down: ['Down on New Year\'s Eve. One last deploy for the year.'], up: ['Up on New Year\'s Eve. Everyone is off to the party.'] },
  '1-1': { down: ['New year, new incident.'], up: ['Up on New Year\'s Day. Everybody is asleep.'] },
  '2-14': { down: ['Valentine\'s Day: GitHub broke up with us.'], up: ['Valentine\'s Day: GitHub stayed. Unlike your last PR reviewer.'] },
  '4-1': { down: ['April Fools\' Day. The status page said down. Was it a prank? No.'], up: ['April Fools\': up, genuinely. The most suspicious thing today.'] },
  '10-31': { down: ['Halloween. A spooky deploy.'], up: ['Halloween, up. The only scary thing was your guess.'] },
  '3-14': { down: ['Pi Day outage. Irrational behaviour.'], up: ['Pi Day, up. Perfectly rational.'] },
  '5-4': { down: ['May the 4th: the Force was not with GitHub.'], up: ['May the 4th, up. The Force was with them.'] },
};
const INCIDENT = [ // regex on the incident name -> lines (only when the day was actually down)
  [/copilot/i, ['Copilot was down. Devs briefly had to think for themselves.', 'Copilot down: everyone suddenly remembers how to write a for loop.']],
  [/actions|runner|workflow/i, ['Actions was down. The build is green in spirit.', 'CI is red, the coffee is cold.']],
  [/pages/i, ['Pages was down. Portfolios everywhere went dark.']],
  [/codespaces/i, ['Codespaces was down. "Works on my machine" is back.']],
  [/git operations|\bgit\b|clone|push/i, ['Git was down. git push, but make it a prayer.']],
  [/webhook/i, ['Webhooks were delayed. Your notifications will arrive in the next life.']],
  [/\bapi\b/i, ['API errors. curl returns vibes only.']],
  [/package|npm|registry|container/i, ['Packages was down. node_modules is not coming.']],
  [/dependabot/i, ['Dependabot was down. For one day, nobody got 47 pull requests.']],
  [/pull request/i, ['Pull Requests were down. LGTM, delayed.']],
  [/issues/i, ['Issues were down. The backlog briefly stopped judging.']],
  [/billing/i, ['Billing was down. Free for a day, accidentally.']],
  [/search/i, ['Search was down. Nobody found anything, not even bugs.']],
];

function ctxLines(r) {
  const dt = new Date(r.date + 'T00:00:00Z'), wd = dt.getUTCDay();
  const actual = r.down ? 'down' : 'up', guess = (r.ok ? r.down : !r.down) ? 'down' : 'up';
  const out = [...(WEEKDAY[wd]?.[`${actual}_${guess}`] ?? [])];
  if (wd === 5 && dt.getUTCDate() === 13) out.push(...FRI13[actual], ...FRI13[actual]); // double weight: rare
  const sp = SPECIAL[`${dt.getUTCMonth() + 1}-${dt.getUTCDate()}`]?.[actual];
  if (sp) out.push(...sp, ...sp);
  if (r.down) for (const [re, lines] of INCIDENT) if (re.test(r.name)) out.push(...lines);
  return out;
}
const pickJoke = r => {
  const ctx = ctxLines(r);
  const pool = ctx.length && Math.random() < .8 ? ctx : JOKES[`${r.down ? 'down' : 'up'}_${(r.ok ? r.down : !r.down) ? 'down' : 'up'}`];
  return pool[Math.floor(Math.random() * pool.length)];
};

// Calendar-page style date, easy to read at a glance
function calIcon(d, size = '') {
  const dt = new Date(d + 'T00:00:00Z'), f = o => dt.toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' });
  return `<div class="calico ${size}" role="img" aria-label="${esc(niceDate(d))}">
    <div class="cm"><span>${f({ month: size ? 'short' : 'long' })}</span> <span>${f({ year: 'numeric' })}</span></div>
    <div class="cd">${f({ day: 'numeric' })}</div>
    <div class="cw">${f({ weekday: 'long' })}</div></div>`;
}
const M = { revealAt: 0, timer: 0, open: false, days: [], picks: [], i: 0, res: [], reveal: null };
const mo = document.createElement('div');
mo.className = 'mo'; mo.hidden = true; mo.setAttribute('role', 'dialog'); mo.setAttribute('aria-modal', 'true'); mo.setAttribute('aria-label', 'Guess the day');
document.body.appendChild(mo);

function openModal() {
  if (!G.cur) return;
  clearTimeout(M.timer);
  const today = Date.parse(iso(Date.now())), t0 = Math.max(Date.parse(G.cur.startDate), today - 365 * DAY); // quiz uses the last 365 days only
  M.days = []; for (let t = t0; t < today; t += DAY) M.days.push(iso(t));
  M.picks = [...M.days].sort(() => Math.random() - .5).slice(0, ROUND);
  Object.assign(M, { open: true, i: 0, res: [], reveal: null });
  mo.hidden = false; document.body.style.overflow = 'hidden';
  renderModal();
}
function closeModal() { clearTimeout(M.timer); M.open = false; mo.hidden = true; document.body.style.overflow = ''; }

function renderModal() {
  const score = M.res.filter(r => r.ok).length;
  const bar = `<div class="mbar">${Array.from({ length: ROUND }, (_, k) => {
    const r = M.res[k]; return `<i class="${r ? (r.ok ? 'ok' : 'no') : k === M.i ? 'now' : ''}"></i>`; }).join('')}</div>`;
  const head = `<div class="mhead"><button class="mx" data-m="close" aria-label="Close">✕</button>${bar}<span class="msc">${score}</span></div>`;
  let body;
  if (M.i >= ROUND) {
    if (score > G.best) { G.best = score; try { localStorage.setItem('gs-best10', score); } catch {} }
    body = `<div class="mbody">${duo(score >= 5 ? 'happy' : 'sad')}
      <div class="mlabel">Your score</div><div class="mscore">${score}/${ROUND}</div>
      <p class="mverdict">${verdict(score)}${G.best ? ` <small>Best: ${G.best}/${ROUND}</small>` : ''}</p>
      <ul class="inc gl">${M.res.map(r => `<li><span class="${r.ok ? 'gok' : 'gno'}">${r.ok ? '✓' : '✕'}</span> ${esc(shortDate(r.date))}: was ${ud(r.down)}${r.down ? ` <small>${esc(r.name)}</small>` : ''}</li>`).join('')}</ul></div>
      <div class="mfoot"><button class="gb up" data-m="again">Play again</button><a class="gb sharex" target="_blank" rel="noopener" href="${xShare(`I scored ${score}/${ROUND} guessing whether GitHub was up or down 🦉 ${verdict(score)} Can you beat me?`)}">Share my score on X</a><button class="gb gray" data-m="close">Close</button></div>`;
  } else if (M.reveal) {
    const r = M.reveal;
    const cols = ['#ffc800', '#ffdf5d', '#ff9600', '#fff1a8', '#ffb020'];
    const confetti = r.ok ? Array.from({ length: 16 }, (_, k) => {
      const a = (k / 16) * 6.283 + Math.random() * .4, d = 90 + Math.random() * 70;
      return `<b class="cf" style="--dx:${Math.round(Math.cos(a) * d)}px;--dy:${Math.round(Math.sin(a) * d - 30)}px;--c:${cols[k % 5]};--r:${Math.round(Math.random() * 360)}deg"></b>`;
    }).join('') : '';
    body = `<div class="mbody rv ${r.ok ? 'ok' : 'no'}">${confetti}${duo(r.ok ? 'happy' : 'sad')}
      <div class="mres ${r.ok ? 'ok' : 'no'}">${r.ok ? '✓ Correct!' : '✕ Not quite.'}</div>
      <div class="mjoke">${esc(r.joke)}</div>
      ${calIcon(r.date, 'sm')}
      <p class="mverdict">GitHub was ${ud(r.down)}${r.down ? `<br><small>${esc(r.name)}</small>` : ''}</p></div>`;
  } else {
    const d = M.picks[M.i], dt = new Date(d + 'T00:00:00Z');
    body = `<div class="mbody">${duo('happy')}
      <div class="mlabel">Day ${M.i + 1} of ${ROUND}</div>
      <div class="mq">Was GitHub ${ud(false)} or ${ud(true)} on</div>
      ${calIcon(d)}</div>
      <div class="mfoot two"><button class="gb up big" data-m="up">Up</button><button class="gb down big" data-m="down">Down</button></div>`;
  }
  mo.className = 'mo' + (M.reveal && M.i < ROUND ? (M.reveal.ok ? ' mo-ok' : ' mo-no') : '');
  mo.innerHTML = `<div class="mwrap">${head}${body}</div>`;
}

mo.addEventListener('click', e => {
  const a = e.target.closest('button[data-m]')?.dataset.m;
  if (a === 'close' || a === 'again') return modalAct(a);
  // tap anywhere on the result screen moves on immediately
  if (M.reveal) { if (performance.now() - M.revealAt > TAP_GUARD_MS) modalAct('next'); return; }
  if (a) modalAct(a);
});
function modalAct(a) {
  if (a === 'close') return closeModal();
  if (a === 'again') return openModal();
  if (a === 'next') { clearTimeout(M.timer); M.reveal = null; M.i++; }
  else if ((a === 'up' || a === 'down') && !M.reveal && M.i < ROUND) {
    const d = M.picks[M.i], inc = G.cur.incidentDays[d], down = !!inc;
    M.reveal = { date: d, ok: (a === 'down') === down, down, name: inc?.[0]?.name ?? '' };
    M.reveal.joke = pickJoke(M.reveal);
    try { navigator.vibrate?.(M.reveal.ok ? 40 : [90, 50, 90, 50, 180]); } catch {}
    M.res.push(M.reveal);
    clearTimeout(M.timer);
    M.timer = setTimeout(() => M.open && modalAct('next'), REVEAL_MS);
    M.revealAt = performance.now(); // auto-advance, no button
  }
  renderModal();
}
addEventListener('keydown', e => {
  if (!M.open) return;
  const k = e.key.toLowerCase();
  if (k === 'escape') closeModal();
  else if (k === 'u' || k === 'arrowup') modalAct('up');
  else if (k === 'd' || k === 'arrowdown') modalAct('down');
});
$('#playTop').addEventListener('click', openModal);

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
    for (const [d, l] of Object.entries(history.incidentDays)) {
      const kept = l.filter(i => !isMaintenance(i.name, i.impact));
      if (kept.length) history.incidentDays[d] = kept; else delete history.incidentDays[d];
    }
    await refresh();
    setInterval(refresh, 60000); // keep the status fresh while the tab is open
  } catch (e) {
    $('#hero').textContent = 'Could not load data/history.json. Serve this folder over HTTP (npm start).';
    console.error(e);
  }
})();
