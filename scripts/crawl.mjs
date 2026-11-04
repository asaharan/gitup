#!/usr/bin/env node
// Crawls https://www.githubstatus.com/history back to START_DATE and merges the result
// into data/history.json (the simple JSON history file; existing entries are kept).
// Any UTC day touched by an incident is a "down" day; every other day is "up".
// Usage: node scripts/crawl.mjs
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE = 'https://www.githubstatus.com/history';
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MAX_PAGES = 80;
const START_DATE = '2025-01-01';
// Planned maintenance is not an incident: it must not break a streak or mark a day as down.
const isMaintenance = (name = '', impact = '') => impact === 'maintenance' || /^\[scheduled\]/i.test(name);

const decode = s => s
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&amp;/g, '&');

async function fetchPage(n) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${BASE}?page=${n}`, { headers: { 'user-agent': 'githubstreak-crawler' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const m = html.match(/data-react-class="HistoryIndex"\s+data-react-props="([^"]*)"/);
      if (!m) throw new Error('HistoryIndex props not found (page layout changed?)');
      return JSON.parse(decode(m[1]));
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}

const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// "Oct <var>31</var>, 23:00 - Nov <var>1</var>, 01:00 UTC" -> every UTC date spanned
function daysOf(timestamp, monthIdx, year) {
  const text = timestamp.replace(/<[^>]+>/g, '');
  const hits = [...text.matchAll(/([A-Z][a-z]{2})\s+(\d{1,2})/g)];
  const pts = hits.map(h => ({ m: MONTHS.indexOf(h[1]), d: +h[2] })).filter(p => p.m >= 0);
  if (!pts.length) return [];
  let y = year;
  const start = Date.UTC(y, pts[0].m, pts[0].d);
  const last = pts[pts.length - 1];
  if (Date.UTC(y, last.m, last.d) < start) y++; // Dec -> Jan
  const end = Date.UTC(y, last.m, last.d);
  const out = [];
  for (let t = start; t <= end; t += 864e5) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(here, '..', 'data', 'history.json');

// Load existing history so past data is never lost
let days = {};
try { days = JSON.parse(await readFile(file, 'utf8')).incidentDays ?? {}; } catch {}
// clean maintenance out of previously saved history too
for (const [d, list] of Object.entries(days)) {
  const kept = list.filter(i => !isMaintenance(i.name, i.impact));
  if (kept.length) days[d] = kept; else delete days[d];
}

for (let page = 1; page <= MAX_PAGES; page++) {
  const data = await fetchPage(page);
  let found = 0;
  for (const month of data.months) {
    const mi = MONTHS.indexOf(month.name.slice(0, 3));
    for (const inc of month.incidents) {
      if (isMaintenance(inc.name, inc.impact)) continue;
      for (const day of daysOf(inc.timestamp, mi, month.year)) {
        if (day < START_DATE) continue;
        const list = (days[day] ??= []);
        if (!list.some(x => x.id === inc.code)) list.push({ id: inc.code, name: inc.name, impact: inc.impact });
      }
      found++;
    }
  }
  console.log(`page ${page}: ${data.start_time.slice(0, 10)} → ${data.end_time.slice(0, 10)}  incidents=${found}`);
  if (data.start_time.slice(0, 10) <= START_DATE) break; // reached the start of our history
}

const dates = Object.keys(days).sort();
const out = {
  generatedAt: new Date().toISOString(),
  source: BASE,
  startDate: START_DATE,
  incidentDays: Object.fromEntries(dates.map(d => [d, days[d]])),
};
await mkdir(path.dirname(file), { recursive: true });
await writeFile(file, JSON.stringify(out, null, 1) + '\n');
console.log(`done: ${dates.length} incident days since ${START_DATE}`);
