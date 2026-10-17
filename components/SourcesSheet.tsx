// "Where this came from": bottom sheet listing every source of a card with a
// link to the original, how the card was made, and the disclaimer.

import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AppConfig, BlurbCard } from '../contract/types.ts';
import { hostOf, relativeTime } from '../lib/format';
import { disclaimerText, howMadeText, primarySource } from '../lib/labels';
import { usePalette } from '../lib/useTheme';
import { MAX_COLUMN_WIDTH } from '../lib/config';
import { fonts } from '../lib/theme';
import { BuildingIcon, CloseIcon, DocumentIcon, ExternalIcon, LinkIcon } from './Icons';
import { Disclaimer } from './Labels';
import { openUrl } from './SourceChip';

export function SourcesSheet({ card, config, onClose }: { card: BlurbCard | null; config: AppConfig | null; onClose: () => void }) {
  const p = usePalette();
  const hidden = card ? card.source_count - card.sources.length : 0;
  const primary = card ? primarySource(card) : null;
  return (
    <Modal visible={card !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: p.overlay }]} onPress={onClose} accessibilityLabel="Close sources" />
      <View style={styles.dock} pointerEvents="box-none">
        <View style={[styles.sheet, { backgroundColor: p.surface }]} accessibilityViewIsModal accessibilityLabel="Sources">
          <View style={[styles.handle, { backgroundColor: p.handle }]} />
          <View style={styles.header}>
            <Text style={[styles.title, { color: p.ink }]} accessibilityRole="header">
              Where this came from
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={[styles.close, { backgroundColor: p.surfaceMuted }]}
            >
              <CloseIcon color={p.ink} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.list}>
            {card?.sources.map((s) => (
              <Pressable
                key={s.url}
                onPress={() => openUrl(s.url)}
                accessibilityRole="link"
                accessibilityLabel={`${s.name}${s.doc_label ? ', ' + s.doc_label : ''}, ${relativeTime(s.published_at)}. Opens the original.`}
                style={({ pressed }) => [styles.row, { borderColor: p.navBorder, opacity: pressed ? 0.75 : 1 }]}
              >
                <View style={[styles.rowIcon, { backgroundColor: p.accentSoft }]}>
                  {s.kind === 'government' ? (
                    <BuildingIcon color={p.accentInk} />
                  ) : s.kind === 'filing' ? (
                    <DocumentIcon color={p.accentInk} />
                  ) : (
                    <LinkIcon color={p.accentInk} size={20} />
                  )}
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowName, { color: p.ink }]}>{s.name}</Text>
                  <Text style={[styles.rowMeta, { color: p.muted }]} numberOfLines={2}>
                    {[s.doc_label, hostOf(s.url), relativeTime(s.published_at)].filter(Boolean).join(' · ')}
                  </Text>
                  {s.attribution ? <Text style={[styles.rowMeta, { color: p.muted }]}>{s.attribution}</Text> : null}
                </View>
                <ExternalIcon color={p.muted} />
              </Pressable>
            ))}
            {hidden > 0 ? (
              <Text style={[styles.rowMeta, { color: p.muted }]}>
                and {hidden} more outlet{hidden === 1 ? '' : 's'}
              </Text>
            ) : null}
            {card ? (
              <View style={[styles.how, { backgroundColor: p.surfaceMuted }]}>
                <Text style={[styles.howTitle, { color: p.ink }]}>How this card was made</Text>
                <Text style={[styles.howText, { color: p.inkSoft }]}>{howMadeText(card)}</Text>
              </View>
            ) : null}
          </ScrollView>
          {primary ? (
            <Pressable
              onPress={() => openUrl(primary.url)}
              accessibilityRole="link"
              style={({ pressed }) => [styles.primary, { backgroundColor: p.accent, opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={[styles.primaryText, { color: p.onAccent }]}>Open the source</Text>
            </Pressable>
          ) : null}
          <Disclaimer text={disclaimerText(config)} center />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, top: '15%', alignItems: 'center', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '100%',
    width: '100%',
    maxWidth: MAX_COLUMN_WIDTH + 40,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 16,
  },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fonts.serif, fontSize: 26, letterSpacing: -0.26 },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  list: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16, borderWidth: 1 },
  rowIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
  rowName: { fontFamily: fonts.sansSemi, fontSize: 16 },
  rowMeta: { fontFamily: fonts.sans, fontSize: 14 },
  how: { gap: 6, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14 },
  howTitle: { fontFamily: fonts.sansSemi, fontSize: 14 },
  howText: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  primary: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: fonts.sansSemi, fontSize: 16 },
});
