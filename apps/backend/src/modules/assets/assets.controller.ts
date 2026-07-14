import { Controller, Get } from '@nestjs/common';
import { AssetsService } from './assets.service';

@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  findAll() {
    return this.assets.findAll();
  }
}
