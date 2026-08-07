import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Collection, CollectionDocument } from './schemas/collection.schema'

@Injectable()
export class CollectionsService {
  constructor(@InjectModel(Collection.name) private readonly collectionModel: Model<CollectionDocument>) {}

  async listForUser(userId: string): Promise<CollectionDocument[]> {
    return this.collectionModel.find({ userId }).sort({ createdAt: -1 }).exec()
  }

  async create(userId: string, name: string): Promise<CollectionDocument> {
    return this.collectionModel.create({ userId, name, recipeIds: [] })
  }

  async rename(userId: string, id: string, name: string): Promise<CollectionDocument | null> {
    return this.collectionModel.findOneAndUpdate({ _id: id, userId }, { name }, { new: true }).exec()
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.collectionModel.deleteOne({ _id: id, userId }).exec()
  }

  async addRecipe(userId: string, id: string, recipeId: string): Promise<CollectionDocument | null> {
    return this.collectionModel
      .findOneAndUpdate({ _id: id, userId }, { $addToSet: { recipeIds: recipeId } }, { new: true })
      .exec()
  }

  async removeRecipe(userId: string, id: string, recipeId: string): Promise<CollectionDocument | null> {
    return this.collectionModel
      .findOneAndUpdate({ _id: id, userId }, { $pull: { recipeIds: recipeId } }, { new: true })
      .exec()
  }
}
