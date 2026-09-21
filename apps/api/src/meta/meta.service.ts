import { Injectable } from '@nestjs/common';
import type { MetaResponse } from '@pdf-memo/shared';
import { API_VERSION, MIN_WEB_VERSION } from './version';

@Injectable()
export class MetaService {
  get(): MetaResponse {
    return {
      apiVersion: API_VERSION,
      minWebVersion: MIN_WEB_VERSION,
      commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7),
      features: {
        // 2단계에서 SyncModule이 붙으면 true
        sync: false,
      },
    };
  }
}
