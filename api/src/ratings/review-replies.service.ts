import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { ReviewReply, ReviewReplyDocument } from './schemas/review-reply.schema'

@Injectable()
export class ReviewRepliesService {
  constructor(
    @InjectModel(ReviewReply.name) private readonly reviewReplyModel: Model<ReviewReplyDocument>,
  ) {}

  async create(
    ratingId: string,
    recipeSlug: string,
    userId: string,
    text: string,
    mentionedUserId?: string,
    mentionedName?: string,
  ): Promise<ReviewReplyDocument> {
    return this.reviewReplyModel.create({ ratingId, recipeSlug, userId, text, mentionedUserId, mentionedName })
  }

  async listByRating(ratingId: string): Promise<(ReviewReply & { _id: unknown; createdAt: Date })[]> {
    const docs = await this.reviewReplyModel.find({ ratingId }).sort({ createdAt: 1 }).lean().exec()
    return docs as unknown as (ReviewReply & { _id: unknown; createdAt: Date })[]
  }

  async countsByRatingIds(ratingIds: string[]): Promise<Record<string, number>> {
    if (ratingIds.length === 0) return {}
    const rows = await this.reviewReplyModel.aggregate([
      { $match: { ratingId: { $in: ratingIds } } },
      { $group: { _id: '$ratingId', count: { $sum: 1 } } },
    ])
    const counts: Record<string, number> = {}
    for (const row of rows) counts[row._id] = row.count
    return counts
  }

  async toggleUpvote(userId: string, replyId: string): Promise<{ upvoted: boolean; count: number }> {
    const reply = await this.reviewReplyModel.findById(replyId).exec()
    if (!reply) throw new NotFoundException('Reply not found')
    const idx = reply.upvotes.indexOf(userId)
    const upvoted = idx === -1
    if (upvoted) reply.upvotes.push(userId)
    else reply.upvotes.splice(idx, 1)
    await reply.save()
    return { upvoted, count: reply.upvotes.length }
  }
}
