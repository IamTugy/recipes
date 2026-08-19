import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import * as webpush from 'web-push'
import { PushSubscription, PushSubscriptionDocument } from './schemas/push-subscription.schema'

export interface PushSubscriptionInput {
  endpoint: string
  keys: { p256dh: string; auth: string }
  deviceLabel?: string
}

@Injectable()
export class PushService {
  private vapidConfigured = false

  constructor(
    @InjectModel(PushSubscription.name) private readonly subscriptionModel: Model<PushSubscriptionDocument>,
    private readonly config: ConfigService,
  ) {}

  // Lazy, like GeminiService's getClient() - configuring VAPID details at
  // construction time would throw in every test that instantiates this
  // service without real keys set. Throwing here instead means a missing
  // key only breaks the one call that actually needs it.
  private ensureVapidConfigured(): void {
    if (this.vapidConfigured) return
    const publicKey = this.getPublicKey()
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY')
    if (!privateKey) throw new Error('VAPID_PRIVATE_KEY is not configured')
    webpush.setVapidDetails(this.config.get<string>('VAPID_SUBJECT') ?? 'mailto:admin@tugy.dev', publicKey, privateKey)
    this.vapidConfigured = true
  }

  getPublicKey(): string {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY')
    if (!publicKey) throw new Error('VAPID_PUBLIC_KEY is not configured')
    return publicKey
  }

  async subscribe(userId: string, input: PushSubscriptionInput): Promise<void> {
    await this.subscriptionModel
      .findOneAndUpdate({ endpoint: input.endpoint }, { ...input, userId }, { upsert: true })
      .exec()
  }

  async unsubscribe(endpoint: string): Promise<void> {
    await this.subscriptionModel.deleteOne({ endpoint }).exec()
  }

  // Sends to every device this user has subscribed - never throws, since
  // the timer sweep must keep processing other due timers even if one
  // user's push happens to fail outright.
  async sendToUser(userId: string, payload: { title: string; body: string }): Promise<void> {
    this.ensureVapidConfigured()
    const subscriptions = await this.subscriptionModel.find({ userId }).exec()
    await Promise.all(subscriptions.map(sub => this.sendOne(sub, payload)))
  }

  private async sendOne(sub: PushSubscriptionDocument, payload: { title: string; body: string }): Promise<void> {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload))
    } catch (err) {
      // 410 Gone means the browser/OS has permanently invalidated this
      // subscription (uninstalled, permission revoked, etc.) - nothing will
      // ever succeed against it again, so it's dead weight to keep retrying.
      // Any other failure (network blip, transient FCM error) is left
      // alone; the next sweep cycle's retry is the recovery path for those.
      if ((err as { statusCode?: number }).statusCode === 410) {
        await this.subscriptionModel.deleteOne({ _id: sub._id }).exec()
      }
    }
  }
}
