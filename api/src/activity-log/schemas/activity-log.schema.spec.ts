import { model } from 'mongoose'
import { ActivityLog, ActivityLogSchema } from './activity-log.schema'

describe('ActivityLog schema', () => {
  it('validates without a recipeId - some actions (search, AI generation before a recipe exists) have none', () => {
    const ActivityLogModel = model(`ActivityLog_${Date.now()}`, ActivityLogSchema)
    const doc = new ActivityLogModel({ userId: 'user_1', action: 'search_performed', metadata: { query: 'pasta' } })

    expect(doc.validateSync()).toBeUndefined()
  })

  it('still requires userId and action', () => {
    const ActivityLogModel = model(`ActivityLog_${Date.now()}`, ActivityLogSchema)
    const doc = new ActivityLogModel({})

    const error = doc.validateSync()
    expect(error?.errors.userId).toBeDefined()
    expect(error?.errors.action).toBeDefined()
  })
})
