import * as v from 'valibot'
import { isRealDate } from '@/shared/lib/date'

const idSchema = v.pipe(v.number(), v.integer(), v.minValue(1), v.check((value: number) => Number.isSafeInteger(value)))
const optionalId = v.optional(v.nullable(idSchema))
const optionalString = v.optional(v.nullable(v.string()))
const optionalDate = v.optional(v.nullable(v.pipe(v.string(), v.check(value => isRealDate(value) && value >= '1000-01-01' && value <= '9999-12-31'))))
export const issueTypeSchema = v.picklist(['EPIC', 'STORY', 'TASK', 'BUG', 'SUBTASK'])
export const issueStatusSchema = v.picklist(['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'])
export const issuePrioritySchema = v.picklist(['LOW', 'NORMAL', 'HIGH', 'URGENT'])
export const issueSchema = v.object({
  id: idSchema, projectId: idSchema, key: v.string(), number: idSchema, title: v.string(), description: optionalString,
  type: issueTypeSchema, status: issueStatusSchema, priority: issuePrioritySchema, reporterId: idSchema,
  assigneeId: optionalId, assigneeName: optionalString, startDate: optionalDate, dueDate: optionalDate,
  progress: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100)), storyPoints: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0)))),
  parentId: optionalId, versionId: optionalId, sprintId: optionalId, sortOrder: v.pipe(v.number(), v.finite()), version: v.pipe(v.number(), v.integer(), v.minValue(0)), updatedAt: v.pipe(v.string(), v.check(value => Number.isFinite(Date.parse(value)))),
  customFields: v.optional(v.record(v.string(), v.nullable(v.union([v.string(), v.pipe(v.number(), v.finite())]))), {}),
})
export const issuePageSchema = v.object({ items: v.array(issueSchema), total: v.pipe(v.number(), v.integer(), v.minValue(0)) })
export const issueCreatedSchema = v.object({ id: idSchema })
export const issueUpdatedSchema = v.object({ version: v.pipe(v.number(), v.integer(), v.minValue(0)) })
