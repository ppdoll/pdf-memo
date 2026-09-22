const fmt = (n: number): string => String(Math.round(n * 100) / 100);

/**
 * perfect-freehand 외곽선 폴리곤을 SVG path 문자열로.
 * 뷰어의 Path2D와 같은 방식(이웃 점 중간을 제어점으로 하는 2차 곡선)이라 화면과 인쇄 결과가 같다.
 * 좌표는 페이지 공간(pt, 원점 좌상단, y 아래 방향) 그대로 둔다.
 */
export function outlineToSvgPath(outline: readonly (readonly number[])[]): string {
  if (outline.length < 2) return '';
  const parts: string[] = [`M ${fmt(outline[0][0])} ${fmt(outline[0][1])}`];
  for (let i = 0; i < outline.length; i += 1) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    parts.push(`Q ${fmt(a[0])} ${fmt(a[1])} ${fmt((a[0] + b[0]) / 2)} ${fmt((a[1] + b[1]) / 2)}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

/** '#RRGGBB' → 0..1 RGB */
export function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const value = /^#([0-9a-f]{6})$/i.exec(hex)?.[1];
  if (!value) return { r: 0, g: 0, b: 0 };
  const n = Number.parseInt(value, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}
