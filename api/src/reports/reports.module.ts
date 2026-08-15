import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Report, ReportSchema } from './schemas/report.schema'
import { ReportsService } from './reports.service'
import { ReportsController } from './reports.controller'

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Report.name, schema: ReportSchema }]),
  ],
  providers: [ReportsService],
  controllers: [ReportsController],
  exports: [ReportsService],
})
export class ReportsModule {}
