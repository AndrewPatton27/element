// Copy for the 4-step first-run tour (designs docs/design/mobile/Mobile-Tutorial*.dc.html
// and docs/design/web/Web-Tutorial*.dc.html). Pure data, rendered by components/Tutorial.tsx.
// Two variants: 'mobile' (touch: swipe, tap) and 'web' (wide desktop: keys, click).
//
// Design copy is kept where it is true of the app; where it was not, it is changed
// as little as possible (tested in lib/__tests__/tutorialLogic.test.ts):
// - cards have no Follow button: legend 3 explains the AI label instead, and the
//   recap says you follow topics, companies and sources (that is what Following does);
// - web feed keys are ↓/j next and ↑/k back; like/dislike is the thumbs buttons
//   (the design's ← / → like/dislike keys do not exist);
// - tapping a number on the strip opens its official source (not the weekly brief);
// - there is no 7 AM push yet, so that sentence is dropped;
// - Search was not in the design: one recap line added.

import { AI_NOTICE_FALLBACK } from './labels.ts';

export type TutorialVariant = 'mobile' | 'web';
export type RecapIcon = 'next' | 'swipe' | 'source' | 'follow' | 'search';

export interface LegendItem {
  label: string; // bold lead-in, e.g. "The summary."
  text: string;
}

export interface KeyTile {
  key: string; // key cap glyph, or 'thumbs-up' / 'thumbs-down' (drawn as icons)
  title: string;
  hint: string;
  tone: 'warn' | 'accent' | 'next';
}

export interface RecapRow {
  icon: RecapIcon;
  bold: string;
  text: string;
}

export interface TutorialStep {
  id: 'card' | 'top' | 'brief' | 'recap';
  title: string;
  lead?: string;
  exampleCaption?: string; // right side of the "Example" badge
  legend: LegendItem[];
  tiles?: KeyTile[];
  recap?: RecapRow[];
  continueHint?: string; // "Swipe up to continue" / "Press ↓ or scroll to continue"
  practiceNote?: string; // under the example; the disclaimer is shown once, in the footer
}

export const TUTORIAL_AI_LABEL = AI_NOTICE_FALLBACK;
export const PRACTICE_FOOTER = 'Practice card, not real news';

// Sample values from the design; shown only inside the tour, captioned "sample numbers".
export const SAMPLE_TICKER = [
  { label: '10-YR', value: '5.10%', change: '▼ 0.09', tone: 'down' as const },
  { label: 'FED FUNDS', value: '3.88%', change: '▪ flat', tone: 'flat' as const },
  { label: 'CPI', value: '3.1%', change: '▼ 0.2', tone: 'down' as const },
  { label: 'JOBLESS', value: '4.2%', change: '▪ flat', tone: 'flat' as const },
  { label: 'WTI', value: '$71.40', change: '▲ 0.90', tone: 'up' as const },
];
export const SAMPLE_CATEGORIES = ['All', 'World', 'Government', 'Economy'];

export function getTutorialSteps(variant: TutorialVariant): TutorialStep[] {
  const web = variant === 'web';
  const tap = web ? 'Click' : 'Tap';
  const cont = web ? 'Press ↓ or scroll to continue' : 'Swipe up to continue';
  return [
    {
      id: 'card',
      title: 'Welcome to Element: the news in a few sentences',
      lead: 'Every card is one story, short enough to read in seconds.',
      exampleCaption: 'Practice story',
      legend: [
        { label: 'The summary.', text: 'Short, plain, for busy people.' },
        { label: 'The source.', text: `${tap} it to see where it came from.` },
        { label: 'The label.', text: 'A computer wrote the summary, so check the source.' },
      ],
      tiles: web
        ? [
            { key: 'thumbs-down', title: 'Dislike', hint: 'click the thumbs-down', tone: 'warn' },
            { key: 'thumbs-up', title: 'Like', hint: 'click the thumbs-up', tone: 'accent' },
            { key: '↓', title: 'Next card', hint: 'or j, or scroll down', tone: 'next' },
          ]
        : [
            { key: '←', title: 'Swipe left', hint: 'Dislike', tone: 'warn' },
            { key: '→', title: 'Swipe right', hint: 'Like', tone: 'accent' },
          ],
      continueHint: cont,
    },
    {
      id: 'top',
      title: 'See the big picture, then pick your topics',
      exampleCaption: 'The top of your feed',
      legend: [
        {
          label: 'Numbers to know.',
          text:
            `The strip keeps key numbers moving past, like interest rates, inflation and jobs. ${tap} a number to open its official source.` +
            (web ? ' Example: “10-YR 5.10% ▼ 0.09” means that rate is 5.10% and fell 0.09 points.' : ''),
        },
        web
          ? { label: 'Categories.', text: 'Pick one on the left to see only that topic. Pick All to see everything.' }
          : { label: 'Categories.', text: 'Tap a chip to see only that topic. Tap All to see everything.' },
      ],
      continueHint: cont,
      practiceNote: 'Practice view, sample numbers',
    },
    {
      id: 'brief',
      title: 'Catch up each morning, then follow what matters',
      exampleCaption: web ? 'Two pages in the top bar' : 'Two tabs to try',
      legend: [
        { label: 'Brief.', text: 'The stories that matter, with a short AI summary.' },
        { label: 'Following.', text: 'Follow topics, companies or sources. Their newest stories collect here.' },
      ],
      continueHint: cont,
      practiceNote: 'Practice examples, not real news',
    },
    {
      id: 'recap',
      title: 'You’re all set',
      lead: 'That’s everything you need. Here’s a quick recap.',
      legend: [],
      recap: [
        web
          ? { icon: 'next', bold: 'Press ↓ or j', text: ' for the next story' }
          : { icon: 'next', bold: 'Swipe up', text: ' for the next story' },
        web
          ? { icon: 'swipe', bold: 'Click the thumbs-down or thumbs-up.', text: ' It tunes your For you feed, no account needed.' }
          : { icon: 'swipe', bold: 'Left to dislike, right to like.', text: ' It tunes your For you feed, no account needed.' },
        { icon: 'source', bold: `${tap} the source`, text: ' on any card to see where it came from.' },
        { icon: 'follow', bold: 'Follow', text: ` a topic to see its stories in the Following ${web ? 'page' : 'tab'}.` },
        { icon: 'search', bold: 'Search', text: ' for a company, agency or topic.' },
      ],
    },
  ];
}

export const TUTORIAL_FOOTNOTE = 'No account needed to read. You can replay this tour anytime in Me.';
