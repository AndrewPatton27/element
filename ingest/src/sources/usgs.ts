// USGS significant earthquakes (GeoJSON, no key) -> template card (no AI), category science.
// Public domain ("USGS-authored or produced data and information are considered to be in the
// U.S. Public Domain"). Credit: U.S. Geological Survey. No page is downloaded.

import { config } from '../config.ts';
import type { RawItem, SummaryDraft } from '../types.ts';

export interface UsgsFeature {
  id: string;
  properties: {
    mag?: number | null;
    place?: string | null;
    time?: number | null;            // epoch ms
    url?: string | null;             // event page
    alert?: string | null;           // green | yellow | orange | red | null
    tsunami?: number | null;         // 1 = oceanic region flag (not a warning)
    title?: string | null;
    type?: string | null;
  };
}

export function parseUsgsGeoJson(text: string): UsgsFeature[] {
  let j: unknown;
  try { j = JSON.parse(text); } catch { throw new Error('usgs: response is not JSON'); }
  const f = (j as { features?: unknown })?.features;
  if (!Array.isArray(f)) throw new Error('usgs: no features list');
  return f.filter((x): x is UsgsFeature => !!x && typeof x.id === 'string' && !!x.properties);
}

export type UsgsSkipReason = 'bad_url' | 'too_old' | 'no_data';

export function usgsToItem(f: UsgsFeature, now: Date): { item: RawItem } | { skip: UsgsSkipReason } {
  const p = f.properties;
  if (typeof p.mag !== 'number' || !p.time || !p.title) return { skip: 'no_data' };
  if (p.time < now.getTime() - config.usgs.maxAgeDays * 86_400_000) return { skip: 'too_old' };
  let url: URL;
  try { url = new URL(p.url ?? ''); } catch { return { skip: 'bad_url' }; }
  if (url.protocol !== 'https:' || url.hostname !== 'earthquake.usgs.gov') return { skip: 'bad_url' };
  return {
    item: {
      source: 'usgs',
      external_id: f.id,
      url: url.toString(),
      title: p.title,
      published_at: new Date(Math.min(p.time, now.getTime())).toISOString(),
      license_class: 'public_domain',
      category: config.usgs.category,
      event_type: config.usgs.eventType,
      tickers: [],
      source_name: config.usgs.sourceName,
      source_kind: 'government',
      doc_label: 'Earthquake',
      summary_text: JSON.stringify({ mag: p.mag, place: p.place ?? null, time: p.time, alert: p.alert ?? null, tsunami: p.tsunami ?? 0 }),
      attribution: config.usgs.attribution,
    },
  };
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Template card text from the event data (no AI). */
export function usgsDraft(it: RawItem): SummaryDraft {
  const d = JSON.parse(it.summary_text) as { mag: number; place: string | null; time: number; alert: string | null; tsunami: number };
  const t = new Date(d.time);
  const when = `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')} UTC on ${MON[t.getUTCMonth()]} ${t.getUTCDate()}`;
  const where = d.place ? (/^\d/.test(d.place) ? d.place : `in the ${d.place}`) : 'at an unnamed location';
  const parts = [`A magnitude ${d.mag.toFixed(1)} earthquake struck ${where} at ${when}.`];
  if (d.alert) parts.push(`USGS alert level: ${d.alert}.`);
  if (d.tsunami === 1) parts.push('It was in an ocean region; official tsunami warnings come from tsunami.gov.');
  return {
    headline: it.title.length > config.headlineMaxChars ? it.title.slice(0, config.headlineMaxChars - 1) + '…' : it.title,
    body: parts.join(' '),
    category: it.category,
    event_type: it.event_type,
    tickers: [],
  };
}
