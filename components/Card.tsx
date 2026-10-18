// One feed card: badge and meta, headline, (numbers), body, tickers, source row,
// AI label, then a footer with the disclaimer and the "next" hint. Every card
// carries the disclaimer. No images, no prices.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppConfig, BlurbCard, Category } from '../contract/types.ts';
import { cardTime, categoryName, clampHeadline, eventLabel } from '../lib/format';
import { cardLabels, disclaimerPlacement, primarySource, shareAlikeCredit } from '../lib/labels';
import { OPEN_DETAIL_HINT, cardDetail } from '../lib/detail';
import { usePalette } from '../lib/useTheme';
import type { Palette } from '../lib/theme';
import { fonts } from '../lib/theme';
import { DataFacts } from './DataCard';
import { ChevronUpIcon, NumbersIcon, SparkleIcon, ThumbDownIcon, ThumbUpIcon } from './Icons';
import type { Feedback } from '../lib/accountLogic';
import { AiLabel, Disclaimer, ShareAlikeLine } from './Labels';
import { SourceRow } from './SourceChip';

interface Props {
  card: BlurbCard;
  config: AppConfig | null;
  categories: Category[];
  onShowSources: (card: BlurbCard) => void;
  onOpenDetail?: (card: BlurbCard) => void; // tap on the card body
  onMore?: (card: BlurbCard) => void; // "⋯" options (signed in only)
  onNext?: () => void;
  wide?: boolean;
  compact?: boolean; // short screens: smaller type so the card fits
  reaction?: Feedback; // signed in: this user's like/dislike
  onReact?: (card: BlurbCard, pressed: Feedback) => void; // signed in only
}

function badgeFor(card: BlurbCard, p: Palette): { text: string; bg: string; fg: string; Icon: typeof SparkleIcon | null } {
  if (card.kind === 'data') return { text: 'New data', bg: p.dataSoft, fg: p.dataInk, Icon: NumbersIcon };
  if (card.ai.generated) return { text: 'Summary', bg: p.accentSoft, fg: p.accentInk, Icon: SparkleIcon };
  return { text: 'From the source', bg: p.surfaceMuted, fg: p.inkSoft, Icon: null };
}

// The badge wording, shared with the top-stories list.
export function badgeLabel(card: BlurbCard): string {
  if (card.kind === 'data') return 'New data';
  return card.ai.generated ? 'Summary' : 'From the source';
}

// Wide summary cards: Agency / Type / Published, only the ones we have.
function factsFor(card: BlurbCard): { label: string; value: string }[] {
  if (card.kind !== 'summary') return [];
  const src = primarySource(card);
  if (!src) return [];
  const out: { label: string; value: string }[] = [];
  out.push({ label: src.kind === 'news' ? 'Source' : 'Agency', value: src.name });
  const type = src.doc_label ?? eventLabel(card.event_type);
  if (type) out.push({ label: 'Type', value: type });
  out.push({ label: 'Published', value: cardTime(card) });
  return out;
}

// "World · 2 h ago", or "Recalls & Safety · Recall · 2 h ago" when the event adds something.
function metaLine(card: BlurbCard, categories: Category[]): string {
  const category = categoryName(card.category, categories);
  const event = eventLabel(card.event_type);
  const parts = [category];
  if (event && !category.toLowerCase().includes(event.toLowerCase())) parts.push(event);
  // Same label the detail sheet shows (lib/format cardTime), so the two never disagree.
  parts.push(cardTime(card));
  return parts.join(' · ');
}

export function Card({ card, config, categories, onShowSources, onOpenDetail, onNext, wide, compact, reaction, onReact, onMore }: Props) {
  const hasDetail = cardDetail(card) !== null;
  const opensDetail = !!onOpenDetail && hasDetail;
  // A malformed ticker from the server is skipped, not shown as an empty chip.
  const validTickers = card.tickers.filter((t) => t && typeof t.symbol === 'string' && t.symbol !== '');
  const p = usePalette();
  const labels = cardLabels(card, config);
  const credit = shareAlikeCredit(card, config);
  const badge = badgeFor(card, p);
  const reactFn = typeof onReact === 'function' ? onReact : undefined;
  // The disclaimer is built once and placed in exactly one slot (see disclaimerPlacement).
  const place = disclaimerPlacement(reactFn !== undefined);
  const disclaimer = <Disclaimer text={labels.disclaimer} />;
  // Design size is 32 (48 on wide); long headlines and short screens step down so the body fits.
  // A narrow wide column (small desktop window) steps the wide headline down too.
  // A short desktop window (card under 660 px tall) tightens padding, gaps and type so
  // the sources, labels and disclaimer still fit without scrolling.
  const [box, setBox] = useState({ w: 0, h: 0 });
  const tight = !!wide && box.h > 0 && box.h < 660;
  const wideSize = tight ? 40 : box.w > 0 && box.w < 600 ? 38 : card.headline.length > 80 ? 42 : 48;
  const headlineSize = wide ? wideSize : compact ? 26 : card.headline.length > 60 ? 28 : 32;
  const facts = wide ? factsFor(card) : [];
  return (
    <View
      onLayout={wide ? (e) => setBox({ w: Math.round(e.nativeEvent.layout.width), h: Math.round(e.nativeEvent.layout.height) }) : undefined}
      style={[styles.card, wide && styles.cardWide, tight && styles.cardTight, compact && styles.cardCompact, { backgroundColor: p.surface, borderColor: p.border }]}
    >
      <View style={styles.meta}>
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          {badge.Icon ? <badge.Icon color={badge.fg} size={14} /> : null}
          <Text style={[styles.badgeText, { color: badge.fg }]}>{badge.text}</Text>
        </View>
        <View style={styles.metaRight}>
          {/* No "Updated" badge: every rewrite pass sets updated_at, so it said nothing (audit C1). */}
          <Text style={[styles.metaText, wide && { fontSize: 14 }, { color: p.muted }]}>{metaLine(card, categories)}</Text>
          {onMore ? (
            <Pressable
              onPress={() => onMore(card)}
              accessibilityRole="button"
              accessibilityLabel="More options for this card"
              style={styles.moreBtn}
            >
              <Text style={[styles.moreDots, { color: p.muted }]}>⋯</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Only this middle part may shrink (and clip); the source row, AI label and
          disclaimer below never do, so they are always visible. Tapping it opens the
          detail sheet, but only when the card has detail (otherwise the sheet would just
          say "not available"); the source row and the buttons below keep their own actions.
          The hint is part of the label because react-native-web drops accessibilityHint. */}
      <Pressable
        onPress={opensDetail ? () => onOpenDetail?.(card) : undefined}
        disabled={!opensDetail}
        accessibilityRole={opensDetail ? 'button' : undefined}
        accessibilityLabel={opensDetail ? `${card.headline}. ${OPEN_DETAIL_HINT}` : undefined}
        style={[styles.middle, wide && { gap: tight ? 12 : 20 }, compact && { gap: 10 }]}
      >
        <Text
          numberOfLines={compact ? 3 : 4}
          style={[styles.headline, { color: p.ink, fontSize: headlineSize, lineHeight: headlineSize * (wide ? 1.07 : 1.1), letterSpacing: wide ? -headlineSize * 0.025 : -0.5, maxWidth: wide ? 820 : undefined }]}
          accessibilityRole="header"
        >
          {clampHeadline(card.headline)}
        </Text>

        {card.kind === 'data' ? <DataFacts card={card} config={config} compact={compact} /> : null}

        {/* On phones a two-number data card has no room for its template sentence, which only
            restates the numbers; it stays readable in the detail sheet. */}
        {card.body && !(card.kind === 'data' && card.macro.length > 1 && !wide) ? (
          <Text
            numberOfLines={compact ? 6 : wide ? undefined : 8}
            style={[styles.body, wide && styles.bodyWide, tight && { fontSize: 18, lineHeight: 27 }, compact && styles.bodyCompact, { color: wide ? p.inkSoft : p.inkBody }]}
          >
            {card.body}
          </Text>
        ) : null}

        {facts.length > 0 ? (
          <View style={[styles.facts, { borderColor: p.divider }]}>
            {facts.map((f) => (
              <View key={f.label} style={styles.fact}>
                <Text style={[styles.factLabel, { color: p.muted }]}>{f.label}</Text>
                <Text style={[styles.factValue, { color: p.ink }]}>{f.value}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {validTickers.length > 0 ? (
          <View style={styles.tickers}>
            {validTickers.map((t, i) => (
              <Text
                key={`${t.symbol}-${i}`}
                style={[styles.ticker, { color: p.inkSoft, borderColor: p.borderStrong }]}
                accessibilityLabel={`${t.name}, ticker ${t.symbol}`}
              >
                {t.symbol}
              </Text>
            ))}
          </View>
        ) : null}
      </Pressable>

      <View style={styles.sourceBlock}>
        {opensDetail ? (
          <Pressable
            onPress={() => onOpenDetail?.(card)}
            accessibilityRole="button"
            accessibilityLabel={`More detail. ${OPEN_DETAIL_HINT}`}
            style={styles.more}
          >
            <Text style={[styles.moreText, { color: p.accentInk }]}>More detail ›</Text>
          </Pressable>
        ) : null}
        <SourceRow card={card} onShowAll={() => onShowSources(card)} wide={wide} />
        {credit ? <ShareAlikeLine credit={credit} cardId={card.id} /> : null}
        {labels.aiLabel ? <AiLabel text={labels.aiLabel} /> : null}
      </View>

      {/* empty space collects here, so only the actions and disclaimer sit at the bottom */}
      <View style={styles.spacer} />

      <View style={[styles.footer, { borderTopColor: p.divider }]}>
        {reactFn ? (
          <View style={styles.reactRow}>
            <ReactButton kind="like" on={reaction === 'like'} onPress={() => reactFn(card, 'like')} />
            <ReactButton kind="dislike" on={reaction === 'dislike'} onPress={() => reactFn(card, 'dislike')} />
          </View>
        ) : null}
        {place.inline ? <View style={styles.footerText}>{disclaimer}</View> : null}
        {onNext ? (
          <Pressable onPress={onNext} accessibilityRole="button" accessibilityLabel="Next card" style={styles.next}>
            {wide ? null : <ChevronUpIcon color={p.muted} />}
            <Text style={[styles.nextText, wide && { fontSize: 14 }, { color: p.muted }]}>{wide ? 'Next: press ↓ or scroll' : 'Swipe up'}</Text>
          </Pressable>
        ) : null}
      </View>
      {place.below ? <View style={styles.disclaimerAlone}>{disclaimer}</View> : null}
    </View>
  );
}

// "More like this" / "Less like this". Pressed state = filled chip + check mark
// + accessibilityState, never colour alone. Pressing again undoes it.
function ReactButton({ kind, on, onPress }: { kind: Feedback; on: boolean; onPress: () => void }) {
  const p = usePalette();
  const like = kind === 'like';
  const Icon = like ? ThumbUpIcon : ThumbDownIcon;
  const color = on ? p.accentInk : p.inkSoft;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={like ? 'More like this' : 'Less like this'}
      aria-pressed={on}
      style={({ pressed }) => [
        styles.react,
        { borderColor: on ? p.accent : p.borderStrong, backgroundColor: on ? p.accentSoft : 'transparent', opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Icon color={color} size={16} />
      <Text style={[styles.reactText, { color }]}>
        {like ? 'More' : 'Less'}
        {on ? ' ✓' : ''}
      </Text>
    </Pressable>
  );
}

// Tap targets are real 44 px boxes: react-native-web's Pressable ignores hitSlop, so padding
// via hitSlop never existed on the website. The negative margins hand the extra height back to
// the layout (it spills only into the card's own padding/gaps), so compact cards still fit.
const styles = StyleSheet.create({
  reactRow: { flex: 1, flexDirection: 'row', gap: 8 },
  react: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    marginVertical: -4,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
  },
  reactText: { fontFamily: fonts.sansSemi, fontSize: 13 },
  disclaimerAlone: { flexShrink: 0, marginTop: -6 },
  card: { flex: 1, borderWidth: 1, borderRadius: 24, padding: 24, gap: 16, overflow: 'hidden' },
  cardCompact: { padding: 20, gap: 10 }, // short screens: less air so the body text still fits
  cardTight: { paddingVertical: 26, paddingHorizontal: 36, gap: 12 },
  cardWide: { paddingVertical: 40, paddingHorizontal: 44, gap: 20 },
  meta: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  metaRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  moreBtn: { minWidth: 44, minHeight: 44, marginVertical: -8, marginHorizontal: -6, alignItems: 'center', justifyContent: 'center' },
  moreDots: { fontSize: 20, lineHeight: 22 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 10, borderRadius: 14 },
  badgeText: { fontFamily: fonts.sansSemi, fontSize: 13 },
  metaText: { fontFamily: fonts.sans, fontSize: 13 },
  headline: { fontFamily: fonts.serif },
  body: { fontFamily: fonts.sans, fontSize: 18, lineHeight: 27 },
  bodyWide: { fontSize: 20, lineHeight: 31, maxWidth: 720 },
  bodyCompact: { fontSize: 16, lineHeight: 23 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 28, rowGap: 10, paddingVertical: 14, borderTopWidth: 1, borderBottomWidth: 1 },
  fact: { gap: 2 },
  factLabel: { fontFamily: fonts.sans, fontSize: 12, letterSpacing: 0.36, textTransform: 'uppercase' },
  factValue: { fontFamily: fonts.sansSemi, fontSize: 16 },
  tickers: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  ticker: { fontFamily: fonts.sansMedium, fontSize: 13, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 3 },
  middle: { flexShrink: 1, minHeight: 0, overflow: 'hidden', gap: 16 },
  spacer: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minHeight: 0 },
  more: { alignSelf: 'flex-start', minHeight: 44, marginTop: -8, marginBottom: -6, justifyContent: 'center' },
  moreText: { fontFamily: fonts.sansSemi, fontSize: 14 },
  sourceBlock: { gap: 8, flexShrink: 0 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, paddingTop: 12, flexShrink: 0 },
  footerText: { flex: 1 },
  next: { minHeight: 44, marginVertical: -6, flexDirection: 'row', alignItems: 'center', gap: 6 },
  nextText: { fontFamily: fonts.sansMedium, fontSize: 13 },
});
