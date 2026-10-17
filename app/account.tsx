// Account: who is signed in, edit topics, sign out, and delete my data (with an
// in-page confirm, since browser dialogs don't exist on native).

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAccount } from '../lib/accountContext';
import { useAppData } from '../lib/appData';
import { categoryName } from '../lib/format';
import { usePalette } from '../lib/useTheme';
import { fonts } from '../lib/theme';
import { Shell } from '../components/Shell';
import { Button } from '../components/States';
import { TopicPicker } from '../components/TopicPicker';

export default function AccountScreen() {
  const p = usePalette();
  const { categories } = useAppData();
  const acct = useAccount();
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!acct.user) router.replace('/signin' as never);
  }, [acct.user]);
  useEffect(() => {
    if (acct.prefs) setSelected(acct.prefs.followed);
  }, [acct.prefs]);

  async function run(work: () => Promise<void>, done: string) {
    setBusy(true);
    setStatus(null);
    try {
      await work();
      setStatus(done);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  const card = [styles.card, { backgroundColor: p.surface, borderColor: p.border }];
  const saved = acct.prefs?.followed ?? [];
  const changed = saved.slice().sort().join() !== selected.slice().sort().join();

  return (
    <Shell active="account" scroll>
      <Text style={[styles.title, { color: p.ink }]} accessibilityRole="header">
        Account
      </Text>
      <View style={card}>
        <Text style={[styles.label, { color: p.muted }]}>Signed in as</Text>
        <Text style={[styles.value, { color: p.ink }]}>{acct.user?.email ?? ''}</Text>
        <Pressable
          onPress={() => run(() => acct.signOut(), 'Signed out.')}
          accessibilityRole="button"
          style={[styles.outline, { borderColor: p.borderStrong }]}
        >
          <Text style={[styles.outlineText, { color: p.ink }]}>Sign out</Text>
        </Pressable>
      </View>

      <View style={card}>
        <Text style={[styles.h2, { color: p.ink }]} accessibilityRole="header">
          Your topics
        </Text>
        <Text style={[styles.help, { color: p.muted }]}>
          {saved.length
            ? `“For you” puts ${saved.map((s) => categoryName(s, categories)).join(', ')} first.`
            : 'Pick topics to put them first in your “For you” feed.'}
        </Text>
        <TopicPicker categories={categories} selected={selected} onChange={setSelected} />
        {changed ? <Button label={busy ? 'Saving…' : 'Save topics'} onPress={() => run(() => acct.savePrefs(selected), 'Topics saved.')} /> : null}
      </View>

      <View style={card}>
        <Text style={[styles.h2, { color: p.ink }]} accessibilityRole="header">
          Your data
        </Text>
        <Text style={[styles.help, { color: p.muted }]}>
          We keep your topics and what you liked, viewed or opened, only to tailor your feed. Deleting removes all of it; your login stays until you
          ask us to remove it.
        </Text>
        {confirming ? (
          <View style={styles.confirm}>
            <Text style={[styles.help, { color: p.ink }]}>Delete your topics and history? This can’t be undone.</Text>
            <Pressable
              onPress={() =>
                run(async () => {
                  await acct.deleteMyData();
                  setConfirming(false);
                }, 'Your data was deleted.')
              }
              accessibilityRole="button"
              style={[styles.danger, { backgroundColor: p.up }]}
            >
              <Text style={[styles.dangerText, { color: '#FFFFFF' }]}>Yes, delete my data</Text>
            </Pressable>
            <Pressable onPress={() => setConfirming(false)} accessibilityRole="button" style={[styles.outline, { borderColor: p.borderStrong }]}>
              <Text style={[styles.outlineText, { color: p.ink }]}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setConfirming(true)} accessibilityRole="button" style={[styles.outline, { borderColor: p.up }]}>
            <Text style={[styles.outlineText, { color: p.up }]}>Delete my data</Text>
          </Pressable>
        )}
      </View>
      {status ? (
        <Text style={[styles.help, { color: p.accentInk }]} accessibilityLiveRegion="polite">
          {status}
        </Text>
      ) : null}
    </Shell>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.serif, fontSize: 34, lineHeight: 37, letterSpacing: -0.5 },
  card: { borderWidth: 1, borderRadius: 24, padding: 20, gap: 10 },
  label: { fontFamily: fonts.sansMedium, fontSize: 13 },
  value: { fontFamily: fonts.sansSemi, fontSize: 17 },
  h2: { fontFamily: fonts.serif, fontSize: 24 },
  help: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  outline: { minHeight: 48, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  outlineText: { fontFamily: fonts.sansSemi, fontSize: 16 },
  confirm: { gap: 8 },
  danger: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dangerText: { fontFamily: fonts.sansSemi, fontSize: 16 },
});
