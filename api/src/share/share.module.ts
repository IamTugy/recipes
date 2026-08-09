import { Module } from '@nestjs/common'
import { RecipesModule } from '../recipes/recipes.module'
import { ShareController } from './share.controller'
import { ShareImageService } from './share-image.service'

@Module({
  imports: [RecipesModule],
  controllers: [ShareController],
  providers: [ShareImageService],
})
export class ShareModule {}
