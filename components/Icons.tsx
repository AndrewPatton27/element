// Line icons, path data copied from the Element design files (24x24 viewBox,
// round caps and joins). Info and Document are drawn in the same style because
// the designs have no About or filing icon.

import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

interface IconProps {
  color: string;
  size?: number;
  strokeWidth?: number;
}

// Icons are decorative. On web, react-native-svg renders a plain <svg>, which
// only understands aria-hidden; the native props would end up in the DOM.
const hiddenFromScreenReaders =
  Platform.OS === 'web'
    ? ({ 'aria-hidden': true } as object)
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

function Icon({ color, size = 24, strokeWidth = 1.8, children }: IconProps & { children: ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...hiddenFromScreenReaders}
    >
      {children}
    </Svg>
  );
}

export function FeedIcon(p: IconProps) {
  return (
    <Icon strokeWidth={1.9} {...p}>
      <Rect x={4} y={4} width={16} height={11} rx={2.5} />
      <Path d="M7 19h10" />
    </Icon>
  );
}

// Bar chart: the design's "New data" icon, also used for the Numbers nav item.
export function NumbersIcon(p: IconProps) {
  return (
    <Icon strokeWidth={2} {...p}>
      <Path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
    </Icon>
  );
}

export function InfoIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 11v6M12 7.5v.01" />
    </Icon>
  );
}

export function LinkIcon(p: IconProps) {
  return (
    <Icon size={18} {...p}>
      <Path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <Path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" />
    </Icon>
  );
}

export function ExternalIcon(p: IconProps) {
  return (
    <Icon size={18} strokeWidth={2} {...p}>
      <Path d="M14 4h6v6" />
      <Path d="M20 4l-9 9" />
      <Path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </Icon>
  );
}

export function SparkleIcon(p: IconProps) {
  return (
    <Icon size={14} strokeWidth={2} {...p}>
      <Path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
    </Icon>
  );
}

export function ChevronUpIcon(p: IconProps) {
  return (
    <Icon size={16} strokeWidth={2} {...p}>
      <Path d="M6 14l6-6 6 6" />
    </Icon>
  );
}

export function CloseIcon(p: IconProps) {
  return (
    <Icon size={18} strokeWidth={2} {...p}>
      <Path d="M6 6l12 12M18 6L6 18" />
    </Icon>
  );
}

// Government building: the design's icon for the Federal Reserve source tile.
export function BuildingIcon(p: IconProps) {
  return (
    <Icon size={22} {...p}>
      <Path d="M3 10l9-6 9 6" />
      <Path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18" />
    </Icon>
  );
}

// Filing / document (same stroke style; the designs have no filing icon).
export function DocumentIcon(p: IconProps) {
  return (
    <Icon size={22} {...p}>
      <Path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <Path d="M14 3v5h5M9 13h6M9 17h4" />
    </Icon>
  );
}
