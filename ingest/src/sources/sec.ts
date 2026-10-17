// SEC EDGAR: current 8-K Atom feed -> RawItem, plus the filing's primary document.
// Feed shape: one <entry> per filing; items are in <summary> as escaped HTML
// ("<br>Item 2.02: Results of Operations ...").

import type { CategorySlug, Exchange } from '../../../contract/types.ts';
import { config } from '../config.ts';
import { attr, blocks, decodeEntities, htmlToText, tagText } from '../html.ts';
import type { RawItem, TickerRef } from '../types.ts';

export interface Sec8kEntry {
  form: string;                      // "8-K" or "8-K/A"
  company_raw: string;               // "COSTCO WHOLESALE CORP /NEW"
  cik: string;                       // "0000909832"
  url: string;                       // filing index page
  filed: string | null;              // "2026-10-16"
  accession: string;
  updated: string;                   // ISO (acceptance time)
  items: { number: string; title: string }[];
  summary_text: string;              // plain text of <summary>
}

export function parseSec8kAtom(xml: string): Sec8kEntry[] {
  const out: Sec8kEntry[] = [];
  for (const e of blocks(xml, 'entry')) {
    const title = tagText(e, 'title') ?? '';
    const m = /^(8-K(?:\/A)?)\s+-\s+(.+?)\s+\((\d{10})\)\s+\(Filer\)\s*$/.exec(title);
    if (!m) continue;
    const url = attr(e, 'link', 'href', (t) => /rel="alternate"/.test(t)) ?? '';
    const summaryHtml = tagText(e, 'summary') ?? '';          // entities decoded once -> real HTML
    const summary_text = decodeEntities(summaryHtml.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').trim();
    const items = [...summary_text.matchAll(/Item (\d\.\d\d):\s*([^\n]+)/g)].map((x) => ({ number: x[1], title: x[2].trim() }));
    const idText = tagText(e, 'id') ?? '';
    out.push({
      form: attr(e, 'category', 'term') ?? m[1],
      company_raw: m[2],
      cik: m[3],
      url,
      filed: /Filed:\s*(\d{4}-\d{2}-\d{2})/.exec(summary_text)?.[1] ?? null,
      accession: /accession-number=([\d-]+)/.exec(idText)?.[1] ?? /AccNo:\s*([\d-]+)/.exec(summary_text)?.[1] ?? '',
      updated: new Date(tagText(e, 'updated') ?? '').toISOString(),
      items,
      summary_text,
    });
  }
  return out;
}

// ---- company names and tickers ------------------------------------------------

const KEEP_UPPER = new Set(['LLC', 'LP', 'LLP', 'PLC', 'NV', 'SA', 'AG', 'SE', 'II', 'III', 'IV', 'USA', 'US', 'REIT', 'ETF', 'AT&T', 'IBM']);

/** "COSTCO WHOLESALE CORP /NEW" -> "Costco Wholesale Corp". Mixed-case names are kept. */
export function displayCompanyName(raw: string): string {
  const name = raw.replace(/\s+\/[A-Z]{2,5}\/?\s*$/g, '').replace(/\s+\/[A-Z]{2,5}\/?\s*$/g, '').trim();
  if (name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (KEEP_UPPER.has(w.toUpperCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

export type TickerMap = Map<string, TickerRef>;   // key: 10-digit CIK

const EXCHANGES: Record<string, Exchange> = { nasdaq: 'Nasdaq', nyse: 'NYSE', 'nyse american': 'NYSE American', cboe: 'Cboe' };

/**
 * Parses SEC's company_tickers_exchange.json ({fields:[cik,name,ticker,exchange], data:[...]}).
 * Keeps only listed exchanges (NYSE, Nasdaq, NYSE American, Cboe); first ticker per CIK wins.
 */
export function parseTickerExchangeJson(json: string): TickerMap {
  const doc = JSON.parse(json) as { fields: string[]; data: unknown[][] };
  const f = (n: string) => doc.fields.indexOf(n);
  const [ci, ni, ti, ei] = [f('cik'), f('name'), f('ticker'), f('exchange')];
  const map: TickerMap = new Map();
  for (const row of doc.data) {
    const exch = EXCHANGES[String(row[ei] ?? '').toLowerCase()];
    if (!exch) continue;
    const cik = String(row[ci]).padStart(10, '0');
    if (!map.has(cik)) map.set(cik, { symbol: String(row[ti]), name: displayCompanyName(String(row[ni])), exchange: exch });
  }
  return map;
}

// ---- items -> category / event --------------------------------------------------

/** Most newsworthy item first. */
export const ITEM_PRIORITY = ['2.02', '1.01', '2.01', '5.02', '4.02', '3.01', '2.05', '2.06', '1.02', '7.01', '8.01'];

const ITEM_CLASS: Record<string, { category: CategorySlug; event_type: string | null }> = {
  '2.02': { category: 'earnings', event_type: 'earnings' },
  '1.01': { category: 'deals', event_type: 'deal' },
  '1.02': { category: 'deals', event_type: 'deal' },
  '2.01': { category: 'deals', event_type: 'deal' },
  '5.02': { category: 'markets', event_type: 'exec_change' },
};

export function primaryItem(items: { number: string }[]): string | null {
  const nums = new Set(items.map((i) => i.number));
  return ITEM_PRIORITY.find((n) => nums.has(n)) ?? null;
}

/**
 * Feed entry -> RawItem, or null if it is not a card candidate:
 * amendments, no tracked item, or (when a ticker map is given) not listed on a major exchange.
 */
export function secEntryToItem(e: Sec8kEntry, tickers: TickerMap | null): RawItem | null {
  if (e.form !== '8-K') return null;
  const tracked = e.items.filter((i) => (config.sec8kItems as readonly string[]).includes(i.number));
  const main = primaryItem(tracked);
  if (!main) return null;
  const t = tickers?.get(e.cik) ?? null;
  if (tickers && !t) return null;
  const cls = ITEM_CLASS[main] ?? { category: 'markets' as CategorySlug, event_type: null };
  const company = t?.name ?? displayCompanyName(e.company_raw);
  const sorted = [...e.items].sort((a, b) => {
    const pa = ITEM_PRIORITY.indexOf(a.number), pb = ITEM_PRIORITY.indexOf(b.number);
    return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
  });
  return {
    source: 'sec_8k',
    external_id: e.accession,
    url: e.url,
    title: `${company} 8-K`,
    published_at: e.updated,
    license_class: 'company_filing',
    category: cls.category,
    event_type: cls.event_type,
    tickers: t ? [t] : [],
    source_name: 'SEC',
    source_kind: 'filing',
    doc_label: 'Form 8-K',
    company,
    items: sorted,
    summary_text: `${company} Form 8-K. ${e.summary_text}`,
  };
}

// ---- filing index page -> primary document ------------------------------------------

/**
 * Finds the primary 8-K document on a filing index page. Prefers the row whose
 * Type column is "8-K"; falls back to the first .htm document that is not the index.
 * Inline XBRL viewer links (/ix?doc=/Archives/...) are unwrapped.
 */
export function findPrimaryDocUrl(indexHtml: string, indexUrl: string): string | null {
  const rows = blocks(indexHtml, 'tr');
  const docHref = (row: string) => {
    const m = /href="([^"]+\.htm[l]?)"/i.exec(row);
    if (!m) return null;
    const href = m[1].replace(/^\/ix\?doc=/, '');
    if (/-index\.htm/i.test(href)) return null;
    return new URL(href, indexUrl).toString();
  };
  for (const r of rows) {
    if (/<td[^>]*>\s*8-K\s*<\/td>/i.test(r)) {
      const u = docHref(r);
      if (u) return u;
    }
  }
  for (const r of rows) {
    const u = docHref(r);
    if (u && /\/Archives\//.test(u)) return u;
  }
  return null;
}

/** Primary document HTML -> plain text, capped for the AI. */
export function filingText(html: string): string {
  return htmlToText(html, config.sourceTextMaxChars);
}
