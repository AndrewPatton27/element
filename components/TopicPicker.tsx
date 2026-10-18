// Multi-select topic chips (onboarding and account). Selected chips show a check
// mark as well as the accent colour, so the state is never colour-only.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Category } from '../contract/types.ts';
import { toggleTopic } from '../lib/accountLogic';
import { usePalette } from '../lib/useTheme';
import { fonts } from '../lib/theme';
import { LoadingState } from './States';

export function TopicPicker({ categories, selected, onChange }: { categories: Category[]; selected: string[]; onChange: (next: string[]) => void }) {
  const p = usePalette();
  if (categories.length === 0) return <LoadingState label="Loading topics…" />;
  return (
    <View style={styles.wrap} accessibilityRole="list">
      {categories.map((c) => {
        const on = selected.includes(c.slug);
        return (
          <Pressable
            key={c.slug}
            onPress={() => onChange(toggleTopic(selected, c.slug))}
            accessibilityRole="checkbox"
            aria-checked={on}
            accessibilityLabel={c.name}
            style={({ pressed }) => [
              styles.chip,
              { borderColor: on ? p.accent : p.borderStrong, backgroundColor: on ? p.accentSoft : p.surface, opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <Text style={[styles.text, { color: on ? p.accentInk : p.inkSoft, fontFamily: on ? fonts.sansSemi : fonts.sansMedium }]}>
              {on ? '✓ ' : ''}
              {c.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1, justifyContent: 'center' },
  text: { fontSize: 15 },
});
