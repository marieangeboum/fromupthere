// node --experimental-strip-types scripts/passes-over-check.ts
// Three days of ISS passes over Toulouse with a ±500 km swath: the same passes as a brute-force scan every 5 s
// (the jumps far from the place skip none), each at the same time within 10 s; the first one is nextOverhead's.
import * as satellite from 'satellite.js';
import { nextOverhead, passesOver } from '../src/next-overhead.ts';
const tle1 = '1 25544U 98067A   25216.88307209  .00003454  00000+0  67688-4 0  9997';
const tle2 = '2 25544  51.6362  65.7123 0001818 143.6625 298.7323 15.50331059522717';
const sat = { id: 'iss', tle1, tle2, halfKm: 500 }, lat = 43.6, lng = 1.44;
const from = Date.UTC(2025, 7, 5), to = from + 3 * 86400e3;

const t0 = performance.now();
const got = passesOver([sat], lat, lng, from, to);
const ms = performance.now() - t0;

// Brute force: runs of 5 s samples inside the swath, each pass at its closest sample
const rec = satellite.twoline2satrec(tle1, tle2), rad = Math.PI / 180;
const want: number[] = [];
let run: { t: number; d: number } | null = null;
for (let t = from; t <= to; t += 5e3) {
  const pv = satellite.propagate(rec, new Date(t));
  const g = satellite.eciToGeodetic(pv.position as satellite.EciVec3<number>, satellite.gstime(new Date(t)));
  const h = Math.sin((g.latitude - lat * rad) / 2) ** 2 + Math.cos(g.latitude) * Math.cos(lat * rad) * Math.sin((g.longitude - lng * rad) / 2) ** 2;
  const d = 2 * 6371 * Math.asin(Math.sqrt(h));
  if (d <= sat.halfKm) { if (!run || d < run.d) run = { t, d }; }
  else if (run) { want.push(run.t); run = null; }
}
if (run) want.push(run.t);

console.log(got.length, 'passes in', ms.toFixed(0), 'ms; brute force', want.length);
if (got.length !== want.length) throw new Error(`${got.length} passes, want ${want.length}`);
got.forEach((p, i) => { if (Math.abs(p.t - want[i]) > 10e3 || p.distKm > sat.halfKm) throw new Error(`pass ${i}: ${new Date(p.t).toISOString()}`); });
const first = nextOverhead([sat], lat, lng, from, to - from);
if (!first || first.t !== got[0].t) throw new Error('nextOverhead disagrees with the first pass');
if (passesOver([sat], 80, 0, from, to).length) throw new Error('ISS (51.6 deg) over 80N?');
