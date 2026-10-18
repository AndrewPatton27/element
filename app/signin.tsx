// Sign in / create account / forgot password, with email and password. After the
// first sign-in the topic picker opens; otherwise back to the feed.

import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { isOnboardingSkipped, useAccount } from '../lib/accountContext';
import { needsOnboarding } from '../lib/accountLogic';
import { RESET_SENT_MESSAGE, validateCredentials, validateEmail } from '../lib/session';
import { usePalette } from '../lib/useTheme';
import { userMessage } from '../lib/errors';
import { fonts } from '../lib/theme';
import { PasswordField, fieldStyles } from '../components/PasswordField';
import { Shell } from '../components/Shell';
import { Button } from '../components/States';

type Mode = 'signin' | 'signup' | 'forgot';

// Where the emailed reset link should land: this site's /reset-password page.
function resetRedirectUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.origin}/reset-password`;
  return Linking.createURL('/reset-password');
}

const TITLES: Record<Mode, string> = { signin: 'Sign in', signup: 'Create your account', forgot: 'Reset your password' };

export default function SignInScreen() {
  const p = usePalette();
  const acct = useAccount();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [hideSignal, setHideSignal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null); // sample mode: offer the test link

  // Already signed in (back button, bookmark): show the account instead of the form.
  // Only for arriving signed in: after our own sign-in, submit() decides where to go.
  const arrivedSignedIn = useRef(acct.user !== null);
  useEffect(() => {
    if (arrivedSignedIn.current && acct.user) router.replace('/account' as never);
  }, [acct.user]);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setInfo(null);
    setSentTo(null);
    setPassword('');
  }

  async function submit() {
    if (busy) return;
    setError(null);
    setInfo(null);
    if (mode === 'forgot') {
      const problem = validateEmail(email);
      if (problem) return setError(problem);
      setBusy(true);
      try {
        await acct.requestPasswordReset(email, resetRedirectUrl());
        setInfo(RESET_SENT_MESSAGE);
        setSentTo(email.trim());
      } catch (e) {
        setError(userMessage(e, 'Could not send the reset link.'));
      } finally {
        setBusy(false);
      }
      return;
    }
    const problem = validateCredentials(email, password);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      if (mode === 'signup') {
        const r = await acct.signUp(email, password);
        if (r.status === 'confirm_email') {
          setInfo('Check your inbox to confirm your email, then sign in here.');
          setMode('signin');
          return;
        }
      } else {
        await acct.signIn(email, password);
      }
      acct.clearNotice();
      const prefs = await acct.refreshPrefs();
      if (needsOnboarding(true, prefs, isOnboardingSkipped(acct.account.currentUser()?.id))) router.replace('/onboarding' as never);
      else router.dismissTo('/');
    } catch (e) {
      setError(userMessage(e, 'Sign-in failed.'));
    } finally {
      // Never keep the password around (or on screen) after a submit.
      setPassword('');
      setHideSignal((n) => n + 1);
      setBusy(false);
    }
  }

  const label = busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link';

  return (
    <Shell active="account" scroll>
      <Text style={[styles.title, { color: p.ink }]} accessibilityRole="header">
        {TITLES[mode]}
      </Text>
      {acct.notice && mode === 'signin' ? (
        <Text style={[styles.note, { backgroundColor: p.dataSoft, color: p.dataInk }]} accessibilityRole="alert">
          {acct.notice}
        </Text>
      ) : null}
      <Text style={[styles.sub, { color: p.muted }]}>
        {mode === 'forgot'
          ? 'Enter the email you signed up with. We’ll send a link to choose a new password.'
          : 'An account gives you a “For you” feed built from the topics you pick and the cards you like. Reading the feed never needs one.'}
      </Text>
      {acct.account.sample ? (
        <Text style={[styles.note, { backgroundColor: p.dataSoft, color: p.dataInk }]}>
          {mode === 'forgot'
            ? 'Sample mode: no email is sent. After you press the button, a test reset link appears here.'
            : 'Sample mode: any email and an 8+ character password work. Nothing leaves this device.'}
        </Text>
      ) : null}
      <View style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }]}>
        <Text style={[fieldStyles.label, { color: p.inkSoft }]}>Email</Text>
        <TextInput
          style={[fieldStyles.input, styles.gap, { borderColor: p.borderStrong, backgroundColor: p.surface, color: p.ink }]}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          inputMode="email"
          keyboardType="email-address"
          placeholder="you@example.com"
          placeholderTextColor={p.muted}
          accessibilityLabel="Email"
          onSubmitEditing={mode === 'forgot' ? submit : undefined}
        />
        {mode !== 'forgot' ? (
          <PasswordField
            label="Password"
            value={password}
            onChangeText={setPassword}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            placeholder="At least 8 characters"
            onSubmitEditing={submit}
            hideSignal={hideSignal}
          />
        ) : null}
        {mode === 'signin' ? (
          <Pressable onPress={() => switchMode('forgot')} accessibilityRole="button" style={styles.forgot} hitSlop={6}>
            <Text style={[styles.forgotText, { color: p.accentInk }]}>Forgot password?</Text>
          </Pressable>
        ) : null}
        {error ? (
          <Text style={[styles.message, { color: p.up }]} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        {info ? (
          <Text style={[styles.message, { color: p.accentInk }]} accessibilityLiveRegion="polite">
            {info}
          </Text>
        ) : null}
        {acct.account.sample && sentTo && Platform.OS === 'web' ? (
          <Pressable
            onPress={() => window.location.assign(`/reset-password#access_token=${encodeURIComponent(`mock-recovery:${sentTo}`)}&type=recovery`)}
            accessibilityRole="link"
          >
            <Text style={[styles.forgotText, { color: p.accentInk }]}>Open the test reset link</Text>
          </Pressable>
        ) : null}
        <Button label={label} onPress={submit} />
        {mode === 'forgot' ? (
          <Pressable onPress={() => switchMode('signin')} accessibilityRole="button" style={styles.switch}>
            <Text style={[styles.switchText, { color: p.accentInk }]}>Back to sign in</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => switchMode(mode === 'signin' ? 'signup' : 'signin')} accessibilityRole="button" style={styles.switch}>
            <Text style={[styles.switchText, { color: p.accentInk }]}>
              {mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}
            </Text>
          </Pressable>
        )}
      </View>
      <Text style={[styles.note2, { color: p.muted }]}>
        Your password goes straight to our sign-in service (Supabase Auth), which stores only a one-way hash of it, never the password itself. We
        store your email, the topics you pick and what you like, view or open, only to tailor your feed. You can delete that data, or your whole
        account, on the Account screen.
      </Text>
    </Shell>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.serif, fontSize: 34, lineHeight: 37, letterSpacing: -0.5 },
  sub: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 21 },
  note: { fontFamily: fonts.sansMedium, fontSize: 13, lineHeight: 18, padding: 12, borderRadius: 12, overflow: 'hidden' },
  card: { borderWidth: 1, borderRadius: 24, padding: 24, gap: 10 },
  gap: { marginBottom: 4 },
  forgot: { alignSelf: 'flex-end', paddingVertical: 2 },
  forgotText: { fontFamily: fonts.sansSemi, fontSize: 14 },
  message: { fontFamily: fonts.sansMedium, fontSize: 14, lineHeight: 20 },
  switch: { alignSelf: 'center', paddingVertical: 10 },
  switchText: { fontFamily: fonts.sansSemi, fontSize: 15 },
  note2: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
});
