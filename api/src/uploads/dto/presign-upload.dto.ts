import { IsIn, IsString, MinLength } from 'class-validator'

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export class PresignUploadDto {
  @IsString()
  @MinLength(1)
  recipeSlug!: string

  @IsIn(ALLOWED_CONTENT_TYPES)
  contentType!: string
}
