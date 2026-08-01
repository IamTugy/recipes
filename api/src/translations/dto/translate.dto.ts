import { IsIn, IsString, MaxLength } from 'class-validator'

export class TranslateDto {
  @IsString()
  @MaxLength(500)
  text!: string

  @IsIn(['he', 'en'])
  targetLang!: 'he' | 'en'
}
