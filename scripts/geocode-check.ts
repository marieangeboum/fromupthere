// node --experimental-strip-types scripts/geocode-check.ts
// Typed coordinates in the search: lat first, comma, semicolon or space between; out of range or anything else: none.
import { parseLatLng, fmtLatLng } from '../src/geocode.ts';
const ok: [string, number, number][] = [['43.60, 1.44', 43.6, 1.44], ['43.6 1.44', 43.6, 1.44], ['-33.87,151.21', -33.87, 151.21], [' 0;0 ', 0, 0], ['90 -180', 90, -180]];
for (const [q, lat, lng] of ok) {
  const p = parseLatLng(q);
  if (p?.lat !== lat || p?.lng !== lng) throw new Error(`${q}: ${JSON.stringify(p)}`);
}
for (const q of ['Toulouse', '43.6', '91, 0', '0, 181', 'Sentinel 2', '43.6, 1.44, 3']) if (parseLatLng(q)) throw new Error(`${q}: not coordinates`);
if (fmtLatLng(-33.87, -70.5) !== '33.87°S 70.50°W') throw new Error(fmtLatLng(-33.87, -70.5));
console.log('ok');
