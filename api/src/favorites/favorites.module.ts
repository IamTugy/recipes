import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Favorite, FavoriteSchema } from './schemas/favorite.schema'
import { FavoritesService } from './favorites.service'
import { FavoritesController } from './favorites.controller'
import { ActivityLogModule } from '../activity-log/activity-log.module'

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Favorite.name, schema: FavoriteSchema }]),
    ActivityLogModule,
  ],
  providers: [FavoritesService],
  controllers: [FavoritesController],
})
export class FavoritesModule {}
