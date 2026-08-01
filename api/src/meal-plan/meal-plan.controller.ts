import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, Req } from '@nestjs/common'
import { Request } from 'express'
import { MealPlanService } from './meal-plan.service'
import { AddMealPlanEntryDto } from './dto/add-meal-plan-entry.dto'

@Controller('meal-plan')
export class MealPlanController {
  constructor(private readonly mealPlanService: MealPlanService) {}

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
    return this.mealPlanService.add(req.userId, body)
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: Request & { userId: string }) {
    await this.mealPlanService.remove(req.userId, id)
    return { deleted: true }
  }
}
