import { Controller, Get, Param, Patch, Post, Req } from '@nestjs/common'
import { Request } from 'express'
import { NotificationsService } from './notifications.service'
import { UsersService } from '../users/users.service'

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
  ) {}

  @Get()
  async list(@Req() req: Request & { userId: string }) {
    const notifications = await this.notificationsService.listForUser(req.userId)
    const profiles = await this.usersService.profilesByIds(notifications.map(n => n.actorId))
    return notifications.map(n => ({
      id: String(n._id),
      type: n.type,
      actorId: n.actorId,
      actorName: profiles[n.actorId]?.name ?? null,
      actorImageUrl: profiles[n.actorId]?.imageUrl ?? null,
      read: n.read,
      createdAt: (n as unknown as { createdAt: Date }).createdAt,
    }))
  }

  @Get('unread-count')
  async unreadCount(@Req() req: Request & { userId: string }) {
    const count = await this.notificationsService.unreadCount(req.userId)
    return { count }
  }

  @Patch(':id/read')
  async markRead(@Param('id') id: string, @Req() req: Request & { userId: string }) {
    await this.notificationsService.markRead(req.userId, id)
    return { read: true }
  }

  @Post('read-all')
  async markAllRead(@Req() req: Request & { userId: string }) {
    await this.notificationsService.markAllRead(req.userId)
    return { read: true }
  }
}
