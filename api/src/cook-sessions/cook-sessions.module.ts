import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { CookSession, CookSessionSchema } from './schemas/cook-session.schema'
import { CookSessionsService } from './cook-sessions.service'
import { CookSessionsController } from './cook-sessions.controller'
import { CookLogModule } from '../cook-log/cook-log.module'

@Module({
  imports: [
    MongooseModule.forFeature([{ name: CookSession.name, schema: CookSessionSchema }]),
    CookLogModule,
  ],
  providers: [CookSessionsService],
  controllers: [CookSessionsController],
})
export class CookSessionsModule {}
