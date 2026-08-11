import { Injectable } from '@nestjs/common'
import { ActivityLogService } from '../activity-log/activity-log.service'
import { UsersService } from '../users/users.service'
import { POINTS_BY_ACTION, RANKING_BONUS_RULES } from './ranking.constants'

export interface LeaderboardEntry {
  userId: string
  name: string | null
  points: number
  rank: number
}

@Injectable()
export class RankingService {
  constructor(
    private readonly activityLogService: ActivityLogService,
    private readonly usersService: UsersService,
  ) {}

  async pointsForUser(userId: string): Promise<number> {
    const points = await this.activityLogService.pointsByUser(POINTS_BY_ACTION, RANKING_BONUS_RULES, {
      userIds: [userId],
    })
    return points.get(userId) ?? 0
  }

  async leaderboard(limit = 20): Promise<LeaderboardEntry[]> {
    const points = await this.activityLogService.pointsByUser(POINTS_BY_ACTION, RANKING_BONUS_RULES, { limit })
    const userIds = [...points.keys()]
    const names = await this.usersService.namesByIds(userIds)

    return userIds.map((userId, index) => ({
      userId,
      name: names[userId] ?? null,
      points: points.get(userId) ?? 0,
      rank: index + 1,
    }))
  }
}
