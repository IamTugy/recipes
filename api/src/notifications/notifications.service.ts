import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Notification, NotificationDocument, NotificationType } from './schemas/notification.schema'

const LIST_CAP = 50

@Injectable()
export class NotificationsService {
  constructor(@InjectModel(Notification.name) private readonly notificationModel: Model<NotificationDocument>) {}

  async create(userId: string, type: NotificationType, actorId: string, recipeId?: string): Promise<void> {
    // One live notification per (recipient, type, actor[, recipe]) is
    // enough, refreshed (unread again) on each new trigger, rather than
    // piling up duplicates - e.g. re-following the same person, or
    // re-rating the same recipe, just refreshes the existing notification.
    // recipeId is part of the key so rating two different recipes owned
    // by the same person produces two separate notifications, not one.
    const key = recipeId ? { userId, type, actorId, recipeId } : { userId, type, actorId }
    await this.notificationModel
      .findOneAndUpdate(key, { ...key, read: false }, { upsert: true })
      .exec()
  }

  async listForUser(userId: string): Promise<NotificationDocument[]> {
    return this.notificationModel.find({ userId }).sort({ updatedAt: -1 }).limit(LIST_CAP).exec()
  }

  async unreadCount(userId: string): Promise<number> {
    return this.notificationModel.countDocuments({ userId, read: false }).exec()
  }

  async markRead(userId: string, id: string): Promise<void> {
    await this.notificationModel.updateOne({ _id: id, userId }, { $set: { read: true } }).exec()
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notificationModel.updateMany({ userId, read: false }, { $set: { read: true } }).exec()
  }
}
