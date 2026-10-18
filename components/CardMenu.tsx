// The card's "⋯" options (signed in only): hide this card's topic. A small sheet
// with large tap targets; Escape / back / tapping outside closes it.

import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { BlurbCard, Category } from '../contract/types.ts';
import { categoryName } from '../lib/format';
import { usePalette } from '../lib/useTheme';
import { fonts } from '../lib/theme';

interface Props {
  card: BlurbCard | null;
  categories: Category[];
  onHideTopic: (card: BlurbCard) => void;
  onClose: () => void;
}

export function CardMenu({ card, categories, onHideTopic, onClose }: Props) {
  const p = usePalette();
  const topic = card ? categoryName(card.category, categories) : '';
  return (
    <Modal visible={card !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: p.overlay }]} onPress={onClose} accessibilityLabel="Close options" />
      <View style={styles.center} pointerEvents="box-none">
        <View style={[styles.menu, { backgroundColor: p.surface }]} accessibilityViewIsModal accessibilityLabel="Card options">
          <Pressable
            onPress={() => card && onHideTopic(card)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.item, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.itemText, { color: p.ink }]}>Hide {topic} topics</Text>
            <Text style={[styles.hint, { color: p.muted }]}>You won’t see {topic} cards. Change it any time in Account.</Text>
          </Pressable>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            style={({ pressed }) => [styles.item, styles.cancel, { borderTopColor: p.divider, opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.cancelText, { color: p.accentInk }]}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  center: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 24 },
  menu: { width: '100%', maxWidth: 360, borderRadius: 20, overflow: 'hidden' },
  item: { paddingVertical: 16, paddingHorizontal: 20, gap: 4 },
  itemText: { fontFamily: fonts.sansSemi, fontSize: 16 },
  hint: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
  cancel: { borderTopWidth: 1, alignItems: 'center' },
  cancelText: { fontFamily: fonts.sansSemi, fontSize: 16 },
});
