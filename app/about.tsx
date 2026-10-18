// About: a plain-language transparency page. Where the news comes from (every
// source with its site and terms), how it is collected, filtered and written, how
// the feeds are ordered, what is stored for an account, and the disclaimer.

import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAppData } from '../lib/appData';
import { aiNoticeText, disclaimerText, noticesFor } from '../lib/labels';
import { APP_NAME } from '../lib/config';
import { SOURCES } from '../lib/sourcesInfo';
import { usePalette } from '../lib/useTheme';
import { fonts } from '../lib/theme';
import { openUrl } from '../components/SourceChip';
import { Shell } from '../components/Shell';

function Section({ title, children }: { title: string; children: ReactNode }) {
  const p = usePalette();
  return (
    <View style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }]}>
      <Text style={[styles.h2, { color: p.ink }]} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Bullets({ items }: { items: string[] }) {
  const p = usePalette();
  return (
    <View style={styles.bullets}>
      {items.map((t, i) => (
        <View key={i} style={styles.bulletRow}>
          <Text style={[styles.bullet, { color: p.accent }]}>•</Text>
          <Text style={[styles.text, styles.flex, { color: p.inkBody }]}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

function Link({ label, url }: { label: string; url: string }) {
  const p = usePalette();
  return (
    <Text style={[styles.link, { color: p.accentInk }]} onPress={() => openUrl(url)} accessibilityRole="link">
      {label} ↗
    </Text>
  );
}

export default function AboutScreen() {
  const p = usePalette();
  const { api, config } = useAppData();
  const notices = noticesFor(config, 'about'); // FRED and CC BY-SA wording, from app_config
  const text = [styles.text, { color: p.inkBody }];

  return (
    <Shell active="about" scroll>
      <Text style={[styles.title, { color: p.ink }]} accessibilityRole="header">
        About {APP_NAME}
      </Text>
      <Text style={[styles.lead, { color: p.inkBody }]}>
        A short daily briefing in plain language: business, the economy, government, the world, science and safety. Here is exactly where it comes
        from and how it is made.
      </Text>

      <Section title="Where the news comes from">
        <Text style={text}>
          Almost everything is a public record from the U.S. government, which anyone may reuse. The one exception is Wikipedia, which is shared under
          a Creative Commons license. We use no paywalled news, no publisher photos and no stock prices.
        </Text>
        {SOURCES.map((s) => (
          <View key={s.name} style={[styles.source, { borderTopColor: p.rowDivider }]}>
            <Text style={[styles.sourceName, { color: p.ink }]}>{s.name}</Text>
            <Text style={[styles.small, { color: p.inkSoft }]}>{s.gives}</Text>
            <View style={styles.links}>
              <Link label="Website" url={s.site} />
              <Link label={s.terms.label} url={s.terms.url} />
            </View>
          </View>
        ))}
        {notices.map((n) => (
          <Text
            key={n.key}
            style={[styles.small, { color: p.muted }]}
            onPress={n.url ? () => openUrl(n.url as string) : undefined}
            accessibilityRole={n.url ? 'link' : 'text'}
          >
            {n.text}
          </Text>
        ))}
      </Section>

      <Section title="How we collect it">
        <Bullets
          items={[
            'A small program checks the official feeds and data services above every few minutes while it runs, several times a day.',
            'It downloads full pages from only three websites: sec.gov, federalreserve.gov and bls.gov. Everything else comes from the source’s own feed or data service.',
            'It tells the SEC who we are on every request, as the SEC requires.',
          ]}
        />
      </Section>

      <Section title="How we filter it">
        <Bullets
          items={[
            'Company filings only for about 150 well-known companies, and only for big events: earnings, CEO or CFO changes, big deals, layoffs, data breaches, restated results and bankruptcies. Routine filings are skipped before any AI is used.',
            'An AI rates how much a typical person would care, from 1 to 5. Anything below 3 is not published.',
            'Duplicates are removed, and no company gets more than 3 cards a day.',
            'Economic numbers become cards only when the change is big enough to matter.',
          ]}
        />
      </Section>

      <Section title="How cards are written">
        <Bullets
          items={[
            'An AI writes each summary from the source text: Google Gemini (free tier), with Groq as a backup. Some cards use a fixed template and no AI at all.',
            'Cards are written in plain words, at about an 8th-grade reading level.',
            'Every AI card is checked automatically: every number must appear in the source, there is no buy, sell or advice language, only short quotes are copied (at most 10 words from filings and Wikipedia, 25 from Fed and BLS text), and the length is limited.',
            'If a draft fails a check it gets one more try. If it still fails, a backup or a plain template card is used instead.',
            `AI cards are marked “${aiNoticeText(config)}”. The “More detail” view is written in the same step and passes the same checks.`,
          ]}
        />
      </Section>

      <Section title="How the feeds are ordered">
        <Bullets
          items={[
            'Trending: the most important cards first, balanced with freshness and how much readers engage with them.',
            'Latest: newest first.',
            'For you (with an account): learns from the topics you follow or hide and the cards you like or dislike. Only taps are stored, such as likes, cards viewed and sources opened.',
          ]}
        />
      </Section>

      <Section title="Your data">
        <Bullets
          items={[
            'Reading never needs an account.',
            'With an account we store your email, the topics you pick, and your reactions and taps, only to tailor your feed.',
            'Your password is handled by our sign-in service (Supabase Auth), which keeps only a one-way hash of it. We never see or store the password itself.',
            'On the Account screen you can delete your data or your whole account at any time.',
          ]}
        />
      </Section>

      <View style={[styles.card, { backgroundColor: p.surfaceMuted, borderColor: p.border }]}>
        <Text style={[styles.strong, { color: p.ink }]}>{disclaimerText(config)}</Text>
        <Text style={text}>AI can make mistakes. Always check the source before relying on anything here; every card links to it.</Text>
      </View>

      {api.sample ? (
        <Text style={[styles.small, { color: p.dataInk }]}>This build shows fictional sample cards. Their headlines start with [SAMPLE].</Text>
      ) : null}
    </Shell>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.serif, fontSize: 34, lineHeight: 37, letterSpacing: -0.5 },
  lead: { fontFamily: fonts.sans, fontSize: 17, lineHeight: 25 },
  card: { borderWidth: 1, borderRadius: 24, padding: 20, gap: 12 },
  h2: { fontFamily: fonts.serif, fontSize: 24, lineHeight: 28 },
  text: { fontFamily: fonts.sans, fontSize: 16, lineHeight: 24 },
  small: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  strong: { fontFamily: fonts.sansSemi, fontSize: 16 },
  flex: { flex: 1 },
  bullets: { gap: 8 },
  bulletRow: { flexDirection: 'row', gap: 10 },
  bullet: { fontFamily: fonts.sansSemi, fontSize: 16, lineHeight: 24 },
  source: { borderTopWidth: 1, paddingTop: 12, gap: 4 },
  sourceName: { fontFamily: fonts.sansSemi, fontSize: 16 },
  links: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 4, paddingTop: 2 },
  link: { fontFamily: fonts.sansSemi, fontSize: 14, textDecorationLine: 'underline' },
});
