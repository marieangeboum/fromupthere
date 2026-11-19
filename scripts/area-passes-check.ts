// node --experimental-strip-types scripts/area-passes-check.ts
// Passes over an area against passes over each of its sample points: ten days of ISS over a 60 x 40 km field around
// Toulouse (with a hole), half-swaths 16, 50 and 145 km. A pass touches the area when it is over at least one point,
// and its share is the fraction of points it's over (the point scan is checked against a brute force elsewhere).
import { passesOver } from '../src/next-overhead.ts';
import { sampleArea, areaPassesOver } from '../src/area.ts';
const tle1 = '1 25544U 98067A   25216.88307209  .00003454  00000+0  67688-4 0  9997';
const tle2 = '2 25544  51.6362  65.7123 0001818 143.6625 298.7323 15.50331059522717';
const from = Date.UTC(2025, 7, 5), to = from + 10 * 86400e3;
const field = [[[1.1, 43.4], [1.85, 43.4], [1.85, 43.76], [1.1, 43.76], [1.1, 43.4]], [[1.4, 43.5], [1.5, 43.5], [1.5, 43.6], [1.4, 43.6], [1.4, 43.5]]];
const area = sampleArea([field]);
if (area.points.some(([x, y]) => x > 1.4 && x < 1.5 && y > 43.5 && y < 43.6)) throw new Error('a point in the hole');
console.log(area.points.length, 'points, radius', area.radiusKm.toFixed(0), 'km');

for (const halfKm of [16, 50, 145]) {
  const sat = { id: 'iss', tle1, tle2, halfKm };
  const t0 = performance.now();
  const got = areaPassesOver([sat], area, from, to);
  const ms = performance.now() - t0;
  // Per point: its passes, grouped across points when within 10 min of each other (one pass of the ISS)
  const times = area.points.flatMap(([lng, lat]) => passesOver([sat], lat, lng, from, to).map(p => p.t)).sort((a, b) => a - b);
  const want: Array<{ t: number; n: number }> = [];
  for (const t of times) {
    const last = want[want.length - 1];
    if (last && t - last.t < 10 * 60e3) last.n++; else want.push({ t, n: 1 });
  }
  console.log(`±${halfKm} km:`, got.length, 'passes in', ms.toFixed(0), 'ms; per point', want.length, '| shares', got.map(p => p.share.toFixed(2)).join(' '));
  if (got.length !== want.length) throw new Error(`±${halfKm} km: ${got.length} passes, want ${want.length}`);
  got.forEach((p, i) => {
    const share = want[i].n / area.points.length;
    if (Math.abs(p.t - want[i].t) > 10 * 60e3 || Math.abs(p.share - share) > 0.02) throw new Error(`±${halfKm} km, pass ${i}: share ${p.share} want ${share}`);
  });
}
// A field smaller than a grid cell still has points (its corners and centre), and the same passes as its centre
const plot = sampleArea([[[[1.5, 43.53], [1.5002, 43.53], [1.5002, 43.5302], [1.5, 43.5302], [1.5, 43.53]]]]);
const sat = { id: 'iss', tle1, tle2, halfKm: 50 };
const a = areaPassesOver([sat], plot, from, to), b = passesOver([sat], plot.centre[1], plot.centre[0], from, to);
if (!plot.points.length || a.length !== b.length) throw new Error(`plot: ${a.length} passes, ${b.length} over its centre`);
