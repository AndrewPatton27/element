// Vertical one-card-per-screen pager. FlatList with paging and snap. The card's
// footer hint ("Swipe up" / "Next: press ↓ or scroll") is a Next button, and on
// web the arrow keys, PageUp/PageDown and j/k move between cards too.

import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Platform, Text, StyleSheet, View, type FlatListProps, type LayoutChangeEvent } from 'react-native';
import type { AppConfig, BlurbCard, Category } from '../contract/types.ts';
import { usePalette } from '../lib/useTheme';
import { fonts } from '../lib/theme';
import { scrollToIndexFallbackOffset } from '../lib/pagerLogic';
import { Card } from './Card';
import { CardErrorBoundary } from './ErrorBoundary';
import type { Feedback } from '../lib/accountLogic';
import { LoadingState } from './States';

interface Props {
  items: BlurbCard[];
  config: AppConfig | null;
  categories: Category[];
  loadingMore: boolean;
  done: boolean;
  onEndReached: () => void;
  onShowSources: (card: BlurbCard) => void;
  onOpenDetail?: (card: BlurbCard) => void;
  onMore?: (card: BlurbCard) => void;
  wide?: boolean;
  reactions?: Record<string, Feedback>;
  onReact?: (card: BlurbCard, pressed: Feedback) => void;
  onActiveCard?: (card: BlurbCard) => void; // the card now on screen (for view tracking)
  active?: boolean; // false when another screen or a sheet is on top: keys are left alone
}

// Below this page height the card switches to smaller type so it fits.
const COMPACT_BELOW = 640;

export function FeedPager({
  items,
  config,
  categories,
  loadingMore,
  done,
  onEndReached,
  onShowSources,
  onOpenDetail,
  wide,
  reactions,
  onReact,
  onActiveCard,
  active,
  onMore,
}: Props) {
  const p = usePalette();
  const list = useRef<FlatList<BlurbCard>>(null);
  const [height, setHeight] = useState(0);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  indexRef.current = index;

  const onLayout = (e: LayoutChangeEvent) => setHeight(Math.round(e.nativeEvent.layout.height));

  const onViewable = useRef<NonNullable<FlatListProps<BlurbCard>['onViewableItemsChanged']>>(({ viewableItems }) => {
    const first = viewableItems.find((v) => v.isViewable && typeof v.index === 'number');
    if (first && typeof first.index === 'number') setIndex(first.index);
  }).current;

  const goTo = useCallback(
    (i: number) => {
      if (items.length === 0) return;
      const target = Math.max(0, Math.min(items.length - 1, i));
      list.current?.scrollToIndex({ index: target, animated: true });
      setIndex(target);
      if (target >= items.length - 2) onEndReached();
    },
    [items.length, onEndReached],
  );
  const next = useCallback(() => goTo(indexRef.current + 1), [goTo]);

  // Fast key-nav can target a row that isn't laid out yet, which makes scrollToIndex
  // throw "out of range". Wait one frame and retry; if it still can't, scroll to the
  // computed offset (index * itemHeight) so navigation never throws or no-ops.
  const onScrollToIndexFailed = useCallback(
    (info: { index: number; highestMeasuredFrameIndex: number; averageItemLength: number }) => {
      const offset = scrollToIndexFallbackOffset(info, height);
      requestAnimationFrame(() => {
        try {
          list.current?.scrollToIndex({ index: info.index, animated: true });
        } catch {
          list.current?.scrollToOffset({ offset, animated: true });
        }
      });
    },
    [height],
  );

  // Page height changed (window resized, phone rotated): the old scroll offset no
  // longer lines up with a card, so jump straight back to the current one.
  useEffect(() => {
    if (height > 0 && indexRef.current > 0) list.current?.scrollToOffset({ offset: height * indexRef.current, animated: false });
  }, [height]);

  const current = items[index];
  useEffect(() => {
    if (current && onActiveCard) onActiveCard(current);
  }, [current, onActiveCard]);

  // New filter -> new list: jump back to the first card.
  const firstId = items[0]?.id;
  useEffect(() => {
    setIndex(0);
    list.current?.scrollToOffset({ offset: 0, animated: false });
  }, [firstId]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || active === false) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (['ArrowDown', 'PageDown', 'j'].includes(e.key)) {
        e.preventDefault();
        goTo(indexRef.current + 1);
      } else if (['ArrowUp', 'PageUp', 'k'].includes(e.key)) {
        e.preventDefault();
        goTo(indexRef.current - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo, active]);

  const compact = !wide && height > 0 && height < COMPACT_BELOW;
  const renderItem = useCallback(
    ({ item, index: i }: { item: BlurbCard; index: number }) => {
      const last = i === items.length - 1 && done;
      return (
        <View style={[styles.page, wide && styles.pageWide, { height }]}>
          <CardErrorBoundary resetKey={item.id}>
            <Card
              card={item}
              config={config}
              categories={categories}
              onShowSources={onShowSources}
              onOpenDetail={onOpenDetail}
              onMore={onMore}
              onNext={last ? undefined : next}
              wide={wide}
              compact={compact}
              reaction={reactions?.[item.id]}
              onReact={onReact}
            />
          </CardErrorBoundary>
          {/* the edge of the next card peeking out below, as in the design (phone layout only) */}
          {wide ? null : <View style={[styles.stack, { backgroundColor: p.surface, borderColor: p.border, opacity: last ? 0 : 1 }]} />}
        </View>
      );
    },
    [height, config, categories, onShowSources, onOpenDetail, onMore, next, wide, compact, items.length, done, p, reactions, onReact],
  );

  return (
    <View style={styles.fill} onLayout={onLayout}>
      {height > 0 ? (
        <FlatList
          ref={list}
          data={items}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          pagingEnabled
          snapToInterval={height}
          snapToAlignment="start"
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, i) => ({ length: height, offset: height * i, index: i })}
          onEndReached={onEndReached}
          onEndReachedThreshold={2}
          onScrollToIndexFailed={onScrollToIndexFailed}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          windowSize={5}
          initialNumToRender={2}
          removeClippedSubviews={Platform.OS !== 'web'}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ height: 80 }}>
                <LoadingState label="Loading more…" />
              </View>
            ) : done && items.length > 0 ? (
              <View style={styles.end}>
                <Text style={[styles.endText, { color: p.muted }]}>You’re all caught up. Switch to Latest or another topic.</Text>
              </View>
            ) : undefined
          }
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  end: { height: 120, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  endText: { fontFamily: fonts.sansMedium, fontSize: 14, textAlign: 'center' },
  fill: { flex: 1 },
  page: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  pageWide: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 12 },
  stack: { height: 10, marginHorizontal: 28, borderWidth: 1, borderTopWidth: 0, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
});
