// Feed screen. Phones: wordmark, Top / Latest (/ For you) tabs, category chips,
// the swipe pager, bottom nav. Wide web: left rail, feed column, Numbers to know
// on the right. Guests see a gentle sign-in prompt; the feed never needs an account.

import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import type { BlurbCard, CategorySlug } from '../contract/types.ts';
import { useAppData } from '../lib/appData';
import { useAccount } from '../lib/accountContext';
import { forYouCoversTopics } from '../lib/accountLogic';
import { SIGN_IN_AGAIN_MESSAGE } from '../lib/session';
import type { FeedTab } from '../lib/feedLogic';
import { categoryName } from '../lib/format';
import { defaultStore } from '../lib/storage';
import { useFeed } from '../lib/useFeed';
import { usePalette, useWide } from '../lib/useTheme';
import { fonts } from '../lib/theme';
import { CategoryChips } from '../components/CategoryChips';
import { FeedPager } from '../components/FeedPager';
import { CloseIcon } from '../components/Icons';
import { NumbersPanel } from '../components/NumbersPanel';
import { Shell, Wordmark } from '../components/Shell';
import { SortToggle } from '../components/SortToggle';
import { SourcesSheet } from '../components/SourcesSheet';
import { DetailSheet } from '../components/DetailSheet';
import { EmptyState, ErrorState, LoadingState } from '../components/States';

const PROMPT_KEY = 'element.signin-prompt-dismissed';
const store = defaultStore();

export default function FeedScreen() {
  const p = usePalette();
  const wide = useWide();
  const { api, config, categories } = useAppData();
  const acct = useAccount();
  const signedIn = acct.user !== null;
  const params = useLocalSearchParams<{ tab?: string }>();
  const [mode, setMode] = useState<FeedTab>(params.tab === 'for_you' ? 'for_you' : 'top');
  const [category, setCategory] = useState<CategorySlug | null>(null);
  const [sheetCard, setSheetCard] = useState<BlurbCard | null>(null);
  const [detailCard, setDetailCard] = useState<BlurbCard | null>(null);
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
  useEffect(() => {
    if (params.tab === 'for_you' && signedIn) setMode('for_you');
  }, [params.tab, signedIn]);

  const forYou = mode === 'for_you';
  const { state, loadMore, retry } = useFeed(api, { mode, category: forYou ? null : category, user: acct.user?.id ?? null }, acct.account);
  const showSources = useCallback((c: BlurbCard) => setSheetCard(c), []);
  const openDetail = useCallback((c: BlurbCard) => setDetailCard(c), []);

  const { noteCards, trackView, react } = acct;
  useEffect(() => {
    if (forYou) noteCards(state.items);
  }, [forYou, state.items, noteCards]);

  const first = state.items.length === 0;
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
        items={state.items}
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
        onActiveCard={signedIn && focused ? trackView : undefined}
        active={focused && sheetCard === null && detailCard === null}
      />
    );
  }

  const inlineError =
    state.items.length > 0 && state.error ? (
      <Pressable onPress={retry} accessibilityRole="button" style={[styles.inlineError, { backgroundColor: p.dataSoft }]}>
        <Text style={{ color: p.dataInk, fontFamily: fonts.sansSemi }}>Could not load more. Tap to retry.</Text>
      </Pressable>
    ) : null;

  // Guests: one quiet line under the chips, dismissible. Never blocks the feed.
  const expired = acct.notice === SIGN_IN_AGAIN_MESSAGE; // not "Your account was deleted."
  const prompt =
    !signedIn && (!promptHidden || expired) ? (
      <View style={[styles.prompt, !wide && styles.promptNarrow, { backgroundColor: p.accentSoft }]}>
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
    <View style={[styles.forYouLine, !wide && styles.promptNarrow]}>
      <Text style={[styles.forYouText, { color: p.muted }]} numberOfLines={2}>
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

  const aside = wide ? (
    <View style={[styles.asideCard, { backgroundColor: p.surface, borderColor: p.border }]}>
      <Text style={[styles.asideTitle, { color: p.ink }]} accessibilityRole="header">
        Numbers to know
      </Text>
      <NumbersPanel api={api} config={config} variant="compact" />
    </View>
  ) : undefined;

  const chips = forYou ? forYouLine : <CategoryChips categories={categories} selected={category} onSelect={setCategory} wide={wide} />;

  return (
    <Shell active="feed" aside={aside}>
      {wide ? (
        <View style={styles.wideTop}>
          <SortToggle mode={mode} onChange={setMode} wide forYou={signedIn} />
          {chips}
          {prompt}
        </View>
      ) : (
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
      <View style={[styles.fill, wide && { marginTop: 14 }]}>{body}</View>
      <SourcesSheet card={sheetCard} config={config} onClose={() => setSheetCard(null)} />
      <DetailSheet card={detailCard} config={config} categories={categories} onClose={() => setDetailCard(null)} />
    </Shell>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  brand: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4, minHeight: 44, justifyContent: 'center' },
  tabs: { paddingHorizontal: 20 },
  wideTop: { paddingTop: 28, gap: 14 },
  inlineError: { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, marginTop: 6 },
  prompt: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingLeft: 14, paddingRight: 8, minHeight: 40 },
  promptNarrow: { marginHorizontal: 20, marginTop: 8 },
  promptMain: { flex: 1, paddingVertical: 8 },
  promptText: { fontFamily: fonts.sansSemi, fontSize: 14 },
  promptClose: { padding: 6 },
  forYouLine: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 36 },
  forYouText: { flex: 1, fontFamily: fonts.sans, fontSize: 14, lineHeight: 19 },
  forYouEdit: { fontFamily: fonts.sansSemi, fontSize: 14 },
  asideCard: { borderWidth: 1, borderRadius: 20, padding: 20, gap: 4 },
  asideTitle: { fontFamily: fonts.serif, fontSize: 24, letterSpacing: -0.24, marginBottom: 6 },
});
