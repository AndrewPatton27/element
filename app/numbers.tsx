// "Numbers to know": the macro numbers, each with a plain-language line, the
// change (glyph + word), the original agency, and the FRED notice.

import { StyleSheet, Text, View } from 'react-native';
import { useAppData } from '../lib/appData';
import { disclaimerText } from '../lib/labels';
import { usePalette } from '../lib/useTheme';
import { fonts } from '../lib/theme';
import { Disclaimer } from '../components/Labels';
import { NumbersPanel } from '../components/NumbersPanel';
import { Shell } from '../components/Shell';

export default function NumbersScreen() {
  const p = usePalette();
  const { api, config } = useAppData();
  return (
    <Shell active="numbers" scroll>
      <View style={styles.header}>
        <Text style={[styles.title, { color: p.ink }]} accessibilityRole="header">
          Numbers to know
        </Text>
        <Text style={[styles.sub, { color: p.muted }]}>Key numbers that shape prices, jobs and loans. Latest official readings.</Text>
      </View>
      <NumbersPanel api={api} config={config} variant="full" />
      <Disclaimer text={disclaimerText(config)} center />
    </Shell>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4, paddingBottom: 4 },
  title: { fontFamily: fonts.serif, fontSize: 34, lineHeight: 37, letterSpacing: -0.5 },
  sub: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 21 },
});
