import { Module } from '@nestjs/common'
import { RecipesModule } from '../recipes/recipes.module'
import { ShareController } from './share.controller'

@Module({
  imports: [RecipesModule],
  controllers: [ShareController],
})
export class ShareModule {}
