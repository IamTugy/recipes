import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, Req } from '@nestjs/common'
import { Request } from 'express'
import { MealPlanService } from './meal-plan.service'
import { AddMealPlanEntryDto } from './dto/add-meal-plan-entry.dto'
import { ActivityLogService } from '../activity-log/activity-log.service'

@Controller('meal-plan')
export class MealPlanController {
  constructor(
    private readonly mealPlanService: MealPlanService,
    private readonly activityLog: ActivityLogService,
  ) {}

  @Get()
  async list(
    @Query('start') start: string,
    @Query('end') end: string,
    @Req() req: Request & { userId: string },
  ) {
    if (!start || !end) throw new BadRequestException('start and end query params are required')
    return this.mealPlanService.listForRange(req.userId, start, end)
  }

  @Post()
  async add(@Body() body: AddMealPlanEntryDto, @Req() req: Request & { userId: string }) {
    const entry = await this.mealPlanService.add(req.userId, body)
    await this.activityLog.record(req.userId, body.recipeId, 'recipe_meal_planned', { date: body.date, mealType: body.mealType })
    return entry
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: Request & { userId: string }) {
    await this.mealPlanService.remove(req.userId, id)
    await this.activityLog.record(req.userId, undefined, 'meal_plan_entry_removed')
    return { deleted: true }
  }
}
