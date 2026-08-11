import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type DishGroupDocument = DishGroup & Document

@Schema({ timestamps: true })
export class DishGroup {
  @Prop({ required: true })
  name!: string // English canonical dish name, e.g. "Caprese Salad"

  @Prop()
  nameHe?: string // Hebrew canonical dish name
}

export const DishGroupSchema = SchemaFactory.createForClass(DishGroup)
