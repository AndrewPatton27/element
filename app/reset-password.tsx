// The page the password-reset email links to. The link carries a short-lived
// recovery token in the URL fragment (#access_token=...&type=recovery). The user
// picks a new password; on success they are signed in and sent to the feed.

import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { useAccount } from '../lib/accountContext';
import { parseRecoveryLink, validateNewPassword, type RecoveryLink } from '../lib/session';
import { usePalette } from '../lib/useTheme';
import { fonts } from '../lib/theme';
import { PasswordField } from '../components/PasswordField';
import { Shell } from '../components/Shell';
import { Button, LoadingState } from '../components/States';

let consumed: RecoveryLink | null = null; // the web link, read once per page load

function readLink(url: string | null): RecoveryLink | null {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (consumed) return consumed;
    consumed = parseRecoveryLink(window.location.hash, window.location.search);
    // Take the token out of the address bar (and browser history) once read.
    if (window.location.hash || window.location.search) window.history.replaceState(null, '', window.location.pathname);
    return consumed;
  }
  if (!url) return null;
  const hashAt = url.indexOf('#');
  const queryAt = url.indexOf('?');
  return parseRecoveryLink(hashAt >= 0 ? url.slice(hashAt) : '', queryAt >= 0 ? url.slice(queryAt, hashAt >= 0 ? hashAt : undefined) : '');
}

export default function ResetPasswordScreen() {
  const p = usePalette();
  const acct = useAccount();
  const url = Linking.useURL();
  const [link, setLink] = useState<RecoveryLink | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [hideSignal, setHideSignal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!link) setLink(readLink(url));
  }, [url, link]);

  async function submit() {
    if (busy || !link || !link.ok) return;
    const problem = validateNewPassword(password, confirm);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await acct.completePasswordRecovery(link, password);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not set the new password.');
    } finally {
      setPassword('');
      setConfirm('');
      setHideSignal((n) => n + 1);
      setBusy(false);
    }
  }

  let body;
  if (!link) body = <LoadingState />;
  else if (!link.ok) {
    body = (
      <View style={styles.block}>
        <Text style={[styles.message, { color: p.up }]} accessibilityRole="alert">
          {link.error}
        </Text>
        <Button label="Go to sign in" onPress={() => router.replace('/signin' as never)} />
      </View>
    );
  } else if (done) {
    body = (
      <View style={styles.block}>
        <Text style={[styles.message, { color: p.accentInk }]} accessibilityLiveRegion="polite">
          {acct.user ? 'Your password was changed and you are signed in.' : 'Your password was changed. Sign in with the new password.'}
        </Text>
        <Button label={acct.user ? 'Go to my feed' : 'Go to sign in'} onPress={() => router.replace((acct.user ? '/' : '/signin') as never)} />
      </View>
    );
  } else {
    body = (
      <View style={styles.block}>
        <PasswordField
          label="New password"
          value={password}
          onChangeText={setPassword}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          hideSignal={hideSignal}
        />
        <PasswordField
          label="Confirm new password"
          value={confirm}
          onChangeText={setConfirm}
          autoComplete="new-password"
          onSubmitEditing={submit}
          hideSignal={hideSignal}
        />
        {error ? (
          <Text style={[styles.message, { color: p.up }]} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <Button label={busy ? 'Saving…' : 'Set new password'} onPress={submit} />
      </View>
    );
  }

  return (
    <Shell active="account" scroll>
      <Text style={[styles.title, { color: p.ink }]} accessibilityRole="header">
        Choose a new password
      </Text>
      <View style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }]}>{body}</View>
      {link && link.ok && !done ? (
        <Pressable onPress={() => router.replace('/signin' as never)} accessibilityRole="link" style={styles.back}>
          <Text style={[styles.backText, { color: p.accentInk }]}>Back to sign in</Text>
        </Pressable>
      ) : null}
    </Shell>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.serif, fontSize: 34, lineHeight: 37, letterSpacing: -0.5 },
  card: { borderWidth: 1, borderRadius: 24, padding: 24 },
  block: { gap: 12 },
  message: { fontFamily: fonts.sansMedium, fontSize: 15, lineHeight: 21 },
  back: { alignSelf: 'center', paddingVertical: 10 },
  backText: { fontFamily: fonts.sansSemi, fontSize: 15 },
});
