// Page frame shared by every screen. Phones: content, then a bottom nav bar.
// Wide web: a left rail with the wordmark and nav, the content, and an optional
// right rail. Nav: Feed, Numbers, About, and Account ("Sign in" for guests).
// The SAMPLE DATA banner sits on top in mock mode.

import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { APP_NAME } from '../lib/config';
import { useAppData } from '../lib/appData';
import { useAccount } from '../lib/accountContext';
import { usePalette, useWide } from '../lib/useTheme';
import { ASIDE_WIDTH, fonts, RAIL_WIDTH } from '../lib/theme';
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

function BottomNav({ active, p, items }: { active: Tab; p: Palette; items: NavItem[] }) {
  return (
    <View style={[styles.bottomNav, { backgroundColor: p.surface, borderTopColor: p.navBorder }]} accessibilityRole="tablist">
      {items.map(({ key, label, href, Icon }) => {
        const on = key === active;
        const color = on ? p.accent : p.muted;
        return (
          <Pressable key={key} onPress={() => go(href)} accessibilityRole="tab" aria-selected={on} style={styles.bottomItem}>
            <Icon color={color} />
            <Text style={{ color, fontSize: 12, fontFamily: on ? fonts.sansSemi : fonts.sansMedium }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SideRail({ active, p, items, email }: { active: Tab; p: Palette; items: NavItem[]; email: string | null }) {
  return (
    <View style={styles.rail} accessibilityRole="tablist">
      <View style={styles.railBrand}>
        <Wordmark size={30} />
      </View>
      {items.map(({ key, label, href, Icon }) => {
        const on = key === active;
        return (
          <Pressable
            key={key}
            onPress={() => go(href)}
            accessibilityRole="tab"
            aria-selected={on}
            style={({ pressed }) => [styles.railItem, { backgroundColor: on ? p.accentSoft : 'transparent', opacity: pressed ? 0.75 : 1 }]}
          >
            <Icon color={on ? p.accentInk : p.inkSoft} />
            <Text style={{ fontSize: 17, color: on ? p.accentInk : p.inkSoft, fontFamily: on ? fonts.sansSemi : fonts.sansMedium }}>{label}</Text>
          </Pressable>
        );
      })}
      <Text style={[styles.railNote, { color: p.muted }]}>
        {email ? `Signed in as ${email}` : 'A two-minute daily briefing from public sources. Sign in for a feed tailored to you.'}
      </Text>
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
          <SideRail active={active} p={p} items={items} email={user?.email ?? null} />
          <View style={styles.main}>{content}</View>
          {aside ? (
            <ScrollView style={styles.aside} contentContainerStyle={styles.asideContent}>
              {aside}
            </ScrollView>
          ) : null}
        </View>
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
  rail: { width: RAIL_WIDTH, paddingVertical: 28, gap: 6 },
  railBrand: { paddingHorizontal: 14, paddingBottom: 18 },
  railItem: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 14, borderRadius: 14 },
  railNote: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18, paddingHorizontal: 14, paddingTop: 16 },
  main: { flexGrow: 1, flexShrink: 1, flexBasis: 520, maxWidth: 640, minWidth: 0 },
  aside: { flexGrow: 0, flexShrink: 1, flexBasis: ASIDE_WIDTH, maxWidth: 360 },
  asideContent: { paddingVertical: 28, gap: 16 },
  scrollWide: { paddingVertical: 28, gap: 16 },
  scrollNarrow: { padding: 20, paddingTop: 24, gap: 16 },
  bottomNav: { flexDirection: 'row', borderTopWidth: 1, paddingTop: 6, paddingBottom: 10, paddingHorizontal: 8 },
  bottomItem: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 2 },
});
