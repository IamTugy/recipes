import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Note, NoteDocument } from './schemas/note.schema'

@Injectable()
export class NotesService {
  constructor(@InjectModel(Note.name) private readonly noteModel: Model<NoteDocument>) {}

  async get(userId: string, recipeSlug: string): Promise<string | null> {
    const note = await this.noteModel.findOne({ userId, recipeSlug }).exec()
    return note?.text ?? null
  }

  async save(userId: string, recipeSlug: string, text: string): Promise<void> {
    await this.noteModel
      .findOneAndUpdate({ userId, recipeSlug }, { userId, recipeSlug, text }, { upsert: true })
      .exec()
  }

  async remove(userId: string, recipeSlug: string): Promise<void> {
    await this.noteModel.deleteOne({ userId, recipeSlug }).exec()
  }
}
