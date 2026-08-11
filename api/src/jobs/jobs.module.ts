import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Job, JobSchema } from './schemas/job.schema'
import { JobsService } from './jobs.service'
import { JobsController } from './jobs.controller'

@Module({
  imports: [MongooseModule.forFeature([{ name: Job.name, schema: JobSchema }])],
  providers: [JobsService],
  controllers: [JobsController],
  exports: [JobsService],
})
export class JobsModule {}
