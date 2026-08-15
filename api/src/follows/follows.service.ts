import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Follow, FollowDocument } from './schemas/follow.schema'
import { NotificationsService } from '../notifications/notifications.service'

@Injectable()
export class FollowsService {
  constructor(
    @InjectModel(Follow.name) private readonly followModel: Model<FollowDocument>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async follow(followerId: string, followingId: string): Promise<void> {
    if (followerId === followingId) {
      throw new BadRequestException('Cannot follow yourself')
    }
    await this.followModel
      .findOneAndUpdate({ followerId, followingId }, { followerId, followingId }, { upsert: true })
      .exec()
    await this.notificationsService.create(followingId, 'new_follower', followerId)
  }

  async unfollow(followerId: string, followingId: string): Promise<void> {
    await this.followModel.deleteOne({ followerId, followingId }).exec()
  }

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const doc = await this.followModel.exists({ followerId, followingId })
    return !!doc
  }

  async followerCount(followingId: string): Promise<number> {
    return this.followModel.countDocuments({ followingId }).exec()
  }

  async followingIds(followerId: string): Promise<string[]> {
    const follows = await this.followModel.find({ followerId }).exec()
    return follows.map(f => f.followingId)
  }
}
