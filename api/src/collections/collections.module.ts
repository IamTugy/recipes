import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Collection, CollectionSchema } from './schemas/collection.schema'
import { CollectionsService } from './collections.service'
import { CollectionsController } from './collections.controller'

@Module({
  imports: [MongooseModule.forFeature([{ name: Collection.name, schema: CollectionSchema }])],
  providers: [CollectionsService],
  controllers: [CollectionsController],
})
export class CollectionsModule {}
