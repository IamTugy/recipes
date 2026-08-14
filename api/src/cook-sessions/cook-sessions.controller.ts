import { Body, Controller, Delete, Param, Post, Req } from '@nestjs/common'
import { Request } from 'express'
import { CookSessionsService } from './cook-sessions.service'

interface LogStepBody {
  stepKey: string
  stepNum: number
}

@Controller('cook-sessions')
export class CookSessionsController {
  constructor(private readonly cookSessionsService: CookSessionsService) {}

  @Post(':recipeId')
  async start(@Param('recipeId') recipeId: string, @Req() req: Request & { userId: string }) {
    const sessionId = await this.cookSessionsService.startSession(req.userId, recipeId)
    return { sessionId }
  }

  @Post(':sessionId/steps')
  async logStep(@Param('sessionId') sessionId: string, @Body() body: LogStepBody) {
    await this.cookSessionsService.logStep(sessionId, body.stepKey, body.stepNum)
    return { ok: true }
  }

  @Post(':sessionId/finish')
  async finish(@Param('sessionId') sessionId: string) {
    await this.cookSessionsService.finishSession(sessionId)
    return { ok: true }
  }

  @Delete(':sessionId')
  async abandon(@Param('sessionId') sessionId: string) {
    await this.cookSessionsService.abandonSession(sessionId)
    return { ok: true }
  }
}
