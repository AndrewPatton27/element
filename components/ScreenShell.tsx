// Shared page wrapper for the new screens (Brief, Search, Following, Me, ...).
// Sits inside Shell, so it gets the safe area, the SAMPLE DATA banner, the bottom
// tab bar (phones) and the top bar + Numbers strip (wide web) for free.
// Phones (design Mobile-Following): a 56 px header with the wordmark on the left
// and the page title on the right, then a scrolling body (16 px sides).
// Wide web (design Web-Following): a centred column, max 1000 px, with a 44 px
// serif title row (optional meta text on the right) and 22 px between sections.

import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePalette, useWide } from '../lib/useTheme';
import { fonts, font, space, MOBILE_HEADER_HEIGHT, PAGE_MAX_WIDTH } from '../lib/theme';
import { Shell, Wordmark } from './Shell';
import type { Tab } from './TabBar';

export interface ScreenShellProps {
  tab: Tab; // which tab lights up
  title: string;
  meta?: string; // short text beside the title, e.g. "3 stories · 2 updated"
  headerRight?: ReactNode; // replaces meta (e.g. a button)
  scroll?: boolean; // default true; false lets the screen manage its own scrolling list
  children: ReactNode;
}

export function ScreenShell({ tab, title, meta, headerRight, scroll = true, children }: ScreenShellProps) {
  const p = usePalette();
  const wide = useWide();

  const right = headerRight ?? (meta ? <Text style={[styles.meta, { color: p.muted }]}>{meta}</Text> : null);

  if (wide) {
    const titleRow = (
      <View style={styles.titleRowWide}>
        <Text accessibilityRole="header" style={[styles.titleWide, { color: p.ink }]}>
          {title}
        </Text>
        {right}
      </View>
    );
    return (
      <Shell active={tab} bare>
        {scroll ? (
          <ScrollView style={styles.fill} contentContainerStyle={styles.columnWide}>
            {titleRow}
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.fill, styles.columnWide]}>
            {titleRow}
            {children}
          </View>
        )}
      </Shell>
    );
  }

  return (
    <Shell active={tab} bare>
      <View style={[styles.header, { backgroundColor: p.surface, borderBottomColor: p.border }]}>
        <Wordmark size={font.headerWordmark} />
        <Text accessibilityRole="header" style={[styles.titleNarrow, { color: p.ink }]} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {scroll ? (
        <ScrollView style={styles.fill} contentContainerStyle={styles.bodyNarrow}>
          {right ? <View style={styles.metaRowNarrow}>{right}</View> : null}
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, styles.bodyNarrow]}>
          {right ? <View style={styles.metaRowNarrow}>{right}</View> : null}
          {children}
        </View>
      )}
    </Shell>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    height: MOBILE_HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingLeft: 20,
    paddingRight: space.page,
    borderBottomWidth: 1,
  },
  titleNarrow: { flexShrink: 1, fontSize: font.body, fontFamily: fonts.sansSemi },
  bodyNarrow: { paddingHorizontal: space.page, paddingTop: 14, paddingBottom: space.md, gap: 14 },
  metaRowNarrow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: space.xs },
  columnWide: {
    width: '100%',
    maxWidth: PAGE_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: space.pageWide,
    paddingTop: space.pageTopWide,
    paddingBottom: space.pageBottomWide,
    gap: space.section,
  },
  titleRowWide: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.sm },
  titleWide: { fontFamily: fonts.serif, fontSize: font.pageTitle, letterSpacing: -0.88 },
  meta: { fontSize: font.nav, fontFamily: fonts.sans },
});
