import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { CookSession, CookSessionSchema } from '../cook-sessions/schemas/cook-session.schema'
import { Recipe, RecipeSchema } from '../recipes/schemas/recipe.schema'
import { CookHistoryService } from './cook-history.service'
import { CookHistoryController } from './cook-history.controller'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CookSession.name, schema: CookSessionSchema },
      { name: Recipe.name, schema: RecipeSchema },
    ]),
  ],
  providers: [CookHistoryService],
  controllers: [CookHistoryController],
})
export class CookHistoryModule {}
