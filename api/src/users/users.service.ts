import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { User, UserDocument } from './schemas/user.schema'

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly userModel: Model<UserDocument>) {}

  async upsertFromClerk(clerkUserId: string, email: string, name?: string, imageUrl?: string): Promise<UserDocument> {
    return this.userModel
      .findOneAndUpdate(
        { clerkUserId },
        { clerkUserId, email, name, imageUrl },
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

  // Same as namesByIds but also carries the profile picture - used
  // wherever a user's identity is shown prominently (chef profile page,
  // review list) rather than just referenced in passing.
  async profilesByIds(clerkUserIds: string[]): Promise<Record<string, { name?: string; imageUrl?: string }>> {
    const uniqueIds = [...new Set(clerkUserIds)]
    if (uniqueIds.length === 0) return {}
    const users = await this.userModel.find({ clerkUserId: { $in: uniqueIds } }).lean().exec()
    const profiles: Record<string, { name?: string; imageUrl?: string }> = {}
    for (const user of users) profiles[user.clerkUserId] = { name: user.name, imageUrl: user.imageUrl }
    return profiles
  }

  // Powers the "find people to follow" search - matches on name only (email
  // is private) and excludes the searcher so they don't see themselves in
  // their own results.
  async search(query: string, excludeUserId: string): Promise<{ userId: string; name?: string; imageUrl?: string }[]> {
    const trimmed = query.trim()
    if (!trimmed) return []
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const users = await this.userModel
      .find({
        clerkUserId: { $ne: excludeUserId },
        name: { $regex: escaped, $options: 'i' },
      })
      .limit(20)
      .lean()
      .exec()
    return users.map(u => ({ userId: u.clerkUserId, name: u.name, imageUrl: u.imageUrl }))
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
