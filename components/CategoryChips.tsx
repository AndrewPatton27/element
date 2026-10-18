// Category filter: "All" plus the categories from api.categories. Scrolls
// sideways on phones, wraps on the wide web layout.

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Category, CategorySlug } from '../contract/types.ts';
import { usePalette } from '../lib/useTheme';
import { fonts } from '../lib/theme';

interface Props {
  categories: Category[];
  selected: CategorySlug | null;
  onSelect: (slug: CategorySlug | null) => void;
  wide?: boolean;
  onEdit?: () => void; // signed in: a last chip that opens Account → Your topics
}

export function CategoryChips({ categories, selected, onSelect, wide, onEdit }: Props) {
  const p = usePalette();
  const items: { slug: CategorySlug | null; name: string }[] = [{ slug: null, name: 'All' }, ...categories];
  const chips = items.map((c) => {
    const on = c.slug === selected;
    return (
      <Pressable
        key={c.slug ?? 'all'}
        onPress={() => onSelect(c.slug)}
        accessibilityRole="tab"
        aria-selected={on}
        style={({ pressed }) => [
          styles.chip,
          { borderColor: on ? p.accent : p.borderStrong, backgroundColor: on ? p.accentSoft : p.surface, opacity: pressed ? 0.75 : 1 },
        ]}
      >
        <Text style={[styles.text, { color: on ? p.accentInk : p.inkSoft, fontFamily: on ? fonts.sansSemi : fonts.sansMedium }]}>{c.name}</Text>
      </Pressable>
    );
  });
  if (onEdit) {
    chips.push(
      <Pressable
        key="edit"
        onPress={onEdit}
        accessibilityRole="link"
        accessibilityLabel="Edit topics"
        style={({ pressed }) => [
          styles.chip,
          { borderColor: p.borderStrong, borderStyle: 'dashed', backgroundColor: 'transparent', opacity: pressed ? 0.75 : 1 },
        ]}
      >
        <Text style={[styles.text, { color: p.accentInk, fontFamily: fonts.sansSemi }]}>Edit topics</Text>
      </Pressable>,
    );
  }
  if (wide) {
    return (
      <View style={styles.wrap} accessibilityRole="tablist">
        {chips}
      </View>
    );
  }
  return (
    <ScrollView
      horizontal
      style={styles.scroller}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="tablist"
    >
      {chips}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroller: { flexGrow: 0, flexShrink: 0 },
  row: { gap: 8, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, justifyContent: 'center' },
  text: { fontSize: 14 },
});
