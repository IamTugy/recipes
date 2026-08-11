import { PointsBonusRule } from '../activity-log/activity-log.service'

// Point values per activity-log action. Judgment call (issue #58): a
// published recipe is the highest-effort, highest-value contribution (it
// passed AI quality review), so it scores far above a like/favorite, which
// costs a user one click. Read-only, internal, and negative/undo actions
// (recipe_viewed, search_performed, recipe_rejected, unfavorited, ...)
// intentionally score 0 so they don't need to be listed here - the
// aggregation's $switch defaults unmapped actions to 0.
export const POINTS_BY_ACTION: Record<string, number> = {
  recipe_published: 50,
  recipe_created: 5,
  recipe_cooked: 5,
  rating_given: 8,
  review_reply_posted: 3,
  collection_created: 3,
  favorited: 1,
  feature_request_submitted: 2,
}

// A review posted with a photo takes more effort than text alone, so it's
// worth a bonus on top of the base rating_given points.
export const RATING_PHOTO_BONUS_RULE: PointsBonusRule = {
  action: 'rating_given',
  metadataKey: 'hasPhoto',
  bonus: 5,
}

export const RANKING_BONUS_RULES: PointsBonusRule[] = [RATING_PHOTO_BONUS_RULE]
