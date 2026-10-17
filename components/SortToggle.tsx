// Top / Latest tabs (underline style), mapped to the api.feed modes.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { FeedMode } from '../contract/types.ts';
import { usePalette } from '../lib/useTheme';
import { fonts } from '../lib/theme';

const OPTIONS: { mode: FeedMode; label: string; hint: string }[] = [
  { mode: 'top', label: 'Top', hint: 'Most important and recent first' },
  { mode: 'latest', label: 'Latest', hint: 'Newest first' },
];

export function SortToggle({ mode, onChange, wide }: { mode: FeedMode; onChange: (m: FeedMode) => void; wide?: boolean }) {
  const p = usePalette();
  return (
    <View style={[styles.row, wide && { borderBottomWidth: 1, borderColor: p.navBorder }]} accessibilityRole="tablist">
      {OPTIONS.map((o) => {
        const on = o.mode === mode;
        return (
          <Pressable
            key={o.mode}
            onPress={() => onChange(o.mode)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityHint={o.hint}
            style={[styles.tab, wide && styles.tabWide, { borderBottomColor: on ? p.accent : 'transparent' }]}
          >
            <Text style={[styles.text, wide && styles.textWide, { color: on ? p.ink : p.muted, fontFamily: on ? fonts.sansSemi : fonts.sansMedium }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4 },
  tab: { height: 44, paddingHorizontal: 14, justifyContent: 'center', borderBottomWidth: 3 },
  tabWide: { height: 48, paddingHorizontal: 16 },
  text: { fontSize: 16 },
  textWide: { fontSize: 17 },
});
