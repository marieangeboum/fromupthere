// Passes over a place: a right click on the map lists when the imaging constellation on view covers it in the next
// days (from the view's clock), and how many times. Optical imagers: daylight passes only, unless "Day only" is
// turned off (night ones then dimmed). A click on a pass jumps the clock to 2 min before it.
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { DeckSatelliteTracker } from '../deck-satellite-tracker';

const PERIODS = [7, 30, 90], LEAD_MS = 2 * 60e3;
const fmtDay = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

export class RevisitsPanel {
  private el = document.createElement('div');
  private site: { lat: number; lng: number } | null = null;
  private days = 30;
  private dayOnly = true;
  private run = 0; // a newer request supersedes a slower one still computing

  constructor(map: MapLibreMap, private tracker: DeckSatelliteTracker) {
    this.el.id = 'revisits';
    this.el.hidden = true;
    document.body.append(this.el);
    map.on('contextmenu', e => {
      e.preventDefault();
      this.site = { lat: e.lngLat.lat, lng: e.lngLat.lng };
      this.refresh();
    });
    this.el.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (b.dataset.close !== undefined) { this.el.hidden = true; this.site = null; }
      else if (b.dataset.days) { this.days = +b.dataset.days; this.refresh(); }
      else if (b.dataset.dayOnly !== undefined) { this.dayOnly = !this.dayOnly; this.refresh(); }
      else if (b.dataset.t) this.tracker.setSimTime(+b.dataset.t - LEAD_MS);
    });
  }

  private async refresh() {
    if (!this.site) return;
    const { lat, lng } = this.site, run = ++this.run;
    const place = `${Math.abs(lat).toFixed(2)}°${lat < 0 ? 'S' : 'N'} ${Math.abs(lng).toFixed(2)}°${lng < 0 ? 'W' : 'E'}`;
    const group = this.tracker.viewedImagers();
    this.el.hidden = false;
    if (!group) {
      this.render(place, '<p class="rv-note">Show an imaging constellation, or track one of its satellites, to list its passes here.</p>');
      return;
    }
    this.render(`${place} · ${group.name}`, '<p class="rv-note">Computing passes…</p>');
    const from = this.tracker.viewNow();
    const r = await this.tracker.passesOver(group.id, lat, lng, this.days, from);
    if (run !== this.run) return;
    const days = new Set(r.passes.filter(p => p.lit).map(p => fmtDay.format(p.date))).size;
    const what = group.night ? 'passes' : 'daylight passes';
    const head = `<p class="rv-count"><b>${r.count}</b> ${what} on <b>${days}</b> days in ${this.days} days from ${fmtDay.format(from)}${
      group.night ? '' : ` <span>(${r.countDayAndNight} day and night)</span>`}</p>`;
    const shown = this.dayOnly ? r.passes.filter(p => p.lit) : r.passes;
    const rows = shown.map(p => `<button type="button" data-t="${p.t}"${p.lit ? '' : ' class="rv-night" title="Night: no optical image"'}>`
      + `<span>${fmtDay.format(p.date)}</span><span>${fmtTime.format(p.date)}</span>`
      + `<span>${p.name.replace(`${group.name} `, '')}</span><span>${Math.round(p.distKm)} km</span></button>`).join(''); // the group is in the title
    this.render(`${place} · ${group.name}`, head + `<div class="rv-list">${rows}</div>`, !group.night);
  }

  private render(title: string, body: string, optical = false) {
    const periods = PERIODS.map(d => `<button type="button" data-days="${d}"${d === this.days ? ' aria-pressed="true"' : ''}>${d} d</button>`).join('')
      + (optical ? `<button type="button" data-day-only aria-pressed="${this.dayOnly}">Day only</button>` : '');
    this.el.innerHTML = `<div class="rv-head"><span>${title}</span><button type="button" data-close aria-label="Close">×</button></div>`
      + `<div class="rv-periods">${periods}</div>${body}`
      + '<p class="rv-note">Nadir swath, clouds ignored; optical imagers count only when the sun is 10° up. Times in UTC.</p>';
  }
}
