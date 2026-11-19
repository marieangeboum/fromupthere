// An area from a file dropped on the map: its polygons ([lng, lat], WGS 84) and a name. GeoJSON: a FeatureCollection,
// a Feature or a bare geometry; Polygons and MultiPolygons (in GeometryCollections too) count, everything else is left
// out. All of a file's polygons make one area (a trial's plots, say).
import type { Polygon } from './area';

export interface AreaFile { name: string; polygons: Polygon[] }

function polygonsOf(g: any): Polygon[] {
  if (!g) return [];
  switch (g.type) {
    case 'FeatureCollection': return (g.features ?? []).flatMap((f: any) => polygonsOf(f));
    case 'Feature': return polygonsOf(g.geometry);
    case 'GeometryCollection': return (g.geometries ?? []).flatMap((x: any) => polygonsOf(x));
    case 'Polygon': return [g.coordinates];
    case 'MultiPolygon': return g.coordinates;
    default: return [];
  }
}

/** The area in a GeoJSON file; throws with a reason a person can act on. */
export async function readAreaFile(file: File): Promise<AreaFile> {
  const name = file.name.replace(/\.(geo)?json$/i, '');
  if (!/\.(geo)?json$/i.test(file.name)) throw new Error(`${file.name}: drop a .geojson or .json file`);
  let g: any;
  try { g = JSON.parse(await file.text()); } catch { throw new Error(`${file.name}: not valid JSON`); }
  const polygons = polygonsOf(g).filter(p => p?.[0]?.length >= 4);
  if (!polygons.length) throw new Error(`${file.name}: no polygon in it`);
  const crs = g.crs?.properties?.name as string | undefined; // GeoJSON is WGS 84; an old-style crs member says otherwise
  if (crs && !/CRS84|4326/.test(crs)) throw new Error(`${file.name}: in ${crs}, not longitude/latitude (WGS 84)`);
  const off = polygons.flat(2).some(([x, y]) => Math.abs(x) > 180 || Math.abs(y) > 90);
  if (off) throw new Error(`${file.name}: coordinates aren't longitude/latitude (WGS 84)`);
  return { name, polygons };
}
