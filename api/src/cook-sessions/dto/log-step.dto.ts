import { ArrayMaxSize, IsArray, IsInt, IsString, MaxLength, Min } from 'class-validator'

export class LogStepDto {
  @IsString()
  @MaxLength(64)
  stepKey!: string

  @IsInt()
  @Min(0)
  stepNum!: number

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
