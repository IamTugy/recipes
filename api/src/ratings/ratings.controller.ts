import { Body, Controller, Delete, Get, Param, Post, Put, Req } from '@nestjs/common'
import { Request } from 'express'
import { RatingsService } from './ratings.service'
import { ReviewRepliesService } from './review-replies.service'
import { UsersService } from '../users/users.service'
import { RateRecipeDto } from './dto/rate-recipe.dto'
import { ReplyToReviewDto } from './dto/reply-to-review.dto'

@Controller('ratings')
export class RatingsController {
  constructor(
    private readonly ratingsService: RatingsService,
    private readonly reviewRepliesService: ReviewRepliesService,
    private readonly usersService: UsersService,
  ) {}

  @Get(':slug/mine')
  async mine(@Param('slug') slug: string, @Req() req: Request & { userId: string }) {
    return this.ratingsService.myRating(req.userId, slug)
  }

  @Get(':slug/reviews')
  async reviews(@Param('slug') slug: string, @Req() req: Request & { userId: string }) {
    const reviews = await this.ratingsService.reviewsForRecipe(slug)
    const [replyCounts, names] = await Promise.all([
      this.reviewRepliesService.countsByRatingIds(reviews.map(r => r.id)),
      this.usersService.namesByIds(reviews.map(r => r.userId)),
    ])
    return reviews.map(r => ({
      ...r,
      userName: names[r.userId] ?? null,
      upvoteCount: r.upvotes.length,
      upvotedByMe: r.upvotes.includes(req.userId),
      replyCount: replyCounts[r.id] ?? 0,
    }))
  }

  @Get(':slug/distribution')
  async distribution(@Param('slug') slug: string) {
    return this.ratingsService.distributionForRecipe(slug)
  }

  @Put(':slug')
  async rate(
    @Param('slug') slug: string,
    @Body() body: RateRecipeDto,
    @Req() req: Request & { userId: string },
  ) {
    return this.ratingsService.rate(req.userId, slug, body.score, body.comment, body.photoUrl)
  }

  @Delete(':slug')
  async remove(@Param('slug') slug: string, @Req() req: Request & { userId: string }) {
    await this.ratingsService.deleteRating(req.userId, slug)
    return { deleted: true }
  }

  @Post(':slug/:ratingId/upvote')
  async upvoteReview(
    @Param('ratingId') ratingId: string,
    @Req() req: Request & { userId: string },
  ) {
    return this.ratingsService.toggleUpvote(req.userId, ratingId)
  }

  @Get(':slug/:ratingId/replies')
  async listReplies(@Param('ratingId') ratingId: string, @Req() req: Request & { userId: string }) {
    const replies = await this.reviewRepliesService.listByRating(ratingId)
    const names = await this.usersService.namesByIds(replies.map(r => r.userId))
    return replies.map(r => ({
      id: String(r._id),
      userId: r.userId,
      userName: names[r.userId] ?? null,
      text: r.text,
      mentionedUserId: r.mentionedUserId ?? null,
      mentionedName: r.mentionedName ?? null,
      upvoteCount: r.upvotes.length,
      upvotedByMe: r.upvotes.includes(req.userId),
      createdAt: (r as unknown as { createdAt: Date }).createdAt,
    }))
  }

  @Post(':slug/:ratingId/replies')
  async createReply(
    @Param('slug') slug: string,
    @Param('ratingId') ratingId: string,
    @Body() body: ReplyToReviewDto,
    @Req() req: Request & { userId: string },
  ) {
    const names = body.mentionedUserId ? await this.usersService.namesByIds([body.mentionedUserId]) : {}
    const reply = await this.reviewRepliesService.create(
      ratingId,
      slug,
      req.userId,
      body.text,
      body.mentionedUserId,
      body.mentionedUserId ? names[body.mentionedUserId] ?? undefined : undefined,
    )
    return {
      id: String(reply._id),
      userId: reply.userId,
      text: reply.text,
      mentionedUserId: reply.mentionedUserId ?? null,
      mentionedName: reply.mentionedName ?? null,
      upvoteCount: 0,
      upvotedByMe: false,
      createdAt: (reply as unknown as { createdAt: Date }).createdAt,
    }
  }

  @Post(':slug/replies/:replyId/upvote')
  async upvoteReply(
    @Param('replyId') replyId: string,
    @Req() req: Request & { userId: string },
  ) {
    return this.reviewRepliesService.toggleUpvote(req.userId, replyId)
  }
}
