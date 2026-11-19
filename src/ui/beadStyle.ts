import type { CSSProperties } from 'react';

/** 把 --bead CSS 变量传给豆子色块。 */
export function beadStyle(hex: string): CSSProperties {
  return { ['--bead' as string]: hex } as CSSProperties;
}
