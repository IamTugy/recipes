import { Controller, Get, Post, Delete, Param, Req } from '@nestjs/common'
import { Request } from 'express'
import { FollowsService } from './follows.service'
import { ActivityLogService } from '../activity-log/activity-log.service'

@Controller('follows')
export class FollowsController {
  constructor(
    private readonly followsService: FollowsService,
    private readonly activityLog: ActivityLogService,
  ) {}

  @Get()
  async list(@Req() req: Request & { userId: string }) {
    return this.followsService.followingIds(req.userId)
  }

  @Get(':userId/status')
  async status(@Param('userId') userId: string, @Req() req: Request & { userId: string }) {
    const [following, followerCount] = await Promise.all([
      this.followsService.isFollowing(req.userId, userId),
      this.followsService.followerCount(userId),
    ])
    return { following, followerCount }
  }

  @Post(':userId')
  async follow(@Param('userId') userId: string, @Req() req: Request & { userId: string }) {
    await this.followsService.follow(req.userId, userId)
    await this.activityLog.record(req.userId, undefined, 'chef_followed', { chefUserId: userId })
    return { following: true }
  }

  @Delete(':userId')
  async unfollow(@Param('userId') userId: string, @Req() req: Request & { userId: string }) {
    await this.followsService.unfollow(req.userId, userId)
    await this.activityLog.record(req.userId, undefined, 'chef_unfollowed', { chefUserId: userId })
    return { following: false }
  }
}
