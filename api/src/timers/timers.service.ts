import { Injectable, OnModuleInit } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Timer, TimerDocument } from './schemas/timer.schema'
import { PushService } from './push.service'

const SWEEP_INTERVAL_MS = 5000

@Injectable()
export class TimersService implements OnModuleInit {
  constructor(
    @InjectModel(Timer.name) private readonly timerModel: Model<TimerDocument>,
    private readonly pushService: PushService,
  ) {}

  onModuleInit(): void {
    setInterval(() => {
      this.sweepDueTimers().catch(() => { /* transient failure - the next tick retries */ })
    }, SWEEP_INTERVAL_MS)
  }

  async upsert(userId: string, clientId: string, recipeId: string, label: string, endsAt: number): Promise<void> {
    await this.timerModel
      .findOneAndUpdate(
        { userId, clientId },
        { userId, clientId, recipeId, label, endsAt, pushSent: false },
        { upsert: true },
      )
      .exec()
  }

  async remove(userId: string, clientId: string): Promise<void> {
    await this.timerModel.deleteOne({ userId, clientId }).exec()
  }

  // Finds every timer whose endsAt has passed but hasn't been pushed yet,
  // sends one push per timer (not batched per user) so each notification
  // carries that timer's own label, then marks it sent. A few seconds of
  // slack past endsAt is expected and accepted - see the design doc.
  async sweepDueTimers(): Promise<void> {
    const due = await this.timerModel.find({ endsAt: { $lte: Date.now() }, pushSent: false }).exec()
    for (const timer of due) {
      await this.pushService.sendToUser(timer.userId, { title: 'Timer done', body: timer.label })
      await this.timerModel.updateOne({ _id: timer._id }, { $set: { pushSent: true } }).exec()
    }
  }
}
