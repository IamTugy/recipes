import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { MealPlanEntry, MealPlanEntrySchema } from './schemas/meal-plan-entry.schema'
import { MealPlanService } from './meal-plan.service'
import { MealPlanController } from './meal-plan.controller'
import { ActivityLogModule } from '../activity-log/activity-log.module'

@Module({
  imports: [MongooseModule.forFeature([{ name: MealPlanEntry.name, schema: MealPlanEntrySchema }]), ActivityLogModule],
  providers: [MealPlanService],
  controllers: [MealPlanController],
})
export class MealPlanModule {}
