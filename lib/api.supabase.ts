// Supabase `api` schema over plain fetch (PostgREST). No supabase-js.
// Only the project URL and the publishable key are used; never a secret key.
// No React imports, so node --test can run it with a fake fetch.

import type { Api, FeedRequest } from './api.ts';
import { NETWORK_MESSAGE, friendlyHttpError, parseErrorBody, warnRaw } from './errors.ts';
import { clampLimit } from './feedLogic.ts';
import { parseAppConfig, parseCategories, parseFeedPage, parseMacroFacts } from './types.ts';

export interface SupabaseOptions {
  url: string; // https://<project>.supabase.co, no trailing slash
  key: string; // publishable key
  fetchFn?: typeof fetch;
  getToken?: () => Promise<string | null>; // signed-in user's access token, if any
}

export class ApiError extends Error {
  status: number;
  /** The server's own text, for developers; `message` is the short friendly line readers see. */
  detail?: string;
  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

export interface PlannedRequest {
  url: string;
  init: { method: 'GET' | 'POST'; headers: Record<string, string>; body?: string };
}

// The api schema is selected per request with Accept-Profile (reads) and
// Content-Profile (RPC calls), so the project only needs `api` exposed.
export function planRequest(
  base: string,
  key: string,
  op: 'feed' | 'categories' | 'numbers' | 'config',
  req?: FeedRequest,
  token?: string | null,
): PlannedRequest {
  const headers: Record<string, string> = { apikey: key, Accept: 'application/json', 'Accept-Profile': 'api' };
  // Signed in: send the user's token so the server knows who is reading.
  if (token) headers.Authorization = `Bearer ${token}`;
  if (op === 'feed') {
    const body = {
      p_mode: req?.mode ?? 'top',
      p_cursor: req?.cursor ?? null,
      p_limit: clampLimit(req?.limit),
      p_category: req?.category ?? null,
    };
    return {
      url: `${base}/rest/v1/rpc/feed`,
      init: { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', 'Content-Profile': 'api' }, body: JSON.stringify(body) },
    };
  }
  const path = {
    categories: 'categories?select=*&order=sort_order',
    numbers: 'numbers_to_know?select=*&order=sort_order',
    config: 'app_config?select=*&limit=1',
  }[op];
  return { url: `${base}/rest/v1/${path}`, init: { method: 'GET', headers } };
}

export function createSupabaseApi(opts: SupabaseOptions): Api {
  const doFetch = opts.fetchFn ?? ((input, init) => fetch(input, init));

  async function call(plan: PlannedRequest): Promise<unknown> {
    let res: Response;
    try {
      res = await doFetch(plan.url, plan.init);
    } catch {
      throw new ApiError(NETWORK_MESSAGE, 0);
    }
    if (!res.ok) {
      // PostgREST puts a short reason in `message` and a `code`. Readers get a friendly line;
      // the raw text stays on `detail` and in a dev-only console warning. Request headers
      // (they hold the key) are never echoed.
      const { message, code } = parseErrorBody(await res.json().catch(() => null));
      const detail = `HTTP ${res.status}${code ? ` ${code}` : ''}${message ? `: ${message}` : ''}`;
      warnRaw('api error', detail);
      throw new ApiError(friendlyHttpError(res.status, message, code), res.status, detail);
    }
    return res.json();
  }

  return {
    sample: false,
    async feed(req) {
      const token = opts.getToken ? await opts.getToken() : null;
      try {
        return parseFeedPage(await call(planRequest(opts.url, opts.key, 'feed', req, token)));
      } catch (e) {
        // api.feed is the same for everyone: if the user's token is rejected, read it as a guest.
        if (e instanceof ApiError && e.status === 401 && token) return parseFeedPage(await call(planRequest(opts.url, opts.key, 'feed', req, null)));
        throw e;
      }
    },
    categories: async () => parseCategories(await call(planRequest(opts.url, opts.key, 'categories'))),
    numbersToKnow: async () => parseMacroFacts(await call(planRequest(opts.url, opts.key, 'numbers'))),
    appConfig: async () => parseAppConfig(await call(planRequest(opts.url, opts.key, 'config'))),
  };
}
