import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { CookLog, CookLogSchema } from './schemas/cook-log.schema'
import { CookLogService } from './cook-log.service'
import { CookLogController } from './cook-log.controller'

@Module({
  imports: [MongooseModule.forFeature([{ name: CookLog.name, schema: CookLogSchema }])],
  providers: [CookLogService],
  controllers: [CookLogController],
  exports: [CookLogService],
})
export class CookLogModule {}
