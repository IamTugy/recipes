import { IsIn, IsOptional } from 'class-validator'

const LANGS = ['he', 'en']
const THEMES = ['light', 'dark', 'system']

export class UpdatePreferencesDto {
  @IsIn(LANGS)
  @IsOptional()
  lang?: 'he' | 'en'

  @IsIn(THEMES)
  @IsOptional()
  theme?: 'light' | 'dark' | 'system'
}
