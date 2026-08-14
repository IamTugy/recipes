import { IsInt, IsString, MaxLength, Min } from 'class-validator'

export class LogStepDto {
  @IsString()
  @MaxLength(64)
  stepKey!: string

  @IsInt()
  @Min(0)
  stepNum!: number
}
