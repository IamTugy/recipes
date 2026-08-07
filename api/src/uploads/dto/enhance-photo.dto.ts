import { IsString, IsUrl, MinLength } from 'class-validator'

export class EnhancePhotoDto {
  @IsString()
  @MinLength(1)
  recipeSlug!: string

  @IsUrl({ require_tld: false })
  imageUrl!: string
}
