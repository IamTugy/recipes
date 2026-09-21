import { Injectable, Logger } from '@nestjs/common'
import { GeminiService } from '../ai/gemini.service'
import { AiPlanResponse, applyAiPlan, buildPlanPrompt } from './cook-together.plan'
import { CookTogetherTask } from './cook-together.types'

const PLAN_TIMEOUT_MS = 20_000

export interface PlanResult {
  tasks: CookTogetherTask[]
  source: 'ai' | 'fallback'
}

// Turns the recipe's steps into an assignment + time estimates for the people
// in the room. The AI does the smart part (who does what, how long, what can
// run in parallel); every answer is sanitised, and any failure - no API key,
// timeout, malformed output - degrades to a deterministic greedy split, so
// starting a cook-together session can never fail because of the model.
@Injectable()
export class CookTogetherPlanner {
  private readonly logger = new Logger(CookTogetherPlanner.name)

  constructor(private readonly gemini: GeminiService) {}

  async plan(recipeTitle: string, tasks: CookTogetherTask[], participantIds: string[]): Promise<PlanResult> {
    const draft = tasks.map(t => ({ ...t, dependsOn: [...t.dependsOn] }))
    const timers = new Map(draft.filter(t => t.waitMinutes > 0).map(t => [t.id, t.waitMinutes]))

    let ai: AiPlanResponse | null = null
    // With one person there is nothing to split, so don't spend a model call.
    if (participantIds.length > 1) {
      ai = await this.askModel(buildPlanPrompt(recipeTitle, draft, participantIds.length, timers))
    }
    const usedAi = applyAiPlan(draft, ai, participantIds, timers, Date.now())
    return { tasks: draft, source: usedAi ? 'ai' : 'fallback' }
  }

  private async askModel(prompt: string): Promise<AiPlanResponse | null> {
    let timer: NodeJS.Timeout | undefined
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('cook-together plan timed out')), PLAN_TIMEOUT_MS)
      })
      return await Promise.race([this.gemini.generateStructured<AiPlanResponse>(prompt, 0.2), timeout])
    } catch (err) {
      this.logger.warn(`AI plan unavailable, using greedy split: ${err instanceof Error ? err.message : err}`)
      return null
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
}
