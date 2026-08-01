import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator'

export class RateRecipeDto {
  @IsInt()
  @Min(1)
  @Max(5)
  score!: number

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string

  @IsOptional()
  @IsString()
  @Matches(/^https:\/\/recipes-assets\.tugy\.dev\/reviews\//, {
    message: 'photoUrl must point to an uploaded review photo',
  })
  photoUrl?: string
}
