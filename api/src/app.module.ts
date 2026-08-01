import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { HealthController } from './health/health.controller'
import { MongoModule } from './mongo/mongo.module'
import { RedisModule } from './redis/redis.module'
import { AuthModule } from './auth/auth.module'
import { RecipesModule } from './recipes/recipes.module'
import { FavoritesModule } from './favorites/favorites.module'
import { RatingsModule } from './ratings/ratings.module'
import { NotesModule } from './notes/notes.module'
import { CollectionsModule } from './collections/collections.module'
import { UploadsModule } from './uploads/uploads.module'
import { FeatureRequestsModule } from './feature-requests/feature-requests.module'
import { TranslationsModule } from './translations/translations.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    MongoModule,
    RedisModule,
    AuthModule,
    RecipesModule,
    FavoritesModule,
    RatingsModule,
    NotesModule,
    CollectionsModule,
    UploadsModule,
    FeatureRequestsModule,
    TranslationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
