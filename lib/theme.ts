// Design tokens (from the Element design canvas). Light is the default; dark is
// derived from the same roles. Pure: no React imports.

export interface Palette {
  bg: string; // page background
  surface: string; // cards, sheets, nav bars
  surfaceMuted: string; // source row, close button, "how this card was made"
  ink: string; // headlines and primary text
  inkBody: string; // card body text
  inkSoft: string; // chip text, secondary labels
  inkPlain: string; // plain-language explainers
  muted: string; // meta text, disclaimer, captions
  border: string; // card border
  borderStrong: string; // chips and outline buttons
  divider: string; // card footer rule
  rowDivider: string; // list rows in the numbers panel
  navBorder: string; // bottom nav and tab rule
  handle: string; // sheet grab handle
  accent: string; // wordmark, active tab, primary button
  accentInk: string; // text on accentSoft
  accentSoft: string; // active chip, Summary badge, active nav item
  onAccent: string; // text on accent
  dataSoft: string; // "New data" badge
  dataInk: string; // text on dataSoft and the data panel label
  dataPanel: string; // the big-number panel on data cards
  up: string; // change went up
  down: string; // change went down
  flat: string; // unchanged
  overlay: string; // behind sheets
}

export const light: Palette = {
  bg: '#F5F6F2',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F4EF',
  ink: '#14211C',
  inkBody: '#24322B',
  inkSoft: '#33403A',
  inkPlain: '#44514A',
  muted: '#56635B',
  border: '#E1E6DE',
  borderStrong: '#D5DBD2',
  divider: '#E7EBE4',
  rowDivider: '#EDF0EA',
  navBorder: '#DDE2DA',
  handle: '#CBD2C8',
  accent: '#0B6B5D',
  accentInk: '#0A5A4E',
  accentSoft: '#DCEEE9',
  onAccent: '#FFFFFF',
  dataSoft: '#FBEFD2',
  dataInk: '#6B4400',
  dataPanel: '#F7F3E8',
  up: '#8A3B12',
  down: '#0A5A4E',
  flat: '#56635B',
  overlay: 'rgba(20,33,28,0.5)',
};

export const dark: Palette = {
  bg: '#0F1513',
  surface: '#18201D',
  surfaceMuted: '#1F2925',
  ink: '#E8EEEA',
  inkBody: '#D3DCD6',
  inkSoft: '#C2CCC5',
  inkPlain: '#B3BEB7',
  muted: '#98A59D',
  border: '#2A3530',
  borderStrong: '#36433D',
  divider: '#26302C',
  rowDivider: '#222B27',
  navBorder: '#2A3530',
  handle: '#45524C',
  accent: '#4FB8A5',
  accentInk: '#9FE0D3',
  accentSoft: '#17352F',
  onAccent: '#06201B',
  dataSoft: '#3A2E14',
  dataInk: '#F1C770',
  dataPanel: '#2A2416',
  up: '#F0A07A',
  down: '#6FD0BD',
  flat: '#98A59D',
  overlay: 'rgba(0,0,0,0.6)',
};

// Light only for now. The dark palette above is kept for later; set this to
// true (and app.json "userInterfaceStyle" to "automatic") to follow the system.
export const DARK_MODE_ENABLED = false;

export function paletteFor(scheme: string | null | undefined): Palette {
  return DARK_MODE_ENABLED && scheme === 'dark' ? dark : light;
}

// Font family names as registered by expo-font (see app/_layout.tsx). Each weight
// is its own family, so never combine these with fontWeight (it would fake-bold).
export const fonts = {
  serif: 'Newsreader_600SemiBold',
  sans: 'InstrumentSans_400Regular',
  sansMedium: 'InstrumentSans_500Medium',
  sansSemi: 'InstrumentSans_600SemiBold',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 12, md: 14, lg: 18, card: 24, sheet: 28, pill: 999 } as const;
export const font = { small: 12, meta: 13, chip: 14, body: 16, cardBody: 18, title: 32, big: 64 } as const;

// At this width and above the web layout switches to three columns.
export const WIDE_BREAKPOINT = 1024;
export const RAIL_WIDTH = 220;
export const ASIDE_WIDTH = 340;
