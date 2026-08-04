import { Type } from 'class-transformer'
import { ArrayMinSize, IsArray, IsInt, IsOptional, Min, ValidateNested } from 'class-validator'
import { IngredientGroupDto } from '../dto/recipe.dto'

export class NutritionEstimateRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => IngredientGroupDto)
  ingredients!: IngredientGroupDto[]

  @IsInt()
  @Min(1)
  @IsOptional()
  servings?: number
}
