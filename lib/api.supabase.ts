// Supabase `api` schema over plain fetch (PostgREST). No supabase-js.
// Only the project URL and the publishable key are used; never a secret key.
// No React imports, so node --test can run it with a fake fetch.

import type { Api, FeedRequest } from './api.ts';
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
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
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
      throw new ApiError('Could not reach the server. Check your connection and try again.', 0);
    }
    if (!res.ok) {
      // PostgREST puts a short reason in `message`; never echo request headers (they hold the key).
      let reason = '';
      try {
        const body = (await res.json()) as { message?: unknown };
        if (typeof body.message === 'string') reason = `: ${body.message}`;
      } catch {
        // body was not JSON
      }
      throw new ApiError(`Server returned ${res.status}${reason}`, res.status);
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
