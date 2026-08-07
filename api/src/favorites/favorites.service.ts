import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Favorite, FavoriteDocument } from './schemas/favorite.schema'

@Injectable()
export class FavoritesService {
  constructor(@InjectModel(Favorite.name) private readonly favoriteModel: Model<FavoriteDocument>) {}

  async add(userId: string, recipeId: string): Promise<void> {
    await this.favoriteModel
      .findOneAndUpdate({ userId, recipeId }, { userId, recipeId }, { upsert: true })
      .exec()
  }

  async remove(userId: string, recipeId: string): Promise<void> {
    await this.favoriteModel.deleteOne({ userId, recipeId }).exec()
  }

  async listIds(userId: string): Promise<string[]> {
    const favorites = await this.favoriteModel.find({ userId }).exec()
    return favorites.map(f => f.recipeId)
  }
}
