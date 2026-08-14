import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { CookSession, CookSessionSchema } from './schemas/cook-session.schema'
import { Recipe, RecipeSchema } from '../recipes/schemas/recipe.schema'
import { Rating, RatingSchema } from '../ratings/schemas/rating.schema'
import { CookSessionsService } from './cook-sessions.service'
import { CookSessionsController } from './cook-sessions.controller'
import { CookLogModule } from '../cook-log/cook-log.module'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CookSession.name, schema: CookSessionSchema },
      { name: Recipe.name, schema: RecipeSchema },
      { name: Rating.name, schema: RatingSchema },
    ]),
    CookLogModule,
  ],
  providers: [CookSessionsService],
  controllers: [CookSessionsController],
})
export class CookSessionsModule {}
