import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Recipe, RecipeSchema } from './schemas/recipe.schema'
import { RecipeRevision, RecipeRevisionSchema } from './schemas/recipe-revision.schema'
import { Rating, RatingSchema } from '../ratings/schemas/rating.schema'
import { RecipesService } from './recipes.service'
import { RecipesController } from './recipes.controller'
import { ActivityLogModule } from '../activity-log/activity-log.module'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Recipe.name, schema: RecipeSchema },
      { name: RecipeRevision.name, schema: RecipeRevisionSchema },
      { name: Rating.name, schema: RatingSchema },
    ]),
    ActivityLogModule,
  ],
  providers: [RecipesService],
  controllers: [RecipesController],
  exports: [RecipesService],
})
export class RecipesModule {}
