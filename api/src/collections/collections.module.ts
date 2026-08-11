import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Collection, CollectionSchema } from './schemas/collection.schema'
import { CollectionsService } from './collections.service'
import { CollectionsController } from './collections.controller'
import { ActivityLogModule } from '../activity-log/activity-log.module'

@Module({
  imports: [MongooseModule.forFeature([{ name: Collection.name, schema: CollectionSchema }]), ActivityLogModule],
  providers: [CollectionsService],
  controllers: [CollectionsController],
})
export class CollectionsModule {}
