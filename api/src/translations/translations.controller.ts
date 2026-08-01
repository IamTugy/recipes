import { Body, Controller, Post } from '@nestjs/common'
import { TranslationsService } from './translations.service'
import { TranslateDto } from './dto/translate.dto'

@Controller('translations')
export class TranslationsController {
  constructor(private readonly translationsService: TranslationsService) {}

  @Post()
  async translate(@Body() body: TranslateDto): Promise<{ translated: string }> {
    const translated = await this.translationsService.translate(body.text, body.targetLang)
    return { translated }
  }
}
