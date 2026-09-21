import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { MetaModule } from './meta/meta.module';

/**
 * 1단계 모듈 구성. 2단계에서 AuthModule, SyncModule, BlobsModule이 추가된다.
 */
@Module({
  imports: [HealthModule, MetaModule],
})
export class AppModule {}
