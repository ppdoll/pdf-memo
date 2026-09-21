import { z } from 'zod';
import { IsoDateTimeSchema } from '../domain/base';

/** NestJS 전역 prefix. 웹은 `/${API_PREFIX}/...`로 호출하고 Vercel rewrite가 api 프로젝트로 넘긴다. */
export const API_PREFIX = 'api/v1';

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  time: IsoDateTimeSchema,
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

/**
 * 기능 플래그와 버전. 웹은 시작 시 읽되 실패해도 로컬 모드로 정상 동작해야 한다.
 */
export const MetaResponseSchema = z.object({
  apiVersion: z.string(),
  minWebVersion: z.string(),
  commit: z.string(),
  features: z.object({
    sync: z.boolean(),
  }),
});
export type MetaResponse = z.infer<typeof MetaResponseSchema>;
