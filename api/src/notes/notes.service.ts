import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Note, NoteDocument } from './schemas/note.schema'

@Injectable()
export class NotesService {
  constructor(@InjectModel(Note.name) private readonly noteModel: Model<NoteDocument>) {}

  async get(userId: string, recipeId: string): Promise<string | null> {
    const note = await this.noteModel.findOne({ userId, recipeId }).exec()
    return note?.text ?? null
  }

  async save(userId: string, recipeId: string, text: string): Promise<void> {
    await this.noteModel
      .findOneAndUpdate({ userId, recipeId }, { userId, recipeId, text }, { upsert: true })
      .exec()
  }

  async remove(userId: string, recipeId: string): Promise<void> {
    await this.noteModel.deleteOne({ userId, recipeId }).exec()
  }
}
