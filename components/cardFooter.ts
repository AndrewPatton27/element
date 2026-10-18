// Where a feed card's small print goes (pure, no React; tested in
// lib/__tests__/cardFooter.test.ts). The disclaimer appears exactly once per card:
// - wide web (Web-Final): one footer line, "AI label · disclaimer";
// - phones (Mobile-Final): the AI label in the footer row and the disclaimer
//   centred under the card, above the bottom nav.

export interface FooterLabels {
  footer: string | null; // the footer row, beside the action buttons
  below: string | null; // centred under the card (phones only)
}

export function footerLabels(aiLabel: string | null | undefined, disclaimer: string, wide: boolean): FooterLabels {
  const ai = aiLabel && aiLabel.trim() !== '' ? aiLabel : null;
  if (wide) return { footer: ai ? `${ai} · ${disclaimer}` : disclaimer, below: null };
  return { footer: ai, below: disclaimer };
}

// Link-out cards (reserved, not produced in v1): "Category · Delayed 12 h".
export function delayedText(hours: number | null | undefined): string | null {
  return typeof hours === 'number' && Number.isFinite(hours) && hours > 0 ? `Delayed ${Math.round(hours)} h` : null;
}
