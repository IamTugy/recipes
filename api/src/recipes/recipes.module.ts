import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Recipe, RecipeSchema } from './schemas/recipe.schema'
import { RecipeRevision, RecipeRevisionSchema } from './schemas/recipe-revision.schema'
import { Rating, RatingSchema } from '../ratings/schemas/rating.schema'
import { RecipesService } from './recipes.service'
import { RecipesController } from './recipes.controller'
import { ActivityLogModule } from '../activity-log/activity-log.module'
import { CookLogModule } from '../cook-log/cook-log.module'
import { UsersModule } from '../users/users.module'
import { AiModule } from '../ai/ai.module'
import { RecipeImportController } from './import/recipe-import.controller'
import { RecipeImportService } from './import/recipe-import.service'
import { NutritionController } from './nutrition/nutrition.controller'
import { NutritionService } from './nutrition/nutrition.service'
import { RecipeAiGenerateController } from './ai-generate/recipe-ai-generate.controller'
import { RecipeAiGenerateService } from './ai-generate/recipe-ai-generate.service'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Recipe.name, schema: RecipeSchema },
      { name: RecipeRevision.name, schema: RecipeRevisionSchema },
      { name: Rating.name, schema: RatingSchema },
    ]),
    ActivityLogModule,
    CookLogModule,
    UsersModule,
    AiModule,
  ],
  providers: [RecipesService, RecipeImportService, NutritionService, RecipeAiGenerateService],
  controllers: [RecipesController, RecipeImportController, NutritionController, RecipeAiGenerateController],
  exports: [RecipesService],
})
export class RecipesModule {}
