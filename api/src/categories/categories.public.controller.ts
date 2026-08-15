import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';

@ApiTags('public / categories')
@Controller('categories')
export class CategoriesPublicController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({
    summary:
      'Active categories with description, images, deposit % and price range',
  })
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  list() {
    return this.categoriesService.listPublic();
  }
}
