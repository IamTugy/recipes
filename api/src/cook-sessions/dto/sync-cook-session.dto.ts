import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'

export class SyncCookSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  currentStepKey!: string | null

  @IsInt()
  @Min(0)
  currentStepNum!: number

  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  checkedSteps!: string[]

  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  checkedIngredients!: string[]
}
