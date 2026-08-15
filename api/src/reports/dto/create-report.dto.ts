import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator'
import type { ReportReason } from '../schemas/report.schema'

export class CreateReportDto {
  @IsIn(['inappropriate', 'incorrect', 'spam', 'copyright', 'other'])
  reason!: ReportReason

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  message?: string
}
