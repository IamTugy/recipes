import { IsInt, IsString, Min, MaxLength, MinLength } from 'class-validator'

export class SearchPerformedDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  query!: string

  @IsInt()
  @Min(0)
  resultsCount!: number
}
