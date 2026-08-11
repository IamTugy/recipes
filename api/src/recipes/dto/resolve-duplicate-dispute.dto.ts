import { IsBoolean } from 'class-validator'

export class ResolveDuplicateDisputeDto {
  @IsBoolean()
  approve!: boolean
}
