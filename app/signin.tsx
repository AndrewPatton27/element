// Sign in / create account with email and password. After the first sign-in the
// topic picker opens; otherwise back to the feed.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useAccount } from '../lib/accountContext';
import { needsOnboarding } from '../lib/accountLogic';
import { passwordToggleLabel, validateCredentials } from '../lib/session';
import { usePalette } from '../lib/useTheme';
import { fonts } from '../lib/theme';
import { Shell } from '../components/Shell';
import { Button } from '../components/States';
import { EyeIcon, EyeOffIcon } from '../components/Icons';

type Mode = 'signin' | 'signup';

export default function SignInScreen() {
  const p = usePalette();
  const acct = useAccount();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit() {
    const problem = validateCredentials(email, password);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
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
      const prefs = await acct.refreshPrefs();
      router.replace(needsOnboarding(true, prefs, false) ? ('/onboarding' as never) : '/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
      setShowPassword(false); // never leave the password on screen after submitting
    }
  }

  const input = [styles.input, { borderColor: p.borderStrong, backgroundColor: p.surface, color: p.ink }];

  return (
    <Shell active="account" scroll>
      <Text style={[styles.title, { color: p.ink }]} accessibilityRole="header">
        {mode === 'signin' ? 'Sign in' : 'Create your account'}
      </Text>
      <Text style={[styles.sub, { color: p.muted }]}>
        An account gives you a “For you” feed built from the topics you pick and the cards you like. Reading the feed never needs one.
      </Text>
      {acct.account.sample ? (
        <Text style={[styles.note, { backgroundColor: p.dataSoft, color: p.dataInk }]}>
          Sample mode: any email and an 8+ character password work. Nothing leaves this device.
        </Text>
      ) : null}
      <View style={[styles.card, { backgroundColor: p.surface, borderColor: p.border }]}>
        <Text style={[styles.label, { color: p.inkSoft }]}>Email</Text>
        <TextInput
          style={input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          inputMode="email"
          keyboardType="email-address"
          placeholder="you@example.com"
          placeholderTextColor={p.muted}
          accessibilityLabel="Email"
        />
        <Text style={[styles.label, { color: p.inkSoft }]}>Password</Text>
        <View style={styles.passwordWrap}>
          <TextInput
            style={[input, styles.passwordInput]}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            placeholder="At least 8 characters"
            placeholderTextColor={p.muted}
            accessibilityLabel="Password"
            onSubmitEditing={submit}
          />
          <Pressable
            onPress={() => setShowPassword((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={passwordToggleLabel(showPassword)}
            accessibilityState={{ checked: showPassword }}
            hitSlop={4}
            style={({ pressed }) => [styles.eye, { opacity: pressed ? 0.6 : 1 }]}
          >
            {showPassword ? <EyeOffIcon color={p.inkSoft} /> : <EyeIcon color={p.inkSoft} />}
          </Pressable>
        </View>
        {error ? (
          <Text style={[styles.error, { color: p.up }]} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        {info ? (
          <Text style={[styles.error, { color: p.accentInk }]} accessibilityLiveRegion="polite">
            {info}
          </Text>
        ) : null}
        <Button label={busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'} onPress={busy ? () => undefined : submit} />
        <Pressable
          onPress={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setError(null);
          }}
          accessibilityRole="button"
          style={styles.switch}
        >
          <Text style={[styles.switchText, { color: p.accentInk }]}>
            {mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}
          </Text>
        </Pressable>
      </View>
      <Text style={[styles.note2, { color: p.muted }]}>
        We store your email, the topics you pick and what you like, view or open, only to tailor your feed. You can delete that data any time on the
        Account screen.
      </Text>
    </Shell>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.serif, fontSize: 34, lineHeight: 37, letterSpacing: -0.5 },
  sub: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 21 },
  note: { fontFamily: fonts.sansMedium, fontSize: 13, lineHeight: 18, padding: 12, borderRadius: 12, overflow: 'hidden' },
  card: { borderWidth: 1, borderRadius: 24, padding: 24, gap: 10 },
  label: { fontFamily: fonts.sansSemi, fontSize: 14 },
  passwordWrap: { position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: 52 },
  eye: { position: 'absolute', right: 2, top: 2, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  input: { fontFamily: fonts.sans, fontSize: 16, minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, marginBottom: 6 },
  error: { fontFamily: fonts.sansMedium, fontSize: 14, lineHeight: 20 },
  switch: { alignSelf: 'center', paddingVertical: 10 },
  switchText: { fontFamily: fonts.sansSemi, fontSize: 15 },
  note2: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
});
