// Account: email (change it), password (change it), sign out, topics, delete my
// data, and delete the whole account (type DELETE to confirm). Confirms are
// in-page because browser dialogs don't exist on native.

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useAccount } from '../lib/accountContext';
import { useAppData } from '../lib/appData';
import { categoryName } from '../lib/format';
import { DELETE_CONFIRM_WORD, deleteConfirmed, validateEmail, validateNewPassword } from '../lib/session';
import { usePalette } from '../lib/useTheme';
import { fonts } from '../lib/theme';
import { PasswordField, fieldStyles } from '../components/PasswordField';
import { Shell } from '../components/Shell';
import { Button } from '../components/States';
import { TopicStatePicker } from '../components/TopicStatePicker';

type Section = 'email' | 'password' | 'topics' | 'data' | 'account' | 'session';
type Msg = { text: string; error: boolean };

export default function AccountScreen() {
  const p = usePalette();
  const { categories } = useAppData();
  const acct = useAccount();
  const [topics, setTopics] = useState<{ followed: string[]; hidden: string[] }>({ followed: [], hidden: [] });
  const [busy, setBusy] = useState<Section | null>(null);
  const [msgs, setMsgs] = useState<Partial<Record<Section, Msg>>>({});
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [hideSignal, setHideSignal] = useState(0);
  const [confirmingData, setConfirmingData] = useState(false);
  const [deleteText, setDeleteText] = useState('');

  useEffect(() => {
    if (!acct.user) router.replace('/signin' as never);
  }, [acct.user]);
  useEffect(() => {
    if (acct.prefs) setTopics({ followed: acct.prefs.followed, hidden: acct.prefs.hidden });
  }, [acct.prefs]);

  async function run(section: Section, work: () => Promise<string | void>, done: string) {
    setBusy(section);
    setMsgs((m) => ({ ...m, [section]: undefined }));
    try {
      const text = await work();
      setMsgs((m) => ({ ...m, [section]: { text: text || done, error: false } }));
    } catch (e) {
      setMsgs((m) => ({ ...m, [section]: { text: e instanceof Error ? e.message : 'Something went wrong.', error: true } }));
    } finally {
      setBusy(null);
    }
  }

  function fail(section: Section, text: string) {
    setMsgs((m) => ({ ...m, [section]: { text, error: true } }));
  }

  function changePassword() {
    const problem = validateNewPassword(newPassword, confirmPassword);
    if (problem) return fail('password', problem);
    const pw = newPassword;
    setNewPassword('');
    setConfirmPassword('');
    setHideSignal((n) => n + 1);
    void run('password', () => acct.changePassword(pw), 'Password changed.');
  }

  function changeEmail() {
    const problem = validateEmail(newEmail);
    if (problem) return fail('email', problem);
    void run(
      'email',
      async () => {
        const r = await acct.changeEmail(newEmail);
        setEditingEmail(false);
        setNewEmail('');
        return r === 'changed' ? 'Email changed.' : 'Check both inboxes: confirm the change from the link we sent.';
      },
      'Email changed.',
    );
  }

  const card = [styles.card, { backgroundColor: p.surface, borderColor: p.border }];
  const input = [fieldStyles.input, { borderColor: p.borderStrong, backgroundColor: p.surface, color: p.ink }];
  const saved = acct.prefs?.followed ?? [];
  const key = (l: string[]) => l.slice().sort().join();
  const topicsChanged = key(saved) !== key(topics.followed) || key(acct.prefs?.hidden ?? []) !== key(topics.hidden);
  const message = (s: Section) => {
    const m = msgs[s];
    return m ? (
      <Text
        style={[styles.help, { color: m.error ? p.up : p.accentInk }]}
        accessibilityRole={m.error ? 'alert' : undefined}
        accessibilityLiveRegion="polite"
      >
        {m.text}
      </Text>
    ) : null;
  };
  const outline = (label: string, onPress: () => void, color = p.ink, border = p.borderStrong) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.outline, { borderColor: border, opacity: pressed ? 0.75 : 1 }]}
    >
      <Text style={[styles.outlineText, { color }]}>{label}</Text>
    </Pressable>
  );

  return (
    <Shell active="account" scroll>
      <Text style={[styles.title, { color: p.ink }]} accessibilityRole="header">
        Account
      </Text>

      <View style={card}>
        <Text style={[styles.label, { color: p.muted }]}>Signed in as</Text>
        <Text style={[styles.value, { color: p.ink }]}>{acct.user?.email ?? ''}</Text>
        {editingEmail ? (
          <View style={styles.form}>
            <Text style={[fieldStyles.label, { color: p.inkSoft }]}>New email</Text>
            <TextInput
              style={input}
              value={newEmail}
              onChangeText={setNewEmail}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              inputMode="email"
              keyboardType="email-address"
              placeholder="new@example.com"
              placeholderTextColor={p.muted}
              accessibilityLabel="New email"
              onSubmitEditing={changeEmail}
            />
            <Button label={busy === 'email' ? 'Saving…' : 'Save new email'} onPress={changeEmail} />
            {outline('Cancel', () => setEditingEmail(false))}
          </View>
        ) : (
          outline('Change email', () => setEditingEmail(true))
        )}
        {message('email')}
        {outline('Sign out', () => void run('session', () => acct.signOut(), 'Signed out.'))}
      </View>

      <View style={card}>
        <Text style={[styles.h2, { color: p.ink }]} accessibilityRole="header">
          Password
        </Text>
        <Text style={[styles.help, { color: p.muted }]}>
          Your password is stored only as a one-way hash by our sign-in service; nobody, including us, can read it.
        </Text>
        <PasswordField
          label="New password"
          value={newPassword}
          onChangeText={setNewPassword}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          hideSignal={hideSignal}
        />
        <PasswordField
          label="Confirm new password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          autoComplete="new-password"
          onSubmitEditing={changePassword}
          hideSignal={hideSignal}
        />
        <Button label={busy === 'password' ? 'Saving…' : 'Change password'} onPress={changePassword} />
        {message('password')}
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
        <TopicStatePicker categories={categories} value={topics} onChange={setTopics} />
        {topicsChanged ? (
          <Button
            label={busy === 'topics' ? 'Saving…' : 'Save topics'}
            onPress={() => void run('topics', () => acct.savePrefs(topics.followed, topics.hidden), 'Topics saved.')}
          />
        ) : null}
        {message('topics')}
      </View>

      <View style={card}>
        <Text style={[styles.h2, { color: p.ink }]} accessibilityRole="header">
          Your data
        </Text>
        <Text style={[styles.help, { color: p.muted }]}>
          We keep your topics and what you liked, viewed or opened, only to tailor your feed. Deleting it keeps your login; to remove that too, delete
          your account below.
        </Text>
        {confirmingData ? (
          <View style={styles.form}>
            <Text style={[styles.help, { color: p.ink }]}>Delete your topics and history? This can’t be undone.</Text>
            <Pressable
              onPress={() =>
                void run(
                  'data',
                  async () => {
                    await acct.deleteMyData();
                    setConfirmingData(false);
                  },
                  'Your data was deleted.',
                )
              }
              accessibilityRole="button"
              style={[styles.danger, { backgroundColor: p.up }]}
            >
              <Text style={[styles.dangerText, { color: '#FFFFFF' }]}>Yes, delete my data</Text>
            </Pressable>
            {outline('Cancel', () => setConfirmingData(false))}
          </View>
        ) : (
          outline('Delete my data', () => setConfirmingData(true), p.up, p.up)
        )}
        {message('data')}
      </View>

      <View style={card}>
        <Text style={[styles.h2, { color: p.ink }]} accessibilityRole="header">
          Delete account
        </Text>
        <Text style={[styles.help, { color: p.muted }]}>
          Removes your login, your topics and your history for good, and signs you out. To confirm, type {DELETE_CONFIRM_WORD} below.
        </Text>
        <TextInput
          style={input}
          value={deleteText}
          onChangeText={setDeleteText}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          placeholder={DELETE_CONFIRM_WORD}
          placeholderTextColor={p.muted}
          accessibilityLabel={`Type ${DELETE_CONFIRM_WORD} to confirm`}
        />
        <Pressable
          disabled={!deleteConfirmed(deleteText) || busy === 'account'}
          onPress={() => void run('account', () => acct.deleteAccount(), 'Your account was deleted.')}
          accessibilityRole="button"
          aria-disabled={!deleteConfirmed(deleteText)}
          style={[styles.danger, { backgroundColor: p.up, opacity: deleteConfirmed(deleteText) ? 1 : 0.4 }]}
        >
          <Text style={[styles.dangerText, { color: '#FFFFFF' }]}>{busy === 'account' ? 'Deleting…' : 'Delete my account'}</Text>
        </Pressable>
        {message('account')}
      </View>
      {message('session')}
    </Shell>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.serif, fontSize: 34, lineHeight: 37, letterSpacing: -0.5 },
  card: { borderWidth: 1, borderRadius: 24, padding: 20, gap: 10 },
  form: { gap: 8 },
  label: { fontFamily: fonts.sansMedium, fontSize: 13 },
  value: { fontFamily: fonts.sansSemi, fontSize: 17 },
  h2: { fontFamily: fonts.serif, fontSize: 24 },
  help: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  outline: { minHeight: 48, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  outlineText: { fontFamily: fonts.sansSemi, fontSize: 16 },
  danger: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dangerText: { fontFamily: fonts.sansSemi, fontSize: 16 },
});
