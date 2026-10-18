// "Pick topics you care about": shown once after the first sign-in. Saved with
// api.set_prefs; "Skip" remembers the choice on this device.

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAccount } from '../lib/accountContext';
import { useAppData } from '../lib/appData';
import { usePalette } from '../lib/useTheme';
import { fonts } from '../lib/theme';
import { Shell } from '../components/Shell';
import { Button } from '../components/States';
import { TopicPicker } from '../components/TopicPicker';

export default function OnboardingScreen() {
  const p = usePalette();
  const { categories } = useAppData();
  const acct = useAccount();
  const [selected, setSelected] = useState<string[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!acct.user) router.replace('/signin' as never);
  }, [acct.user]);
  useEffect(() => {
    if (acct.prefs && acct.prefs.followed.length > 0) setSelected(acct.prefs.followed);
  }, [acct.prefs]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await acct.savePrefs(
        selected,
        hidden.filter((h) => !selected.includes(h)),
      );
      router.dismissTo('/?tab=for_you' as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your topics.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell active="account" scroll>
      <Text style={[styles.title, { color: p.ink }]} accessibilityRole="header">
        Pick topics you care about
      </Text>
      <Text style={[styles.sub, { color: p.muted }]}>
        Your “For you” feed puts these first. Likes and “less like this” fine-tune it over time. You can change this any time.
      </Text>
      <TopicPicker categories={categories} selected={selected} onChange={setSelected} />
      <Text style={[styles.sub, { color: p.muted }]}>Topics to hide (optional): you won’t see these at all.</Text>
      <TopicPicker
        categories={categories.filter((c) => !selected.includes(c.slug))}
        selected={hidden.filter((h) => !selected.includes(h))}
        onChange={setHidden}
      />
      {error ? (
        <Text style={[styles.error, { color: p.up }]} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button
          label={busy ? 'Saving…' : selected.length ? `Save ${selected.length} topic${selected.length === 1 ? '' : 's'}` : 'Save'}
          onPress={busy ? () => undefined : save}
        />
        <Pressable
          onPress={() => {
            acct.skipOnboarding();
            router.dismissTo('/');
          }}
          accessibilityRole="button"
          style={styles.skip}
        >
          <Text style={[styles.skipText, { color: p.muted }]}>Skip for now</Text>
        </Pressable>
      </View>
    </Shell>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.serif, fontSize: 34, lineHeight: 37, letterSpacing: -0.5 },
  sub: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 21 },
  error: { fontFamily: fonts.sansMedium, fontSize: 14 },
  actions: { gap: 6, alignItems: 'stretch' },
  skip: { alignSelf: 'center', paddingVertical: 12 },
  skipText: { fontFamily: fonts.sansSemi, fontSize: 15 },
});
