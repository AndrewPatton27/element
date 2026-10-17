// One data interface, two implementations: sample fixtures (mock, the default) and
// the Supabase `api` schema over plain fetch. Screens only talk to this interface.

import type { AppConfig, Category, CategorySlug, FeedMode, FeedPage, MacroFact } from '../contract/types.ts';
import { resolveApiConfig, readEnv, type ApiConfig } from './config.ts';
import { createMockApi } from './api.mock.ts';
import { createSupabaseApi } from './api.supabase.ts';

export interface FeedRequest {
  mode: FeedMode;
  cursor?: string | null;
  category?: CategorySlug | null;
  limit?: number;
}

export interface Api {
  /** True when cards are fictional samples; the app must then show the SAMPLE DATA banner. */
  readonly sample: boolean;
  feed(req: FeedRequest): Promise<FeedPage>;
  categories(): Promise<Category[]>;
  numbersToKnow(): Promise<MacroFact[]>;
  appConfig(): Promise<AppConfig>;
}

export type ApiResult = { ok: true; api: Api } | { ok: false; error: string };

let cached: ApiResult | null = null;

export function buildApi(config: ApiConfig): ApiResult {
  if (!config.ok) return { ok: false, error: config.error };
  if (config.mode === 'mock') return { ok: true, api: createMockApi() };
  return { ok: true, api: createSupabaseApi({ url: config.url, key: config.key }) };
}

// A config error is returned, not hidden: the root layout shows it full screen.
export function getApi(): ApiResult {
  if (!cached) cached = buildApi(resolveApiConfig(readEnv()));
  return cached;
}
