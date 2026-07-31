import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { User, UserDocument } from './schemas/user.schema'

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly userModel: Model<UserDocument>) {}

  async upsertFromClerk(clerkUserId: string, email: string, name?: string): Promise<UserDocument> {
    return this.userModel
      .findOneAndUpdate(
        { clerkUserId },
        { clerkUserId, email, name },
        { upsert: true, new: true },
      )
      .exec()
  }
}
