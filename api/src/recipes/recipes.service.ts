import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Recipe, RecipeDocument } from './schemas/recipe.schema'

@Injectable()
export class RecipesService {
  constructor(@InjectModel(Recipe.name) private readonly recipeModel: Model<RecipeDocument>) {}

  async findAll(): Promise<RecipeDocument[]> {
    return this.recipeModel.find({ hidden: { $ne: true } }).exec()
  }

  async findBySlug(slug: string): Promise<RecipeDocument | null> {
    return this.recipeModel.findOne({ slug }).exec()
  }
}
