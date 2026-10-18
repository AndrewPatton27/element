// Report-card scoring and audit helpers. Network access is injected so this module is fixture-testable.
import { config } from './config.ts';
import type { RevisableCard, RevisePayload } from './types.ts';

export type StoryRelation = 'DUPLICATE' | 'UPDATE' | 'ANGLE' | 'RELATED' | 'NEW';
export interface CardScore {
  topic_fit: boolean; matched_topic: string | null;
  scores: { headline: number; summary: number; trust: number; importance: number };
  decision: 'PASS' | 'REVISE' | 'ABANDON'; relation: StoryRelation; related_id: string | null;
  reason: string; recommendations: string[];
  category_fix?: string | null; proposed_headline?: string | null;
}
export interface ScoreClient { generate(prompt: string): Promise<string> }
export const REPORT_CARD = `Element gives busy people business and market news affecting money, jobs and lives. Topic must fit markets, economy, known companies, consumer safety/money, consequential regulators, broad tech/science, or major world events. Exclude niche paperwork, Form 144, routine SEC exhibits/amendments, trivial micro-cap, local crime, celebrity/sports without business impact, opinion, speculation, private-person stories, and guesses. Score headline, summary, trust, importance 0-2 each. Headline: sentence case, verb, about 40-80 chars, no clickbait/jargon/form numbers. Summary: 2-3 plain sentences, adds why it matters, factual, neutral. Trust: source/link, AI label, disclaimer, freshness, no duplicate. PASS means topic_fit and no zero. REVISE means topic fits and fixable with source text. ABANDON means off-topic, stale, duplicate, trivial or unfixable. Relation must be DUPLICATE (same facts/angle), UPDATE (new facts), ANGLE (different effect), RELATED (distinct connected story), NEW (unconnected). DUPLICATE always ABANDON. Return strict JSON matching schema in the prompt.`;

export function scorePrompt(card: Pick<RevisableCard,'id'|'headline'|'body'|'category'|'as_of'|'ai_generated'|'sources'>, recent: Array<Pick<RevisableCard,'id'|'headline'|'body'>> = []): string {
  return `${REPORT_CARD}\nCARD ${JSON.stringify({id:card.id,headline:card.headline,summary:card.body,category:card.category,as_of:card.as_of,ai:card.ai_generated,sources:card.sources?.map(s=>({name:s.name,url:s.url}))})}\nRECENT ${JSON.stringify(recent.map(c=>({id:c.id,headline:c.headline,body:c.body?.slice(0,500)})))}\nJSON keys topic_fit,matched_topic,scores(headline,summary,trust,importance integers 0-2),decision,relation,related_id,reason,recommendations(string[]).`;
}
export async function scoreCard(client: ScoreClient, card: Parameters<typeof scorePrompt>[0], recent: Array<Pick<RevisableCard,'id'|'headline'|'body'>> = []): Promise<CardScore> {
  const text = await client.generate(scorePrompt(card,recent));
  const obj = JSON.parse(text) as CardScore;
  if (typeof obj.topic_fit !== 'boolean' || !['PASS','REVISE','ABANDON'].includes(obj.decision) || !['DUPLICATE','UPDATE','ANGLE','RELATED','NEW'].includes(obj.relation) || !obj.scores || !['headline','summary','trust','importance'].every(k => Number.isInteger((obj.scores as any)[k]) && (obj.scores as any)[k] >= 0 && (obj.scores as any)[k] <= 2) || !Array.isArray(obj.recommendations)) throw new Error('invalid report-card JSON');
  if (!obj.topic_fit || obj.relation === 'DUPLICATE') obj.decision = 'ABANDON';
  return obj;
}
export interface AuditActions { revise(p: RevisePayload): Promise<unknown>; hide(id:string,note:string):Promise<unknown>; link(id:string,related:string,kind:string):Promise<unknown> }
export async function applyAudit(cards: RevisableCard[], scores: CardScore[], actions: AuditActions, reviseText: (card:RevisableCard,recommendations:string[])=>Promise<{headline:string;body:string|null}>, rescore:(card:RevisableCard,text:{headline:string;body:string|null})=>Promise<CardScore>) {
  const hideCount=scores.filter(s=>s.decision==='ABANDON').length;
  if(cards.length && hideCount/cards.length>config.reportCard.auditHideMaxFraction) throw new Error('audit hide safety cap exceeded');
  const undo: Array<{id:string;old_text:{headline:string;body:string|null};new_text?:{headline:string;body:string|null};old_status:'published'}>=[];
  for(let i=0;i<cards.length;i++) { const c=cards[i]!, s=scores[i]!;
    if(s.decision==='ABANDON'){await actions.hide(c.id,s.reason||'report_card_abandon');undo.push({id:c.id,old_text:{headline:c.headline,body:c.body},old_status:'published'});continue;}
    if(s.decision==='REVISE'){const t=await reviseText(c,s.recommendations);const updated={...c,...t};const check=await rescore(updated,t);if(check.decision==='PASS'){await actions.revise({id:c.id,action:'revise',headline:t.headline,body:t.body,ai_generated:true,model:config.groq.model,prompt_version:config.reportCard.scorePromptVersion,detail:null});undo.push({id:c.id,old_text:{headline:c.headline,body:c.body},new_text:t,old_status:'published'});}}
    if(['UPDATE','ANGLE','RELATED'].includes(s.relation)&&s.related_id) await actions.link(c.id,s.related_id,s.relation.toLowerCase());
  }
  return undo;
}
export function auditTable(rows:Array<{card:RevisableCard;score:CardScore}>):string { return rows.map(({card:c,score:s})=>`${s.decision==='PASS'?'✓':s.decision==='REVISE'?'✎':'×'} ${c.category}${s.category_fix?` → ${s.category_fix}`:''} | ${s.reason} | ${s.recommendations[0]??''}`).join('\n'); }
