import { Module } from '@nestjs/common'
import { AiModule } from '../ai/ai.module'
import { UploadsService } from './uploads.service'
import { UploadsController } from './uploads.controller'

@Module({
  imports: [AiModule],
  providers: [UploadsService],
  controllers: [UploadsController],
})
export class UploadsModule {}
