// Story lists on the Brief screen. The ranked list ("Today in a minute", "Top stories ·
// last week": a big accent number, meta line, serif headline, optional one-line teaser) and
// the plain category sections. Every row opens the card's DetailSheet (key points, sources,
// labels), so the source links and the AI label are one tap away.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BlurbCard, Category } from '../contract/types.ts';
import { teaser } from '../lib/briefLogic';
import { cardTime, categoryName, clampHeadline } from '../lib/format';
import { usePalette } from '../lib/useTheme';
import { fonts } from '../lib/theme';
import { badgeLabel } from './Card';

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
  onOpen: (card: BlurbCard) => void;
  wide: boolean;
  ranked?: boolean; // numbered rows with a teaser line (the headline list)
  showTeaser?: boolean;
}

export function BriefStories({ label, right, cards, categories, onOpen, wide, ranked, showTeaser }: ListProps) {
  const p = usePalette();
  if (cards.length === 0) return null;
  return (
    <View accessibilityRole="list" accessibilityLabel={label} style={styles.list}>
      <BriefLabel text={label} right={right} />
      {cards.map((c, i) => {
        const line = ranked && showTeaser ? teaser(c.body, wide ? 150 : 90) : '';
        const meta = [badgeLabel(c), ...(ranked ? [categoryName(c.category, categories)] : []), cardTime(c)].filter(Boolean).join(' · ');
        return (
          <Pressable
            key={c.id}
            onPress={() => onOpen(c)}
            accessibilityRole="button"
            accessibilityLabel={`${ranked ? `${i + 1}. ` : ''}${clampHeadline(c.headline)}. ${meta}. Opens more detail`}
            style={({ pressed }) => [styles.row, wide && styles.rowWide, { borderTopColor: p.border, opacity: pressed ? 0.7 : 1 }]}
          >
            {ranked ? <Text style={[styles.rank, wide && styles.rankWide, { color: p.accent }]}>{i + 1}</Text> : null}
            <View style={styles.text}>
              <Text style={[styles.meta, wide && styles.metaWide, { color: p.muted }]}>{meta}</Text>
              <Text style={[ranked ? styles.title : styles.titlePlain, wide && (ranked ? styles.titleWide : styles.titlePlainWide), { color: p.ink }]}>
                {clampHeadline(c.headline)}
              </Text>
              {line ? <Text style={[styles.line, wide && styles.lineWide, { color: p.inkSoft }]}>{line}</Text> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { flexDirection: 'column' },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: 6 },
  label: { fontFamily: fonts.sansSemi, fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase' },
  labelRight: { fontFamily: fonts.sans, fontSize: 13 },
  row: { flexDirection: 'row', gap: 14, paddingVertical: 14, borderTopWidth: 1, minHeight: 44 },
  rowWide: { gap: 20, paddingVertical: 22 },
  rank: { fontFamily: fonts.serif, fontSize: 24, lineHeight: 26, minWidth: 20 },
  rankWide: { fontSize: 34, lineHeight: 34, minWidth: 28 },
  text: { flex: 1, gap: 4 },
  meta: { fontFamily: fonts.sans, fontSize: 12 },
  metaWide: { fontSize: 13 },
  title: { fontFamily: fonts.serif, fontSize: 19, lineHeight: 23 },
  titleWide: { fontSize: 28, lineHeight: 32, letterSpacing: -0.4 },
  titlePlain: { fontFamily: fonts.serif, fontSize: 18, lineHeight: 22 },
  titlePlainWide: { fontSize: 22, lineHeight: 27 },
  line: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  lineWide: { fontSize: 17, lineHeight: 25, maxWidth: 640 },
});
