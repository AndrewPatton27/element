// Search screen. Stub from the UI foundation (P0.4); another builder fills it in.
// Keep the file name and the default export.

import { StyleSheet, Text } from 'react-native';
import { ScreenShell } from '../components/ScreenShell';
import { usePalette } from '../lib/useTheme';
import { fonts, font } from '../lib/theme';

export default function SearchScreen() {
  const p = usePalette();
  return (
    <ScreenShell tab="search" title="Search">
      <Text style={[styles.soon, { color: p.inkSoft }]}>Search across every card is coming soon.</Text>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  soon: { fontSize: font.body, lineHeight: 24, fontFamily: fonts.sans },
});