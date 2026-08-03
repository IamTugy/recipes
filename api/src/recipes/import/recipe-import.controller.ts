import { Body, Controller, Post, BadRequestException, UploadedFile, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { RecipeImportService } from './recipe-import.service'

@Controller('recipes/import')
export class RecipeImportController {
  constructor(private readonly importService: RecipeImportService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async import(@Body() body: { text?: string; url?: string }, @UploadedFile() file?: Express.Multer.File) {
    const sourcesProvided = [body.text, body.url, file].filter(Boolean).length
    if (sourcesProvided === 0) {
      throw new BadRequestException('Provide text, a URL, or a file')
    }
    if (sourcesProvided > 1) {
      throw new BadRequestException('Provide only one of text, a URL, or a file')
    }

    if (body.text) return this.importService.importFromText(body.text)
    if (body.url) return this.importService.importFromUrl(body.url)
    return this.importService.importFromFile(file!.buffer, file!.mimetype)
  }
}
