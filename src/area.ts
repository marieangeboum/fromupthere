// Passes over an area (polygons, from a GeoJSON or a shapefile): a pass counts when its swath touches the area, and
// comes with the share of the area under it. The area is sampled: a grid of up to ~300 points inside it (each standing
// for the same ground), or, for an area smaller than a grid cell, its vertices and centre. Candidates are the passes
// over its centre with the swath widened by the area's radius; for each, a sample point is under the swath when it lies
// within halfKm of the ground track (5 s segments, ~35 km, measured on a plane tangent at the point).
import { passesOver, groundTrack, type OverheadSat } from './next-overhead.ts'; // .ts: the check script runs it in Node

export type Polygon = number[][][]; // [lng, lat] rings: the outer one, then holes
export interface AreaSample { centre: [number, number]; radiusKm: number; points: number[][] }
export interface AreaPass { id: string; t: number; distKm: number; share: number } // distKm: the track to the centre

const R = 6371, rad = Math.PI / 180, GRID = 18, TRACK_STEP_MS = 5e3, TRACK_KMS = 6.5; // ground speed lower bound

const km = (a: number[], b: number[]) => {
  const h = Math.sin((b[1] - a[1]) * rad / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin((b[0] - a[0]) * rad / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, h)));
};
const inRing = (p: number[], ring: number[][]) => { // ray casting
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const inPolygon = (p: number[], poly: Polygon) => inRing(p, poly[0]) && !poly.slice(1).some(h => inRing(p, h));

/** Sample points standing for the area, its centre and its radius (km, centre to the farthest vertex). */
export function sampleArea(polygons: Polygon[]): AreaSample {
  const vertices = polygons.flatMap(p => p[0]);
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of vertices) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  const points: number[][] = [];
  for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) {
    const p = [w + ((i + 0.5) * (e - w)) / GRID, s + ((j + 0.5) * (n - s)) / GRID];
    if (polygons.some(poly => inPolygon(p, poly))) points.push(p);
  }
  if (points.length === 0) points.push(...vertices, [(w + e) / 2, (s + n) / 2]); // smaller than a grid cell
  const centre: [number, number] = [points.reduce((a, p) => a + p[0], 0) / points.length, points.reduce((a, p) => a + p[1], 0) / points.length];
  return { centre, radiusKm: Math.max(0, ...vertices.map(v => km(centre, v))), points };
}

/** Distance (km) from p to the segment a-b, on a plane tangent at p (fine for segments of tens of km). */
function toSegment(p: number[], a: number[], b: number[]) {
  const c = Math.cos(p[1] * rad), x = (q: number[]) => (((q[0] - p[0] + 540) % 360) - 180) * rad * R * c, y = (q: number[]) => (q[1] - p[1]) * rad * R;
  const ax = x(a), ay = y(a), dx = x(b) - ax, dy = y(b) - ay, l2 = dx * dx + dy * dy;
  const u = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
  return Math.hypot(ax + u * dx, ay + u * dy);
}

/** Every pass of sats whose swath touches the area in [from, to], in time order, with the share of the area it covers. */
export function areaPassesOver(sats: OverheadSat[], area: AreaSample, from: number, to: number): AreaPass[] {
  const [lng, lat] = area.centre, out: AreaPass[] = [];
  const wide = sats.map(s => ({ ...s, halfKm: s.halfKm + area.radiusKm }));
  for (const c of passesOver(wide, lat, lng, from, to)) {
    const s = sats.find(x => x.id === c.id)!, half = (area.radiusKm + s.halfKm) / TRACK_KMS * 1e3 + TRACK_STEP_MS;
    const track = groundTrack(s, c.t - half, c.t + half, TRACK_STEP_MS);
    let under = 0;
    for (const p of area.points) {
      for (let k = 0; k + 1 < track.length; k++) if (toSegment(p, track[k], track[k + 1]) <= s.halfKm) { under++; break; }
    }
    if (under) out.push({ id: c.id, t: c.t, distKm: c.distKm, share: under / area.points.length });
  }
  return out;
}
