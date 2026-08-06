import { IsString, MaxLength, MinLength } from 'class-validator'

export class UpdateFeatureRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  description!: string
}
