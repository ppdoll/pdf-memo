import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@pdf-memo/shared';

@Controller('health')
export class HealthController {
  @Get()
  get(): HealthResponse {
    return { status: 'ok', time: new Date().toISOString() };
  }
}
