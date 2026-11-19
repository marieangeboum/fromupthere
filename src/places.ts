// Places typed in the search: coordinates as people write them. "43.60, 1.44", "43.60 1.44", "43.60°N 1.44°E",
// "1.44°E, 43.60°N" (letters fix the order), "-33.9, 18.4". Without letters, latitude comes first.

const NUM = String.raw`([+-]?\d+(?:\.\d+)?)\s*°?\s*([NSEW])?`;
const PAIR = new RegExp(String.raw`^\s*${NUM}\s*[,;\s]\s*${NUM}\s*$`, 'i');

/** The place in q, or null if q isn't a pair of coordinates in range. */
export function parseLatLng(q: string): { lat: number; lng: number } | null {
  const m = PAIR.exec(q);
  if (!m) return null;
  const parts = [[+m[1], m[2]?.toUpperCase()], [+m[3], m[4]?.toUpperCase()]] as Array<[number, string | undefined]>;
  const signed = ([v, h]: [number, string | undefined]) => (h === 'S' || h === 'W' ? -Math.abs(v) : v);
  const isLng = (h?: string) => h === 'E' || h === 'W', isLat = (h?: string) => h === 'N' || h === 'S';
  if (isLat(parts[0][1]) && isLat(parts[1][1]) || isLng(parts[0][1]) && isLng(parts[1][1])) return null; // two latitudes
  const [a, b] = isLng(parts[0][1]) || isLat(parts[1][1]) ? [parts[1], parts[0]] : parts;
  const lat = signed(a), lng = signed(b);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

/** "43.60°N 1.44°E" */
export const formatLatLng = (lat: number, lng: number) =>
  `${Math.abs(lat).toFixed(2)}°${lat < 0 ? 'S' : 'N'} ${Math.abs(lng).toFixed(2)}°${lng < 0 ? 'W' : 'E'}`;
