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

  async getPreferences(clerkUserId: string): Promise<{ lang?: 'he' | 'en'; theme?: 'light' | 'dark' | 'system' }> {
    const user = await this.userModel.findOne({ clerkUserId }).select('lang theme').lean().exec()
    return { lang: user?.lang, theme: user?.theme }
  }

  async setPreferences(
    clerkUserId: string,
    prefs: { lang?: 'he' | 'en'; theme?: 'light' | 'dark' | 'system' },
  ): Promise<{ lang?: 'he' | 'en'; theme?: 'light' | 'dark' | 'system' }> {
    const update: Record<string, unknown> = {}
    if (prefs.lang !== undefined) update.lang = prefs.lang
    if (prefs.theme !== undefined) update.theme = prefs.theme
    const user = await this.userModel
      .findOneAndUpdate({ clerkUserId }, { $set: update }, { new: true, upsert: false })
      .select('lang theme')
      .lean()
      .exec()
    return { lang: user?.lang, theme: user?.theme }
  }
}
