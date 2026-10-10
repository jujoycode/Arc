import * as v from 'valibot'
import { isRealDate } from '@/shared/lib/date'
import { issuePrioritySchema, issueStatusSchema, issueTypeSchema } from '../../api/schemas'

const integerString = (minimum: number, maximum: number, message: string) => v.pipe(v.string(), v.trim(), v.check(value => /^\d+$/.test(value), message), v.transform(Number), v.check(value => Number.isSafeInteger(value) && value >= minimum && value <= maximum, message))
const nullableInteger = (maximum: number, message: string) => v.union([v.pipe(v.literal(''), v.transform(() => null)), integerString(0, maximum, message)])
const nullableId = v.union([v.pipe(v.literal(''), v.transform(() => null)), integerString(1, Number.MAX_SAFE_INTEGER, '올바른 항목을 선택해 주세요.')])
const optionalDate = v.pipe(v.string(), v.check(value => value === '' || isRealDate(value) && value >= '1000-01-01' && value <= '9999-12-31', '1000~9999년의 실제 날짜를 YYYY-MM-DD 형식으로 입력해 주세요.'), v.transform(value => value || null))

export const issueFormSchema = v.pipe(v.object({
  title: v.pipe(v.string(), v.trim(), v.minLength(1, '제목을 입력해 주세요.'), v.maxLength(200, '제목은 200자 이하로 입력해 주세요.')),
  description: v.pipe(v.string(), v.maxLength(10_000, '설명은 10,000자 이하로 입력해 주세요.')), type: issueTypeSchema, status: issueStatusSchema, priority: issuePrioritySchema,
  assigneeId: nullableId, startDate: optionalDate, dueDate: optionalDate,
  progress: integerString(0, 100, '완료율은 0~100 사이의 정수로 입력해 주세요.'),
  storyPoints: nullableInteger(2_147_483_647, '스토리 포인트는 0~2,147,483,647 사이의 정수로 입력해 주세요.'),
  parentId: nullableId, versionId: nullableId,
}),
v.forward(v.partialCheck([['startDate'], ['dueDate']], input => !input.startDate || !input.dueDate || input.startDate <= input.dueDate, '완료일은 시작일 이후의 날짜로 입력해 주세요.'), ['dueDate']),
v.forward(v.partialCheck([['type'], ['parentId']], input => input.type !== 'SUBTASK' || input.parentId !== null, '하위 작업의 부모 이슈를 선택해 주세요.'), ['parentId']),
v.forward(v.partialCheck([['type'], ['parentId']], input => input.type !== 'EPIC' || input.parentId === null, 'Epic에는 부모 이슈를 지정할 수 없습니다.'), ['parentId']))

export type IssueFormValues = v.InferInput<typeof issueFormSchema>
export const executionFormSchema = v.object({ status: issueStatusSchema, progress: integerString(0, 100, '완료율은 0~100 사이의 정수로 입력해 주세요.') })

export function validationErrors(issues: readonly v.BaseIssue<unknown>[]): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const issue of issues) {
    const key = issue.path?.map(item => String(item.key)).join('.') ?? ''
    if (key && !errors[key]) errors[key] = issue.message
  }
  return errors
}
