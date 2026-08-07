import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'

const CATEGORIES = ['breakfast', 'lunch', 'dinner', 'dessert', 'salad', 'soup', 'snack', 'bread', 'sauce']
const DIFFICULTIES = ['easy', 'medium', 'hard']

export class IngredientItemDto {
  // Not IsInt: fractional amounts are common and valid ("חצי כף" = 0.5 tbsp,
  // 1.5 cups, etc.) - requiring an integer rejected every recipe using them.
  @IsNumber()
  @Min(0)
  @IsOptional()
  amount?: number

  @IsString()
  @IsOptional()
  unit?: string

  @IsString()
  @MinLength(1)
  name!: string

  @IsString()
  @IsOptional()
  nameEn?: string

  @IsString()
  @IsOptional()
  note?: string

  @IsString()
  @IsOptional()
  noteEn?: string
}

export class IngredientGroupDto {
  @IsString()
  @IsOptional()
  group?: string

  @IsString()
  @IsOptional()
  groupEn?: string

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngredientItemDto)
  items!: IngredientItemDto[]
}

export class StepItemDto {
  @IsString()
  @MinLength(1)
  instruction!: string

  @IsString()
  @IsOptional()
  instructionEn?: string

  @IsInt()
  @Min(1)
  @IsOptional()
  timerMinutes?: number

  @IsString()
  @IsOptional()
  tip?: string

  @IsString()
  @IsOptional()
  tipEn?: string
}

export class StepGroupDto {
  @IsString()
  @IsOptional()
  title?: string

  @IsString()
  @IsOptional()
  titleEn?: string

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StepItemDto)
  items!: StepItemDto[]
}

export class NutritionDto {
  @IsNumber()
  @Min(0)
  @IsOptional()
  calories?: number

  @IsNumber()
  @Min(0)
  @IsOptional()
  protein?: number

  @IsNumber()
  @Min(0)
  @IsOptional()
  carbs?: number

  @IsNumber()
  @Min(0)
  @IsOptional()
  fat?: number
}

export class SourceDto {
  @IsString()
  @MinLength(1)
  title!: string

  @IsString()
  @MinLength(1)
  url!: string
}

export class RecipeDto {
  @IsString()
  @MinLength(1)
  title!: string

  @IsString()
  @IsOptional()
  titleHe?: string

  @IsIn(CATEGORIES)
  category!: string

  @IsArray()
  @IsString({ each: true })
  tags!: string[]

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tagsEn?: string[]

  @IsString()
  @IsOptional()
  cuisine?: string

  @IsString()
  @MinLength(1)
  image!: string

  @IsString()
  @MinLength(1)
  description!: string

  @IsString()
  @IsOptional()
  descriptionEn?: string

  @IsInt()
  @Min(0)
  prepTime!: number

  @IsInt()
  @Min(0)
  cookTime!: number

  @IsInt()
  @Min(1)
  servings!: number

  @IsIn(DIFFICULTIES)
  difficulty!: string

  @ValidateNested()
  @Type(() => NutritionDto)
  @IsOptional()
  nutrition?: NutritionDto

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngredientGroupDto)
  ingredients!: IngredientGroupDto[]

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StepGroupDto)
  steps!: StepGroupDto[]

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

  @IsBoolean()
  @IsOptional()
  aiGenerated?: boolean

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SourceDto)
  @IsOptional()
  sources?: SourceDto[]
}
