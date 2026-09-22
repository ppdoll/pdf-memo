import {
  arcPath,
  circlePath,
  ellipsePath,
  heartPath,
  linePath,
  polygonPath,
  rayPath,
  roundedRectPath,
  starPath,
} from './paths';

/**
 * 내장 스티커 팩 "basic". 벡터(SVG path)라서 화면에서 선명하고, 내보내기에서도 pdf-lib의
 * drawSvgPath로 그대로 굽는다. 자산 id는 'pack:basic/<name>' (AssetMeta 규약).
 */

export type StickerCategory = 'basic' | 'face' | 'deco' | 'bubble' | 'tape';

export interface StickerShape {
  d: string;
  /** 채움색. 없으면 채우지 않음 */
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  /** 0~1, 기본 1 */
  opacity?: number;
  lineCap?: 'round' | 'butt';
}

export interface StickerDef {
  id: string;
  name: string;
  category: StickerCategory;
  /** 좌표 상자 (viewBox) 크기. 비율은 이 값으로 고정된다 */
  width: number;
  height: number;
  shapes: StickerShape[];
}

export const PACK_PREFIX = 'pack:basic/';

export const STICKER_CATEGORIES: ReadonlyArray<{ id: StickerCategory; label: string }> = [
  { id: 'basic', label: '기본' },
  { id: 'face', label: '표정' },
  { id: 'deco', label: '꾸미기' },
  { id: 'bubble', label: '말풍선·화살표' },
  { id: 'tape', label: '테이프' },
];

const INK = '#1f2937';

function def(
  name: string,
  label: string,
  category: StickerCategory,
  shapes: StickerShape[],
  size: { width: number; height: number } = { width: 100, height: 100 },
): StickerDef {
  return { id: `${PACK_PREFIX}${name}`, name: label, category, ...size, shapes };
}

function heart(name: string, label: string, fill: string): StickerDef {
  return def(name, label, 'basic', [
    { d: heartPath(50, 52, 40), fill },
    { d: ellipsePath(33, 36, 7, 11), fill: '#ffffff', opacity: 0.55 },
  ]);
}

function star(name: string, label: string, fill: string, stroke: string): StickerDef {
  return def(name, label, 'basic', [
    { d: starPath(50, 53, 5, 46, 21), fill, stroke, strokeWidth: 3 },
  ]);
}

function face(name: string, label: string, extra: StickerShape[]): StickerDef {
  return def(name, label, 'face', [
    { d: circlePath(50, 50, 44), fill: '#fde047', stroke: '#f59e0b', strokeWidth: 3 },
    ...extra,
  ]);
}

function flower(
  name: string,
  label: string,
  petals: number,
  petalFill: string,
  petalStroke: string,
  centerFill: string,
): StickerDef {
  const shapes: StickerShape[] = [];
  for (let i = 0; i < petals; i += 1) {
    const a = (i * 2 * Math.PI) / petals - Math.PI / 2;
    shapes.push({
      d: circlePath(50 + 24 * Math.cos(a), 52 + 24 * Math.sin(a), 18),
      fill: petalFill,
      stroke: petalStroke,
      strokeWidth: 2,
    });
  }
  shapes.push({ d: circlePath(50, 52, 13), fill: centerFill });
  return def(name, label, 'deco', shapes);
}

function tape(name: string, label: string, fill: string, pattern: StickerShape[] = []): StickerDef {
  return def(
    name,
    label,
    'tape',
    [
      {
        d: polygonPath([
          [0, 2],
          [4, 0],
          [8, 3],
          [12, 0],
          [16, 3],
          [20, 0],
          [96, 0],
          [92, 3],
          [88, 0],
          [84, 3],
          [80, 0],
          [76, 3],
          [72, 0],
          [72, 0],
          [100, 2],
          [100, 26],
          [96, 28],
          [92, 25],
          [88, 28],
          [84, 25],
          [80, 28],
          [4, 28],
          [8, 25],
          [12, 28],
          [16, 25],
          [20, 28],
          [0, 26],
        ]),
        fill,
        opacity: 0.8,
      },
      ...pattern,
    ],
    { width: 100, height: 28 },
  );
}

function dots(color: string): StickerShape[] {
  const shapes: StickerShape[] = [];
  for (let x = 10; x < 100; x += 16) {
    shapes.push({ d: circlePath(x, 9, 2.5), fill: color, opacity: 0.7 });
    shapes.push({ d: circlePath(x + 8, 19, 2.5), fill: color, opacity: 0.7 });
  }
  return shapes;
}

function stripes(color: string): StickerShape[] {
  const shapes: StickerShape[] = [];
  for (let x = 6; x < 100; x += 14) {
    shapes.push({
      d: polygonPath([
        [x, 28],
        [x + 8, 0],
        [x + 13, 0],
        [x + 5, 28],
      ]),
      fill: color,
      opacity: 0.5,
    });
  }
  return shapes;
}

const sunRays: StickerShape[] = Array.from({ length: 8 }, (_, i) => ({
  d: rayPath(50, 50, 31, 45, i * 45),
  stroke: '#f59e0b',
  strokeWidth: 6,
  lineCap: 'round' as const,
}));

export const STICKER_PACK: readonly StickerDef[] = [
  // 기본
  heart('heart-red', '빨간 하트', '#ef4444'),
  heart('heart-pink', '분홍 하트', '#f472b6'),
  heart('heart-purple', '보라 하트', '#a78bfa'),
  star('star-yellow', '노란 별', '#facc15', '#f59e0b'),
  star('star-blue', '파란 별', '#60a5fa', '#3b82f6'),
  star('star-pink', '분홍 별', '#f9a8d4', '#ec4899'),
  def('sparkle', '반짝임', 'basic', [
    { d: starPath(44, 56, 4, 42, 11), fill: '#fde68a' },
    { d: starPath(78, 24, 4, 16, 4), fill: '#fcd34d' },
  ]),
  def('check', '체크', 'basic', [
    { d: circlePath(50, 50, 46), fill: '#22c55e' },
    { d: 'M 28 52 L 44 68 L 74 36', stroke: '#ffffff', strokeWidth: 10, lineCap: 'round' },
  ]),
  def('cross', '엑스', 'basic', [
    { d: circlePath(50, 50, 46), fill: '#ef4444' },
    { d: 'M 32 32 L 68 68', stroke: '#ffffff', strokeWidth: 10, lineCap: 'round' },
    { d: 'M 68 32 L 32 68', stroke: '#ffffff', strokeWidth: 10, lineCap: 'round' },
  ]),
  def('circle-mark', '동그라미', 'basic', [
    { d: circlePath(50, 50, 40), stroke: '#ef4444', strokeWidth: 9 },
  ]),
  def('exclaim', '느낌표', 'basic', [
    { d: roundedRectPath(41, 8, 18, 54, 9), fill: '#ef4444' },
    { d: circlePath(50, 82, 10), fill: '#ef4444' },
  ]),

  // 표정
  face('smile', '웃는 얼굴', [
    { d: circlePath(36, 42, 5), fill: INK },
    { d: circlePath(64, 42, 5), fill: INK },
    { d: 'M 32 60 C 40 74 60 74 68 60', stroke: INK, strokeWidth: 5, lineCap: 'round' },
  ]),
  face('wink', '윙크', [
    { d: circlePath(36, 42, 5), fill: INK },
    { d: linePath(57, 42, 71, 42), stroke: INK, strokeWidth: 5, lineCap: 'round' },
    { d: 'M 32 60 C 40 74 60 74 68 60', stroke: INK, strokeWidth: 5, lineCap: 'round' },
  ]),
  face('love', '하트 눈', [
    { d: heartPath(35, 42, 9), fill: '#ef4444' },
    { d: heartPath(65, 42, 9), fill: '#ef4444' },
    { d: 'M 34 60 C 42 78 58 78 66 60 Z', fill: '#7f1d1d' },
  ]),

  // 꾸미기
  flower('flower-pink', '분홍 꽃', 6, '#f9a8d4', '#f472b6', '#fde047'),
  flower('flower-purple', '보라 꽃', 5, '#c4b5fd', '#a78bfa', '#f59e0b'),
  def('sun', '해', 'deco', [...sunRays, { d: circlePath(50, 50, 24), fill: '#facc15' }]),
  def('cloud', '구름', 'deco', [
    { d: circlePath(34, 62, 17), fill: '#bfdbfe' },
    { d: circlePath(52, 50, 22), fill: '#bfdbfe' },
    { d: circlePath(70, 62, 15), fill: '#bfdbfe' },
    { d: roundedRectPath(24, 60, 60, 18, 9), fill: '#bfdbfe' },
  ]),
  def('rainbow', '무지개', 'deco', [
    { d: arcPath(50, 72, 44, 180, 360), stroke: '#f87171', strokeWidth: 8 },
    { d: arcPath(50, 72, 36, 180, 360), stroke: '#fb923c', strokeWidth: 8 },
    { d: arcPath(50, 72, 28, 180, 360), stroke: '#fde047', strokeWidth: 8 },
    { d: arcPath(50, 72, 20, 180, 360), stroke: '#4ade80', strokeWidth: 8 },
    { d: arcPath(50, 72, 12, 180, 360), stroke: '#60a5fa', strokeWidth: 8 },
  ]),
  def('leaf', '나뭇잎', 'deco', [
    { d: 'M 20 80 C 20 40 50 20 84 18 C 84 56 56 82 20 80 Z', fill: '#4ade80' },
    { d: 'M 24 78 C 40 60 58 42 78 24', stroke: '#16a34a', strokeWidth: 3, lineCap: 'round' },
  ]),
  def('crown', '왕관', 'deco', [
    {
      d: polygonPath([
        [14, 78],
        [14, 40],
        [32, 58],
        [50, 24],
        [68, 58],
        [86, 40],
        [86, 78],
      ]),
      fill: '#facc15',
      stroke: '#f59e0b',
      strokeWidth: 3,
    },
    { d: roundedRectPath(14, 74, 72, 12, 3), fill: '#f59e0b' },
    { d: circlePath(32, 60, 4), fill: '#ef4444' },
    { d: circlePath(50, 52, 4), fill: '#3b82f6' },
    { d: circlePath(68, 60, 4), fill: '#22c55e' },
  ]),
  def('ribbon', '리본 배지', 'deco', [
    {
      d: polygonPath([
        [36, 58],
        [26, 94],
        [42, 84],
        [50, 72],
      ]),
      fill: '#ec4899',
    },
    {
      d: polygonPath([
        [64, 58],
        [74, 94],
        [58, 84],
        [50, 72],
      ]),
      fill: '#ec4899',
    },
    { d: circlePath(50, 40, 30), fill: '#f472b6' },
    { d: circlePath(50, 40, 20), fill: '#ffffff' },
    { d: starPath(50, 41, 5, 14, 6), fill: '#f472b6' },
  ]),
  def('pin', '핀', 'deco', [
    { d: linePath(50, 60, 50, 94), stroke: '#6b7280', strokeWidth: 4, lineCap: 'round' },
    {
      d: polygonPath([
        [36, 46],
        [64, 46],
        [58, 64],
        [42, 64],
      ]),
      fill: '#b91c1c',
    },
    { d: circlePath(50, 30, 22), fill: '#ef4444' },
    { d: ellipsePath(42, 22, 6, 4), fill: '#ffffff', opacity: 0.6 },
  ]),
  def('music', '음표', 'deco', [
    { d: linePath(48, 16, 48, 74), stroke: INK, strokeWidth: 6, lineCap: 'round' },
    { d: 'M 48 14 C 62 20 74 26 68 46 C 66 34 58 30 48 28 Z', fill: INK },
    { d: ellipsePath(36, 76, 15, 11), fill: INK },
  ]),
  def('paw', '발자국', 'deco', [
    { d: circlePath(30, 36, 9), fill: '#78716c' },
    { d: circlePath(46, 26, 9), fill: '#78716c' },
    { d: circlePath(64, 30, 9), fill: '#78716c' },
    { d: circlePath(76, 46, 8), fill: '#78716c' },
    { d: ellipsePath(50, 66, 22, 18), fill: '#78716c' },
  ]),

  // 말풍선·화살표
  def('bubble-blue', '말풍선', 'bubble', [
    {
      d: polygonPath([
        [26, 66],
        [18, 92],
        [50, 68],
      ]),
      fill: '#bae6fd',
    },
    { d: roundedRectPath(8, 12, 84, 58, 14), fill: '#bae6fd' },
    { d: circlePath(34, 41, 5), fill: '#0369a1' },
    { d: circlePath(50, 41, 5), fill: '#0369a1' },
    { d: circlePath(66, 41, 5), fill: '#0369a1' },
  ]),
  def('bubble-heart', '하트 말풍선', 'bubble', [
    {
      d: polygonPath([
        [26, 66],
        [18, 92],
        [50, 68],
      ]),
      fill: '#fef08a',
    },
    { d: roundedRectPath(8, 12, 84, 58, 14), fill: '#fef08a' },
    { d: heartPath(50, 42, 16), fill: '#ef4444' },
  ]),
  def('arrow-right', '오른쪽 화살표', 'bubble', [
    {
      d: polygonPath([
        [10, 38],
        [58, 38],
        [58, 20],
        [92, 50],
        [58, 80],
        [58, 62],
        [10, 62],
      ]),
      fill: '#3b82f6',
    },
  ]),
  def('arrow-up', '위쪽 화살표', 'bubble', [
    {
      d: polygonPath([
        [38, 90],
        [38, 42],
        [20, 42],
        [50, 8],
        [80, 42],
        [62, 42],
        [62, 90],
      ]),
      fill: '#ef4444',
    },
  ]),

  // 테이프
  tape('tape-pink', '분홍 테이프', '#f9a8d4'),
  tape('tape-mint', '민트 테이프', '#a7f3d0', dots('#ffffff')),
  tape('tape-lavender', '라벤더 테이프', '#ddd6fe', stripes('#ffffff')),
  tape('tape-yellow', '노란 테이프', '#fef08a'),
];

const BY_ID = new Map(STICKER_PACK.map((s) => [s.id, s]));

export function isPackAssetId(assetId: string): boolean {
  return assetId.startsWith('pack:');
}

export function getPackSticker(assetId: string): StickerDef | undefined {
  return BY_ID.get(assetId);
}
