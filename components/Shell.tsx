// Page frame shared by every screen. Phones: content, then the 5-tab bottom bar
// (Feed / Brief / Search / Following / Me; components/TabBar.tsx). Numbers and
// About are no longer tabs, so on Me, Numbers and About a slim "Numbers · About"
// row sits above the bar to keep them one tap away. Wide web: a 64 px top bar
// (wordmark, Trending / Latest / For you, the Feed / Brief / Search / Following /
// Me links, Numbers, Sign in or Account), a scrolling Numbers strip, then a body
// of left categories, the main column and a right aside, with a floating About
// pill at the bottom left (design: docs/design/web/Web-Final.dc.html). The SAMPLE
// DATA banner sits on top in mock mode.

import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { APP_NAME } from '../lib/config';
import { useAppData } from '../lib/appData';
import { useAccount } from '../lib/accountContext';
import type { FeedTab } from '../lib/feedLogic';
import { usePalette, useWide } from '../lib/useTheme';
import { fonts, font, TOP_BAR_HEIGHT } from '../lib/theme';
import type { Palette } from '../lib/theme';
import { InfoIcon } from './Icons';
import { NumbersTicker } from './NumbersTicker';
import { SampleBanner } from './SampleBanner';
import { SortToggle } from './SortToggle';
import { go, TabBar, TopNavLinks, type Tab } from './TabBar';

export type { Tab } from './TabBar';

export function Wordmark({ size = 24 }: { size?: number }) {
  const p = usePalette();
  return (
    <Text style={{ fontFamily: fonts.serif, fontSize: size, letterSpacing: -size * 0.01, color: p.accent }} accessibilityRole="header">
      {APP_NAME}
    </Text>
  );
}

// Phones only: Numbers and About links (they used to be bottom tabs).
function MoreLinks({ active, p }: { active: Tab; p: Palette }) {
  const items = [
    { key: 'numbers' as const, label: 'Numbers to know', href: '/numbers' as const },
    { key: 'about' as const, label: 'About Element', href: '/about' as const },
  ];
  return (
    <View style={[styles.moreRow, { borderTopColor: p.divider }]}>
      {items.map(({ key, label, href }) => {
        const on = key === active;
        return (
          <Pressable key={key} onPress={() => go(href)} accessibilityRole="link" accessibilityState={{ selected: on }} style={styles.moreLink}>
            <Text style={{ color: on ? p.accentInk : p.inkSoft, fontSize: font.chip, fontFamily: on ? fonts.sansSemi : fonts.sansMedium }}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Wide only. Feed passes its tab state; on other screens the tabs go back to the feed.
function TopBar({ active, p, signedIn, feedTab }: { active: Tab; p: Palette; signedIn: boolean; feedTab?: ShellProps['feedTab'] }) {
  const onChange =
    feedTab?.onChange ?? ((m: FeedTab) => router.navigate({ pathname: '/', params: { tab: m, t: String(Date.now()) } } as never));
  return (
    <View style={[styles.topBar, { backgroundColor: p.surface, borderBottomColor: p.border }]}>
      <Pressable onPress={() => go('/')} accessibilityRole="link" accessibilityLabel={`${APP_NAME}, home`}>
        <Text style={[styles.wordmark, { color: p.accent }]}>{APP_NAME}</Text>
      </Pressable>
      <SortToggle mode={feedTab ? feedTab.mode : null} onChange={onChange} wide forYou={signedIn} />
      <View style={styles.spacer} />
      <TopNavLinks active={active} signedIn={signedIn} />
      <Pressable onPress={() => go('/numbers')} accessibilityRole="link" accessibilityLabel="Numbers to know" style={styles.textLink}>
        <Text style={{ color: active === 'numbers' ? p.accentInk : p.inkSoft, fontSize: 15, fontFamily: active === 'numbers' ? fonts.sansSemi : fonts.sansMedium }}>
          Numbers
        </Text>
      </Pressable>
      <Pressable
        onPress={() => go(signedIn ? '/account' : '/signin')}
        accessibilityRole="button"
        style={({ pressed }) => [styles.pill, { backgroundColor: p.accent, opacity: pressed ? 0.85 : 1 }]}
      >
        <Text style={{ color: p.onAccent, fontSize: 15, fontFamily: fonts.sansSemi }}>{signedIn ? 'Account' : 'Sign in'}</Text>
      </Pressable>
    </View>
  );
}

interface ShellProps {
  active: Tab;
  children: ReactNode;
  left?: ReactNode; // wide only: categories column
  aside?: ReactNode; // wide only: right column
  scroll?: boolean; // wrap content in a ScrollView (Numbers, About)
  bare?: boolean; // children fill the area under the bars as-is (ScreenShell does its own layout)
  feedTab?: { mode: FeedTab; onChange: (m: FeedTab) => void }; // wide only: top bar tabs (feed screen)
}

export function Shell({ active, children, left, aside, scroll, bare, feedTab }: ShellProps) {
  const p = usePalette();
  const wide = useWide();
  const { api, config } = useAppData();
  const { user } = useAccount();
  const signedIn = user !== null;

  if (wide) {
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: p.bg }]}>
        {api.sample ? <SampleBanner /> : null}
        <TopBar active={active} p={p} signedIn={signedIn} feedTab={feedTab} />
        <View style={[styles.strip, { backgroundColor: p.bg, borderBottomColor: p.border }]}>
          <NumbersTicker api={api} config={config} />
        </View>
        {bare ? (
          <View style={styles.fill}>{children}</View>
        ) : scroll ? (
          <ScrollView style={styles.fill} contentContainerStyle={styles.scrollWide}>
            {children}
          </ScrollView>
        ) : (
          <View style={styles.body}>
            {left ? (
              <ScrollView style={styles.left} contentContainerStyle={styles.leftContent}>
                {left}
              </ScrollView>
            ) : null}
            <View style={styles.main}>{children}</View>
            {aside ? (
              <ScrollView style={styles.aside} contentContainerStyle={styles.asideContent}>
                {aside}
              </ScrollView>
            ) : null}
          </View>
        )}
        {active !== 'about' ? (
          <Pressable
            onPress={() => go('/about')}
            accessibilityRole="link"
            accessibilityLabel="About"
            style={[styles.aboutPill, { backgroundColor: p.surface, borderColor: p.borderStrong }]}
          >
            <InfoIcon color={p.inkSoft} size={20} />
            <Text style={{ color: p.inkSoft, fontSize: 15, fontFamily: fonts.sansMedium }}>About</Text>
          </Pressable>
        ) : null}
      </SafeAreaView>
    );
  }

  const content =
    scroll && !bare ? (
      <ScrollView style={styles.fill} contentContainerStyle={styles.scrollNarrow}>
        {children}
      </ScrollView>
    ) : (
      <View style={styles.fill}>{children}</View>
    );
  const showMore = active === 'account' || active === 'me' || active === 'numbers' || active === 'about';
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: p.bg }]} edges={['top', 'bottom']}>
      {api.sample ? <SampleBanner /> : null}
      {content}
      {showMore ? <MoreLinks active={active} p={p} /> : null}
      <TabBar active={active} signedIn={signedIn} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: 28,
    rowGap: 8,
    paddingHorizontal: 32,
    minHeight: TOP_BAR_HEIGHT,
    borderBottomWidth: 1,
  },
  wordmark: { fontFamily: fonts.serif, fontSize: 26, letterSpacing: -0.26 },
  spacer: { flex: 1 },
  textLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  pill: { minHeight: 44, paddingHorizontal: 18, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  strip: { height: 44, borderBottomWidth: 1, justifyContent: 'center', overflow: 'hidden' },
  body: {
    flex: 1,
    width: '100%',
    maxWidth: 1360,
    alignSelf: 'center',
    flexDirection: 'row',
    paddingHorizontal: 32,
    paddingTop: 28,
    paddingBottom: 28,
    gap: 36,
  },
  left: { flexGrow: 0, flexShrink: 0, flexBasis: 180, width: 180 },
  leftContent: { paddingBottom: 90 },
  main: { flex: 1, minWidth: 0 },
  aside: { flexGrow: 0, flexShrink: 1, flexBasis: 340, maxWidth: 340, minWidth: 280 },
  asideContent: { paddingBottom: 90 },
  scrollWide: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 32, paddingTop: 28, paddingBottom: 100, gap: 16 },
  scrollNarrow: { padding: 20, paddingTop: 24, gap: 16 },
  aboutPill: {
    position: 'absolute',
    left: 32,
    bottom: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
  },
  moreRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, borderTopWidth: 1, paddingHorizontal: 16 },
  moreLink: { minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' },
});
