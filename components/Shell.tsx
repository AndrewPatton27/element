// Page frame shared by every screen. Every layout now puts navigation in a
// bottom bar like a mobile app. Phones: content, then the bottom nav. Wide web:
// a centred content column (with an optional right rail), then a roomier bottom
// nav bar spanning the width. Nav: Feed, Numbers, About, and Account ("Sign in"
// for guests). The SAMPLE DATA banner sits on top in mock mode.

import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { APP_NAME } from '../lib/config';
import { useAppData } from '../lib/appData';
import { useAccount } from '../lib/accountContext';
import { usePalette, useWide } from '../lib/useTheme';
import { ASIDE_WIDTH, CARD_MAX_WIDTH, fonts } from '../lib/theme';
import type { Palette } from '../lib/theme';
import { FeedIcon, InfoIcon, NumbersIcon, PersonIcon } from './Icons';
import { SampleBanner } from './SampleBanner';

export type Tab = 'feed' | 'numbers' | 'about' | 'account';
type Href = '/' | '/numbers' | '/about' | '/account' | '/signin';
type NavItem = { key: Tab; label: string; href: Href; Icon: typeof FeedIcon };

function navItems(signedIn: boolean): NavItem[] {
  return [
    { key: 'feed', label: 'Feed', href: '/', Icon: FeedIcon },
    { key: 'numbers', label: 'Numbers', href: '/numbers', Icon: NumbersIcon },
    { key: 'about', label: 'About', href: '/about', Icon: InfoIcon },
    signedIn
      ? { key: 'account', label: 'Account', href: '/account', Icon: PersonIcon }
      : { key: 'account', label: 'Sign in', href: '/signin', Icon: PersonIcon },
  ];
}

function go(href: Href) {
  router.navigate(href as never); // typed routes regenerate on the next `expo start`
}

export function Wordmark({ size = 24 }: { size?: number }) {
  const p = usePalette();
  return (
    <Text style={{ fontFamily: fonts.serif, fontSize: size, letterSpacing: -size * 0.01, color: p.accent }} accessibilityRole="header">
      {APP_NAME}
    </Text>
  );
}

function BottomNav({ active, p, items, wide }: { active: Tab; p: Palette; items: NavItem[]; wide?: boolean }) {
  return (
    <View
      style={[styles.bottomNav, wide && styles.bottomNavWide, { backgroundColor: p.surface, borderTopColor: p.navBorder }]}
      accessibilityRole="tablist"
    >
      <View style={[styles.bottomInner, wide && styles.bottomInnerWide]}>
        {items.map(({ key, label, href, Icon }, i) => {
          const on = key === active;
          const color = on ? p.accent : p.muted;
          // Wide: end items align their icon to the block edge (first → left,
          // last → right) so the outer icon edges sit flush with the card edges.
          const edge = !wide ? null : i === 0 ? styles.itemStart : i === items.length - 1 ? styles.itemEnd : null;
          return (
            <Pressable
              key={key}
              onPress={() => go(href)}
              accessibilityRole="tab"
              aria-selected={on}
              style={[styles.bottomItem, wide && styles.bottomItemWide, edge]}
            >
              <Icon color={color} />
              <Text style={{ color, fontSize: 12, fontFamily: on ? fonts.sansSemi : fonts.sansMedium }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

interface ShellProps {
  active: Tab;
  children: ReactNode;
  aside?: ReactNode; // right rail on wide screens only
  scroll?: boolean; // wrap content in a ScrollView (Numbers, About)
}

export function Shell({ active, children, aside, scroll }: ShellProps) {
  const p = usePalette();
  const wide = useWide();
  const { api } = useAppData();
  const { user } = useAccount();
  const items = navItems(user !== null);

  const content = scroll ? (
    <ScrollView style={styles.fill} contentContainerStyle={wide ? styles.scrollWide : styles.scrollNarrow}>
      {children}
    </ScrollView>
  ) : (
    <View style={styles.fill}>{children}</View>
  );

  if (wide) {
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: p.bg }]}>
        {api.sample ? <SampleBanner /> : null}
        <View style={styles.wideRow}>
          <View style={styles.main}>{content}</View>
          {aside ? (
            <ScrollView style={styles.aside} contentContainerStyle={styles.asideContent}>
              {aside}
            </ScrollView>
          ) : null}
        </View>
        <BottomNav active={active} p={p} items={items} wide />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: p.bg }]} edges={['top', 'bottom']}>
      {api.sample ? <SampleBanner /> : null}
      {content}
      <BottomNav active={active} p={p} items={items} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  wideRow: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 32, paddingHorizontal: 32 },
  main: { flexGrow: 1, flexShrink: 1, flexBasis: 520, maxWidth: CARD_MAX_WIDTH, minWidth: 0 },
  aside: { flexGrow: 0, flexShrink: 1, flexBasis: ASIDE_WIDTH, maxWidth: 360 },
  asideContent: { paddingVertical: 28, gap: 16 },
  scrollWide: { paddingVertical: 28, gap: 16 },
  scrollNarrow: { padding: 20, paddingTop: 24, gap: 16 },
  bottomNav: { flexDirection: 'row', borderTopWidth: 1, paddingTop: 6, paddingBottom: 10, paddingHorizontal: 8 },
  // Wide: same horizontal gutter as the content row (wideRow) and centre the
  // capped inner block horizontally so it lines up with the centred card column.
  bottomNavWide: { paddingTop: 8, paddingBottom: 12, paddingHorizontal: 32, justifyContent: 'center' },
  bottomInner: { flex: 1, flexDirection: 'row', justifyContent: 'space-evenly' },
  // Match the news-card column exactly: capped at 640 and centred. space-between
  // puts the first icon's left edge on the card's left edge and the last icon's
  // right edge on the card's right edge.
  bottomInnerWide: { alignSelf: 'center', width: '100%', maxWidth: CARD_MAX_WIDTH, justifyContent: 'space-between' },
  bottomItem: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 2 },
  // Wide: items size to content and the end ones align to the block edges so the
  // outer icon edges sit flush with the card edges, not inset.
  bottomItemWide: { flex: 0, minWidth: 48, paddingHorizontal: 8 },
  itemStart: { alignItems: 'flex-start', paddingLeft: 0 },
  itemEnd: { alignItems: 'flex-end', paddingRight: 0 },
});
