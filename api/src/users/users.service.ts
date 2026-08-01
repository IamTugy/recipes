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

  async namesByIds(clerkUserIds: string[]): Promise<Record<string, string | undefined>> {
    const uniqueIds = [...new Set(clerkUserIds)]
    if (uniqueIds.length === 0) return {}
    const users = await this.userModel.find({ clerkUserId: { $in: uniqueIds } }).lean().exec()
    const names: Record<string, string | undefined> = {}
    for (const user of users) names[user.clerkUserId] = user.name
    return names
  }
}
