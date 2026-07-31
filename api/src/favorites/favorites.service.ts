import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Favorite, FavoriteDocument } from './schemas/favorite.schema'

@Injectable()
export class FavoritesService {
  constructor(@InjectModel(Favorite.name) private readonly favoriteModel: Model<FavoriteDocument>) {}

  async add(userId: string, recipeSlug: string): Promise<void> {
    await this.favoriteModel
      .findOneAndUpdate({ userId, recipeSlug }, { userId, recipeSlug }, { upsert: true })
      .exec()
  }

  async remove(userId: string, recipeSlug: string): Promise<void> {
    await this.favoriteModel.deleteOne({ userId, recipeSlug }).exec()
  }

  async listSlugs(userId: string): Promise<string[]> {
    const favorites = await this.favoriteModel.find({ userId }).exec()
    return favorites.map(f => f.recipeSlug)
  }
}
