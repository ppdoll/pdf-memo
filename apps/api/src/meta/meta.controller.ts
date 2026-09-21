import { Controller, Get } from '@nestjs/common';
import type { MetaResponse } from '@pdf-memo/shared';
import { MetaService } from './meta.service';

@Controller('meta')
export class MetaController {
  constructor(private readonly meta: MetaService) {}

  @Get()
  get(): MetaResponse {
    return this.meta.get();
  }
}
