import { IsIn, IsString, MaxLength } from 'class-validator'

export class TranslateDto {
  @IsString()
  @MaxLength(5000)
  text!: string

  @IsIn(['he', 'en'])
  targetLang!: 'he' | 'en'
}
