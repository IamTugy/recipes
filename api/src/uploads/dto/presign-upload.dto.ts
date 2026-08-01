import { IsIn, IsOptional, IsString, MinLength } from 'class-validator'

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const PURPOSES = ['review', 'recipe']

export class PresignUploadDto {
  @IsString()
  @MinLength(1)
  recipeSlug!: string

  @IsIn(ALLOWED_CONTENT_TYPES)
  contentType!: string

  @IsIn(PURPOSES)
  @IsOptional()
  purpose?: 'review' | 'recipe'
}
