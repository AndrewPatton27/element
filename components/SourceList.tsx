// Every source of a card as tappable rows (outlet, document, site, time, link to
// the original), "and N more outlets", and the CC BY-SA license link on
// Wikipedia sources. Used by the sources sheet and the detail sheet.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppConfig, BlurbCard } from '../contract/types.ts';
import { hostOf, relativeTime } from '../lib/format';
import { CC_BY_SA_MARK, shareAlikeCredit } from '../lib/labels';
import { openUrl } from '../lib/openUrl';
import { usePalette } from '../lib/useTheme';
import { fonts } from '../lib/theme';
import { BuildingIcon, DocumentIcon, ExternalIcon, LinkIcon } from './Icons';

export function SourceList({ card, config }: { card: BlurbCard; config: AppConfig | null }) {
  const p = usePalette();
  const hidden = card.source_count - card.sources.length;
  const credit = shareAlikeCredit(card, config);
  return (
    <View style={styles.list}>
      {card.sources.map((s) => (
        <Pressable
          key={s.url}
          onPress={() => openUrl(s.url, card.id)}
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
            {(s.license_class as string) === 'cc_by_sa' && credit ? (
              <Text
                style={[styles.rowMeta, styles.licenseLink, { color: p.accentInk }]}
                onPress={() => openUrl(credit.licenseUrl)}
                accessibilityRole="link"
              >
                License: {CC_BY_SA_MARK}
              </Text>
            ) : null}
          </View>
          <ExternalIcon color={p.muted} />
        </Pressable>
      ))}
      {hidden > 0 ? (
        <Text style={[styles.rowMeta, { color: p.muted }]}>
          and {hidden} more outlet{hidden === 1 ? '' : 's'}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16, borderWidth: 1 },
  rowIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
  rowName: { fontFamily: fonts.sansSemi, fontSize: 16 },
  licenseLink: { textDecorationLine: 'underline' },
  rowMeta: { fontFamily: fonts.sans, fontSize: 14 },
});
