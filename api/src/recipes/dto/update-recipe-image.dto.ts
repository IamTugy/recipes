import { IsString, MinLength } from 'class-validator'

export class UpdateRecipeImageDto {
  @IsString()
  @MinLength(1)
  image!: string
}
