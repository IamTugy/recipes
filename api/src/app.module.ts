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
import { CookLogModule } from './cook-log/cook-log.module'
import { CookSessionsModule } from './cook-sessions/cook-sessions.module'
import { CookHistoryModule } from './cook-history/cook-history.module'
import { MealPlanModule } from './meal-plan/meal-plan.module'
import { ShareModule } from './share/share.module'
import { RankingModule } from './ranking/ranking.module'
import { JobsModule } from './jobs/jobs.module'
import { FollowsModule } from './follows/follows.module'
import { ReportsModule } from './reports/reports.module'

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
    CookLogModule,
    CookSessionsModule,
    CookHistoryModule,
    MealPlanModule,
    ShareModule,
    RankingModule,
    JobsModule,
    FollowsModule,
    ReportsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
