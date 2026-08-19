import { Body, Controller, Get, Post, Req } from '@nestjs/common'
import { Request } from 'express'
import { PushService, PushSubscriptionInput } from './push.service'

@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Get('vapid-public-key')
  vapidPublicKey() {
    return { publicKey: this.pushService.getPublicKey() }
  }

  @Post('subscribe')
  async subscribe(@Body() body: PushSubscriptionInput, @Req() req: Request & { userId: string }) {
    await this.pushService.subscribe(req.userId, body)
    return { ok: true }
  }

  @Post('unsubscribe')
  async unsubscribe(@Body() body: { endpoint: string }) {
    await this.pushService.unsubscribe(body.endpoint)
    return { ok: true }
  }
}
