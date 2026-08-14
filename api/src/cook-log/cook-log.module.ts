import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { CookLog, CookLogSchema } from './schemas/cook-log.schema'
import { Recipe, RecipeSchema } from '../recipes/schemas/recipe.schema'
import { CookLogService } from './cook-log.service'
import { ActivityLogModule } from '../activity-log/activity-log.module'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CookLog.name, schema: CookLogSchema },
      { name: Recipe.name, schema: RecipeSchema },
    ]),
    ActivityLogModule,
  ],
  providers: [CookLogService],
  exports: [CookLogService],
})
export class CookLogModule {}
