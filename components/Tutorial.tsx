// The first-run tour: 4 steps (designs docs/design/mobile/Mobile-Tutorial*.dc.html and
// docs/design/web/Web-Tutorial*.dc.html; copy in lib/tutorialSteps.ts, logic in
// lib/tutorialLogic.ts). Used two ways:
// - as an overlay from app/_layout.tsx on the first visit (TutorialGate below);
// - as the /tutorial route (app/tutorial.tsx), replayable from Me / About.
//
// Controls: Skip tutorial (top right), Back, Next ("Swipe up to continue" on phones,
// "Press ↓ or scroll to continue" on wide web), and on the last step Start reading /
// Create a free account. Phones: swipe up = next, swipe down = back. Web: ↓/→/PageDown
// next, ↑/←/PageUp back, Esc skips; the wheel moves a step when the step fits on screen.
// The tour's key handler runs first (capture) and stops the feed behind it from moving.
// With reduced motion the practice card, ticker and hint arrow stay still.

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, usePathname } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { APP_NAME } from '../lib/config';
import { DISCLAIMER_FALLBACK } from '../lib/labels';
import { defaultStore } from '../lib/storage';
import { fonts } from '../lib/theme';
import {
  backStep,
  hasSeenTutorial,
  isLastStep,
  keyToAction,
  markTutorialSeen,
  nextStep,
  progressLabel,
  shouldAutoShow,
} from '../lib/tutorialLogic';
import { PRACTICE_FOOTER, TUTORIAL_FOOTNOTE, getTutorialSteps } from '../lib/tutorialSteps';
import { usePalette, useWide } from '../lib/useTheme';
import { ChevronLeftIcon, ChevronUpIcon } from './Icons';
import { BriefFollowingPanel, FeedTopPanel, Legend, PracticeCard, Recap, Tiles } from './TutorialParts';

export type TutorialExit = 'skip' | 'done' | 'signup';

const NATIVE = Platform.OS !== 'web';

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') return;
      const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
      if (!mq) return;
      setReduced(mq.matches);
      const on = () => setReduced(mq.matches);
      mq.addEventListener?.('change', on);
      return () => mq.removeEventListener?.('change', on);
    }
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduced(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

// A looping 0→1 value; stays at 0 with reduced motion.
function useLoop(ms: number, reduced: boolean, easing = Easing.inOut(Easing.ease)): Animated.Value {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    v.setValue(0);
    if (reduced) return;
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: ms, easing, useNativeDriver: NATIVE }));
    loop.start();
    return () => loop.stop();
  }, [v, ms, reduced, easing]);
  return v;
}

export function Tutorial({ onExit }: { onExit: (how: TutorialExit) => void }) {
  const p = usePalette();
  const web = useWide();
  const steps = useMemo(() => getTutorialSteps(web ? 'web' : 'mobile'), [web]);
  const count = steps.length;
  const [step, setStep] = useState(0);
  const stepRef = useRef(0);
  stepRef.current = step;
  const s = steps[step];
  const last = isLastStep(step, count);
  const reduced = useReducedMotion();

  const go = useCallback((to: number) => setStep(to), []);
  const next = useCallback(() => go(nextStep(stepRef.current, count)), [go, count]);
  const back = useCallback(() => go(backStep(stepRef.current, count)), [go, count]);

  // Scroll to the top and announce the new step.
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
    AccessibilityInfo.announceForAccessibility?.(`${progressLabel(step, count)}. ${steps[step]?.title ?? ''}`);
  }, [step, count, steps]);

  // Keyboard (web). Capture phase + stopImmediatePropagation keeps the feed still.
  const exitRef = useRef(onExit);
  exitRef.current = onExit;
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const action = keyToAction(e.key, stepRef.current, count);
      // Swallow the feed's own keys while the tour is open, even when they do nothing here.
      if (action || ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'j', 'k'].includes(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      if (action === 'next') next();
      else if (action === 'back') back();
      else if (action === 'skip') exitRef.current('skip');
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [count, next, back]);

  // Wheel / trackpad (web): one step per gesture, only when the step fits on screen.
  const fits = useRef(true);
  const viewH = useRef(0);
  const contentH = useRef(0);
  const updateFits = () => (fits.current = contentH.current <= viewH.current + 2);
  const lastWheel = useRef(0);
  const rootRef = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    const el = rootRef.current as unknown as HTMLElement | null;
    if (Platform.OS !== 'web' || !el || typeof el.addEventListener !== 'function') return;
    const onWheel = (e: WheelEvent) => {
      if (!fits.current || Math.abs(e.deltaY) < 30) return;
      const now = Date.now();
      if (now - lastWheel.current < 700) return;
      lastWheel.current = now;
      if (e.deltaY > 0 && !isLastStep(stepRef.current, count)) next();
      else if (e.deltaY < 0) back();
    };
    el.addEventListener('wheel', onWheel, { passive: true });
    return () => el.removeEventListener('wheel', onWheel);
  }, [count, next, back]);

  // Swipe up / down (phones).
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => !web && Math.abs(g.dy) > 24 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5 && fits.current,
        onPanResponderRelease: (_e, g) => {
          if (g.dy < -50 && !isLastStep(stepRef.current, count)) next();
          else if (g.dy > 50) back();
        },
      }),
    [web, count, next, back],
  );

  // Motion: the card sways left (dislike) then right (like) over 6 s; the hint bounces.
  const sway = useLoop(6000, reduced, Easing.linear);
  const bounce = useLoop(1600, reduced);
  const marquee = useLoop(16000, reduced, Easing.linear);
  const swayX = sway.interpolate({ inputRange: [0, 0.1, 0.22, 0.34, 0.6, 0.72, 0.84, 1], outputRange: [0, -14, -14, 0, 14, 14, 0, 0] });
  const dislikeOp = reduced ? 1 : sway.interpolate({ inputRange: [0, 0.1, 0.22, 0.34, 1], outputRange: [0.3, 1, 1, 0.3, 0.3] });
  const likeOp = reduced ? 1 : sway.interpolate({ inputRange: [0, 0.4, 0.6, 0.72, 0.84, 1], outputRange: [0.3, 0.3, 1, 1, 0.3, 0.3] });
  const bounceY = bounce.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, web ? 9 : -9, 0] });
  const marqueeX = marquee.interpolate({ inputRange: [0, 1], outputRange: [0, -420] });

  const progress = progressLabel(step, count);
  const H = web ? styles.h1Web : styles.h1;

  return (
    <View
      ref={rootRef}
      role="dialog"
      aria-modal
      aria-label={`${APP_NAME} quick tour`}
      style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: p.bg }]}
      {...pan.panHandlers}
    >
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <View style={[styles.header, web && styles.headerWeb, { borderBottomColor: web ? p.border : 'transparent', backgroundColor: web ? p.surface : p.bg }]}>
          <Text style={[styles.wordmark, web && styles.wordmarkWeb, { color: p.accent }]} aria-hidden={false}>
            {APP_NAME}
          </Text>
          <Pressable
            onPress={() => onExit('skip')}
            accessibilityRole="button"
            accessibilityLabel="Skip tutorial"
            accessibilityHint="Closes the tour. You can replay it in Me."
            style={({ pressed }) => [styles.skip, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.skipText, { color: p.inkSoft }]}>Skip tutorial</Text>
          </Pressable>
        </View>

        <ScrollView
          ref={scroll}
          style={styles.fill}
          contentContainerStyle={[styles.body, web && styles.bodyWeb]}
          onLayout={(e) => {
            viewH.current = e.nativeEvent.layout.height;
            updateFits();
          }}
          onContentSizeChange={(_w, h) => {
            contentH.current = h;
            updateFits();
          }}
        >
          <View style={styles.progressRow}>
            <Text accessibilityLiveRegion="polite" style={[styles.progress, web && { fontSize: 14 }, { color: p.accentInk }]}>
              {progress}
            </Text>
            <View style={styles.dots} aria-hidden importantForAccessibility="no-hide-descendants">
              {steps.map((st, i) => (
                <View
                  key={st.id}
                  style={[styles.dot, i === step && { width: web ? 28 : 24 }, { backgroundColor: i === step ? p.accent : p.borderStrong }]}
                />
              ))}
            </View>
          </View>

          {s.id === 'card' ? (
            <>
              <PracticeCard
                p={p}
                web={web}
                title={s.title}
                lead={s.lead}
                caption={s.exampleCaption}
                sway={reduced ? 0 : swayX}
                likeOpacity={likeOp}
                dislikeOpacity={dislikeOp}
              />
              <Legend p={p} items={s.legend} web={web} />
              {s.tiles ? <Tiles p={p} tiles={s.tiles} web={web} /> : null}
            </>
          ) : null}

          {s.id === 'top' || s.id === 'brief' ? (
            <>
              <Text role="heading" aria-level={1} style={[H, { color: p.ink }]}>
                {s.title}
              </Text>
              {s.id === 'top' ? (
                <FeedTopPanel p={p} web={web} caption={s.exampleCaption} note={s.practiceNote} marquee={reduced ? 0 : (marqueeX as unknown as Animated.Value)} />
              ) : (
                <BriefFollowingPanel p={p} web={web} caption={s.exampleCaption} note={s.practiceNote} />
              )}
              <Legend p={p} items={s.legend} web={web} />
            </>
          ) : null}

          {s.id === 'recap' ? (
            <>
              <View style={styles.recapHead}>
                <Text role="heading" aria-level={1} style={[web ? styles.h1RecapWeb : styles.h1Recap, { color: p.ink }]}>
                  {s.title}
                </Text>
                {s.lead ? <Text style={[web ? styles.leadWeb : styles.lead, { color: p.inkSoft }]}>{s.lead}</Text> : null}
              </View>
              {s.recap ? <Recap p={p} rows={s.recap} web={web} /> : null}
              <View style={styles.ctas}>
                <Pressable
                  onPress={() => onExit('done')}
                  accessibilityRole="button"
                  accessibilityLabel="Start reading"
                  style={({ pressed }) => [styles.primary, web && { minHeight: 60 }, { backgroundColor: p.accent, opacity: pressed ? 0.85 : 1 }]}
                >
                  <Text style={[styles.primaryText, { color: p.onAccent }]}>Start reading</Text>
                </Pressable>
                <Pressable
                  onPress={() => onExit('signup')}
                  accessibilityRole="button"
                  accessibilityLabel="Create a free account"
                  style={({ pressed }) => [styles.secondary, { borderColor: p.borderStrong, backgroundColor: p.surface, opacity: pressed ? 0.85 : 1 }]}
                >
                  <Text style={[styles.secondaryText, { color: p.ink }]}>Create a free account</Text>
                </Pressable>
                <Text style={[styles.footnote, { color: p.muted }]}>{TUTORIAL_FOOTNOTE}</Text>
              </View>
            </>
          ) : null}

          <View style={styles.nav}>
            {step > 0 ? (
              <Pressable
                onPress={back}
                accessibilityRole="button"
                accessibilityLabel="Back, previous step"
                style={({ pressed }) => [styles.back, { opacity: pressed ? 0.6 : 1 }]}
              >
                <ChevronLeftIcon color={p.inkSoft} size={20} />
                <Text style={[styles.backText, { color: p.inkSoft }]}>Back</Text>
              </Pressable>
            ) : (
              <View style={styles.back} />
            )}
            {!last && s.continueHint ? (
              <Pressable
                onPress={next}
                accessibilityRole="button"
                accessibilityLabel={`Next step. ${s.continueHint}`}
                style={({ pressed }) => [styles.continue, { opacity: pressed ? 0.7 : 1 }]}
              >
                {web ? <Text style={[styles.continueText, { color: p.accent }]}>{s.continueHint}</Text> : null}
                <Animated.View style={{ transform: [{ translateY: reduced ? 0 : bounceY }, { rotate: web ? '180deg' : '0deg' }] }}>
                  <ChevronUpIcon color={p.accent} size={30} strokeWidth={2.4} />
                </Animated.View>
                {!web ? <Text style={[styles.continueText, { color: p.accent }]}>{s.continueHint}</Text> : null}
              </Pressable>
            ) : null}
            <View style={styles.back} />
          </View>

          {/* The disclaimer, once per step. */}
          <Text style={[styles.footer, { color: p.muted }]}>
            {last ? DISCLAIMER_FALLBACK : `${PRACTICE_FOOTER} · ${DISCLAIMER_FALLBACK}`}
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// First-run overlay, rendered by app/_layout.tsx over every screen. Shows once per
// device (versioned key in lib/tutorialLogic.ts), signed in or not.
export function TutorialGate() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const checked = useRef(false);
  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    if (shouldAutoShow(hasSeenTutorial(defaultStore()), pathname)) setOpen(true);
  }, [pathname]);
  if (!open) return null;
  return (
    <Tutorial
      onExit={(how) => {
        markTutorialSeen(defaultStore());
        setOpen(false);
        if (how === 'signup') router.push('/signin?mode=signup' as never);
      }}
    />
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 1000 },
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 52, paddingLeft: 20, paddingRight: 8 },
  headerWeb: { height: 64, paddingHorizontal: 32, borderBottomWidth: 1 },
  wordmark: { fontFamily: fonts.serif, fontSize: 22, letterSpacing: -0.2 },
  wordmarkWeb: { fontSize: 26 },
  skip: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  skipText: { fontFamily: fonts.sansSemi, fontSize: 15 },
  body: { paddingHorizontal: 16, paddingBottom: 10, gap: 12, flexGrow: 1 },
  bodyWeb: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 32, paddingTop: 28, paddingBottom: 40, gap: 20 },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingBottom: 4 },
  progress: { fontFamily: fonts.sansSemi, fontSize: 13 },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  h1: { fontFamily: fonts.serif, fontSize: 28, lineHeight: 31, letterSpacing: -0.5, marginHorizontal: 4 },
  h1Web: { fontFamily: fonts.serif, fontSize: 40, lineHeight: 43, letterSpacing: -0.8 },
  h1Recap: { fontFamily: fonts.serif, fontSize: 34, lineHeight: 36, letterSpacing: -0.6 },
  h1RecapWeb: { fontFamily: fonts.serif, fontSize: 48, lineHeight: 50, letterSpacing: -0.9 },
  recapHead: { gap: 8, marginHorizontal: 4 },
  lead: { fontFamily: fonts.sans, fontSize: 16, lineHeight: 24 },
  leadWeb: { fontFamily: fonts.sans, fontSize: 18, lineHeight: 27 },
  ctas: { gap: 10, marginTop: 'auto' },
  primary: { minHeight: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: fonts.sansSemi, fontSize: 17 },
  secondary: { minHeight: 52, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: fonts.sansSemi, fontSize: 16 },
  footnote: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' },
  back: { width: 88, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2 },
  backText: { fontFamily: fonts.sansSemi, fontSize: 15 },
  continue: { flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center' },
  continueText: { fontFamily: fonts.sansSemi, fontSize: 16 },
  footer: { fontFamily: fonts.sans, fontSize: 12, textAlign: 'center', paddingHorizontal: 4 },
});
