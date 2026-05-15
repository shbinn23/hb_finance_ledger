# Code 작업 지침
# 이 문서는 AI/개발자의 작업 원칙만 정의한다. 프로젝트 구조, 실행 방법, 배포 맥락 등 상세 컨텍스트는 HANDOVER.md를 우선 참고한다.

## 0. 대원칙

1. Think Before Coding
   Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

State your assumptions explicitly. If uncertain, ask.
If multiple interpretations exist, present them - don't pick silently.
If a simpler approach exists, say so. Push back when warranted.
If something is unclear, stop. Name what's confusing. Ask.
2. Simplicity First
   Minimum code that solves the problem. Nothing speculative.

No features beyond what was asked.
No abstractions for single-use code.
No "flexibility" or "configurability" that wasn't requested.
No error handling for impossible scenarios.
If you write 200 lines and it could be 50, rewrite it.
Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

3. Surgical Changes
   Touch only what you must. Clean up only your own mess.

When editing existing code:

Don't "improve" adjacent code, comments, or formatting.
Don't refactor things that aren't broken.
Match existing style, even if you'd do it differently.
If you notice unrelated dead code, mention it - don't delete it.
When your changes create orphans:

Remove imports/variables/functions that YOUR changes made unused.
Don't remove pre-existing dead code unless asked.
The test: Every changed line should trace directly to the user's request.

4. Goal-Driven Execution
   Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

"Add validation" → "Write tests for invalid inputs, then make them pass"
"Fix the bug" → "Write a test that reproduces it, then make it pass"
"Refactor X" → "Ensure tests pass before and after"
For multi-step tasks, state a brief plan:

1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
   Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 1. 설계 원칙 (Core Principles)

### SoC (관심사의 분리)
- 모듈 간 결합도(Coupling) 최소화, 응집도(Cohesion) 극대화
- 기능별 철저한 모듈화
- 계층 간 의존성 방향 단방향 유지 (상위 → 하위)

### Data Integrity (데이터 무결성)
- 편의를 위한 설계 타협 금지
- 데이터 정규화 3NF 이상 준수 (분석용 데이터는 쿼리 성능상 비정규화 허용)
- 제약 조건(Constraints) 설정 최우선

### Robust Pipeline
- 모든 파이프라인에 멱등성(Idempotency) 보장 필수
- 중복 적재 방지 로직 항상 포함
- 필요 시 확장 가능한 구조 지향 — 단, 현재 요구사항을 벗어난 선행 설계 금지

---

## 2. 코드 품질 기준

### DRY & 추상화
- 중복 코드 발견 시 공통 모듈/함수로 분리
- 과도한 추상화 vs 부족한 추상화 교차 검증
- 추상화가 가독성을 해치면 DRY보다 가독성 우선

### SRP (단일 책임 원칙)
- God Function 형태 금지
- 한 함수는 한 가지 책임만
- 책임 최소 단위로 분할

### 코드 리뷰 기준
- 논리적/기술적 오류 발견 시 즉시 지적
- 과도한 칭찬 없이 팩트 기반 피드백
- 문제점 발견 시 수정 방향까지 반드시 제시
- 동일한 실수 반복 시 구조적 원인까지 분석
---

## 3. 프로젝트 구조 규칙

### 디렉토리
- 기능 단위로 폴더 분리
- 공통 유틸리티는 core/ 또는 utils/ 하위
- 환경변수는 .env + dotenv 방식으로 직접 로드 (현재 코드 기준)

### 환경변수
- 모든 환경변수는 .env로 관리
- 하드코딩 금지
- 민감 정보는 절대 GitHub push 금지

### Git
- 커밋 메시지 규칙 준수
  feat / fix / refactor / chore / docs
- 기능 단위로 커밋 (너무 크거나 작지 않게)
- .env, venv/, *.tar.gz는 .gitignore 필수

---

## 4. 불확실할 때 원칙

- 설계 방향이 불명확하면 구현 전 먼저 확인
- 다중 해석 가능한 요구사항은 임의 추측 금지
