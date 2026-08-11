import { Body, Controller, Delete, Get, Param, Post, Put, Req } from '@nestjs/common'
import { Request } from 'express'
import { RatingsService } from './ratings.service'
import { ReviewRepliesService } from './review-replies.service'
import { UsersService } from '../users/users.service'
import { ActivityLogService } from '../activity-log/activity-log.service'
import { RateRecipeDto } from './dto/rate-recipe.dto'
import { ReplyToReviewDto } from './dto/reply-to-review.dto'

@Controller('ratings')
export class RatingsController {
  constructor(
    private readonly ratingsService: RatingsService,
    private readonly reviewRepliesService: ReviewRepliesService,
    private readonly usersService: UsersService,
    private readonly activityLog: ActivityLogService,
  ) {}

  @Get(':id/mine')
  async mine(@Param('id') id: string, @Req() req: Request & { userId: string }) {
    return this.ratingsService.myRating(req.userId, id)
  }

  @Get(':id/reviews')
  async reviews(@Param('id') id: string, @Req() req: Request & { userId: string }) {
    const reviews = await this.ratingsService.reviewsForRecipe(id)
    const [replyCounts, profiles] = await Promise.all([
      this.reviewRepliesService.countsByRatingIds(reviews.map(r => r.id)),
      this.usersService.profilesByIds(reviews.map(r => r.userId)),
    ])
    return reviews.map(r => ({
      ...r,
      userName: profiles[r.userId]?.name ?? null,
      userImageUrl: profiles[r.userId]?.imageUrl ?? null,
      upvoteCount: r.upvotes.length,
      upvotedByMe: r.upvotes.includes(req.userId),
      replyCount: replyCounts[r.id] ?? 0,
    }))
  }

  @Get(':id/distribution')
  async distribution(@Param('id') id: string) {
    return this.ratingsService.distributionForRecipe(id)
  }

  @Put(':id')
  async rate(
    @Param('id') id: string,
    @Body() body: RateRecipeDto,
    @Req() req: Request & { userId: string },
  ) {
    const result = await this.ratingsService.rate(req.userId, id, body.score, body.comment, body.photoUrl)
    await this.activityLog.record(req.userId, id, 'rating_given', { score: body.score, hasPhoto: !!body.photoUrl })
    return result
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: Request & { userId: string }) {
    await this.ratingsService.deleteRating(req.userId, id)
    await this.activityLog.record(req.userId, id, 'rating_removed')
    return { deleted: true }
  }

  @Post(':id/:ratingId/upvote')
  async upvoteReview(
    @Param('ratingId') ratingId: string,
    @Req() req: Request & { userId: string },
  ) {
    return this.ratingsService.toggleUpvote(req.userId, ratingId)
  }

  @Get(':id/:ratingId/replies')
  async listReplies(@Param('ratingId') ratingId: string, @Req() req: Request & { userId: string }) {
    const replies = await this.reviewRepliesService.listByRating(ratingId)
    const profiles = await this.usersService.profilesByIds(replies.map(r => r.userId))
    return replies.map(r => ({
      id: String(r._id),
      userId: r.userId,
      userName: profiles[r.userId]?.name ?? null,
      userImageUrl: profiles[r.userId]?.imageUrl ?? null,
      text: r.text,
      mentionedUserId: r.mentionedUserId ?? null,
      mentionedName: r.mentionedName ?? null,
      upvoteCount: r.upvotes.length,
      upvotedByMe: r.upvotes.includes(req.userId),
      createdAt: (r as unknown as { createdAt: Date }).createdAt,
    }))
  }

  @Post(':id/:ratingId/replies')
  async createReply(
    @Param('id') id: string,
    @Param('ratingId') ratingId: string,
    @Body() body: ReplyToReviewDto,
    @Req() req: Request & { userId: string },
  ) {
    const names: Record<string, string | undefined> = body.mentionedUserId
      ? await this.usersService.namesByIds([body.mentionedUserId])
      : {}
    const ownProfile = await this.usersService.profilesByIds([req.userId])
    const reply = await this.reviewRepliesService.create(
      ratingId,
      id,
      req.userId,
      body.text,
      body.mentionedUserId,
      body.mentionedUserId ? names[body.mentionedUserId] ?? undefined : undefined,
    )
    await this.activityLog.record(req.userId, id, 'review_reply_posted')
    return {
      id: String(reply._id),
      userId: reply.userId,
      userName: ownProfile[req.userId]?.name ?? null,
      userImageUrl: ownProfile[req.userId]?.imageUrl ?? null,
      text: reply.text,
      mentionedUserId: reply.mentionedUserId ?? null,
      mentionedName: reply.mentionedName ?? null,
      upvoteCount: 0,
      upvotedByMe: false,
      createdAt: (reply as unknown as { createdAt: Date }).createdAt,
    }
  }

  @Post(':id/replies/:replyId/upvote')
  async upvoteReply(
    @Param('replyId') replyId: string,
    @Req() req: Request & { userId: string },
  ) {
    return this.reviewRepliesService.toggleUpvote(req.userId, replyId)
  }
}
