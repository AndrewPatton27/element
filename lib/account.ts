// Accounts and tailored recommendations: one interface, two implementations.
// Supabase: Auth (GoTrue) over REST + the account RPCs in the `api` schema, all with
// plain fetch and the user's access token. Mock: in-memory accounts over the sample
// fixtures, so sample mode works with no back end. No React imports.

import type { BlurbCard, FeedPage } from '../contract/types.ts';
import type { FeedForYouParams, SetPrefsParams, TrackParams } from '../contract/account.ts';
import { clampLimit } from './feedLogic.ts';
import { EMPTY_PREFS, mockForYouOrder, type Feedback, type TrackEvent, type UserPrefs } from './accountLogic.ts';
import {
  RESET_RATE_LIMIT_MESSAGE,
  SIGN_IN_AGAIN_MESSAGE,
  authErrorMessage,
  needsRefresh,
  parseSession,
  type AuthUser,
  type RecoveryLink,
  type Session,
} from './session.ts';
import { defaultStore, type KeyValueStore } from './storage.ts';
import { parseFeedPage } from './types.ts';

export type SignUpResult = { status: 'signed_in' } | { status: 'confirm_email' };
export type EmailChangeResult = 'changed' | 'confirm_sent';
type RecoveryTokens = Extract<RecoveryLink, { ok: true }>;

export interface AccountApi {
  readonly sample: boolean;
  currentUser(): AuthUser | null;
  /** Valid access token (refreshed if needed), or null when signed out. */
  accessToken(): Promise<string | null>;
  onChange(fn: (user: AuthUser | null) => void): () => void;
  signUp(email: string, password: string): Promise<SignUpResult>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  getPrefs(): Promise<UserPrefs>;
  /** Saves followed topics (and optionally hidden ones); marks the user onboarded. */
  setPrefs(followed: string[], hidden?: string[]): Promise<UserPrefs>;
  feedForYou(cursor: string | null, limit?: number): Promise<FeedPage>;
  track(cardId: string, event: TrackEvent): Promise<void>;
  /** Deletes the user's prefs and events. The login stays (deleted in the dashboard). */
  deleteMyData(): Promise<void>;
  /** Emails a reset link. Resolves the same way whether or not the email has an account. */
  requestPasswordReset(email: string, redirectTo: string): Promise<void>;
  /** From the emailed link: signs in with its token and sets the new password. */
  completePasswordRecovery(link: RecoveryTokens, newPassword: string): Promise<void>;
  /** Signed in: sets a new password for the current account. */
  changePassword(newPassword: string): Promise<void>;
  /** Signed in: changes the email ('changed' at once when confirmations are off). */
  changeEmail(newEmail: string): Promise<EmailChangeResult>;
  /** Deletes the login and everything stored for it (api.delete_account), then signs out here. */
  deleteAccount(): Promise<void>;
  /** Why the user was signed out without asking (an expired session), once; null otherwise. */
  takeSignOutReason(): string | null;
}

export class AccountError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'AccountError';
    this.status = status;
  }
}

const SESSION_KEY = 'element.session.v1';

// ---- RPC names and arguments (supabase/migrations/20261017030000_accounts.sql) ----
export const ACCOUNT_RPC = {
  getPrefs: { fn: 'get_prefs', args: () => ({}) },
  setPrefs: {
    fn: 'set_prefs',
    args: (followed: string[], hidden?: string[]): SetPrefsParams => ({
      p_followed: followed as SetPrefsParams['p_followed'],
      p_hidden: (hidden ?? null) as SetPrefsParams['p_hidden'],
    }),
  },
  feedForYou: { fn: 'feed_for_you', args: (cursor: string | null, limit: number): FeedForYouParams => ({ p_cursor: cursor, p_limit: limit }) },
  track: { fn: 'track', args: (cardId: string, event: TrackEvent): TrackParams => ({ p_blurb: cardId, p_kind: event }) },
  deleteMyData: { fn: 'delete_my_data', args: () => ({}) },
  // supabase/migrations/20261017040000_account_delete.sql
  deleteAccount: { fn: 'delete_account', args: () => ({}) },
} as const;

const slugList = (x: unknown): string[] => (Array.isArray(x) ? [...new Set(x.filter((v): v is string => typeof v === 'string'))] : []);

// api.get_prefs / api.set_prefs return {followed_categories, hidden_categories, onboarded, ...}.
export function parseUserPrefs(x: unknown): UserPrefs {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return { ...EMPTY_PREFS };
  const o = x as Record<string, unknown>;
  return { followed: slugList(o.followed_categories), hidden: slugList(o.hidden_categories), onboarded: o.onboarded === true };
}

// get_prefs may return ["world", ...], [{category:"world"}], or {categories:[...]}.
export function parsePrefs(x: unknown): string[] {
  const list = Array.isArray(x)
    ? x
    : x && typeof x === 'object' && Array.isArray((x as { categories?: unknown }).categories)
      ? (x as { categories: unknown[] }).categories
      : [];
  const out: string[] = [];
  for (const item of list) {
    if (typeof item === 'string') out.push(item);
    else if (item && typeof item === 'object') {
      const v = (item as { category?: unknown; slug?: unknown }).category ?? (item as { slug?: unknown }).slug;
      if (typeof v === 'string') out.push(v);
    }
  }
  return [...new Set(out)];
}

// ---------------------------------------------------------------- Supabase ----

export interface SupabaseAccountOptions {
  url: string;
  key: string; // publishable key
  fetchFn?: typeof fetch;
  store?: KeyValueStore;
  now?: () => number; // unix seconds, for tests
}

export function createSupabaseAccount(opts: SupabaseAccountOptions): AccountApi {
  const doFetch = opts.fetchFn ?? ((i, init) => fetch(i, init));
  const store = opts.store ?? defaultStore();
  const now = opts.now ?? (() => Math.floor(Date.now() / 1000));
  const listeners = new Set<(u: AuthUser | null) => void>();

  let session: Session | null = null;
  try {
    const saved = store.get(SESSION_KEY);
    session = saved ? parseSession(JSON.parse(saved), now()) : null;
  } catch {
    session = null;
  }

  function setSession(s: Session | null) {
    session = s;
    if (s) store.set(SESSION_KEY, JSON.stringify(s));
    else store.remove(SESSION_KEY);
    for (const fn of listeners) fn(s ? s.user : null);
  }

  let signOutReason: string | null = null;

  async function authCall(path: string, body: unknown, token?: string, method: 'POST' | 'PUT' = 'POST'): Promise<unknown> {
    let res: Response;
    try {
      res = await doFetch(`${opts.url}/auth/v1/${path}`, {
        method,
        headers: { apikey: opts.key, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
    } catch {
      throw new AccountError(authErrorMessage(0, null), 0);
    }
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new AccountError(authErrorMessage(res.status, json), res.status);
    return json;
  }

  async function accessToken(): Promise<string | null> {
    if (!session) return null;
    if (!needsRefresh(session, now())) return session.access_token;
    try {
      const json = await authCall('token?grant_type=refresh_token', { refresh_token: session.refresh_token });
      const s = parseSession(json, now());
      setSession(s);
      return s ? s.access_token : null;
    } catch (e) {
      // A rejected refresh token means the session is over; a network error keeps it.
      if (e instanceof AccountError && e.status >= 400 && e.status < 500) {
        signOutReason = SIGN_IN_AGAIN_MESSAGE;
        setSession(null);
      }
      return null;
    }
  }

  async function rpc(fn: string, args: object): Promise<unknown> {
    const token = await accessToken();
    if (!token) throw new AccountError('Please sign in again.', 401);
    let res: Response;
    try {
      res = await doFetch(`${opts.url}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: {
          apikey: opts.key,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Profile': 'api',
          'Content-Profile': 'api',
        },
        body: JSON.stringify(args),
      });
    } catch {
      throw new AccountError('Could not reach the server. Check your connection and try again.', 0);
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
      const reason = body && typeof body.message === 'string' ? `: ${body.message}` : '';
      throw new AccountError(`Server returned ${res.status}${reason}`, res.status);
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  return {
    sample: false,
    currentUser: () => session?.user ?? null,
    accessToken,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async signUp(email, password) {
      const json = await authCall('signup', { email: email.trim(), password });
      const s = parseSession(json, now());
      if (s) {
        setSession(s);
        return { status: 'signed_in' };
      }
      return { status: 'confirm_email' };
    },
    async signIn(email, password) {
      const json = await authCall('token?grant_type=password', { email: email.trim(), password });
      const s = parseSession(json, now());
      if (!s) throw new AccountError('Sign-in failed: unexpected response.', 500);
      setSession(s);
    },
    async signOut() {
      const token = session?.access_token;
      setSession(null);
      if (token) await authCall('logout', {}, token).catch(() => undefined);
    },
    async getPrefs() {
      return parseUserPrefs(await rpc(ACCOUNT_RPC.getPrefs.fn, ACCOUNT_RPC.getPrefs.args()));
    },
    async setPrefs(followed, hidden) {
      return parseUserPrefs(await rpc(ACCOUNT_RPC.setPrefs.fn, ACCOUNT_RPC.setPrefs.args(followed, hidden)));
    },
    async feedForYou(cursor, limit) {
      return parseFeedPage(await rpc(ACCOUNT_RPC.feedForYou.fn, ACCOUNT_RPC.feedForYou.args(cursor, clampLimit(limit))));
    },
    async track(cardId, event) {
      await rpc(ACCOUNT_RPC.track.fn, ACCOUNT_RPC.track.args(cardId, event));
    },
    async deleteMyData() {
      await rpc(ACCOUNT_RPC.deleteMyData.fn, ACCOUNT_RPC.deleteMyData.args());
    },
    async requestPasswordReset(email, redirectTo) {
      try {
        await authCall(`recover?redirect_to=${encodeURIComponent(redirectTo)}`, { email: email.trim() });
      } catch (e) {
        if (e instanceof AccountError && e.status === 429) throw new AccountError(RESET_RATE_LIMIT_MESSAGE, 429);
        if (e instanceof AccountError && e.status === 0) throw e;
        // Any other answer is treated as sent, so the form never reveals who has an account.
      }
    },
    async completePasswordRecovery(link, newPassword) {
      const json = await authCall('user', { password: newPassword }, link.access_token, 'PUT');
      const user = json && typeof json === 'object' ? (json as { id?: unknown; email?: unknown }) : {};
      if (typeof user.id !== 'string') throw new AccountError('Could not set the new password. Ask for a new link.', 500);
      if (link.refresh_token) {
        setSession({
          access_token: link.access_token,
          refresh_token: link.refresh_token,
          expires_at: now() + (link.expires_in ?? 3600),
          user: { id: user.id, email: typeof user.email === 'string' ? user.email : '' },
        });
      }
    },
    async changePassword(newPassword) {
      const token = await accessToken();
      if (!token) throw new AccountError(SIGN_IN_AGAIN_MESSAGE, 401);
      await authCall('user', { password: newPassword }, token, 'PUT');
    },
    async changeEmail(newEmail) {
      const token = await accessToken();
      if (!token || !session) throw new AccountError(SIGN_IN_AGAIN_MESSAGE, 401);
      const wanted = newEmail.trim();
      const json = (await authCall('user', { email: wanted }, token, 'PUT')) as { email?: unknown } | null;
      if (json && typeof json.email === 'string' && json.email.toLowerCase() === wanted.toLowerCase()) {
        setSession({ ...session, user: { ...session.user, email: json.email } });
        return 'changed';
      }
      return 'confirm_sent';
    },
    async deleteAccount() {
      await rpc(ACCOUNT_RPC.deleteAccount.fn, ACCOUNT_RPC.deleteAccount.args());
      setSession(null); // the login no longer exists, so there is nothing to log out on the server
    },
    takeSignOutReason() {
      const r = signOutReason;
      signOutReason = null;
      return r;
    },
  };
}

// -------------------------------------------------------------------- Mock ----

// Sample mode: any email + an 8+ character password works; nothing leaves the device.
export function createMockAccount(cards: () => BlurbCard[], store: KeyValueStore = defaultStore()): AccountApi {
  const KEY = 'element.mock-account.v1';
  type State = { user: AuthUser | null; prefs: Record<string, UserPrefs>; feedback: Record<string, Record<string, Feedback>> };
  let state: State = { user: null, prefs: {}, feedback: {} };
  try {
    const saved = store.get(KEY);
    if (saved) state = { ...state, ...(JSON.parse(saved) as State) };
  } catch {
    // start fresh
  }
  const listeners = new Set<(u: AuthUser | null) => void>();
  const save = () => store.set(KEY, JSON.stringify(state));
  const setUser = (u: AuthUser | null) => {
    state.user = u;
    save();
    for (const fn of listeners) fn(u);
  };
  const need = () => {
    if (!state.user) throw new AccountError('Please sign in again.', 401);
    return state.user;
  };
  const wait = <T>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 150));

  return {
    sample: true,
    currentUser: () => state.user,
    accessToken: async () => (state.user ? 'mock-token' : null),
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async signUp(email) {
      setUser({ id: `mock-${email.trim().toLowerCase()}`, email: email.trim() });
      return wait({ status: 'signed_in' as const });
    },
    async signIn(email) {
      setUser({ id: `mock-${email.trim().toLowerCase()}`, email: email.trim() });
      await wait(null);
    },
    async signOut() {
      setUser(null);
    },
    async getPrefs() {
      return wait(state.prefs[need().id] ?? { ...EMPTY_PREFS });
    },
    async setPrefs(followed, hidden) {
      const u = need();
      const prev = state.prefs[u.id] ?? EMPTY_PREFS;
      const next = { followed: [...new Set(followed)], hidden: hidden ? [...new Set(hidden)] : prev.hidden, onboarded: true };
      state.prefs[u.id] = next;
      save();
      return wait(next);
    },
    async feedForYou(cursor, limit) {
      const u = need();
      const prefs = state.prefs[u.id] ?? EMPTY_PREFS;
      const fb = state.feedback[u.id] ?? {};
      const ordered = mockForYouOrder(cards(), prefs.followed, fb, prefs.hidden).map((c) => ({ ...c, my_reaction: fb[c.id] ?? null }));
      const n = clampLimit(limit);
      const offset = cursor ? Math.max(0, parseInt(cursor, 10) || 0) : 0;
      const items = ordered.slice(offset, offset + n);
      return wait({ items, next_cursor: offset + items.length < ordered.length ? String(offset + items.length) : null });
    },
    async track(cardId, event) {
      const u = need();
      const fb = { ...(state.feedback[u.id] ?? {}) };
      if (event === 'like' || event === 'dislike') fb[cardId] = event;
      else if (event === 'clear') delete fb[cardId];
      else return;
      state.feedback[u.id] = fb;
      save();
    },
    async deleteMyData() {
      const u = need();
      delete state.prefs[u.id];
      delete state.feedback[u.id];
      save();
    },
    async requestPasswordReset() {
      await wait(null); // sample mode sends no email; the sign-in screen offers a test link
    },
    async completePasswordRecovery(link) {
      // Sample links look like #access_token=mock-recovery:<email>&type=recovery
      const m = /^mock-recovery:(.+)$/.exec(link.access_token);
      if (!m) throw new AccountError('This reset link is invalid or has expired. Ask for a new one from the sign-in page.', 401);
      setUser({ id: `mock-${m[1].trim().toLowerCase()}`, email: m[1].trim() });
      await wait(null);
    },
    async changePassword() {
      need();
      await wait(null); // sample mode never stores passwords
    },
    async changeEmail(newEmail) {
      const u = need();
      setUser({ ...u, email: newEmail.trim() });
      return wait('changed' as const);
    },
    async deleteAccount() {
      const u = need();
      delete state.prefs[u.id];
      delete state.feedback[u.id];
      setUser(null);
      await wait(null);
    },
    takeSignOutReason: () => null,
  };
}
