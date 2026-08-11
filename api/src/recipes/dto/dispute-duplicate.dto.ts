import { IsOptional, IsString } from 'class-validator'

export class DisputeDuplicateDto {
  @IsString()
  @IsOptional()
  message?: string
}
