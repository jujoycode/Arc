import * as v from 'valibot'

const email = v.pipe(v.string(), v.trim(), v.minLength(1, '이메일을 입력해 주세요.'), v.email('올바른 이메일 주소를 입력해 주세요.'))
const password = v.pipe(v.string(), v.minLength(1, '비밀번호를 입력해 주세요.'), v.check(value => new TextEncoder().encode(value).length <= 72, '비밀번호는 영문 72자 또는 한글 24자 이내로 입력해 주세요.'))

export const loginFormSchema = v.object({ email, password })
export const registerFormSchema = v.object({
  email,
  password: v.pipe(password, v.minLength(12, '비밀번호는 12자 이상으로 입력해 주세요.')),
  displayName: v.pipe(v.string(), v.trim(), v.minLength(1, '이름을 입력해 주세요.'), v.maxLength(120, '이름은 120자 이하로 입력해 주세요.')),
})
export const loginResponseSchema = v.object({
  token: v.pipe(v.string(), v.minLength(1)),
  user: v.object({ id: v.pipe(v.number(), v.safeInteger(), v.minValue(1)), email: v.string(), displayName: v.string() }),
})
export const messageResponseSchema = v.object({ message: v.string() })

export function authValidationErrors(issues: readonly v.BaseIssue<unknown>[]): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const issue of issues) {
    const name = issue.path?.[0]?.key
    if (typeof name === 'string' && !errors[name]) errors[name] = issue.message
  }
  return errors
}
