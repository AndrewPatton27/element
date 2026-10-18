// Following screen. Stub from the UI foundation (P0.4); another builder fills it in.
// Keep the file name and the default export.

import { StyleSheet, Text } from 'react-native';
import { ScreenShell } from '../components/ScreenShell';
import { usePalette } from '../lib/useTheme';
import { fonts, font } from '../lib/theme';

export default function FollowingScreen() {
  const p = usePalette();
  return (
    <ScreenShell tab="following" title="Following">
      <Text style={[styles.soon, { color: p.inkSoft }]}>Follow a story from the feed and its updates will show here. Coming soon.</Text>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  soon: { fontSize: font.body, lineHeight: 24, fontFamily: fonts.sans },
});