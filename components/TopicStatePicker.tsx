// Account → Your topics: each topic is Follow, Normal or Hide. A segmented control
// per row; the chosen segment is filled and shows a check mark (never colour only),
// and screen readers get radio buttons named "<Topic>: Follow" and so on.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Category } from '../contract/types.ts';
import { topicState, withTopicState, type TopicState } from '../lib/accountLogic';
import { usePalette } from '../lib/useTheme';
import { fonts } from '../lib/theme';
import { LoadingState } from './States';

const STATES: { state: TopicState; label: string }[] = [
  { state: 'follow', label: 'Follow' },
  { state: 'normal', label: 'Normal' },
  { state: 'hide', label: 'Hide' },
];

interface Props {
  categories: Category[];
  value: { followed: string[]; hidden: string[] };
  onChange: (next: { followed: string[]; hidden: string[] }) => void;
}

export function TopicStatePicker({ categories, value, onChange }: Props) {
  const p = usePalette();
  if (categories.length === 0) return <LoadingState label="Loading topics…" />;
  return (
    <View style={styles.list}>
      {categories.map((c) => {
        const current = topicState(value, c.slug);
        return (
          <View key={c.slug} style={[styles.row, { borderTopColor: p.rowDivider }]}>
            <Text style={[styles.name, { color: current === 'hide' ? p.muted : p.ink }]} numberOfLines={2}>
              {c.name}
            </Text>
            <View style={[styles.seg, { borderColor: p.borderStrong }]} accessibilityRole="radiogroup" accessibilityLabel={c.name}>
              {STATES.map(({ state, label }) => {
                const on = state === current;
                return (
                  <Pressable
                    key={state}
                    onPress={() => onChange(withTopicState(value, c.slug, state))}
                    accessibilityRole="radio"
                    aria-checked={on}
                    accessibilityLabel={`${c.name}: ${label}`}
                    style={[styles.option, on && { backgroundColor: state === 'hide' ? p.surfaceMuted : p.accentSoft }]}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        { color: on ? (state === 'hide' ? p.ink : p.accentInk) : p.muted, fontFamily: on ? fonts.sansSemi : fonts.sansMedium },
                      ]}
                    >
                      {on ? '✓ ' : ''}
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {},
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1 },
  name: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 15 },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: 999, overflow: 'hidden' },
  option: { minHeight: 36, minWidth: 64, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  optionText: { fontSize: 13 },
});
