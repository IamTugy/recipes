import { IsString, MaxLength } from 'class-validator'

export class CreateCookTogetherDto {
  @IsString()
  @MaxLength(64)
  recipeId!: string
}
