import { Module } from '@nestjs/common'
import { CookTogetherService } from './cook-together.service'
import { CookTogetherPlanner } from './cook-together-planner.service'
import { CookTogetherController } from './cook-together.controller'
import { ActivityLogModule } from '../activity-log/activity-log.module'
import { AiModule } from '../ai/ai.module'
import { CookLogModule } from '../cook-log/cook-log.module'
import { RecipesModule } from '../recipes/recipes.module'
import { UsersModule } from '../users/users.module'

@Module({
  imports: [ActivityLogModule, AiModule, CookLogModule, RecipesModule, UsersModule],
  providers: [CookTogetherService, CookTogetherPlanner],
  controllers: [CookTogetherController],
})
export class CookTogetherModule {}
