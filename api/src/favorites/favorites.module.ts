import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Favorite, FavoriteSchema } from './schemas/favorite.schema'

@Module({
  imports: [MongooseModule.forFeature([{ name: Favorite.name, schema: FavoriteSchema }])],
})
export class FavoritesModule {}
