import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { CookSession, CookSessionSchema } from './schemas/cook-session.schema'
import { CookSessionsService } from './cook-sessions.service'
import { CookSessionsController } from './cook-sessions.controller'

@Module({
  imports: [MongooseModule.forFeature([{ name: CookSession.name, schema: CookSessionSchema }])],
  providers: [CookSessionsService],
  controllers: [CookSessionsController],
})
export class CookSessionsModule {}
