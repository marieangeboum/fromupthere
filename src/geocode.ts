// Places for the search: typed coordinates ("43.60, 1.44" or "43.60 1.44", lat first), or a place name from Photon
// (komoot's OpenStreetMap geocoder: no key, made for search-as-you-type).
export interface Place { lat: number; lng: number; name: string; detail: string }

export function parseLatLng(q: string): { lat: number; lng: number } | null {
  const m = q.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = +m[1], lng = +m[2];
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

export function fmtLatLng(lat: number, lng: number): string {
  return `${Math.abs(lat).toFixed(2)}°${lat < 0 ? 'S' : 'N'} ${Math.abs(lng).toFixed(2)}°${lng < 0 ? 'W' : 'E'}`;
}

interface PhotonFeature { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> }

export async function searchPlaces(q: string, limit = 4): Promise<Place[]> {
  const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=${limit}`);
  if (!res.ok) return [];
  const { features } = await res.json() as { features: PhotonFeature[] };
  return features.map(({ geometry: { coordinates: [lng, lat] }, properties: p }) => ({
    lat, lng, name: p.name ?? fmtLatLng(lat, lng),
    detail: [p.city !== p.name ? p.city : undefined, p.state, p.country].filter(Boolean).join(', ')
  }));
}
