# Arc 프런트엔드

React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui, TanStack Query·Table·Router로 구현했습니다. 실행 방법과 기능은 [루트 README](../README.md)를 참고하세요.

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm check:boundaries
pnpm build
pnpm check:browser  # API·MySQL·Mailpit·Chromium 필요
```

개발 서버는 `/api` 요청을 `http://localhost:8080`으로 전달합니다.

Node 22.13 이상과 pnpm 11.19.0을 사용합니다. pnpm이 없으면 `corepack enable`을 실행하세요. 버전은 package.json의 packageManager에 고정합니다.

폴더별 책임, 공개 진입점과 의존 규칙은 [프런트 구조 문서](../docs/FRONTEND_ARCHITECTURE.md)를 따릅니다. `pnpm build`는 경계 검사와 TypeScript 검사를 포함합니다.
