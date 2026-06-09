import type { RawStyles } from './types';

export const TW_COLORS: Record<string, string> = {
  'rgb(255, 255, 255)': 'white', 'rgb(0, 0, 0)': 'black',
  'rgb(248, 250, 252)': 'slate-50', 'rgb(241, 245, 249)': 'slate-100', 'rgb(226, 232, 240)': 'slate-200', 'rgb(203, 213, 225)': 'slate-300', 'rgb(148, 163, 184)': 'slate-400', 'rgb(100, 116, 139)': 'slate-500', 'rgb(71, 85, 105)': 'slate-600', 'rgb(51, 65, 85)': 'slate-700', 'rgb(30, 41, 59)': 'slate-800', 'rgb(15, 23, 42)': 'slate-900',
  'rgb(238, 242, 255)': 'indigo-50', 'rgb(165, 180, 252)': 'indigo-300', 'rgb(129, 140, 248)': 'indigo-400', 'rgb(99, 102, 241)': 'indigo-500', 'rgb(79, 70, 229)': 'indigo-600', 'rgb(67, 56, 202)': 'indigo-700', 'rgb(55, 48, 163)': 'indigo-800', 'rgb(49, 46, 129)': 'indigo-900',
  'rgb(248, 113, 113)': 'red-400', 'rgb(239, 68, 68)': 'red-500', 'rgb(220, 38, 38)': 'red-600', 'rgb(185, 28, 28)': 'red-700',
  'rgb(250, 204, 21)': 'yellow-400', 'rgb(234, 179, 8)': 'yellow-500', 'rgb(202, 138, 4)': 'yellow-600',
  'rgb(251, 191, 36)': 'amber-400', 'rgb(245, 158, 11)': 'amber-500', 'rgb(217, 119, 6)': 'amber-600',
  'rgb(74, 222, 128)': 'green-400', 'rgb(34, 197, 94)': 'green-500', 'rgb(22, 163, 74)': 'green-600',
  'rgb(52, 211, 153)': 'emerald-400', 'rgb(16, 185, 129)': 'emerald-500', 'rgb(5, 150, 105)': 'emerald-600',
  'rgb(45, 212, 191)': 'teal-400', 'rgb(20, 184, 166)': 'teal-500',
  'rgb(96, 165, 250)': 'blue-400', 'rgb(59, 130, 246)': 'blue-500', 'rgb(37, 99, 235)': 'blue-600',
  'rgb(251, 113, 133)': 'rose-400', 'rgb(244, 63, 94)': 'rose-500', 'rgb(225, 29, 72)': 'rose-600',
  'rgb(251, 146, 60)': 'orange-400', 'rgb(249, 115, 22)': 'orange-500',
  'rgb(192, 132, 252)': 'purple-400', 'rgb(168, 85, 247)': 'purple-500', 'rgb(147, 51, 234)': 'purple-600',
  'rgb(156, 163, 175)': 'gray-400', 'rgb(107, 114, 128)': 'gray-500', 'rgb(75, 85, 99)': 'gray-600', 'rgb(55, 65, 81)': 'gray-700', 'rgb(31, 41, 55)': 'gray-800', 'rgb(17, 24, 39)': 'gray-900',
};

export const TW_SPACING: Record<string, string> = {
  '0px': '0', '1px': 'px', '2px': '0.5', '4px': '1', '6px': '1.5', '8px': '2', '10px': '2.5', '12px': '3', '14px': '3.5', '16px': '4', '20px': '5', '24px': '6', '28px': '7', '32px': '8', '36px': '9', '40px': '10', '44px': '11', '48px': '12', '56px': '14', '64px': '16', '80px': '20', '96px': '24',
};

export const TW_FONT_SIZE: Record<string, string> = {
  '10px': 'xs', '12px': 'xs', '14px': 'sm', '16px': 'base', '18px': 'lg', '20px': 'xl', '24px': '2xl', '28px': '3xl', '30px': '3xl', '36px': '4xl', '48px': '6xl',
};

export const TW_FONT_WEIGHT: Record<string, string> = {
  '100': 'thin', '200': 'extralight', '300': 'light', '400': 'normal', '500': 'medium', '600': 'semibold', '700': 'bold', '800': 'extrabold', '900': 'black',
};

export const TW_BORDER_RADIUS: Record<string, string | null> = {
  '0px': null, '2px': 'rounded-sm', '4px': 'rounded', '6px': 'rounded-md', '8px': 'rounded-lg', '12px': 'rounded-xl', '16px': 'rounded-2xl', '24px': 'rounded-3xl', '9999px': 'rounded-full', '50%': 'rounded-full',
};

export function colorToTwName(rgb: string): string | null {
  if (!rgb || rgb === 'rgba(0, 0, 0, 0)' || rgb === 'transparent') return null;
  return TW_COLORS[rgb] || null;
}

export function mapStyles(cs: CSSStyleDeclaration): string[] {
  const lines: string[] = [];
  const bgName = colorToTwName(cs.backgroundColor);
  if (bgName) lines.push(`bg-${bgName}`);
  const colorName = colorToTwName(cs.color);
  if (colorName) lines.push(`text-${colorName}`);
  const fsClass = TW_FONT_SIZE[cs.fontSize];
  if (fsClass) lines.push(`text-${fsClass}`);
  const fwClass = TW_FONT_WEIGHT[cs.fontWeight];
  if (fwClass && fwClass !== 'normal') lines.push(`font-${fwClass}`);
  const pt = TW_SPACING[cs.paddingTop], pr = TW_SPACING[cs.paddingRight];
  const pb = TW_SPACING[cs.paddingBottom], pl = TW_SPACING[cs.paddingLeft];
  if (pt !== undefined && pt === pr && pr === pb && pb === pl) lines.push(`p-${pt}`);
  else {
    if (pt !== undefined && pt === pb) lines.push(`py-${pt}`); else { if (pt !== undefined) lines.push(`pt-${pt}`); if (pb !== undefined) lines.push(`pb-${pb}`); }
    if (pr !== undefined && pr === pl) lines.push(`px-${pr}`); else { if (pr !== undefined) lines.push(`pr-${pr}`); if (pl !== undefined) lines.push(`pl-${pl}`); }
  }
  const brClass = TW_BORDER_RADIUS[cs.borderRadius];
  if (brClass) lines.push(brClass);
  return lines;
}

export function getRawStyles(cs: CSSStyleDeclaration): RawStyles {
  return {
    bg: cs.backgroundColor,
    color: cs.color,
    fontSize: cs.fontSize,
    fontWeight: cs.fontWeight,
    padding: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
    borderRadius: cs.borderRadius,
    display: cs.display,
    position: cs.position,
  };
}
