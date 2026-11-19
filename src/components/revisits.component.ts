// Passes over a place: a right click on the map lists when the imaging constellation on view covers it in the next
// days (from the view's clock), and how many times. Optical imagers: daylight passes only, unless "Day only" is
// turned off (night ones then dimmed). Each pass shows the cloud cover there at that hour (Open-Meteo's models, where
// they reach: ~2 months back, 16 days ahead); Sentinel-2's past passes show their image's own instead (Earth Search),
// or that there is none. A click on a pass jumps the clock to 2 min before it.
import { Marker, type Map as MapLibreMap } from 'maplibre-gl';
import type { Constellation } from '../config/satellites';
import type { DeckSatelliteTracker } from '../deck-satellite-tracker';
import { fmtLatLng } from '../geocode';
import { cloudCover, cloudAt } from '../clouds';
import { s2Scenes, sceneAt, Scene } from '../scenes';
import { sampleArea, type AreaSample } from '../area';
import { readAreaFile } from '../area-file';

const PERIODS = [7, 30, 90], LEAD_MS = 2 * 60e3;
const fmtDay = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
const cloud = (c?: number) => (c === undefined ? '<i title="No cloud data for that hour">–</i>' : `<i title="Cloud cover (model)">${Math.round(c)}%</i>`);
const image = (s?: Scene) => (s ? `<i class="rv-img" title="The image: cloudy share of its tile">${Math.round(s.cloud)}%</i>` : '<i title="No image in Earth Search">none</i>');
type Passes = Awaited<ReturnType<DeckSatelliteTracker['passesOver']>>;

export class RevisitsPanel {
  private el = document.createElement('div');
  private pin = new Marker({ color: '#00d6ff' }); // the place, while the panel is open
  private site: { lat: number; lng: number; name?: string; area?: AreaSample } | null = null;
  private days = 30;
  private dayOnly = true;
  private run = 0; // a newer request supersedes a slower one still computing
  private shown: { title: string; group: Constellation; from: number; r: Passes; clouds: Map<number, number>; scenes: Scene[] | null } | null = null; // last result, for "Day only"

  constructor(private map: MapLibreMap, private tracker: DeckSatelliteTracker) {
    this.el.id = 'revisits';
    this.el.hidden = true;
    document.body.append(this.el);
    // On the container, not map.on('contextmenu'): in the flat view the deck.gl canvas sits on top of MapLibre's and
    // takes the clicks. Canvases only, so a right click on a control keeps the browser's menu.
    const box = map.getContainer();
    box.addEventListener('contextmenu', e => {
      if (!(e.target instanceof HTMLCanvasElement)) return;
      e.preventDefault();
      const r = box.getBoundingClientRect(), ll = map.unproject([e.clientX - r.left, e.clientY - r.top]);
      this.open(ll.lat, ll.lng);
    });
    // A GeoJSON dropped on the map: its area, drawn, and the passes over it
    box.addEventListener('dragover', e => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
    box.addEventListener('drop', async e => {
      const file = e.dataTransfer?.files[0];
      if (!file) return;
      e.preventDefault();
      try { this.openArea(await readAreaFile(file)); } catch (err) { this.notice((err as Error).message); }
    });
    this.el.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (b.dataset.close !== undefined) { this.el.hidden = true; this.site = null; this.run++; this.pin.remove(); this.drawArea(null); }
      else if (b.dataset.days) { this.days = +b.dataset.days; this.refresh(); }
      else if (b.dataset.dayOnly !== undefined) { this.dayOnly = !this.dayOnly; this.draw(); } // a filter: no new scan
      else if (b.dataset.t) this.tracker.setSimTime(+b.dataset.t - LEAD_MS);
    });
  }

  /** The passes over (lat, lng), pinned on the map; `name`: a searched place's, before its coordinates in the title */
  open(lat: number, lng: number, name?: string) {
    this.site = { lat, lng, name };
    this.pin.setLngLat([lng, lat]).addTo(this.map);
    this.drawArea(null);
    this.refresh();
  }

  /** The passes over an area (a dropped file's polygons): drawn on the map, flown to, its share under each pass */
  openArea({ name, polygons }: { name: string; polygons: number[][][][] }) {
    const area = sampleArea(polygons), [lng, lat] = area.centre;
    this.site = { lat, lng, name, area };
    this.pin.remove();
    this.drawArea(polygons);
    // Frame it: its diameter over ~1/3 of the view's width (zoom 0: 512 px for the Earth's 40 075 km)
    const fit = Math.log2((40075 * Math.cos(lat * Math.PI / 180) * this.map.getContainer().clientWidth) / (512 * 6 * Math.max(area.radiusKm, 0.05)));
    this.tracker.flyToPlace(lat, lng, Math.min(16, Math.max(3, fit)));
    this.refresh();
  }

  private drawArea(polygons: number[][][][] | null) {
    const data = { type: 'Feature' as const, properties: {}, geometry: { type: 'MultiPolygon' as const, coordinates: polygons ?? [] } };
    const src = this.map.getSource('revisits-area') as import('maplibre-gl').GeoJSONSource | undefined;
    if (src) { src.setData(data); return; }
    if (!polygons) return;
    this.map.addSource('revisits-area', { type: 'geojson', data });
    this.map.addLayer({ id: 'revisits-area-fill', type: 'fill', source: 'revisits-area', paint: { 'fill-color': '#00d6ff', 'fill-opacity': 0.15 } });
    this.map.addLayer({ id: 'revisits-area-line', type: 'line', source: 'revisits-area', paint: { 'line-color': '#00d6ff', 'line-width': 2 } });
  }

  private notice(text: string) { // a file that isn't an area: say why, in the panel
    this.el.hidden = false;
    this.el.innerHTML = `<div class="rv-head"><span>Area</span><button type="button" data-close aria-label="Close">×</button></div>`
      + `<p class="rv-note">${text.replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`)}</p>`;
  }

  private async refresh() {
    if (!this.site) return;
    const { lat, lng, name, area } = this.site, run = ++this.run;
    const place = (name ? `${name.replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`)} ` : '') + fmtLatLng(lat, lng); // a geocoder's name: text, not HTML
    const group = this.tracker.viewedImagers();
    this.el.hidden = false;
    this.shown = null;
    if (!group) {
      this.render(place, '<p class="rv-note">Show an imaging constellation, or track one of its satellites, to list its passes here.</p>');
      return;
    }
    const title = `${place} · ${group.name}`;
    this.render(title, '<p class="rv-note">Computing passes…</p>');
    // The scan blocks the main thread (seconds for big constellations): let the note paint first
    await new Promise(r => requestAnimationFrame(() => setTimeout(r)));
    if (run !== this.run) return;
    const from = this.tracker.clockNow(), to = from + this.days * 86400e3;
    // Clouds: requested before the scan, and never in the way of the passes if they fail
    const clouds = cloudCover(lat, lng).catch(() => new Map<number, number>());
    const scenes = group.id === 'sentinel-2' && from < Date.now() // its images so far
      ? s2Scenes(lat, lng, from, Math.min(Date.now(), to)).catch(() => null) : Promise.resolve(null);
    try {
      const r = await this.tracker.passesOver(group.id, lat, lng, this.days, from, area);
      const [c, s] = await Promise.all([clouds, scenes]);
      if (run !== this.run) return;
      this.shown = { title, group, from, r, clouds: c, scenes: s };
      this.draw();
    } catch (err) {
      if (run !== this.run) return;
      console.warn('Passes over', place, err);
      this.render(title, '<p class="rv-note">Couldn\'t load this constellation\'s orbits. Try again.</p>');
    }
  }

  private draw() {
    if (!this.shown) return;
    const { title, group, from, r, clouds, scenes } = this.shown, now = Date.now();
    const days = new Set(r.passes.filter(p => p.lit).map(p => fmtDay.format(p.date))).size;
    const what = group.night ? 'passes' : 'daylight passes';
    const head = `<p class="rv-count"><b>${r.count}</b> ${what} on <b>${days}</b> days in ${this.days} days from ${fmtDay.format(from)}${
      group.night ? '' : ` <span>(${r.countDayAndNight} day and night)</span>`}</p>`;
    const shown = this.dayOnly ? r.passes.filter(p => p.lit) : r.passes;
    const rows = shown.map(p => `<button type="button" data-t="${p.t}"${p.lit ? '' : ' class="rv-night" title="Night: no optical image"'}>`
      + `<span>${fmtDay.format(p.date)}</span><span>${fmtTime.format(p.date)}</span>`
      + `<span>${p.name.replace(`${group.name} `, '')}</span>` // the group is in the title
      + `<span>${scenes && p.t < now ? image(sceneAt(scenes, p.id, p.t)) : cloud(cloudAt(clouds, p.t))}</span>`
      + ('share' in p ? `<span title="Share of the area under the swath">${p.share === 1 ? 'all' : `${Math.max(1, Math.round((p.share as number) * 100))}% in`}</span>` // an area
        : `<span>${Math.round(p.distKm)} km</span>`) + '</button>').join('');
    this.render(title, head + `<div class="rv-list">${rows}</div>`, !group.night);
  }

  private render(title: string, body: string, optical = false) {
    const periods = PERIODS.map(d => `<button type="button" data-days="${d}"${d === this.days ? ' aria-pressed="true"' : ''}>${d} d</button>`).join('')
      + (optical ? `<button type="button" data-day-only aria-pressed="${this.dayOnly}">Day only</button>` : '');
    this.el.innerHTML = `<div class="rv-head"><span>${title}</span><button type="button" data-close aria-label="Close">×</button></div>`
      + `<div class="rv-periods">${periods}</div>${body}`
      + '<p class="rv-note">Nadir swath; optical imagers count only when the sun is 10° up. Clouds: Open-Meteo\'s models at that hour '
      + '(forecast up to 16 days ahead), not the image\'s own; <b>bold</b>: a Sentinel-2 image\'s own (cloudy share of its tile). Times in UTC.</p>';
  }
}
