// Satellites over a place: the times a satellite's ground track comes within halfKm of it (for an imager, its swath
// half-width: when it images the place). Ground point every 30 s (~200 km along the track); each pass's closest
// approach is bracketed by a local minimum of the distance, then refined to ~1 s. Far from the place, the scan jumps
// ahead: the ground point can't close the gap faster than GROUND_KMS.
import * as satellite from 'satellite.js';

export interface OverheadSat { id: string; tle1: string; tle2: string; halfKm: number }
export interface OverheadPass { id: string; t: number; distKm: number } // t: closest approach (ms)

const STEP_MS = 30e3, R = 6371, rad = Math.PI / 180;
const GROUND_KMS = 8.5; // ground point speed bound: ~7.5 km/s in LEO, plus the Earth's turn (0.46 km/s)

/** One satellite's passes over (lat, lng) in [from, to], in time order. Stops at a decayed or bad TLE. */
function* passes(s: OverheadSat, lat: number, lng: number, from: number, to: number): Generator<OverheadPass> {
  const rec = satellite.twoline2satrec(s.tle1, s.tle2);
  const d = (t: number) => {
    const pv = satellite.propagate(rec, new Date(t));
    if (!pv || typeof pv.position === 'boolean' || !pv.position) return NaN;
    const g = satellite.eciToGeodetic(pv.position, satellite.gstime(new Date(t)));
    const h = Math.sin((g.latitude - lat * rad) / 2) ** 2 + Math.cos(g.latitude) * Math.cos(lat * rad) * Math.sin((g.longitude - lng * rad) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(Math.min(1, h)));
  };
  let t0 = from - STEP_MS, d0 = d(t0), t1 = from, d1 = d(t1);
  while (t1 <= to && !Number.isNaN(d1)) { // NaN: decayed, or a bad TLE
    // Far away: jump to where the track is still at least a step's run outside the swath, then scan again
    const skip = ((d1 - s.halfKm) / GROUND_KMS) * 1e3 - STEP_MS;
    if (skip > STEP_MS) {
      t1 += skip; d1 = d(t1); t0 = t1 - STEP_MS; d0 = d(t0);
      continue;
    }
    const t2 = t1 + STEP_MS, d2 = d(t2);
    if (d1 <= d0 && d1 <= d2) {
      let a = t0, b = t2; // golden-section search for the closest approach in [t0, t2]
      while (b - a > 1e3) {
        const m1 = b - (b - a) * 0.618, m2 = a + (b - a) * 0.618;
        if (d(m1) < d(m2)) b = m2; else a = m1;
      }
      const t = Math.max(from, (a + b) / 2), dist = d(t);
      if (dist <= s.halfKm && t <= to) yield { id: s.id, t, distKm: dist };
    }
    t0 = t1; d0 = d1; t1 = t2; d1 = d2;
  }
}

/** First pass of any of sats over (lat, lng), within horizonMs of `from`. */
export function nextOverhead(sats: OverheadSat[], lat: number, lng: number, from = Date.now(), horizonMs = 24 * 3600e3): OverheadPass | null {
  let best: OverheadPass | null = null;
  for (const s of sats) {
    const end = Math.min(from + horizonMs, best ? best.t : Infinity); // later than the best so far: no need to look
    const p = passes(s, lat, lng, from, end).next();
    if (!p.done) best = p.value;
  }
  return best;
}

/** Every pass of sats over (lat, lng) in [from, to], in time order. */
export function passesOver(sats: OverheadSat[], lat: number, lng: number, from: number, to: number): OverheadPass[] {
  return sats.flatMap(s => [...passes(s, lat, lng, from, to)]).sort((a, b) => a.t - b.t);
}

/** A satellite's ground track ([lng, lat] degrees) from t0 to t1, a point every stepMs; empty past a decayed TLE. */
export function groundTrack(s: OverheadSat, t0: number, t1: number, stepMs: number): number[][] {
  const rec = satellite.twoline2satrec(s.tle1, s.tle2), out: number[][] = [];
  for (let t = t0; t <= t1; t += stepMs) {
    const pv = satellite.propagate(rec, new Date(t));
    if (!pv || typeof pv.position === 'boolean' || !pv.position) return [];
    const g = satellite.eciToGeodetic(pv.position, satellite.gstime(new Date(t)));
    out.push([g.longitude / rad, g.latitude / rad]);
  }
  return out;
}
