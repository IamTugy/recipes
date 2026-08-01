import { IsString, MinLength } from 'class-validator'

export class AddRecipeDto {
  @IsString()
  @MinLength(1)
  slug!: string
}
