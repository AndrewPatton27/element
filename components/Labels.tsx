// Trust labels. The disclaimer is on every card; the AI label only on cards whose
// text was written by a model. Strings come from lib/labels.ts.

import { StyleSheet, Text } from 'react-native';
import { usePalette } from '../lib/useTheme';
import { font, fonts } from '../lib/theme';

export function AiLabel({ text }: { text: string }) {
  const p = usePalette();
  return (
    <Text style={[styles.small, { color: p.muted }]} accessibilityLabel={text}>
      {text}
    </Text>
  );
}

export function Disclaimer({ text, center }: { text: string; center?: boolean }) {
  const p = usePalette();
  return <Text style={[styles.small, { color: p.muted }, center && styles.center]}>{text}</Text>;
}

const styles = StyleSheet.create({
  small: { fontFamily: fonts.sans, fontSize: font.small, lineHeight: 17 },
  center: { textAlign: 'center' },
});
