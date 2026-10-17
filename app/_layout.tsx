// Root layout: loads the fonts, picks the API (sample fixtures or Supabase),
// shows a full-screen error if the build is misconfigured, and provides shared
// data to every screen. Feed, Numbers and About are peers (tab-like), not modals.

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
// Per-weight imports so the web build ships only these 4 font files, not all 22.
import { Newsreader_600SemiBold } from '@expo-google-fonts/newsreader/600SemiBold';
import { InstrumentSans_400Regular } from '@expo-google-fonts/instrument-sans/400Regular';
import { InstrumentSans_500Medium } from '@expo-google-fonts/instrument-sans/500Medium';
import { InstrumentSans_600SemiBold } from '@expo-google-fonts/instrument-sans/600SemiBold';
import { getApi } from '../lib/api';
import { AppDataProvider } from '../lib/appData';
import { AccountProvider } from '../lib/accountContext';
import { light, paletteFor } from '../lib/theme';
import { ConfigErrorScreen } from '../components/States';

export default function RootLayout() {
  const scheme = useColorScheme();
  const p = paletteFor(scheme);
  const result = getApi();
  // If a font fails to load the app still renders with the system font.
  const [fontsLoaded, fontError] = useFonts({
    Newsreader_600SemiBold,
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
  });

  if (!fontsLoaded && !fontError) return <View style={{ flex: 1, backgroundColor: p.bg }} />;

  return (
    <SafeAreaProvider>
      <StatusBar style={p === light ? 'dark' : 'light'} />
      {result.ok ? (
        <AppDataProvider api={result.api}>
          <AccountProvider account={result.account}>
            <Stack screenOptions={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: p.bg } }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="numbers" />
              <Stack.Screen name="about" />
              <Stack.Screen name="account" />
              <Stack.Screen name="signin" />
              <Stack.Screen name="onboarding" />
              <Stack.Screen name="reset-password" />
            </Stack>
          </AccountProvider>
        </AppDataProvider>
      ) : (
        <ConfigErrorScreen error={result.error} />
      )}
    </SafeAreaProvider>
  );
}
