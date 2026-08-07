import { Body, Controller, Delete, Get, Param, Put, Req } from '@nestjs/common'
import { Request } from 'express'
import { NotesService } from './notes.service'
import { SaveNoteDto } from './dto/save-note.dto'

@Controller('notes')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get(':id')
  async get(@Param('id') id: string, @Req() req: Request & { userId: string }) {
    const text = await this.notesService.get(req.userId, id)
    return { text }
  }

  @Put(':id')
  async save(
    @Param('id') id: string,
    @Body() body: SaveNoteDto,
    @Req() req: Request & { userId: string },
  ) {
    await this.notesService.save(req.userId, id, body.text)
    return { text: body.text }
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: Request & { userId: string }) {
    await this.notesService.remove(req.userId, id)
    return { text: null }
  }
}
