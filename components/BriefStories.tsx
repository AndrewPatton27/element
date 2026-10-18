// Story lists on the Brief screen. The ranked list ("Today in a minute", "Top stories ·
// last week": a big accent number, meta line, serif headline, optional one-line teaser) and
// the plain category sections. The headline opens the card's DetailSheet; under it every row
// carries a small source chip and one muted labels line (rule 5), so no row is unlabelled.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppConfig, BlurbCard, Category } from '../contract/types.ts';
import { briefRowLabels, teaser } from '../lib/briefLogic';
import { cardTime, categoryName, clampHeadline } from '../lib/format';
import { openUrl } from '../lib/openUrl';
import { usePalette } from '../lib/useTheme';
import { fonts } from '../lib/theme';
import { badgeLabel } from './Card';
import { LinkIcon } from './Icons';
import { ShareAlikeLine } from './Labels';

export function BriefLabel({ text, right }: { text: string; right?: string }) {
  const p = usePalette();
  return (
    <View style={styles.labelRow}>
      <Text accessibilityRole="header" style={[styles.label, { color: p.muted }]}>
        {text}
      </Text>
      {right ? <Text style={[styles.labelRight, { color: p.muted }]}>{right}</Text> : null}
    </View>
  );
}

interface ListProps {
  label: string;
  right?: string;
  cards: BlurbCard[];
  categories: Category[];
  config: AppConfig | null;
  onOpen: (card: BlurbCard) => void;
  wide: boolean;
  ranked?: boolean; // numbered rows with a teaser line (the headline list)
  showTeaser?: boolean;
}

export function BriefStories({ label, right, cards, categories, config, onOpen, wide, ranked, showTeaser }: ListProps) {
  const p = usePalette();
  if (cards.length === 0) return null;
  return (
    <View accessibilityRole="list" accessibilityLabel={label} style={styles.list}>
      <BriefLabel text={label} right={right} />
      {cards.map((c, i) => {
        const line = ranked && showTeaser ? teaser(c.body, wide ? 150 : 90) : '';
        const meta = [badgeLabel(c), ...(ranked ? [categoryName(c.category, categories)] : []), cardTime(c)].filter(Boolean).join(' · ');
        return (
          <View key={c.id} style={[styles.row, wide && styles.rowWide, { borderTopColor: p.border }]}>
            {ranked ? <Text style={[styles.rank, wide && styles.rankWide, { color: p.accent }]}>{i + 1}</Text> : null}
            <View style={styles.text}>
              <Pressable
                onPress={() => onOpen(c)}
                accessibilityRole="button"
                accessibilityLabel={`${ranked ? `${i + 1}. ` : ''}${clampHeadline(c.headline)}. ${meta}. Opens more detail`}
                style={({ pressed }) => [styles.open, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={[styles.meta, wide && styles.metaWide, { color: p.muted }]}>{meta}</Text>
                <Text style={[ranked ? styles.title : styles.titlePlain, wide && (ranked ? styles.titleWide : styles.titlePlainWide), { color: p.ink }]}>
                  {clampHeadline(c.headline)}
                </Text>
                {line ? <Text style={[styles.line, wide && styles.lineWide, { color: p.inkSoft }]}>{line}</Text> : null}
              </Pressable>
              <RowLabels card={c} config={config} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

// Rule 5, per row: a small source chip (opens the original, https only) and one muted line
// with the AI label (AI-written cards only) and the disclaimer, once.
function RowLabels({ card, config }: { card: BlurbCard; config: AppConfig | null }) {
  const p = usePalette();
  const { source, line, credit } = briefRowLabels(card, config);
  return (
    <View style={styles.labels}>
      {source ? (
        <Pressable
          onPress={() => openUrl(source.url, card.id)}
          accessibilityRole="link"
          accessibilityLabel={`Source: ${source.label}${source.count > 1 ? `, ${source.count} sources` : ''}. Opens the original.`}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          style={({ pressed }) => [styles.chip, { backgroundColor: p.surfaceMuted, opacity: pressed ? 0.75 : 1 }]}
        >
          <LinkIcon color={p.ink} size={12} />
          <Text style={[styles.chipText, { color: p.ink }]} numberOfLines={1}>
            {source.label}
          </Text>
          {source.count > 1 ? <Text style={[styles.chipCount, { color: p.muted }]}>+{source.count - 1}</Text> : null}
        </Pressable>
      ) : null}
      {credit ? <ShareAlikeLine credit={credit} cardId={card.id} /> : null}
      <Text style={[styles.small, { color: p.muted }]}>{line}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { flexDirection: 'column' },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: 6 },
  label: { fontFamily: fonts.sansSemi, fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase' },
  labelRight: { fontFamily: fonts.sans, fontSize: 13 },
  row: { flexDirection: 'row', gap: 14, paddingVertical: 14, borderTopWidth: 1 },
  rowWide: { gap: 20, paddingVertical: 22 },
  rank: { fontFamily: fonts.serif, fontSize: 24, lineHeight: 26, minWidth: 20 },
  rankWide: { fontSize: 34, lineHeight: 34, minWidth: 28 },
  text: { flex: 1, gap: 6 },
  open: { gap: 4 },
  labels: { gap: 4, alignItems: 'flex-start' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999 },
  chipText: { flexShrink: 1, fontFamily: fonts.sansSemi, fontSize: 12 },
  chipCount: { fontFamily: fonts.sans, fontSize: 12 },
  small: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 17 },
  meta: { fontFamily: fonts.sans, fontSize: 12 },
  metaWide: { fontSize: 13 },
  title: { fontFamily: fonts.serif, fontSize: 19, lineHeight: 23 },
  titleWide: { fontSize: 28, lineHeight: 32, letterSpacing: -0.4 },
  titlePlain: { fontFamily: fonts.serif, fontSize: 18, lineHeight: 22 },
  titlePlainWide: { fontSize: 22, lineHeight: 27 },
  line: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  lineWide: { fontSize: 17, lineHeight: 25, maxWidth: 640 },
});
