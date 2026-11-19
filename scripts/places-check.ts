// node --experimental-strip-types scripts/places-check.ts
// Coordinates as people type them, and what isn't coordinates.
import { parseLatLng } from '../src/places.ts';
const ok: Array<[string, number, number]> = [
  ['43.60, 1.44', 43.6, 1.44], ['43.60 1.44', 43.6, 1.44], ['43.6;1.44', 43.6, 1.44], ['43.60°N 1.44°E', 43.6, 1.44],
  ['1.44°E, 43.60°N', 43.6, 1.44], ['43.6 N, 1.44 W', 43.6, -1.44], ['-33.92, 18.42', -33.92, 18.42], ['33.92S 18.42E', -33.92, 18.42],
  ['  45.55 , 18.69 ', 45.55, 18.69]
];
for (const [q, lat, lng] of ok) {
  const p = parseLatLng(q);
  if (!p || Math.abs(p.lat - lat) > 1e-9 || Math.abs(p.lng - lng) > 1e-9) throw new Error(`${q}: ${JSON.stringify(p)}, want ${lat}, ${lng}`);
}
for (const q of ['sentinel-2a', 'Toulouse', '43.6', '95, 10', '10, 200', '43N 44S', '1.44E 2.3W', 'yam-16 2']) {
  if (parseLatLng(q)) throw new Error(`${q}: coordinates?`);
}
console.log(ok.length, 'parsed, 8 rejected');
