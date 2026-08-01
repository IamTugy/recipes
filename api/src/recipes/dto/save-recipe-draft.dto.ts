import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator'
import { IngredientGroupDto, StepGroupDto } from './recipe.dto'

const CATEGORIES = ['breakfast', 'lunch', 'dinner', 'dessert', 'salad', 'soup', 'snack', 'bread', 'sauce']
const DIFFICULTIES = ['easy', 'medium', 'hard']

// Drafts can be saved incomplete - only a title is required. Full-field
// validation happens separately, at submit-for-review time, against
// whatever is currently stored.
export class SaveRecipeDraftDto {
  @IsString()
  @MinLength(1)
  title!: string

  @IsString()
  @IsOptional()
  titleHe?: string

  @IsIn(CATEGORIES)
  @IsOptional()
  category?: string

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[]

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tagsEn?: string[]

  @IsString()
  @IsOptional()
  cuisine?: string

  @IsString()
  @IsOptional()
  image?: string

  @IsString()
  @IsOptional()
  description?: string

  @IsString()
  @IsOptional()
  descriptionEn?: string

  @IsInt()
  @Min(0)
  @IsOptional()
  prepTime?: number

  @IsInt()
  @Min(0)
  @IsOptional()
  cookTime?: number

  @IsInt()
  @Min(1)
  @IsOptional()
  servings?: number

  @IsIn(DIFFICULTIES)
  @IsOptional()
  difficulty?: string

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngredientGroupDto)
  @IsOptional()
  ingredients?: IngredientGroupDto[]

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StepGroupDto)
  @IsOptional()
  steps?: StepGroupDto[]

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tips?: string[]

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tipsEn?: string[]

  @IsBoolean()
  @IsOptional()
  featured?: boolean
}
