// Feed screen. Phones: wordmark, Trending / Latest (/ For you) tabs, category chips,
// the swipe pager, bottom nav. Wide web (docs/design/web/Web-Final.dc.html): top bar
// with the tabs, Numbers strip, categories on the left, the wide card in the middle,
// top stories and trends on the right (Shell lays out the frame). Guests see a gentle
// sign-in prompt; the feed never needs an account.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { DwellTimer } from '../lib/dwell';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import type { BlurbCard, CategorySlug } from '../contract/types.ts';
import { useAppData } from '../lib/appData';
import { useAccount } from '../lib/accountContext';
import { forYouCoversTopics, withoutHidden } from '../lib/accountLogic';
import { sourceName, withoutHiddenSources } from '../lib/sourceKeys';
import { SIGN_IN_AGAIN_MESSAGE } from '../lib/session';
import type { FeedTab } from '../lib/feedLogic';
import { categoryName } from '../lib/format';
import { defaultStore } from '../lib/storage';
import { useFeed } from '../lib/useFeed';
import { usePalette, useWide } from '../lib/useTheme';
import { fonts } from '../lib/theme';
import { CategoryChips, CategoryList } from '../components/CategoryChips';
import { FeedPager } from '../components/FeedPager';
import { CloseIcon } from '../components/Icons';
import { Shell, Wordmark } from '../components/Shell';
import { WideAside, useAsideData } from '../components/WideAside';
import { SortToggle } from '../components/SortToggle';
import { SourcesSheet } from '../components/SourcesSheet';
import { DetailSheet } from '../components/DetailSheet';
import { CardMenu } from '../components/CardMenu';
import { UndoToast } from '../components/UndoToast';
import { EmptyState, ErrorState, LoadingState } from '../components/States';

// Below this window width the right column is dropped.
const ASIDE_MIN_WIDTH = 1180;
const PROMPT_KEY = 'element.signin-prompt-dismissed';
const store = defaultStore();

export default function FeedScreen() {
  const p = usePalette();
  const wide = useWide();
  const { api, config, categories } = useAppData();
  const acct = useAccount();
  const signedIn = acct.user !== null;
  const params = useLocalSearchParams<{ tab?: string; t?: string }>();
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState<FeedTab>(params.tab === 'for_you' ? 'for_you' : 'top');
  const [category, setCategory] = useState<CategorySlug | null>(null);
  const [sheetCard, setSheetCard] = useState<BlurbCard | null>(null);
  const [detailCard, setDetailCard] = useState<BlurbCard | null>(null);
  const [menuCard, setMenuCard] = useState<BlurbCard | null>(null);
  const [undo, setUndo] = useState<
    | { message: string; kind: 'topic'; previous: { followed: string[]; hidden: string[] } }
    | { message: string; kind: 'source'; previous: string[] }
    | null
  >(null);
  // The feed stays mounted under Numbers / About / Account; only drive it (keys,
  // view tracking) while it's the screen on top (B2).
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const [promptHidden, setPromptHidden] = useState(() => store.get(PROMPT_KEY) === '1');

  // Signing out while on For you falls back to Top; arriving from onboarding opens For you.
  useEffect(() => {
    if (!signedIn && mode === 'for_you') setMode('top');
  }, [signedIn, mode]);
  // Other screens' top bar sends ?tab=top|latest|for_you (t makes a repeat tap count).
  useEffect(() => {
    if (params.tab === 'for_you' && signedIn) setMode('for_you');
    else if (params.tab === 'top' || params.tab === 'latest') setMode(params.tab);
  }, [params.tab, params.t, signedIn]);

  const forYou = mode === 'for_you';
  // Signed in: hidden topics leave the feed and the chips at once (the server filters too).
  const hidden = signedIn ? (acct.prefs?.hidden ?? []) : [];
  const hiddenSources = signedIn ? (acct.prefs?.hiddenSources ?? []) : [];
  const sourcesSupported = signedIn && acct.prefs?.hiddenSources != null;
  // The same filter drives the list on screen and the paging, so "end of feed" and "load
  // more" are decided on what the reader can actually see.
  const visible = useCallback(
    (cards: BlurbCard[]) => withoutHiddenSources(withoutHidden(cards, hidden), hiddenSources),
    [hidden, hiddenSources],
  );
  const { state, loadMore, retry } = useFeed(api, { mode, category: forYou ? null : category, user: acct.user?.id ?? null }, acct.account, visible);
  const showSources = useCallback((c: BlurbCard) => setSheetCard(c), []);
  const openDetail = useCallback((c: BlurbCard) => setDetailCard(c), []);

  const items = visible(state.items);
  const chipCategories = withoutHidden(categories, hidden);
  useEffect(() => {
    if (category && hidden.includes(category)) setCategory(null);
  }, [category, hidden]);

  const hideTopic = useCallback(
    (c: BlurbCard) => {
      setMenuCard(null);
      const topic = categoryName(c.category, categories);
      acct
        .hideTopic(c.category)
        .then((previous) => setUndo({ message: `${topic} topics hidden.`, kind: 'topic', previous }))
        .catch(() => setUndo(null));
    },
    [acct, categories],
  );
  const hideSource = useCallback(
    (_c: BlurbCard, key: string) => {
      setMenuCard(null);
      acct
        .hideSource(key)
        .then((previous) => setUndo({ message: `Cards from ${sourceName(key)} hidden.`, kind: 'source', previous }))
        .catch(() => setUndo(null));
    },
    [acct],
  );
  const undoHide = useCallback(() => {
    if (undo?.kind === 'topic') void acct.restoreTopics(undo.previous).catch(() => undefined);
    if (undo?.kind === 'source') void acct.saveSources(undo.previous).catch(() => undefined);
    setUndo(null);
  }, [acct, undo]);
  const clearUndo = useCallback(() => setUndo(null), []);

  const { noteCards, trackView, react, trackDwell, trackDwellOnExit, trackOpenDetail } = acct;

  // ---- Time spent on cards (signed in only) ----
  // The clock runs for the card on screen and pauses while the tab is hidden, a
  // sheet or menu is open, or another screen is on top. Detail time is sent as
  // 'open_detail' instead. Sending is fire and forget.
  const dwell = useRef(new DwellTimer());
  const sendDwell = useCallback((r: { cardId: string; ms: number } | null) => r && trackDwell(r.cardId, r.ms), [trackDwell]);
  const onActiveCard = useCallback(
    (c: BlurbCard) => {
      trackView(c);
      sendDwell(dwell.current.show(c.id, Date.now()));
    },
    [trackView, sendDwell],
  );
  useEffect(() => {
    const t = dwell.current;
    if (focused) t.resume('away', Date.now());
    else t.pause('away', Date.now());
  }, [focused]);
  const overlay = sheetCard !== null || detailCard !== null || menuCard !== null;
  useEffect(() => {
    const t = dwell.current;
    if (overlay) t.pause('sheet', Date.now());
    else t.resume('sheet', Date.now());
  }, [overlay]);
  useEffect(() => {
    if (detailCard && signedIn) trackOpenDetail(detailCard);
  }, [detailCard, signedIn, trackOpenDetail]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') dwell.current.resume('hidden', Date.now());
      else dwell.current.pause('hidden', Date.now());
    });
    // Closing the tab: send what we have. keepalive lets the request outlive the page and keeps
    // the auth header (sendBeacon cannot set headers).
    const onHide = () => {
      const r = dwell.current.finish(Date.now());
      if (r) trackDwellOnExit(r.cardId, r.ms);
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.addEventListener('pagehide', onHide);
    return () => {
      sub.remove();
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.removeEventListener('pagehide', onHide);
    };
  }, [trackDwellOnExit]);
  useEffect(() => {
    // Signing out (or a different user) ends the current look without sending it.
    dwell.current.finish(Date.now());
  }, [acct.user?.id]);
  useEffect(() => {
    if (forYou) noteCards(state.items);
  }, [forYou, state.items, noteCards]);

  const first = items.length === 0;
  let body;
  if (first && state.error) body = <ErrorState message={state.error} onRetry={retry} />;
  else if (first && (state.loading || !state.done)) body = <LoadingState label="Loading the feed…" />;
  else if (first) {
    body = (
      <EmptyState
        message={forYou ? 'Nothing new in your topics yet.' : category ? 'No cards in this category yet.' : 'No cards yet. Check back soon.'}
        actionLabel={forYou ? 'Show Trending' : category ? 'Show all categories' : undefined}
        onAction={forYou ? () => setMode('top') : category ? () => setCategory(null) : undefined}
      />
    );
  } else {
    body = (
      <FeedPager
        items={items}
        config={config}
        categories={categories}
        loadingMore={state.loading}
        done={state.done}
        onEndReached={loadMore}
        onShowSources={showSources}
        onOpenDetail={openDetail}
        wide={wide}
        reactions={signedIn ? acct.reactions : undefined}
        onReact={signedIn ? react : undefined}
        onActiveCard={signedIn && focused ? onActiveCard : undefined}
        active={focused && sheetCard === null && detailCard === null && menuCard === null}
        onMore={signedIn ? setMenuCard : undefined}
      />
    );
  }

  const inlineError =
    items.length > 0 && state.error ? (
      <Pressable onPress={retry} accessibilityRole="button" style={[styles.inlineError, { backgroundColor: p.dataSoft }]}>
        <Text style={{ color: p.dataInk, fontFamily: fonts.sansSemi }}>Could not load more. Tap to retry.</Text>
      </Pressable>
    ) : null;

  // Guests: one quiet line under the chips, dismissible. Never blocks the feed.
  const expired = acct.notice === SIGN_IN_AGAIN_MESSAGE; // not "Your account was deleted."
  const prompt =
    !signedIn && (!promptHidden || expired) ? (
      <View style={[styles.prompt, !wide && styles.promptNarrow, wide && styles.promptWide, { backgroundColor: p.accentSoft }]}>
        <Pressable onPress={() => router.navigate('/signin' as never)} accessibilityRole="link" style={styles.promptMain}>
          <Text style={[styles.promptText, { color: p.accentInk }]}>
            {expired ? `${acct.notice} Sign in →` : 'Sign in for a feed tailored to you →'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            store.set(PROMPT_KEY, '1');
            setPromptHidden(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Hide this suggestion"
          hitSlop={10}
          style={styles.promptClose}
        >
          <CloseIcon color={p.accentInk} size={16} />
        </Pressable>
      </View>
    ) : null;

  // For you: the chips don't apply; show what it is built from instead.
  const followed = acct.prefs?.followed ?? [];
  const forYouLine = forYou ? (
    <View style={[styles.forYouLine, !wide && styles.promptNarrow, wide && styles.forYouWide]}>
      <Text style={[styles.forYouText, wide && { flex: 0 }, { color: p.muted }]} numberOfLines={wide ? 6 : 2}>
        {!forYouCoversTopics(state.items, followed)
          ? 'No new cards in your topics yet; showing top stories.'
          : followed.length
            ? `Tailored to ${followed.map((s) => categoryName(s, categories)).join(', ')} and your likes.`
            : 'Tailored to your likes.'}
      </Text>
      <Pressable onPress={() => router.navigate('/account' as never)} accessibilityRole="link" hitSlop={8}>
        <Text style={[styles.forYouEdit, { color: p.accentInk }]}>{followed.length ? 'Edit topics' : 'Pick topics'}</Text>
      </Pressable>
    </View>
  ) : null;

  // Under ~1180 px the right column would squeeze the card, so it steps aside (and its
  // two RPCs are not called).
  const asideFits = wide && width >= ASIDE_MIN_WIDTH;
  const aside = useAsideData(api, asideFits);
  // Hidden topics and sources leave Top stories too.
  const asideShown = { ...aside, stories: visible(aside.stories) };
  const showAside = asideFits && (aside.loading || asideShown.stories.length > 0 || aside.trends.length > 0);

  const chips = forYou ? (
    forYouLine
  ) : (
    <CategoryChips
      categories={chipCategories}
      selected={category}
      onSelect={setCategory}
      wide={wide}
      onEdit={signedIn ? () => router.navigate('/account' as never) : undefined}
    />
  );

  return (
    <Shell
      active="feed"
      feedTab={{ mode, onChange: setMode }}
      left={
        wide ? (
          <>
            {forYou ? (
              forYouLine
            ) : (
              <CategoryList
                categories={chipCategories}
                selected={category}
                onSelect={setCategory}
                onEdit={signedIn ? () => router.navigate('/account' as never) : undefined}
              />
            )}
            {prompt}
          </>
        ) : undefined
      }
      aside={
        showAside ? <WideAside data={asideShown} categories={categories} onOpenStory={openDetail} /> : undefined
      }
    >
      {wide ? null : (
        <>
          <View style={styles.brand}>
            <Wordmark />
          </View>
          <View style={styles.tabs}>
            <SortToggle mode={mode} onChange={setMode} forYou={signedIn} />
          </View>
          {chips}
          {prompt}
        </>
      )}
      {inlineError}
      <View style={styles.fill}>{body}</View>
      <SourcesSheet card={sheetCard} config={config} onClose={() => setSheetCard(null)} />
      <DetailSheet card={detailCard} config={config} categories={categories} onClose={() => setDetailCard(null)} />
      <CardMenu
        card={menuCard}
        categories={categories}
        onHideTopic={hideTopic}
        onHideSource={sourcesSupported ? hideSource : undefined}
        onClose={() => setMenuCard(null)}
      />
      <UndoToast message={undo?.message ?? null} onUndo={undoHide} onDone={clearUndo} />
    </Shell>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  brand: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4, minHeight: 44, justifyContent: 'center' },
  tabs: { paddingHorizontal: 20 },
  inlineError: { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, marginTop: 6 },
  prompt: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingLeft: 14, paddingRight: 8, minHeight: 40 },
  promptWide: { marginTop: 16, paddingLeft: 12, minHeight: 0 },
  promptNarrow: { marginHorizontal: 20, marginTop: 8 },
  promptMain: { flex: 1, paddingVertical: 8 },
  promptText: { fontFamily: fonts.sansSemi, fontSize: 14 },
  promptClose: { padding: 6 },
  forYouLine: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 36 },
  forYouWide: { flexDirection: 'column', alignItems: 'flex-start', gap: 6, paddingHorizontal: 12 },
  forYouText: { flex: 1, fontFamily: fonts.sans, fontSize: 14, lineHeight: 19 },
  forYouEdit: { fontFamily: fonts.sansSemi, fontSize: 14 },
});
