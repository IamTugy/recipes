import { IsIn, IsOptional, IsString, Matches } from 'class-validator'

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack']

export class AddMealPlanEntryDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string

  @IsString()
  recipeSlug!: string

  @IsIn(MEAL_TYPES)
  @IsOptional()
  mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack'
}
