// --rewrite: redo published cards written with an older prompt or template version, in place.
// For each card from api.blurbs_to_revise (status published, prompt_version not current):
// - data card: rebuild the text with the current plain template from the numbers already on it.
// - template card (no AI): rebuild from the same feed metadata with the current template.
// - AI card: rebuild the licensed source text through the same allowlisted fetches as a normal
//   run, then the same chain (license gate, caps, pacing), validator and relevance gate.
//   Relevance below the minimum -> the card is hidden. No valid AI draft -> the old card stays.
// The card keeps its id, category, event type, sources and sort_at (the feed order does not jump);
// api.revise_blurb sets revision + 1 and updated_at.

import { config } from './config.ts';
import type { Deps } from './pipeline.ts';
import { buildPublishPayload } from './publish.ts';
import { beaItemToItem } from './sources/bea.ts';
import { fedItemToItem, fedPageText, mergeFedItems, parseRss } from './sources/fed.ts';
import { fedRegDocToItem, type FrDoc } from './sources/fedreg.ts';
import { buildDataCard, observationFromFact } from './sources/macro.ts';
import { classifySecEntry, filingText, findPrimaryDocUrl, parseSubmissionsJson } from './sources/sec.ts';
import { usgsDraft } from './sources/usgs.ts';
import { createChainState, summarizeWithChain } from './summarizer/chain.ts';
import { templateDraft } from './summarizer/template.ts';
import type { RawItem, RevisableCard, RevisePayload } from './types.ts';
import { SUMMARIZABLE, validatePublish } from './validate.ts';

export interface RewriteStats {
  selected: number;
  revised: number;
  hidden: number;
  kept: number;                       // old card left unchanged (no valid draft, source gone, unsupported)
  failed: number;
  ai: number;
}

/** Versions that count as current: the AI prompt and the template wording. */
export const currentVersions = (): string[] => [config.promptVersion, config.templateVersion];

type Rebuilt = { item: RawItem; pageText: () => Promise<string> } | { reason: string };

const noPage = async () => '';

/** Rebuilds the RawItem (and how to get its page text) for a card, from the same sources a normal run uses. */
export async function rebuildItem(card: RevisableCard, deps: Pick<Deps, 'fetchText' | 'now'>): Promise<Rebuilt> {
  const src = card.item;
  if (!src) return { reason: 'no collected item behind this card' };
  const url = src.url;
  switch (src.source) {
    case 'sec_8k': {
      const cik = /\/edgar\/data\/(\d+)\//.exec(url)?.[1];
      if (!cik) return { reason: 'no CIK in the filing URL' };
      const json = await deps.fetchText(config.secSubmissionsUrl.replace('{cik}', cik.padStart(10, '0')), 'api', 0);
      const entry = parseSubmissionsJson(json, deps.now, 3650).find((e) => e.accession === src.external_id || e.url === url);
      if (!entry) return { reason: 'filing not found in the company filing list' };
      const r = classifySecEntry(entry, null);
      if (!('item' in r)) return { reason: `filing not a card candidate (${r.skip})` };
      const item = { ...r.item, url, tickers: card.tickers.length ? card.tickers : r.item.tickers };
      if (item.tickers[0]) item.company = item.tickers[0].name;
      return {
        item,
        pageText: async () => {
          const index = await deps.fetchText(url, 'page', config.cacheTtlMinutes);
          const doc = findPrimaryDocUrl(index, url);
          return doc ? filingText(await deps.fetchText(doc, 'page', config.cacheTtlMinutes)) : '';
        },
      };
    }
    case 'fed_rss': {
      const item = fedItemToItem({ title: src.title ?? card.headline, link: url, description: '', category: null, pubDate: card.as_of, guid: src.external_id ?? url });
      return { item: { ...item, event_type: card.event_type }, pageText: async () => fedPageText(await deps.fetchText(url, 'page', config.cacheTtlMinutes)) };
    }
    case 'bea_rss': {
      const list = mergeFedItems([parseRss(await deps.fetchText(config.feeds.beaRss, 'api', config.feedCacheTtlMinutes))], deps.now, 3650);
      const hit = list.find((i) => i.link === url);
      return hit ? { item: beaItemToItem(hit), pageText: noPage } : { reason: 'release no longer in the BEA feed' };
    }
    case 'fedreg': {
      if (!src.external_id) return { reason: 'no document number' };
      const u = new URL(config.fedRegister.documentEndpoint.replace('{doc}', encodeURIComponent(src.external_id)));
      for (const f of config.fedRegister.fields) u.searchParams.append('fields[]', f);
      const doc = JSON.parse(await deps.fetchText(u.toString(), 'api', 0)) as FrDoc;
      const r = fedRegDocToItem(doc, deps.now);
      return 'item' in r ? { item: r.item, pageText: noPage } : { reason: `rule not usable (${r.skip})` };
    }
    default:
      return { reason: `source ${src.source} is not supported by --rewrite (it was added after the plain-language prompt)` };
  }
}

export async function runRewrite(deps: Deps, opts: { limit?: number } = {}): Promise<RewriteStats> {
  const stats: RewriteStats = { selected: 0, revised: 0, hidden: 0, kept: 0, failed: 0, ai: 0 };
  const pub = deps.publisher;
  if (!pub.listToRevise || !pub.reviseBlurb) throw new Error('publisher cannot list or revise cards');
  const cards = await pub.listToRevise(currentVersions(), opts.limit ?? 20);
  stats.selected = cards.length;
  deps.log(`rewrite: ${cards.length} published cards not on ${currentVersions().join(' / ')}`);
  const chain = createChainState();

  const revise = async (card: RevisableCard, p: RevisePayload, how: string) => {
    const res = await pub.reviseBlurb!(p);
    if (res.status === 'revised') stats.revised++;
    else if (res.status === 'hidden') stats.hidden++;
    else stats.kept++;
    deps.log(`${res.status} [${how}] ${card.headline}${p.action === 'revise' ? `  ->  ${p.headline}` : `  (${p.note})`}`);
  };

  for (const card of cards) {
    try {
      // 1. data cards: same numbers, current plain template
      if (card.kind === 'data') {
        const facts = card.macro.map(observationFromFact);
        if (!facts[0] || facts.some((f) => !f)) { stats.kept++; deps.log(`kept (unknown series): ${card.headline}`); continue; }
        const d = buildDataCard(facts[0]!, facts.slice(1) as NonNullable<(typeof facts)[0]>[], { force: true });
        if (!d) { stats.kept++; deps.log(`kept (no change to describe): ${card.headline}`); continue; }
        await revise(card, { id: card.id, action: 'revise', headline: d.headline, body: d.body, ai_generated: false, model: null, prompt_version: config.templateVersion, detail: d.detail ?? null }, 'data template');
        continue;
      }
      if (card.kind !== 'summary') { stats.kept++; deps.log(`kept (kind ${card.kind}): ${card.headline}`); continue; }

      const rb = await rebuildItem(card, deps);
      if ('reason' in rb) { stats.kept++; deps.log(`kept (${rb.reason}): ${card.headline}`); continue; }
      const it = rb.item;

      // 2. template cards: same metadata, current plain template (no AI)
      if (!card.ai_generated) {
        const draft = it.source === 'usgs' ? usgsDraft(it) : templateDraft({ item: it, text: '' });
        const p = buildPublishPayload(it, draft, { aiGenerated: false, model: null });
        await revise(card, { id: card.id, action: 'revise', headline: p.headline, body: p.body, ai_generated: false, model: null, prompt_version: config.templateVersion, detail: p.detail ?? null }, 'template');
        continue;
      }

      // 3. AI cards: same licensed text, same chain, validator and relevance gate
      if (!(SUMMARIZABLE as readonly string[]).includes(it.license_class)) {
        stats.kept++; deps.log(`kept (license ${it.license_class} may not be summarized): ${card.headline}`); continue;
      }
      let text = it.summary_text;
      try {
        const page = await rb.pageText();
        if (page) text = `${it.summary_text}\n\n${page}`.slice(0, config.sourceTextMaxChars);
      } catch (e) {
        deps.log(`page text unavailable (feed text only): ${it.url}: ${(e as Error).message}`);
      }
      const r = await summarizeWithChain({ item: it, text }, deps.providers, deps.counter, {
        state: chain, minRelevance: config.minEverydayRelevance, requireRelevance: true,
      });
      if (r.ai_generated) stats.ai++;
      if (r.low_relevance) {
        await revise(card, { id: card.id, action: 'hide', note: `low_relevance (${r.relevance})` }, r.provider);
        continue;
      }
      if (!r.ai_generated) {
        stats.kept++;
        deps.log(`kept (no valid AI draft; old card unchanged): ${card.headline}  (${r.log.join(' | ')})`);
        continue;
      }
      const p = buildPublishPayload(it, r.draft, { aiGenerated: true, model: r.model });
      const v = validatePublish(p);
      if (!v.ok) { stats.kept++; deps.log(`kept (publish check failed: ${v.errors.join('; ')}): ${card.headline}`); continue; }
      await revise(card, { id: card.id, action: 'revise', headline: p.headline, body: p.body, ai_generated: true, model: r.model, prompt_version: config.promptVersion, detail: p.detail ?? null }, `${r.provider}, relevance ${r.relevance}${p.detail ? ', with detail' : ', no detail'}`);
    } catch (e) {
      stats.failed++;
      deps.log(`failed (old card unchanged): ${card.headline}: ${(e as Error).message}`);
    }
  }
  return stats;
}
