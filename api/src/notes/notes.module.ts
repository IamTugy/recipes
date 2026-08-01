import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Note, NoteSchema } from './schemas/note.schema'
import { NotesService } from './notes.service'
import { NotesController } from './notes.controller'

@Module({
  imports: [MongooseModule.forFeature([{ name: Note.name, schema: NoteSchema }])],
  providers: [NotesService],
  controllers: [NotesController],
})
export class NotesModule {}
