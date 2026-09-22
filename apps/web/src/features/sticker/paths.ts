/**
 * 내장 스티커용 SVG path 생성기.
 * 호(arc) 명령(A) 대신 3차 베지어만 쓴다: 화면(SVG)과 pdf-lib의 drawSvgPath가 똑같이 그리게 하기 위해서다.
 */

const KAPPA = 0.5522847498;

const fmt = (n: number): string => {
  const rounded = Math.round(n * 100) / 100;
  return (Object.is(rounded, -0) ? 0 : rounded).toString();
};

const pt = (x: number, y: number): string => `${fmt(x)} ${fmt(y)}`;

export function circlePath(cx: number, cy: number, r: number): string {
  return ellipsePath(cx, cy, r, r);
}

export function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [
    `M ${pt(cx + rx, cy)}`,
    `C ${pt(cx + rx, cy + ky)} ${pt(cx + kx, cy + ry)} ${pt(cx, cy + ry)}`,
    `C ${pt(cx - kx, cy + ry)} ${pt(cx - rx, cy + ky)} ${pt(cx - rx, cy)}`,
    `C ${pt(cx - rx, cy - ky)} ${pt(cx - kx, cy - ry)} ${pt(cx, cy - ry)}`,
    `C ${pt(cx + kx, cy - ry)} ${pt(cx + rx, cy - ky)} ${pt(cx + rx, cy)}`,
    'Z',
  ].join(' ');
}

export function polygonPath(points: ReadonlyArray<readonly [number, number]>): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  return `M ${pt(first[0], first[1])} ${rest.map(([x, y]) => `L ${pt(x, y)}`).join(' ')} Z`;
}

/** 꼭짓점이 points개인 별. rotateDeg는 첫 꼭짓점 방향 (기본 -90 = 위) */
export function starPath(
  cx: number,
  cy: number,
  points: number,
  outerR: number,
  innerR: number,
  rotateDeg = -90,
): string {
  const vertices: Array<[number, number]> = [];
  const step = Math.PI / points;
  for (let i = 0; i < points * 2; i += 1) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (rotateDeg * Math.PI) / 180 + i * step;
    vertices.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  return polygonPath(vertices);
}

export function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h / 2);
  const k = rr * KAPPA;
  return [
    `M ${pt(x + rr, y)}`,
    `L ${pt(x + w - rr, y)}`,
    `C ${pt(x + w - rr + k, y)} ${pt(x + w, y + rr - k)} ${pt(x + w, y + rr)}`,
    `L ${pt(x + w, y + h - rr)}`,
    `C ${pt(x + w, y + h - rr + k)} ${pt(x + w - rr + k, y + h)} ${pt(x + w - rr, y + h)}`,
    `L ${pt(x + rr, y + h)}`,
    `C ${pt(x + rr - k, y + h)} ${pt(x, y + h - rr + k)} ${pt(x, y + h - rr)}`,
    `L ${pt(x, y + rr)}`,
    `C ${pt(x, y + rr - k)} ${pt(x + rr - k, y)} ${pt(x + rr, y)}`,
    'Z',
  ].join(' ');
}

/** 하트. size는 대략 절반 폭 */
export function heartPath(cx: number, cy: number, size: number): string {
  const s = size;
  return [
    `M ${pt(cx, cy + s * 0.75)}`,
    `C ${pt(cx - s * 1.1, cy + s * 0.1)} ${pt(cx - s * 0.95, cy - s * 0.65)} ${pt(cx - s * 0.5, cy - s * 0.65)}`,
    `C ${pt(cx - s * 0.2, cy - s * 0.65)} ${pt(cx, cy - s * 0.35)} ${pt(cx, cy - s * 0.15)}`,
    `C ${pt(cx, cy - s * 0.35)} ${pt(cx + s * 0.2, cy - s * 0.65)} ${pt(cx + s * 0.5, cy - s * 0.65)}`,
    `C ${pt(cx + s * 0.95, cy - s * 0.65)} ${pt(cx + s * 1.1, cy + s * 0.1)} ${pt(cx, cy + s * 0.75)}`,
    'Z',
  ].join(' ');
}

/**
 * 열린 호 (선으로 그릴 때). 각도는 SVG 좌표(y 아래) 기준 도 단위, 시계 방향으로 증가.
 * 90도 이하 구간으로 나눠 3차 베지어로 근사한다.
 */
export function arcPath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
): string {
  const total = endDeg - startDeg;
  const segments = Math.max(1, Math.ceil(Math.abs(total) / 90));
  const delta = ((total / segments) * Math.PI) / 180;
  const k = (4 / 3) * Math.tan(delta / 4);
  let angle = (startDeg * Math.PI) / 180;
  const parts = [`M ${pt(cx + r * Math.cos(angle), cy + r * Math.sin(angle))}`];
  for (let i = 0; i < segments; i += 1) {
    const next = angle + delta;
    const x1 = cx + r * (Math.cos(angle) - k * Math.sin(angle));
    const y1 = cy + r * (Math.sin(angle) + k * Math.cos(angle));
    const x2 = cx + r * (Math.cos(next) + k * Math.sin(next));
    const y2 = cy + r * (Math.sin(next) - k * Math.cos(next));
    parts.push(
      `C ${pt(x1, y1)} ${pt(x2, y2)} ${pt(cx + r * Math.cos(next), cy + r * Math.sin(next))}`,
    );
    angle = next;
  }
  return parts.join(' ');
}

/** 선분 (두 점) */
export function linePath(x1: number, y1: number, x2: number, y2: number): string {
  return `M ${pt(x1, y1)} L ${pt(x2, y2)}`;
}

/** 중심에서 뻗는 방사선 (해, 반짝임) */
export function rayPath(
  cx: number,
  cy: number,
  fromR: number,
  toR: number,
  angleDeg: number,
): string {
  const a = (angleDeg * Math.PI) / 180;
  return linePath(
    cx + fromR * Math.cos(a),
    cy + fromR * Math.sin(a),
    cx + toR * Math.cos(a),
    cy + toR * Math.sin(a),
  );
}
