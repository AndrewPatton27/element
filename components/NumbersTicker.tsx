// A constantly looping "Numbers to know" marquee for the top of the wide feed.
// The macro facts scroll horizontally like a ferris wheel, moving left to right
// and wrapping around forever. The list is laid out twice back to back so the
// loop is seamless; we measure one copy and translate by its width.
//
// Driven by requestAnimationFrame + transform rather than Reanimated, so it
// needs no extra babel plugin and behaves the same on web and native.

import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppConfig } from '../contract/types.ts';
import type { Api } from '../lib/api.ts';
import { changeText, factA11yLabel } from '../lib/format';
import { usePalette } from '../lib/useTheme';
import { fonts } from '../lib/theme';
import { changeColor } from './DataCard';
import { useNumbers } from './NumbersPanel';
import { openUrl } from './SourceChip';

// Pixels travelled per second. Lower is calmer.
const SPEED = 48;

export function NumbersTicker({ api, config }: { api: Api; config: AppConfig | null }) {
  const p = usePalette();
  const { facts } = useNumbers(api);
  const [setWidth, setSetWidth] = useState(0);
  const [offset, setOffset] = useState(0);

  // Advance an offset in [0, setWidth) every frame. The track is translated by
  // (offset - setWidth), so it moves left to right and loops seamlessly because
  // a second identical copy trails behind.
  const raf = useRef<number | null>(null);
  const last = useRef<number | null>(null);
  const pos = useRef(0);
  useEffect(() => {
    if (setWidth <= 0) return;
    const step = (now: number) => {
      if (last.current != null) {
        const dt = (now - last.current) / 1000;
        pos.current = (pos.current + dt * SPEED) % setWidth;
        setOffset(pos.current);
      }
      last.current = now;
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
      last.current = null;
    };
  }, [setWidth]);

  if (!facts || facts.length === 0) return null;

  const translateX = setWidth > 0 ? offset - setWidth : 0;

  const row = (keyPrefix: string, onMeasure?: (w: number) => void) => (
    <View
      style={styles.row}
      onLayout={onMeasure ? (e) => onMeasure(e.nativeEvent.layout.width) : undefined}
      // The measured copy carries accessibility; the clone is decorative.
      accessibilityElementsHidden={onMeasure ? undefined : true}
      importantForAccessibility={onMeasure ? 'auto' : 'no-hide-descendants'}
    >
      {facts.map((f) => (
        <Pressable
          key={`${keyPrefix}-${f.series_id}`}
          onPress={() => openUrl(f.source_url)}
          accessibilityRole="link"
          accessibilityLabel={factA11yLabel(f)}
          style={({ pressed }) => [styles.item, { borderColor: p.border, backgroundColor: p.surface, opacity: pressed ? 0.75 : 1 }]}
        >
          <Text style={[styles.label, { color: p.muted }]} numberOfLines={1}>
            {f.label}
          </Text>
          <Text style={[styles.value, { color: p.ink }]} numberOfLines={1}>
            {f.value}
          </Text>
          {changeText(f) ? (
            <Text style={[styles.change, { color: changeColor(p, f.direction) }]} numberOfLines={1}>
              {changeText(f)}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={styles.wrap} accessibilityRole="list" accessibilityLabel="Numbers to know">
      <View style={[styles.track, { transform: [{ translateX }] }]}>
        {row('a', setSetWidth)}
        {row('b')}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', paddingVertical: 4 },
  track: { flexDirection: 'row' },
  row: { flexDirection: 'row', gap: 10, paddingRight: 10 },
  item: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  label: { fontFamily: fonts.sansSemi, fontSize: 12, letterSpacing: 0.2, textTransform: 'uppercase' },
  value: { fontFamily: fonts.serif, fontSize: 18, lineHeight: 20 },
  change: { fontFamily: fonts.sansSemi, fontSize: 12 },
});
