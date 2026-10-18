// Following (designs Mobile-Following / Web-Following). What the reader follows
// (topics, companies, sources) at the top, then api.followingFeed: the newest
// relevant stories first, each saying why it is here ("Because you follow X").
// Nothing followed yet: a prompt to pick topics, with the top stories below.
// Topics follow the account when signed in; see lib/useFollows.ts.

import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BlurbCard } from '../contract/types.ts';
import { useAppData } from '../lib/appData';
import { useAccount } from '../lib/accountContext';
import { withoutHidden } from '../lib/accountLogic';
import { withoutHiddenSources } from '../lib/sourceKeys';
import { followCountText, followReasonText, followsKey, hasFollows } from '../lib/followingLogic';
import { suggestedTopics } from '../lib/searchLogic';
import { useFollows } from '../lib/useFollows';
import { usePagedCards } from '../lib/usePagedCards';
import { usePalette, useWide } from '../lib/useTheme';
import { fonts, font } from '../lib/theme';
import { go } from '../components/TabBar';
import { DetailSheet } from '../components/DetailSheet';
import { FollowingManager } from '../components/FollowingManager';
import { ScreenShell } from '../components/ScreenShell';
import { SearchResults } from '../components/SearchResults';
import { SourcesSheet } from '../components/SourcesSheet';
import { aiNoticeText, disclaimerText } from '../lib/labels';

export default function FollowingScreen() {
  const p = usePalette();
  const wide = useWide();
  const { api, config, categories } = useAppData();
  const acct = useAccount();
  const signedIn = acct.user !== null;
  const { follows, toggleTopic, toggleSource, toggleTicker, topicsLoading, error } = useFollows();
  const following = hasFollows(follows);

  // The "add" pickers are open while nothing is followed (the prompt) and when asked for.
  const [manage, setManage] = useState(false);
  const expanded = manage || !following;

  const [sheetCard, setSheetCard] = useState<BlurbCard | null>(null);
  const [detailCard, setDetailCard] = useState<BlurbCard | null>(null);
  const { trackOpenDetail } = acct;
  useEffect(() => {
    if (detailCard && signedIn) trackOpenDetail(detailCard);
  }, [detailCard, signedIn, trackOpenDetail]);

  const hidden = acct.viewPrefs?.hidden ?? [];
  const hiddenSources = acct.viewPrefs?.hiddenSources ?? [];
  const visible = useCallback(
    (cards: BlurbCard[]) => withoutHiddenSources(withoutHidden(cards, hidden), hiddenSources),
    [hidden, hiddenSources],
  );

  // Wait for the account's topics before asking, so the list does not flash the top
  // stories and then switch.
  const key = topicsLoading ? null : followsKey(follows);
  const { state, loadMore, retry } = usePagedCards(
    key,
    (cursor, limit) => api.followingFeed({ topics: follows.topics, sources: follows.sources, tickers: follows.tickers, cursor, limit }),
    visible,
  );
  const items = visible(state.items);

  const empty = following ? (
    <View style={styles.none} accessibilityLiveRegion="polite">
      <Text style={[styles.noneTitle, { color: p.ink }]}>Nothing new yet</Text>
      <Text style={[styles.noneText, { color: p.muted }]}>
        No stories match what you follow right now. New ones will show up here as they are published.
      </Text>
      <Pressable onPress={() => setManage(true)} accessibilityRole="button" style={[styles.again, { borderColor: p.borderStrong, backgroundColor: p.surface }]}>
        <Text style={{ color: p.ink, fontFamily: fonts.sansSemi, fontSize: 15 }}>Change what you follow</Text>
      </Pressable>
    </View>
  ) : (
    <View style={styles.none} accessibilityLiveRegion="polite">
      <Text style={[styles.noneTitle, { color: p.ink }]}>No stories yet</Text>
      <Text style={[styles.noneText, { color: p.muted }]}>Pick a few topics above, then check back soon.</Text>
    </View>
  );

  return (
    <ScreenShell tab="following" title="Following" meta={following ? followCountText(follows) : undefined}>
      <Text style={[styles.intro, wide && styles.introWide, { color: p.inkSoft }]}>
        {following
          ? 'The newest stories about what you follow come first. Each one says why it is here.'
          : 'Follow topics, companies or sources and their newest stories gather here.'}
      </Text>

      <FollowingManager
        categories={suggestedTopics(categories, hidden)}
        follows={follows}
        expanded={expanded}
        onExpandedChange={setManage}
        onToggleTopic={toggleTopic}
        onToggleSource={toggleSource}
        onToggleTicker={toggleTicker}
        topicsLoading={topicsLoading}
        error={error}
      />

      {!signedIn && following ? (
        <Pressable onPress={() => go('/signin')} accessibilityRole="link" style={styles.signIn}>
          <Text style={[styles.signInText, { color: p.accentInk }]}>Saved on this device. Sign in to keep your topics on every device →</Text>
        </Pressable>
      ) : null}

      <Text style={[styles.section, { color: p.muted }]} accessibilityRole="header">
        {following ? 'Newest for you' : 'Top stories for now'}
      </Text>

      <SearchResults
        items={items}
        state={state}
        config={config}
        categories={categories}
        columns={wide ? 2 : 1}
        reasonFor={following ? (c) => followReasonText(c, categories) : undefined}
        onOpen={setDetailCard}
        onShowSources={setSheetCard}
        onLoadMore={loadMore}
        onRetry={retry}
        empty={empty}
      />

      <Text style={[styles.footer, { color: p.muted }]}>{aiNoticeText(config)} · {disclaimerText(config)}</Text>

      <SourcesSheet card={sheetCard} config={config} onClose={() => setSheetCard(null)} />
      <DetailSheet card={detailCard} config={config} categories={categories} onClose={() => setDetailCard(null)} />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  footer: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 17, textAlign: 'center', paddingTop: 4 },
  intro: { fontFamily: fonts.sans, fontSize: font.chip, lineHeight: 20, paddingHorizontal: 4 },
  introWide: { fontSize: font.body, lineHeight: 24, maxWidth: 640, paddingHorizontal: 0 },
  section: { fontFamily: fonts.sansSemi, fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', paddingHorizontal: 4 },
  signIn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  signInText: { fontFamily: fonts.sansSemi, fontSize: 14, lineHeight: 19 },
  none: { alignItems: 'center', gap: 10, paddingVertical: 36, paddingHorizontal: 16 },
  noneTitle: { fontFamily: fonts.serif, fontSize: 22, textAlign: 'center' },
  noneText: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 21, textAlign: 'center', maxWidth: 420 },
  again: { minHeight: 44, paddingHorizontal: 20, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
