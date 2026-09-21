import { z } from 'zod';
import { BaseEntitySchema } from './base';
import { HexColorSchema } from './folder';

/**
 * 주석 객체 스키마 버전. 필드가 바뀌면 올리고 마이그레이션을 추가한다.
 * 백업 파일과 동기화 payload 호환성 판단에 쓴다.
 */
export const ANNOTATION_SCHEMA_VERSION = 1;

/**
 * 좌표계 = "페이지 공간": PDF pt 단위, 원점 좌상단, 회전 0, 배율 1.
 * pdf.js getViewport({ scale: 1, rotation: 0 })와 같다. 화면 배율·DPR과 무관하다.
 */
export const BBoxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);
/** [x, y, w, h] */
export type BBox = z.infer<typeof BBoxSchema>;

const Opacity = z.number().min(0).max(1);
const Rotation = z.number();

const AnnotationBaseSchema = BaseEntitySchema.extend({
  schemaVersion: z.number().int().positive(),
  documentId: z.uuid(),
  /** 0-based */
  pageIndex: z.number().int().nonnegative(),
  /** 페이지 안에서의 그리기 순서. 클수록 위 */
  z: z.number(),
  /** 히트 테스트·부분 렌더용 경계 상자 */
  bbox: BBoxSchema,
  locked: z.boolean(),
});

export const InkToolSchema = z.enum(['pen', 'highlighter', 'marker']);
export type InkTool = z.infer<typeof InkToolSchema>;

export const InkObjectSchema = AnnotationBaseSchema.extend({
  type: z.literal('ink'),
  tool: InkToolSchema,
  color: HexColorSchema,
  opacity: Opacity,
  /** 기준 굵기 (pt) */
  width: z.number().positive(),
  /** [x, y, pressure, x, y, pressure, ...] 평면 배열. 소수 2자리로 반올림해 저장 */
  points: z
    .array(z.number())
    .refine((p) => p.length >= 3 && p.length % 3 === 0, 'points must be [x, y, pressure] triples'),
  /** 스트로크 생성 시점의 perfect-freehand 옵션 스냅샷 */
  smoothing: z.object({
    thinning: z.number(),
    streamline: z.number(),
    smoothing: z.number(),
  }),
});

export const TextObjectSchema = AnnotationBaseSchema.extend({
  type: z.literal('text'),
  x: z.number(),
  y: z.number(),
  w: z.number().nonnegative(),
  h: z.number().nonnegative(),
  rotation: Rotation,
  content: z.string().max(20_000),
  fontFamily: z.string().min(1),
  fontSize: z.number().positive(),
  color: HexColorSchema,
  align: z.enum(['left', 'center', 'right']),
  /** 메모지 배경색. null = 투명 */
  background: HexColorSchema.nullable(),
});

/** 텍스트 레이어 기반 형광펜 */
export const HighlightObjectSchema = AnnotationBaseSchema.extend({
  type: z.literal('highlight'),
  rects: z.array(BBoxSchema).min(1),
  color: HexColorSchema,
  opacity: Opacity,
});

/** 스티커, 사진, 마스킹 테이프 */
export const ImageObjectSchema = AnnotationBaseSchema.extend({
  type: z.literal('image'),
  assetId: z.string().min(1),
  x: z.number(),
  y: z.number(),
  w: z.number().nonnegative(),
  h: z.number().nonnegative(),
  rotation: Rotation,
  opacity: Opacity,
  /** 'x' = 테이프처럼 가로 반복 */
  repeat: z.enum(['none', 'x']),
  flipX: z.boolean(),
  flipY: z.boolean(),
});

export const ShapeKindSchema = z.enum(['rect', 'ellipse', 'line', 'arrow']);

export const ShapeObjectSchema = AnnotationBaseSchema.extend({
  type: z.literal('shape'),
  shape: ShapeKindSchema,
  x: z.number(),
  y: z.number(),
  w: z.number().nonnegative(),
  h: z.number().nonnegative(),
  rotation: Rotation,
  stroke: HexColorSchema,
  strokeWidth: z.number().positive(),
  fill: HexColorSchema.nullable(),
  dash: z.array(z.number().nonnegative()).nullable(),
});

/** 접히는 스티키 노트 (아이콘 + 팝업 본문) */
export const NoteObjectSchema = AnnotationBaseSchema.extend({
  type: z.literal('note'),
  x: z.number(),
  y: z.number(),
  content: z.string().max(20_000),
  color: HexColorSchema,
  collapsed: z.boolean(),
});

export const AnnotationObjectSchema = z.discriminatedUnion('type', [
  InkObjectSchema,
  TextObjectSchema,
  HighlightObjectSchema,
  ImageObjectSchema,
  ShapeObjectSchema,
  NoteObjectSchema,
]);

export type InkObject = z.infer<typeof InkObjectSchema>;
export type TextObject = z.infer<typeof TextObjectSchema>;
export type HighlightObject = z.infer<typeof HighlightObjectSchema>;
export type ImageObject = z.infer<typeof ImageObjectSchema>;
export type ShapeObject = z.infer<typeof ShapeObjectSchema>;
export type NoteObject = z.infer<typeof NoteObjectSchema>;
export type AnnotationObject = z.infer<typeof AnnotationObjectSchema>;
export type AnnotationType = AnnotationObject['type'];
