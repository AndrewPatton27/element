// Every tunable value for the ingest script lives here (one place to change).
// Values marked UNVERIFIED must be confirmed before relying on them.

export const config = {
  // ---- AI summarizer --------------------------------------------------------
  gemini: {
    model: 'gemini-3.5-flash-lite',            // verified model ID (stable), 2026-10-17
    fallbackModel: 'gemini-3.1-flash-lite',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
    // Free-tier limits for this model, read in AI Studio on 2026-10-17: 15 RPM, 250K TPM, 500 RPD.
    freeRpd: 500 as number | null,
    freeRpm: 15,
  },
  aiDailyCapCode: 600,                         // hard cap in code; effective cap = min(this, freeRpd)
  promptVersion: 'sum-v1',
  providerOrder: ['gemini', 'template'] as const, // a list on purpose: adding a provider is one entry

  // ---- card limits ------------------------------------------------------------
  headlineMaxChars: 90,
  bodyMaxWords: 60,
  maxTickersPerCard: 5,
  maxSourcesPerCard: 8,
  // Max consecutive words copied from the source (numbers and 8-K item titles don't count).
  copyLimitWords: {
    company_filing: 10,
    public_domain: 25,
  } as Record<string, number>,

  // Phrases that read as investment advice. Matched case-insensitively on word boundaries.
  adviceBlocklist: [
    'should', 'recommend', 'recommends', 'recommended', 'recommendation',
    'price target', 'guaranteed', 'guarantee', 'undervalued', 'overvalued',
    'strong buy', 'buy rating', 'sell rating', 'hold rating', 'time to buy', 'time to sell',
    'buy the dip', 'must-buy', 'must buy', 'outperform', 'underperform', 'can\'t lose',
    'sure thing', 'to the moon',
  ],

  // ---- dedupe / ranking guard --------------------------------------------------
  tickerCapPer24h: 3,                          // mirrors core.rank_params.ticker_cap_24h
  tickerCapWindowHours: 24,

  // ---- fetching ------------------------------------------------------------------
  // Full pages may only be downloaded from these hosts.
  pageHosts: ['www.sec.gov', 'www.federalreserve.gov', 'www.bls.gov'],
  // Data APIs (JSON/CSV endpoints, not pages). The Supabase host is added at runtime.
  apiHosts: ['api.stlouisfed.org', 'home.treasury.gov', 'generativelanguage.googleapis.com'],
  maxRequestsPerSecond: 5,                     // SEC allows 10/s; we stay at half
  maxRedirects: 3,
  fetchTimeoutMs: 20_000,
  cacheDir: 'cache',
  cacheTtlMinutes: 60 * 24,                    // filings never change; feeds use a short TTL below
  feedCacheTtlMinutes: 4,
  sourceTextMaxChars: 10_000,                  // about 2.5k tokens sent to the AI

  feeds: {
    sec8k: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&company=&dateb=&owner=include&start=0&count=40&output=atom',
    fedRss: [
      'https://www.federalreserve.gov/feeds/press_monetary.xml',
      'https://www.federalreserve.gov/feeds/press_all.xml',
    ],
    fredObservations: 'https://api.stlouisfed.org/fred/series/observations',
    treasuryCsv: 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/{year}/all?type=daily_treasury_yield_curve&field_tdr_date_value={year}&page&_format=csv',
  },
  macroSeries: ['DGS2', 'DGS10', 'DFF', 'CPIAUCSL', 'UNRATE', 'DCOILWTICO'],
  // A data card is published only for a new observation that moved at least this much.
  // Monthly series (CPI, unemployment) always get a card when a new month arrives.
  dataCardMinMove: {
    DGS2: 0.05,          // percentage points
    DGS10: 0.05,
    DFF: 0.05,
    DCOILWTICO: 2.0,     // percent
  } as Record<string, number>,
  fredLookbackDays: 500,                       // enough history for CPI year-over-year
  fedMaxAgeDays: 7,                            // ignore older press releases
  secTickersUrl: 'https://www.sec.gov/files/company_tickers_exchange.json',
  // 8-K items we turn into cards.
  sec8kItems: ['1.01', '1.02', '2.01', '2.02', '2.05', '2.06', '3.01', '4.02', '5.02', '7.01', '8.01'],
  pollIntervalMinutes: 10,                     // for `--loop`
} as const;

/** Effective daily AI call cap: min(code cap, verified free requests per day). */
export function aiDailyCap(freeRpd: number | null = config.gemini.freeRpd): number {
  return freeRpd == null ? config.aiDailyCapCode : Math.min(config.aiDailyCapCode, freeRpd);
}

// ---- environment ----------------------------------------------------------------

export interface Env {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  geminiApiKey: string | null;
  fredApiKey: string | null;
  secUserAgent: string;
}

export const ENV_NAMES = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GEMINI_API_KEY',
  'FRED_API_KEY',
  'SEC_USER_AGENT',
] as const;

const PLACEHOLDER = /^$|your|example|xxx|<|>|changeme|placeholder/i;

/**
 * Reads and checks the environment. Throws (without printing any key value) if a
 * required value is missing or still a placeholder.
 */
export function readEnv(env: Record<string, string | undefined>, opts: { dryRun?: boolean } = {}): Env {
  const get = (k: string) => (env[k] ?? '').trim();
  const problems: string[] = [];

  const supabaseUrl = get('SUPABASE_URL');
  const key = get('SUPABASE_SERVICE_ROLE_KEY');
  const ua = get('SEC_USER_AGENT');

  if (!opts.dryRun) {
    if (PLACEHOLDER.test(supabaseUrl) || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(supabaseUrl)) {
      problems.push('SUPABASE_URL is missing or a placeholder (expected https://<ref>.supabase.co)');
    }
    if (PLACEHOLDER.test(key) || key.length < 20) {
      problems.push('SUPABASE_SERVICE_ROLE_KEY is missing or a placeholder');
    }
    if (PLACEHOLDER.test(ua) || !/\S+@\S+\.\S+/.test(ua)) {
      problems.push('SEC_USER_AGENT must be "<app name> <contact email>"');
    }
  }
  if (problems.length) throw new Error('Environment not ready:\n- ' + problems.join('\n- '));

  return {
    supabaseUrl: supabaseUrl.replace(/\/$/, ''),
    supabaseServiceRoleKey: key,
    geminiApiKey: get('GEMINI_API_KEY') || null,
    fredApiKey: get('FRED_API_KEY') || null,
    secUserAgent: ua,
  };
}

/** Safe description of an Env for logs: never prints key values. */
export function describeEnv(e: Env): string {
  return [
    `SUPABASE_URL=${e.supabaseUrl}`,
    `SUPABASE_SERVICE_ROLE_KEY=${e.supabaseServiceRoleKey ? '[set]' : '[missing]'}`,
    `GEMINI_API_KEY=${e.geminiApiKey ? '[set]' : '[missing]'}`,
    `FRED_API_KEY=${e.fredApiKey ? '[set]' : '[missing]'}`,
    `SEC_USER_AGENT=${e.secUserAgent ? '[set]' : '[missing]'}`,
  ].join(' ');
}
