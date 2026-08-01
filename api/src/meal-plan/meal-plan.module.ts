import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { MealPlanEntry, MealPlanEntrySchema } from './schemas/meal-plan-entry.schema'
import { MealPlanService } from './meal-plan.service'
import { MealPlanController } from './meal-plan.controller'

@Module({
  imports: [MongooseModule.forFeature([{ name: MealPlanEntry.name, schema: MealPlanEntrySchema }])],
  providers: [MealPlanService],
  controllers: [MealPlanController],
})
export class MealPlanModule {}
