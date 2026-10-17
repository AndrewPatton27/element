// NASA news releases (RSS, no key) -> RawItem, category science.
// Only items whose link starts with https://www.nasa.gov/news-release/ are used: the feed also
// carries APOD and image articles (third-party images, thin captions). The AI sees the release
// text from the feed's content:encoded with figures, captions and images removed (rule 9).
// No page is downloaded; www.nasa.gov is on the API host list only. NASA text is "generally not
// subject to copyright in the United States" (VERIFIED 2026-10-17); no NASA logo, no endorsement.

import { config } from '../config.ts';
import { blocks, htmlToText, tagText } from '../html.ts';
import type { RawItem } from '../types.ts';

export interface NasaItem {
  title: string;
  link: string;
  pubDate: string;                   // ISO
  content: string;                   // plain text of content:encoded (no figures or captions)
}

/** Release HTML -> plain text without figures, captions, images or scripts. */
export function nasaReleaseText(html: string, maxChars: number = config.sourceTextMaxChars): string {
  const cleaned = html
    .replace(/<figure\b[\s\S]*?<\/figure>/gi, ' ')
    .replace(/<figcaption\b[\s\S]*?<\/figcaption>/gi, ' ')
    .replace(/<(img|svg|picture|video|iframe)\b[\s\S]*?(<\/\1>|\/?>)/gi, ' ');
  return htmlToText(cleaned, maxChars).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parseNasaRss(xml: string): NasaItem[] {
  return blocks(xml, 'item').map((it) => ({
    title: tagText(it, 'title') ?? '',
    link: (tagText(it, 'link') ?? '').trim(),
    pubDate: new Date(tagText(it, 'pubDate') ?? '').toISOString(),
    content: nasaReleaseText(tagText(it, 'content:encoded') ?? ''),
  })).filter((i) => i.title && i.link);
}

/** News releases only (link prefix), within maxAgeDays, newest first. */
export function selectNasaReleases(items: NasaItem[], now: Date): NasaItem[] {
  const oldest = now.getTime() - config.nasa.maxAgeDays * 86_400_000;
  return items
    .filter((i) => i.link.startsWith(config.nasa.linkPrefix))
    .filter((i) => Date.parse(i.pubDate) >= oldest)
    .sort((a, b) => Date.parse(b.pubDate) - Date.parse(a.pubDate));
}

export function nasaToItem(i: NasaItem, now: Date): RawItem {
  return {
    source: 'nasa',
    external_id: i.link,
    url: i.link,
    title: i.title,
    published_at: new Date(Math.min(Date.parse(i.pubDate), now.getTime())).toISOString(),
    license_class: 'public_domain',
    category: config.nasa.category,
    event_type: config.nasa.eventType,
    tickers: [],
    source_name: 'NASA',
    source_kind: 'government',
    doc_label: 'News release',
    summary_text: `${i.title}. ${i.content}`.slice(0, config.sourceTextMaxChars),   // the ONLY text the AI sees
    attribution: config.nasa.attribution,
  };
}
