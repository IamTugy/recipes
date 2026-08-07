import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator'

export class EnhancePhotoDto {
  @IsString()
  @MinLength(1)
  recipeId!: string

  @IsUrl({ require_tld: false })
  imageUrl!: string

  @IsString()
  @IsOptional()
  @MaxLength(300)
  instructions?: string
}
