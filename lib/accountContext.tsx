// Signed-in state for the whole app: who is signed in, their saved topics, their
// like/dislike per card, and event tracking (view, open_source, like, dislike).
// Works the same over the mock account (sample mode) and Supabase.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { BlurbCard } from '../contract/types.ts';
import type { AccountApi, EmailChangeResult, SignUpResult } from './account.ts';
import { ViewTracker, feedbackEvent, reactionOf, type Feedback, type UserPrefs } from './accountLogic.ts';
import type { AuthUser, RecoveryLink } from './session.ts';
import { setOpenSourceListener } from './openUrl.ts';
import { defaultStore } from './storage.ts';

export interface AccountState {
  account: AccountApi;
  user: AuthUser | null;
  prefs: UserPrefs | null; // null while loading or signed out
  onboardingSkipped: boolean;
  reactions: Record<string, Feedback>;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<SignUpResult>;
  signOut(): Promise<void>;
  savePrefs(followed: string[]): Promise<void>;
  skipOnboarding(): void;
  react(card: BlurbCard, pressed: Feedback): void;
  noteCards(cards: BlurbCard[]): void; // pick up my_reaction from For you cards
  trackView(card: BlurbCard): void;
  deleteMyData(): Promise<void>;
  refreshPrefs(): Promise<UserPrefs | null>;
  /** "Please sign in again." after an expired session; cleared by clearNotice. */
  notice: string | null;
  clearNotice(): void;
  requestPasswordReset(email: string, redirectTo: string): Promise<void>;
  completePasswordRecovery(link: Extract<RecoveryLink, { ok: true }>, newPassword: string): Promise<void>;
  changePassword(newPassword: string): Promise<void>;
  changeEmail(newEmail: string): Promise<EmailChangeResult>;
  deleteAccount(): Promise<void>;
}

const Ctx = createContext<AccountState | null>(null);
const store = defaultStore();
const skipKey = (uid: string) => `element.onboarding-skipped.${uid}`;

export function AccountProvider({ account, children }: { account: AccountApi; children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(account.currentUser());
  const [prefs, setPrefs] = useState<UserPrefs | null>(null);
  const [reactions, setReactions] = useState<Record<string, Feedback>>({});
  const [skipped, setSkipped] = useState(false);
  const views = useRef(new ViewTracker());
  const [notice, setNotice] = useState<string | null>(null);

  // Track the signed-in user; when the account signs us out by itself (expired
  // session), keep its reason to show "Please sign in again."
  useEffect(
    () =>
      account.onChange((u) => {
        setUser(u);
        if (!u) {
          const reason = account.takeSignOutReason();
          if (reason) setNotice(reason);
        }
      }),
    [account],
  );

  const refreshPrefs = useCallback(async () => {
    if (!account.currentUser()) return null;
    try {
      const p = await account.getPrefs();
      setPrefs(p);
      return p;
    } catch {
      return null;
    }
  }, [account]);

  // A different user (or sign-out) starts from a clean slate.
  useEffect(() => {
    setPrefs(null);
    setReactions({});
    views.current.reset();
    setSkipped(user ? store.get(skipKey(user.id)) === '1' : false);
    if (user) void refreshPrefs();
  }, [user, refreshPrefs]);

  // Opening an original source counts as interest in that card.
  useEffect(() => {
    if (!user) {
      setOpenSourceListener(null);
      return;
    }
    setOpenSourceListener((cardId) => void account.track(cardId, 'open_source').catch(() => undefined));
    return () => setOpenSourceListener(null);
  }, [user, account]);

  const value = useMemo<AccountState>(
    () => ({
      account,
      user,
      prefs,
      onboardingSkipped: skipped,
      reactions,
      signIn: (email, password) => account.signIn(email, password),
      signUp: (email, password) => account.signUp(email, password),
      signOut: () => account.signOut(),
      async savePrefs(followed) {
        const p = await account.setPrefs(followed);
        setPrefs(p);
      },
      skipOnboarding() {
        if (user) store.set(skipKey(user.id), '1');
        setSkipped(true);
      },
      react(card, pressed) {
        if (!user) return;
        const current = reactions[card.id];
        const event = feedbackEvent(current, pressed);
        // Optimistic: the button flips at once; a failed call puts it back.
        setReactions((r) => {
          const next = { ...r };
          if (event === 'clear') delete next[card.id];
          else next[card.id] = pressed;
          return next;
        });
        account.track(card.id, event).catch(() =>
          setReactions((r) => {
            const next = { ...r };
            if (current) next[card.id] = current;
            else delete next[card.id];
            return next;
          }),
        );
      },
      noteCards(cards) {
        const found: Record<string, Feedback> = {};
        for (const c of cards) {
          const r = reactionOf(c);
          if (r) found[c.id] = r;
        }
        if (Object.keys(found).length > 0) setReactions((r) => ({ ...found, ...r }));
      },
      trackView(card) {
        if (!user || !views.current.shouldTrack(card.id)) return;
        account.track(card.id, 'view').catch(() => undefined);
      },
      async deleteMyData() {
        await account.deleteMyData();
        setReactions({});
        views.current.reset();
        await refreshPrefs();
      },
      refreshPrefs,
      notice,
      clearNotice: () => setNotice(null),
      requestPasswordReset: (email, redirectTo) => account.requestPasswordReset(email, redirectTo),
      async completePasswordRecovery(link, newPassword) {
        await account.completePasswordRecovery(link, newPassword);
        setNotice(null);
      },
      changePassword: (newPassword) => account.changePassword(newPassword),
      async changeEmail(newEmail) {
        const r = await account.changeEmail(newEmail);
        setUser(account.currentUser());
        return r;
      },
      async deleteAccount() {
        await account.deleteAccount();
        setReactions({});
        views.current.reset();
        setNotice('Your account was deleted.');
      },
    }),
    [account, user, prefs, skipped, reactions, refreshPrefs, notice],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccount(): AccountState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAccount must be used inside AccountProvider');
  return v;
}
