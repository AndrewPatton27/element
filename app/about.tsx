// About: what the app is, the disclaimer, what the AI label means, how Top
// ranks, and the required notices.

import { StyleSheet, Text, View } from 'react-native';
import { useAppData } from '../lib/appData';
import { aiNoticeText, disclaimerText, noticesFor } from '../lib/labels';
import { APP_NAME } from '../lib/config';
import { usePalette } from '../lib/useTheme';
import { fonts } from '../lib/theme';
import { openUrl } from '../components/SourceChip';
import { Shell } from '../components/Shell';

export default function AboutScreen() {
  const p = usePalette();
  const { api, config } = useAppData();
  const notices = noticesFor(config, 'about');
  const text = [styles.text, { color: p.inkBody }];

  return (
    <Shell active="about" scroll>
      <Text style={[styles.title, { color: p.ink }]} accessibilityRole="header">
        About {APP_NAME}
      </Text>
      <View style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }]}>
        <Text style={text}>
          A short daily briefing in plain language: business, the economy, government, the world, science and safety. Cards are built from public
          sources: SEC company filings, Federal Reserve releases, government data published through FRED and the U.S. Treasury, federal agency notices
          such as product recalls, science agencies, and Wikipedia’s “In the news” (adapted under CC BY-SA 4.0). Every card links to its original
          source.
        </Text>
        <Text style={[styles.strong, { color: p.ink }]}>{disclaimerText(config)}</Text>
        <Text style={text}>
          Cards marked “{aiNoticeText(config)}” were summarized by an AI model and checked by automatic rules (numbers must appear in the source, no
          buy or sell language). Cards without that label were written from a fixed template. Always check the original before relying on anything
          here.
        </Text>
        <Text style={text}>
          “Top” orders cards by importance and freshness: a card twice as important stays level with one 8 hours newer. “Latest” is newest first.
        </Text>
      </View>
      {notices.map((n) => (
        <Text
          key={n.key}
          style={[styles.notice, { color: p.muted }]}
          onPress={n.url ? () => openUrl(n.url as string) : undefined}
          accessibilityRole={n.url ? 'link' : 'text'}
        >
          {n.text}
        </Text>
      ))}
      {api.sample ? (
        <Text style={[styles.notice, { color: p.dataInk }]}>This build shows fictional sample cards. Their headlines start with [SAMPLE].</Text>
      ) : null}
    </Shell>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.serif, fontSize: 34, lineHeight: 37, letterSpacing: -0.5 },
  card: { borderWidth: 1, borderRadius: 24, padding: 24, gap: 14 },
  text: { fontFamily: fonts.sans, fontSize: 16, lineHeight: 24 },
  strong: { fontFamily: fonts.sansSemi, fontSize: 16 },
  notice: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
});
