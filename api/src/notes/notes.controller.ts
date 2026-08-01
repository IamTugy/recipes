import { Body, Controller, Delete, Get, Param, Put, Req } from '@nestjs/common'
import { Request } from 'express'
import { NotesService } from './notes.service'
import { SaveNoteDto } from './dto/save-note.dto'

@Controller('notes')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get(':slug')
  async get(@Param('slug') slug: string, @Req() req: Request & { userId: string }) {
    const text = await this.notesService.get(req.userId, slug)
    return { text }
  }

  @Put(':slug')
  async save(
    @Param('slug') slug: string,
    @Body() body: SaveNoteDto,
    @Req() req: Request & { userId: string },
  ) {
    await this.notesService.save(req.userId, slug, body.text)
    return { text: body.text }
  }

  @Delete(':slug')
  async remove(@Param('slug') slug: string, @Req() req: Request & { userId: string }) {
    await this.notesService.remove(req.userId, slug)
    return { text: null }
  }
}
