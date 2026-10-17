// One feed card: badge and meta, headline, (numbers), body, tickers, source row,
// AI label, then a footer with the disclaimer and the "next" hint. Every card
// carries the disclaimer. No images, no prices.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppConfig, BlurbCard, Category } from '../contract/types.ts';
import { categoryName, clampHeadline, relativeTime } from '../lib/format';
import { cardLabels } from '../lib/labels';
import { usePalette } from '../lib/useTheme';
import type { Palette } from '../lib/theme';
import { fonts } from '../lib/theme';
import { DataFacts } from './DataCard';
import { ChevronUpIcon, NumbersIcon, SparkleIcon } from './Icons';
import { AiLabel, Disclaimer } from './Labels';
import { SourceRow } from './SourceChip';

interface Props {
  card: BlurbCard;
  config: AppConfig | null;
  categories: Category[];
  onShowSources: (card: BlurbCard) => void;
  onNext?: () => void;
  wide?: boolean;
  compact?: boolean; // short screens: smaller type so the card fits
}

function badgeFor(card: BlurbCard, p: Palette): { text: string; bg: string; fg: string; Icon: typeof SparkleIcon | null } {
  if (card.kind === 'data') return { text: 'New data', bg: p.dataSoft, fg: p.dataInk, Icon: NumbersIcon };
  if (card.ai.generated) return { text: 'Summary', bg: p.accentSoft, fg: p.accentInk, Icon: SparkleIcon };
  return { text: 'From the source', bg: p.surfaceMuted, fg: p.inkSoft, Icon: null };
}

export function Card({ card, config, categories, onShowSources, onNext, wide, compact }: Props) {
  const p = usePalette();
  const labels = cardLabels(card, config);
  const badge = badgeFor(card, p);
  // Design size is 32 (42 on wide); long headlines and short screens step down so the body fits.
  const headlineSize = wide ? 42 : compact ? 26 : card.headline.length > 60 ? 28 : 32;
  return (
    <View style={[styles.card, wide && styles.cardWide, { backgroundColor: p.surface, borderColor: p.border }]}>
      <View style={styles.meta}>
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          {badge.Icon ? <badge.Icon color={badge.fg} size={14} /> : null}
          <Text style={[styles.badgeText, { color: badge.fg }]}>{badge.text}</Text>
        </View>
        <View style={styles.metaRight}>
          {card.updated_at ? <Text style={[styles.updated, { color: p.dataInk, borderColor: p.dataInk }]}>Updated</Text> : null}
          <Text style={[styles.metaText, wide && { fontSize: 14 }, { color: p.muted }]}>
            {categoryName(card.category, categories)} · {relativeTime(card.as_of)}
          </Text>
        </View>
      </View>

      {/* Only this middle part may shrink (and clip); the source row, AI label and
          disclaimer below never do, so they are always visible. */}
      <View style={[styles.middle, wide && { gap: 18 }]}>
        <Text
          style={[styles.headline, { color: p.ink, fontSize: headlineSize, lineHeight: headlineSize * 1.1, letterSpacing: wide ? -0.8 : -0.5 }]}
          accessibilityRole="header"
        >
          {clampHeadline(card.headline)}
        </Text>

        {card.kind === 'data' ? <DataFacts card={card} config={config} compact={compact} /> : null}

        {card.body ? (
          <Text
            style={[styles.body, wide && styles.bodyWide, compact && styles.bodyCompact, { color: p.inkBody }]}
            numberOfLines={card.kind === 'data' && card.macro.length > 1 && !wide ? 2 : undefined}
          >
            {card.body}
          </Text>
        ) : null}

        {card.tickers.length > 0 ? (
          <View style={styles.tickers}>
            {card.tickers.map((t) => (
              <Text
                key={t.symbol}
                style={[styles.ticker, { color: p.inkSoft, borderColor: p.borderStrong }]}
                accessibilityLabel={`${t.name}, ticker ${t.symbol}`}
              >
                {t.symbol}
              </Text>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.spacer} />

      <View style={styles.sourceBlock}>
        <SourceRow card={card} onShowAll={() => onShowSources(card)} wide={wide} />
        {labels.aiLabel ? <AiLabel text={labels.aiLabel} /> : null}
      </View>

      <View style={[styles.footer, { borderTopColor: p.divider }]}>
        <View style={styles.footerText}>
          <Disclaimer text={labels.disclaimer} />
        </View>
        {onNext ? (
          <Pressable onPress={onNext} accessibilityRole="button" accessibilityLabel="Next card" hitSlop={8} style={styles.next}>
            {wide ? null : <ChevronUpIcon color={p.muted} />}
            <Text style={[styles.nextText, wide && { fontSize: 14 }, { color: p.muted }]}>{wide ? 'Next: press ↓ or scroll' : 'Swipe up'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, borderWidth: 1, borderRadius: 24, padding: 24, gap: 16, overflow: 'hidden' },
  cardWide: { padding: 32, gap: 18 },
  meta: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  metaRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 10, borderRadius: 14 },
  badgeText: { fontFamily: fonts.sansSemi, fontSize: 13 },
  updated: { fontFamily: fonts.sansSemi, fontSize: 12, borderWidth: 1, borderRadius: 6, paddingHorizontal: 5 },
  metaText: { fontFamily: fonts.sans, fontSize: 13 },
  headline: { fontFamily: fonts.serif },
  body: { fontFamily: fonts.sans, fontSize: 18, lineHeight: 27 },
  bodyWide: { fontSize: 19, lineHeight: 29.5 },
  bodyCompact: { fontSize: 16, lineHeight: 23 },
  tickers: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  ticker: { fontFamily: fonts.sansMedium, fontSize: 13, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 3 },
  middle: { flexShrink: 1, minHeight: 0, overflow: 'hidden', gap: 16 },
  spacer: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minHeight: 0 },
  sourceBlock: { gap: 8, flexShrink: 0 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, paddingTop: 12, flexShrink: 0 },
  footerText: { flex: 1 },
  next: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 6 },
  nextText: { fontFamily: fonts.sansMedium, fontSize: 13 },
});
