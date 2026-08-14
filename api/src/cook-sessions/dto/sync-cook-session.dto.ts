import { IsArray, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator'

export class SyncCookSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  currentStepKey!: string | null

  @IsInt()
  @Min(0)
  currentStepNum!: number

  @IsArray()
  @IsString({ each: true })
  checkedSteps!: string[]

  @IsArray()
  @IsString({ each: true })
  checkedIngredients!: string[]
}
