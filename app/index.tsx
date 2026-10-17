// Feed screen. Phones: wordmark, Top/Latest tabs, category chips, the swipe
// pager, bottom nav. Wide web: left rail, feed column, Numbers to know on the right.

import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BlurbCard, CategorySlug, FeedMode } from '../contract/types.ts';
import { useAppData } from '../lib/appData';
import { useFeed } from '../lib/useFeed';
import { usePalette, useWide } from '../lib/useTheme';
import { fonts } from '../lib/theme';
import { CategoryChips } from '../components/CategoryChips';
import { FeedPager } from '../components/FeedPager';
import { NumbersPanel } from '../components/NumbersPanel';
import { Shell, Wordmark } from '../components/Shell';
import { SortToggle } from '../components/SortToggle';
import { SourcesSheet } from '../components/SourcesSheet';
import { EmptyState, ErrorState, LoadingState } from '../components/States';

export default function FeedScreen() {
  const p = usePalette();
  const wide = useWide();
  const { api, config, categories } = useAppData();
  const [mode, setMode] = useState<FeedMode>('top');
  const [category, setCategory] = useState<CategorySlug | null>(null);
  const [sheetCard, setSheetCard] = useState<BlurbCard | null>(null);
  const { state, loadMore, retry } = useFeed(api, { mode, category });
  const showSources = useCallback((c: BlurbCard) => setSheetCard(c), []);

  const first = state.items.length === 0;
  let body;
  if (first && state.error) body = <ErrorState message={state.error} onRetry={retry} />;
  else if (first && (state.loading || !state.done)) body = <LoadingState label="Loading the feed…" />;
  else if (first) {
    body = (
      <EmptyState
        message={category ? 'No cards in this category yet.' : 'No cards yet. Check back soon.'}
        actionLabel={category ? 'Show all categories' : undefined}
        onAction={category ? () => setCategory(null) : undefined}
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
        wide={wide}
      />
    );
  }

  const inlineError =
    state.items.length > 0 && state.error ? (
      <Pressable onPress={retry} accessibilityRole="button" style={[styles.inlineError, { backgroundColor: p.dataSoft }]}>
        <Text style={{ color: p.dataInk, fontFamily: fonts.sansSemi }}>Could not load more. Tap to retry.</Text>
      </Pressable>
    ) : null;

  const aside = wide ? (
    <View style={[styles.asideCard, { backgroundColor: p.surface, borderColor: p.border }]}>
      <Text style={[styles.asideTitle, { color: p.ink }]} accessibilityRole="header">
        Numbers to know
      </Text>
      <NumbersPanel api={api} config={config} variant="compact" />
    </View>
  ) : undefined;

  return (
    <Shell active="feed" aside={aside}>
      {wide ? (
        <View style={styles.wideTop}>
          <SortToggle mode={mode} onChange={setMode} wide />
          <CategoryChips categories={categories} selected={category} onSelect={setCategory} wide />
        </View>
      ) : (
        <>
          <View style={styles.brand}>
            <Wordmark />
          </View>
          <View style={styles.tabs}>
            <SortToggle mode={mode} onChange={setMode} />
          </View>
          <CategoryChips categories={categories} selected={category} onSelect={setCategory} />
        </>
      )}
      {inlineError}
      <View style={[styles.fill, wide && { marginTop: 14 }]}>{body}</View>
      <SourcesSheet card={sheetCard} config={config} onClose={() => setSheetCard(null)} />
    </Shell>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  brand: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4, minHeight: 44, justifyContent: 'center' },
  tabs: { paddingHorizontal: 20 },
  wideTop: { paddingTop: 28, gap: 14 },
  inlineError: { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, marginTop: 6 },
  asideCard: { borderWidth: 1, borderRadius: 20, padding: 20, gap: 4 },
  asideTitle: { fontFamily: fonts.serif, fontSize: 24, letterSpacing: -0.24, marginBottom: 6 },
});
