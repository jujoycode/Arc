import * as v from 'valibot'
import { isRealDate } from '@/shared/lib/date'

const requiredDate = v.pipe(v.string(), v.minLength(1, '날짜를 입력해 주세요.'), v.check(isRealDate, '실제 날짜를 YYYY-MM-DD 형식으로 입력해 주세요.'))
const nonnegativeInteger = v.pipe(v.number(), v.safeInteger(), v.minValue(0))

export const sprintFormSchema = v.pipe(v.object({
  name: v.pipe(v.string(), v.trim(), v.minLength(1, '스프린트 이름을 입력해 주세요.'), v.maxLength(120, '스프린트 이름은 120자 이하로 입력해 주세요.')),
  goal: v.string(),
  startOn: requiredDate,
  endOn: requiredDate,
}), v.forward(v.partialCheck([['startOn'], ['endOn']], input => input.startOn <= input.endOn, '종료일은 시작일 이후의 날짜로 입력해 주세요.'), ['endOn']))

export const sprintCloseSchema = v.object({
  nextSprintId: v.union([
    v.pipe(v.literal(''), v.transform(() => null)),
    v.pipe(v.string(), v.check(value => /^[1-9]\d*$/.test(value), '이동할 계획 스프린트를 선택해 주세요.'), v.transform(Number), v.safeInteger('올바른 스프린트를 선택해 주세요.')),
  ]),
})

export const sprintCreatedSchema = v.object({ id: v.pipe(v.number(), v.safeInteger(), v.minValue(1)) })
export const sprintStartedSchema = v.object({ issueCount: nonnegativeInteger, storyPoints: nonnegativeInteger })
export const sprintClosedSchema = v.object({ issueCount: nonnegativeInteger, doneCount: nonnegativeInteger, donePoints: nonnegativeInteger, remainingPoints: nonnegativeInteger })

export type SprintFormValues = v.InferInput<typeof sprintFormSchema>

export function sprintValidationErrors(issues: readonly v.BaseIssue<unknown>[]): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const issue of issues) {
    const key = issue.path?.[0]?.key
    if (typeof key === 'string' && !errors[key]) errors[key] = issue.message
  }
  return errors
}
