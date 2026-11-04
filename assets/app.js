// Shared logic: loads data/history.json, computes streaks (UTC days), renders Duo + page.
const MODE = document.body.dataset.mode; // "up" | "down"
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

function streaks(data) {
  const start = Date.parse(data.startDate), today = Date.parse(iso(Date.now()));
  const down = d => !!data.incidentDays[iso(d)];
  const runs = { up: [], down: [] };
  let cur = null;
  for (let t = start; t <= today; t += DAY) {
    const k = down(t) ? 'down' : 'up';
    if (cur && cur.k === k) cur.n++; else { cur = { k, n: 1, from: t }; runs[k].push(cur); }
  }
  const last = cur;
  const best = k => runs[k].reduce((m, r) => Math.max(m, r.n), 0);
  const total = k => runs[k].reduce((s, r) => s + r.n, 0);
  return { start, today, down, last, runs, best, total,
           current: k => (last.k === k ? last.n : 0) };
}

function message(mode, s) {
  const n = s.current(mode);
  if (mode === 'up') {
    if (!n) return ["GitHub is having an incident today. Come on, fix it and start a new streak. I believe in you!", 'sad'];
    if (n === 1) return ["Day 1! Every great streak starts somewhere. Keep it green, GitHub!", 'happy'];
    if (n < 7) return [`${n} days without an incident! Don't break it now, GitHub!`, 'happy'];
    if (n < 30) return [`${n} days up! One week strong. Duo is so proud!`, 'happy'];
    if (n < 100) return [`${n} days up! Incredible. Please do not deploy on Friday.`, 'happy'];
    return [`${n} days up!! Legendary. Duo is running out of confetti.`, 'happy'];
  }
  if (!n) return ["No down streak right now. Keep it that way, GitHub!", 'happy'];
  if (n === 1) return ["An incident today. Duo is worried. Fix it before the streak grows!", 'sad'];
  return [`${n} days in a row with incidents. Duo is NOT happy. Please, GitHub, stabilise!`, 'sad'];
}

function render(data) {
  const s = streaks(data), n = s.current(MODE);
  const [msg, mood] = message(MODE, s);
  $('#hero').innerHTML = duo(mood) + `<div class="bubble">${msg}</div>`;
  $('#streak').innerHTML = `<div class="num">${FLAME}<span>${n}</span></div>
    <div class="label">day ${MODE === 'up' ? 'up' : 'down'} streak</div>`;

  // week row (Mon-Sun, UTC)
  const dow = (new Date(s.today).getUTCDay() + 6) % 7, monday = s.today - dow * DAY;
  $('#week').innerHTML = ['M','T','W','T','F','S','S'].map((l, i) => {
    const t = monday + i * DAY, future = t > s.today, tracked = t >= s.start;
    const cls = future || !tracked ? '' : s.down(t) ? 'down' : 'up';
    const mark = cls === 'up' ? '✓' : cls === 'down' ? '✕' : '';
    return `<div class="wd">${l}<div class="dot ${cls} ${t === s.today ? 'today' : ''}">${mark}</div></div>`;
  }).join('');

  // stats
  const bestK = MODE;
  $('#stats').innerHTML = [
    [s.best(bestK), `longest ${MODE} streak`],
    [s.total(bestK), `total ${MODE} days`],
    [s.runs[bestK].length, `${MODE} streaks`],
  ].map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');

  // calendar: last 26 weeks, columns = weeks
  const weeks = 26, first = monday - (weeks - 1) * 7 * DAY;
  let cal = '';
  for (let t = first; t < monday + 7 * DAY; t += DAY) {
    const cls = t > s.today || t < s.start ? 'pad' : s.down(t) ? 'down' : 'up';
    const n = cls === 'down' ? data.incidentDays[iso(t)].length : 0;
    cal += `<i class="${cls}" title="${iso(t)}${n ? ` · ${n} incident(s)` : ''}"></i>`;
  }
  $('#cal').innerHTML = cal;

  // recent incidents
  const recent = Object.keys(data.incidentDays).sort().reverse().slice(0, 8);
  $('#incidents').innerHTML = recent.map(d => {
    const i = data.incidentDays[d];
    return `<li>${i[0].name}${i.length > 1 ? ` <small>+${i.length - 1} more</small>` : ''}<small>${d}</small></li>`;
  }).join('');

  $('#updated').textContent = `Data since ${data.startDate} · last crawled ${data.generatedAt.slice(0, 16).replace('T', ' ')} UTC`;
}

fetch('data/history.json').then(r => r.json()).then(render).catch(e => {
  $('#hero').textContent = 'Could not load data/history.json — serve this folder over HTTP (npm start).';
  console.error(e);
});
