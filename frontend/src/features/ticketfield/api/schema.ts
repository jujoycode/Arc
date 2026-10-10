import * as v from 'valibot'
import { isRealDate } from '@/shared/lib/date'
export { isRealDate } from '@/shared/lib/date'

export const standardFieldKeys = ['title', 'type', 'description', 'status', 'priority', 'assigneeId', 'startDate', 'dueDate', 'progress', 'storyPoints', 'parentId', 'versionId'] as const
const label = v.pipe(v.string(), v.trim(), v.minLength(1, '이름을 입력하세요.'), v.maxLength(80, '이름은 80자 이하로 입력하세요.'))
const description = v.pipe(v.string(), v.maxLength(500, '설명은 500자 이하로 입력하세요.'))
export const standardFieldDefinitionSchema = v.object({
  key: v.picklist(standardFieldKeys), label, description, visible: v.boolean(), required: v.boolean(), order: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1000)),
})
export const customFieldDefinitionSchema = v.object({
  key: v.pipe(v.string(), v.regex(/^[a-z][a-z0-9_-]{0,63}$/)),
  type: v.picklist(['TEXT', 'NUMBER', 'DATE', 'SELECT']), label, description,
  active: v.boolean(), required: v.boolean(), order: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1000)),
  options: v.array(v.object({value: v.pipe(v.string(), v.regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/)), label, active: v.boolean()})),
})
export const ticketFieldPolicySchema = v.pipe(v.object({
  workspaceId: v.pipe(v.number(), v.integer(), v.minValue(1), v.check(value => Number.isSafeInteger(value))),
  revision: v.pipe(v.number(), v.integer(), v.minValue(0), v.check(value => Number.isSafeInteger(value))),
  standardFields: v.array(standardFieldDefinitionSchema), customFields: v.pipe(v.array(customFieldDefinitionSchema), v.maxLength(100, '비활성 필드를 포함하여 최대 100개입니다.')),
}), v.check(policy => policy.standardFields.length === standardFieldKeys.length && new Set(policy.standardFields.map(field => field.key)).size === standardFieldKeys.length, '모든 표준 필드를 중복 없이 포함해야 합니다.'),
v.check(policy => policy.standardFields.every(field => (!field.required || field.visible) && (!['title', 'type', 'status', 'progress'].includes(field.key) || field.visible && field.required) && (field.key !== 'parentId' || !field.required)), '핵심 필드의 표시·필수 규칙을 유지해야 합니다.'),
v.check(policy => new Set(policy.customFields.map(field => field.key)).size === policy.customFields.length && policy.customFields.every(field => new Set(field.options.map(option => option.value)).size === field.options.length), '필드와 선택지 키가 중복될 수 없습니다.'))
export type StandardFieldDefinition = v.InferOutput<typeof standardFieldDefinitionSchema>
export type CustomFieldDefinition = v.InferOutput<typeof customFieldDefinitionSchema>
export type TicketFieldPolicy = v.InferOutput<typeof ticketFieldPolicySchema>
export type CustomValues = Record<string, string | number | null>

export function parseTicketValues(inputs: Record<string, string>, definitions: CustomFieldDefinition[], existing: CustomValues = {}) {
  const values: CustomValues = {...existing}
  const errors: Record<string, string> = {}
  for (const definition of definitions.filter(field => field.active)) {
    const input = inputs[definition.key] ?? (existing[definition.key] == null ? '' : String(existing[definition.key]))
    const raw = input.trim(), path = `customFields.${definition.key}`
    if (!raw) {
      values[definition.key] = null
      if (definition.required) errors[path] = `${definition.label}을(를) 입력하세요.`
      continue
    }
    if (definition.type === 'TEXT') {
      if (input.length > 2000) errors[path] = '2,000자 이하로 입력하세요.'
      values[definition.key] = input
    } else if (definition.type === 'NUMBER') {
      if (!/^[+-]?(?:\d+(?:\.\d{1,6})?|\.\d{1,6})$/.test(raw) || !Number.isFinite(Number(raw)) || Math.abs(Number(raw)) > 1_000_000_000) errors[path] = '절댓값 10억 이하, 소수점 6자리 이내의 숫자를 입력하세요.'
      else values[definition.key] = Number(raw)
    } else if (definition.type === 'DATE') {
      if (!isRealDate(raw)) errors[path] = '실제 날짜를 YYYY-MM-DD로 입력하세요.'
      else values[definition.key] = raw
    } else {
      const option = definition.options.find(item => item.value === raw)
      if (!option || (!option.active && existing[definition.key] !== raw)) errors[path] = '사용할 수 있는 선택지를 고르세요.'
      else values[definition.key] = raw
    }
  }
  return {values, errors}
}

export function validateFieldPolicy(policy: TicketFieldPolicy, original: TicketFieldPolicy): Record<string, string> {
  const errors: Record<string, string> = {}
  const parsed = v.safeParse(ticketFieldPolicySchema, policy)
  if (!parsed.success) for (const issue of parsed.issues) {
    const path = issue.path?.map(part => String(part.key)).join('.') ?? 'policy'
    errors[path] ??= issue.message
  }
  if (policy.customFields.filter(field => field.active).length > 30) errors.customFields = '활성 커스텀 필드는 최대 30개입니다.'
  if (policy.customFields.length > 100) errors.customFields = '비활성 필드를 포함하여 최대 100개입니다.'
  for (const [index, field] of policy.standardFields.entries()) {
    if (field.required && !field.visible) errors[`standardFields.${index}.visible`] = '필수 필드는 표시해야 합니다.'
  }
  for (const [index, field] of policy.customFields.entries()) {
    const old = original.customFields.find(item => item.key === field.key)
    if (old && old.type !== field.type) errors[`customFields.${index}.type`] = '저장한 필드의 타입은 변경할 수 없습니다.'
    if (field.type === 'SELECT' && field.active && !field.options.some(option => option.active)) errors[`customFields.${index}.options`] = '활성 선택지를 하나 이상 추가하세요.'
    if (field.type !== 'SELECT' && field.options.length) errors[`customFields.${index}.options`] = '단일 선택 필드에만 선택지를 지정할 수 있습니다.'
    if (field.options.length > 100) errors[`customFields.${index}.options`] = '선택지는 최대 100개입니다.'
    for (const [optionIndex, option] of field.options.entries()) if (!option.label.trim()) errors[`customFields.${index}.options.${optionIndex}.label`] = '선택지 이름을 입력하세요.'
  }
  return errors
}
