import { IsString, MinLength } from 'class-validator'

export class RejectSubmissionDto {
  @IsString()
  @MinLength(1)
  comment!: string
}
