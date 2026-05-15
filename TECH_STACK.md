# Tech Stack

## Frontend

| 항목 | 기술 | 비고 |
|---|---|---|
| Framework | Next.js 16 | App Router, RSC, 서버 중심 렌더링 |
| Language | TypeScript | API contract와 view model 타입 관리 |
| Styling | Tailwind CSS v4 | CSS-first configuration, @theme 기반 design token |
| UI Kit | shadcn/ui | Radix UI 기반, 복사-붙여넣기 방식 |
| Chart | Recharts | shadcn/ui chart와 연계, forecast chart 구현 |
| URL State | nuqs | 필터 상태 복잡도 증가 시점에 도입 |
| Runtime Validation | Zod | FastAPI 응답 검증, 추후 도입 가능 |

> shadcn/ui + Tremor 중복 제거 → shadcn/ui + Recharts 단일화