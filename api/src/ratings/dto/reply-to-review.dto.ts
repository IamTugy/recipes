import { IsOptional, IsString, MaxLength } from 'class-validator'

export class ReplyToReviewDto {
  @IsString()
  @MaxLength(500)
  text!: string

  @IsOptional()
  @IsString()
  mentionedUserId?: string
}
