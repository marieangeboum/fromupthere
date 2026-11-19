// node --experimental-strip-types scripts/passes-over-check.ts
// Ten days of ISS passes over Toulouse with half-swaths of 16 to 1000 km: the same passes as a brute-force scan every
// 1 s (the jumps far from the place skip none), each at the same time within 5 s; the first one is nextOverhead's.
import * as satellite from 'satellite.js';
import { nextOverhead, passesOver } from '../src/next-overhead.ts';
const tle1 = '1 25544U 98067A   25216.88307209  .00003454  00000+0  67688-4 0  9997';
const tle2 = '2 25544  51.6362  65.7123 0001818 143.6625 298.7323 15.50331059522717';
const lat = 43.6, lng = 1.44, from = Date.UTC(2025, 7, 5), to = from + 10 * 86400e3;

// Brute force: the ground track's distance to the place every second, once for all swaths
const rec = satellite.twoline2satrec(tle1, tle2), rad = Math.PI / 180;
const dist: number[] = [];
for (let t = from; t <= to; t += 1e3) {
  const pv = satellite.propagate(rec, new Date(t));
  const g = satellite.eciToGeodetic(pv.position as satellite.EciVec3<number>, satellite.gstime(new Date(t)));
  const h = Math.sin((g.latitude - lat * rad) / 2) ** 2 + Math.cos(g.latitude) * Math.cos(lat * rad) * Math.sin((g.longitude - lng * rad) / 2) ** 2;
  dist.push(2 * 6371 * Math.asin(Math.sqrt(h)));
}

for (const halfKm of [16, 50, 145, 1000]) {
  const sat = { id: 'iss', tle1, tle2, halfKm };
  const t0 = performance.now();
  const got = passesOver([sat], lat, lng, from, to);
  const ms = performance.now() - t0;
  // Runs of samples inside the swath, each pass at its closest sample
  const want: number[] = [];
  let run: { i: number; d: number } | null = null;
  dist.forEach((d, i) => {
    if (d <= halfKm) { if (!run || d < run.d) run = { i, d }; }
    else if (run) { want.push(from + run.i * 1e3); run = null; }
  });
  if (run) want.push(from + (run as { i: number }).i * 1e3);

  console.log(`±${halfKm} km:`, got.length, 'passes in', ms.toFixed(0), 'ms; brute force', want.length);
  if (got.length !== want.length) throw new Error(`±${halfKm} km: ${got.length} passes, want ${want.length}`);
  got.forEach((p, i) => { if (Math.abs(p.t - want[i]) > 5e3 || p.distKm > halfKm) throw new Error(`±${halfKm} km, pass ${i}: ${new Date(p.t).toISOString()}`); });
  const first = nextOverhead([sat], lat, lng, from, to - from);
  if (got.length && (!first || first.t !== got[0].t)) throw new Error(`±${halfKm} km: nextOverhead disagrees with the first pass`);
}
if (passesOver([{ id: 'iss', tle1, tle2, halfKm: 500 }], 80, 0, from, to).length) throw new Error('ISS (51.6 deg) over 80N?');
