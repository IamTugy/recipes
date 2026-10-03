import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common'
import { Request } from 'express'
import { CookTogetherMutation, CookTogetherService } from './cook-together.service'
import { CreateCookTogetherDto } from './dto/create-cook-together.dto'
import { ActivityLogService } from '../activity-log/activity-log.service'

type AuthedRequest = Request & { userId: string }

@Controller('cook-together')
export class CookTogetherController {
  constructor(
    private readonly cookTogetherService: CookTogetherService,
    private readonly activityLog: ActivityLogService,
  ) {}

  @Get('current')
  async getCurrent(@Req() req: AuthedRequest) {
    return this.cookTogetherService.getCurrent(req.userId)
  }

  @Post()
  async create(@Body() body: CreateCookTogetherDto, @Req() req: AuthedRequest) {
    const view = await this.cookTogetherService.create(req.userId, body.recipeId)
    await this.activityLog.record(req.userId, body.recipeId, 'cook_together_created')
    return view
  }

  @Get(':code')
  async get(@Param('code') code: string, @Req() req: AuthedRequest) {
    return this.cookTogetherService.getRoom(code, req.userId)
  }

  @Post(':code/join')
  async join(@Param('code') code: string, @Req() req: AuthedRequest) {
    const view = await this.cookTogetherService.join(code, req.userId)
    await this.activityLog.record(req.userId, view.recipeId, 'cook_together_joined', {
      participants: view.participants.length,
    })
    return view
  }

  @Post(':code/leave')
  async leave(@Param('code') code: string, @Req() req: AuthedRequest) {
    await this.cookTogetherService.leave(code, req.userId)
    await this.activityLog.record(req.userId, undefined, 'cook_together_left')
    return { ok: true }
  }

  @Post(':code/start')
  async start(@Param('code') code: string, @Req() req: AuthedRequest) {
    const view = await this.cookTogetherService.start(code, req.userId)
    await this.activityLog.record(req.userId, view.recipeId, 'cook_together_started', {
      participants: view.participants.length,
      planSource: view.planSource,
      steps: view.tasks.length,
    })
    return view
  }

  @Post(':code/resplit')
  async resplit(@Param('code') code: string, @Req() req: AuthedRequest) {
    const view = await this.cookTogetherService.resplit(code, req.userId)
    await this.activityLog.record(req.userId, view.recipeId, 'cook_together_resplit')
    return view
  }

  @Post(':code/tasks/:taskId/claim')
  async claimTask(@Param('code') code: string, @Param('taskId') taskId: string, @Req() req: AuthedRequest) {
    const view = await this.cookTogetherService.claimTask(code, req.userId, taskId)
    await this.activityLog.record(req.userId, view.recipeId, 'cook_together_task_claimed', { taskId })
    return view
  }

  @Post(':code/tasks/:taskId/start')
  async startTask(@Param('code') code: string, @Param('taskId') taskId: string, @Req() req: AuthedRequest) {
    const view = await this.cookTogetherService.startTask(code, req.userId, taskId)
    await this.activityLog.record(req.userId, view.recipeId, 'cook_together_task_started', { taskId })
    return view
  }

  @Post(':code/tasks/:taskId/complete')
  async completeTask(@Param('code') code: string, @Param('taskId') taskId: string, @Req() req: AuthedRequest) {
    const result = await this.cookTogetherService.completeTask(code, req.userId, taskId)
    await this.activityLog.record(req.userId, result.view.recipeId, 'cook_together_task_completed', { taskId })
    await this.logFinished(result)
    return result.view
  }

  @Post(':code/tasks/:taskId/reopen')
  async reopenTask(@Param('code') code: string, @Param('taskId') taskId: string, @Req() req: AuthedRequest) {
    const view = await this.cookTogetherService.reopenTask(code, req.userId, taskId)
    await this.activityLog.record(req.userId, view.recipeId, 'cook_together_task_reopened', { taskId })
    return view
  }

  @Post(':code/finish')
  async finish(@Param('code') code: string, @Req() req: AuthedRequest) {
    const result = await this.cookTogetherService.finish(code, req.userId)
    await this.logFinished(result)
    return result.view
  }

  @Delete(':code')
  async cancel(@Param('code') code: string, @Req() req: AuthedRequest) {
    await this.cookTogetherService.cancel(code, req.userId)
    await this.activityLog.record(req.userId, undefined, 'cook_together_cancelled')
    return { ok: true }
  }

  // Finishing is a moment that belongs to everyone in the room, not just the
  // person whose tap happened to complete the last step.
  private async logFinished({ finished }: CookTogetherMutation): Promise<void> {
    if (!finished) return
    await Promise.all(finished.participantIds.map(userId =>
      this.activityLog.record(userId, finished.recipeId, 'cook_together_finished', {
        participants: finished.participantIds.length,
        durationMinutes: finished.durationMinutes,
      }),
    ))
  }
}
