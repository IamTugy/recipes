import { IsInt, IsString, Min, MinLength } from 'class-validator'

export class SearchPerformedDto {
  @IsString()
  @MinLength(1)
  query!: string

  @IsInt()
  @Min(0)
  resultsCount!: number
}
