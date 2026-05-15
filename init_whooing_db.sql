-- ============================================================
-- Whooing API - PostgreSQL DDL
-- 대상 스키마  : whooing  (report 스키마와 완전 분리)
-- 생성일       : 2026-05-08
-- 참고 문서    : whooing_api.md
--
-- [설계 원칙]
--   1. 모든 테이블은 whooing 스키마 안에만 위치
--   2. entry_date → NUMERIC(14,4)  후잉 고유 YYYYMMDD.NNNN 보존
--   3. money/total → NUMERIC(12,2) 10조 미만 금액 처리 (소수 오차 방지)
--   4. 거래-첨부파일 1:N → entry_attachments 별도 테이블
--   5. 모든 주요 테이블에 original_ref_id 포함 (편한가계부 원본 ID)
--   6. synced_at 컬럼으로 API 동기화 시각 관리
--
-- [개선 제안 — 적용 방법은 하단 "Appendix" 섹션 참고]
--   A. entries.entry_date_only  GENERATED ALWAYS 컬럼 추가 시
--      SQL 날짜 범위 조건을 훨씬 단순하게 작성할 수 있음
--   B. entries 테이블 연도별 파티셔닝 시
--      수백만 건 이상 데이터에서 range scan 성능 향상 가능
-- ============================================================

CREATE SCHEMA IF NOT EXISTS whooing;

-- ============================================================
-- 1. Users  사용자
--    GET /api/user.json
-- ============================================================
CREATE TABLE whooing.users (
    user_id             INTEGER         PRIMARY KEY,

    username            VARCHAR(100)    NOT NULL,
    language            VARCHAR(10),                -- 예: ko, en
    level               VARCHAR(10),                -- 사용자 플랜 등급
    expire              TIMESTAMPTZ,                -- 유료 플랜 만료 시각 (Unix ts → TIMESTAMPTZ)
    timezone            VARCHAR(50),                -- 예: Asia/Seoul
    currency            VARCHAR(10),                -- 기본 통화 단위 (예: KRW)
    country             VARCHAR(10),                -- 국가 코드 (예: KR)
    image_url           VARCHAR(500),
    mileage             INTEGER         DEFAULT 0,

    last_ip             VARCHAR(45),
    last_login_at       TIMESTAMPTZ,

    created_at          TIMESTAMPTZ,
    modified_at         TIMESTAMPTZ,
    synced_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- 편한가계부 등 외부 시스템 원본 ID (마이그레이션 추적용)
    original_ref_id     VARCHAR(100)
);

COMMENT ON TABLE  whooing.users                  IS '후잉 사용자 정보. GET /api/user.json';
COMMENT ON COLUMN whooing.users.level            IS '사용자 플랜 등급 (무료/유료 구분)';
COMMENT ON COLUMN whooing.users.expire           IS '유료 플랜 만료일. Unix timestamp를 TIMESTAMPTZ로 변환 저장';
COMMENT ON COLUMN whooing.users.mileage          IS '누적 마일리지 포인트';
COMMENT ON COLUMN whooing.users.synced_at        IS 'API에서 마지막으로 동기화한 시각';
COMMENT ON COLUMN whooing.users.original_ref_id  IS '편한가계부 등 외부 시스템 원본 ID (마이그레이션용)';


-- ============================================================
-- 2. User Logs  사용자 활동 로그
--    GET /api/user_logs.json
-- ============================================================
CREATE TABLE whooing.user_logs (
    log_id              BIGINT          PRIMARY KEY,    -- API 응답의 id 필드

    contents            TEXT            NOT NULL,
    logged_at           TIMESTAMPTZ     NOT NULL,       -- API datetime (Unix ts) → TIMESTAMPTZ
    ip                  VARCHAR(45),
    segment0            VARCHAR(100),                   -- 로그 최상위 분류 (예: sections)
    segment1            VARCHAR(100),                   -- 로그 세부 분류
    writer              VARCHAR(50),                    -- 작성 주체 (예: user)

    synced_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    original_ref_id     VARCHAR(100)
);

COMMENT ON TABLE  whooing.user_logs             IS '사용자 활동 이력. GET /api/user_logs.json';
COMMENT ON COLUMN whooing.user_logs.segment0    IS '로그 최상위 분류 (예: sections, entries, accounts)';
COMMENT ON COLUMN whooing.user_logs.segment1    IS '로그 세부 분류';


-- ============================================================
-- 3. User Point Logs  포인트 적립/사용 이력
--    GET /api/user_point_logs.json
-- ============================================================
CREATE TABLE whooing.user_point_logs (
    point_id            BIGINT          PRIMARY KEY,

    logged_at           TIMESTAMPTZ     NOT NULL,
    description         TEXT,
    point               INTEGER         NOT NULL DEFAULT 0,  -- 음수이면 차감
    writer              VARCHAR(50),

    synced_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    original_ref_id     VARCHAR(100)
);

COMMENT ON TABLE  whooing.user_point_logs          IS '포인트 적립/사용 이력. GET /api/user_point_logs.json';
COMMENT ON COLUMN whooing.user_point_logs.point    IS '포인트 변동량. 양수=적립, 음수=차감';


-- ============================================================
-- 4. Sections  섹션(가계부 단위)
--    GET /api/sections.json
-- ============================================================
CREATE TABLE whooing.sections (
    section_id          VARCHAR(20)     PRIMARY KEY,    -- 후잉 고유 ID (예: "s123")

    title               VARCHAR(100)    NOT NULL,
    memo                VARCHAR(255),
    currency            VARCHAR(10)     NOT NULL,
    isolation           CHAR(1)         NOT NULL DEFAULT 'n'
                            CHECK (isolation IN ('y', 'n')),

    -- API가 반환하는 캐시된 집계값 (실시간 연산, 쓰기 금지)
    total_assets        NUMERIC(12, 2)  DEFAULT 0,
    total_liabilities   NUMERIC(12, 2)  DEFAULT 0,

    -- 디스플레이 설정
    skin_id             INTEGER         DEFAULT 0,
    decimal_places      SMALLINT        DEFAULT 2
                            CHECK (decimal_places BETWEEN 0 AND 3),
    date_format         VARCHAR(10)     DEFAULT 'YMD',

    webhook_token       VARCHAR(200),

    -- UI 설정 JSON (budgetLong, insertSlot, width, mainIndex 등)
    ui                  JSONB,

    sort_order          SMALLINT        DEFAULT 0,

    synced_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    original_ref_id     VARCHAR(100)
);

COMMENT ON TABLE  whooing.sections                      IS '후잉 섹션(독립 가계부). GET /api/sections.json. 1유저 최대 9개';
COMMENT ON COLUMN whooing.sections.section_id           IS '후잉 고유 ID. 문자 s + 숫자 조합 (예: "s123")';
COMMENT ON COLUMN whooing.sections.isolation            IS 'y이면 비자금 섹션 — 기본 목록 조회에서 제외될 수 있음';
COMMENT ON COLUMN whooing.sections.total_assets         IS 'API 응답 캐시값. 직접 연산하지 말고 entries로부터 재계산 권장';
COMMENT ON COLUMN whooing.sections.total_liabilities    IS 'API 응답 캐시값. 직접 연산하지 말고 entries로부터 재계산 권장';
COMMENT ON COLUMN whooing.sections.decimal_places       IS '표시 소수점 자릿수 (0~3)';
COMMENT ON COLUMN whooing.sections.ui                   IS 'UI 설정 JSONB. 알려진 키: budgetLong(y/n), insertSlot(1~3), width, mainIndex, insertMethod, cashflowSalesAccs';
COMMENT ON COLUMN whooing.sections.sort_order           IS '섹션 목록 정렬 순서 (PUT /api/sections/sort.json)';


-- ============================================================
-- 5. Accounts  항목
--    GET /api/accounts.json
-- ============================================================
CREATE TABLE whooing.accounts (
    account_id          VARCHAR(20)     NOT NULL,   -- 예: "x1"  (섹션 내 고유)
    section_id          VARCHAR(20)     NOT NULL
                            REFERENCES whooing.sections(section_id),

    -- 5대 계정 분류
    account_type        VARCHAR(20)     NOT NULL
                            CHECK (account_type IN
                                ('assets', 'liabilities', 'capital', 'expenses', 'income')),

    -- group = 그룹 헤더 (하위 항목 묶음), account = 실제 거래 항목
    item_type           VARCHAR(10)     NOT NULL
                            CHECK (item_type IN ('group', 'account')),

    title               VARCHAR(100)    NOT NULL,
    memo                VARCHAR(255),

    open_date           INTEGER,    -- 항목 유효 시작일 (YYYYMMDD 정수)
    close_date          INTEGER,    -- 항목 유효 종료일. 29991231이면 현재 사용 중

    -- 항목 성격 (normal / client / creditcard / checkcard / steady / floating)
    category            VARCHAR(20),

    -- 신용카드·체크카드 전용 필드
    opt_use_date        VARCHAR(10),    -- 사용기간 시작일 표기 (pp1~p31 형식)
    opt_pay_date        SMALLINT,       -- 대금 결제일 (1~31)
    opt_pay_account_id  VARCHAR(20),    -- 결제 계좌 항목 ID (자산 항목)

    sort_order          SMALLINT        DEFAULT 0,

    synced_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    original_ref_id     VARCHAR(100),

    PRIMARY KEY (account_id, section_id)
);

COMMENT ON TABLE  whooing.accounts                          IS '항목(계정) 목록. GET /api/accounts.json. account_id는 섹션 내에서만 고유';
COMMENT ON COLUMN whooing.accounts.account_id               IS '후잉 고유 ID. 문자 x + 숫자 (예: "x1"). 삭제된 항목 참조 시 x0으로 표기됨';
COMMENT ON COLUMN whooing.accounts.account_type             IS '5대 계정 분류: assets/liabilities/capital/expenses/income';
COMMENT ON COLUMN whooing.accounts.item_type                IS 'group=그룹 헤더(거래 불가), account=실제 거래 가능 항목';
COMMENT ON COLUMN whooing.accounts.open_date                IS '항목 사용 시작일 (YYYYMMDD 정수). 이 날짜 이전 거래에서는 항목이 노출되지 않음';
COMMENT ON COLUMN whooing.accounts.close_date               IS '항목 사용 종료일 (YYYYMMDD 정수). 29991231이면 현재도 사용 중인 항목';
COMMENT ON COLUMN whooing.accounts.category                 IS '항목 성격: normal/client(거래처)/creditcard/checkcard/steady(고정비)/floating(변동비)';
COMMENT ON COLUMN whooing.accounts.opt_use_date             IS '[신용카드 전용] 전월 사용기간 시작일 표기. pp1~p31 형식 (p1=전월 1일)';
COMMENT ON COLUMN whooing.accounts.opt_pay_date             IS '[신용카드 전용] 대금 결제일 (1~31)';
COMMENT ON COLUMN whooing.accounts.opt_pay_account_id       IS '[신용카드 전용] 결제 계좌 항목 ID (자산 계정)';

CREATE INDEX idx_accounts_section       ON whooing.accounts(section_id);
CREATE INDEX idx_accounts_section_type  ON whooing.accounts(section_id, account_type);


-- ============================================================
-- 6. Entries  거래내역
--    GET /api/entries.json
-- ============================================================
CREATE TABLE whooing.entries (
    entry_id            BIGINT          PRIMARY KEY,
    section_id          VARCHAR(20)     NOT NULL
                            REFERENCES whooing.sections(section_id),

    -- 후잉 고유 날짜+순번 형식: YYYYMMDD.NNNN
    --   정수부 = 거래 날짜 (YYYYMMDD)
    --   소수부 = 당일 입력 순번 (0001~9999)
    --   예: 20110817.0001 = 2011-08-17의 첫 번째 거래
    --   NUMERIC(14,4) = 정수 10자리, 소수 4자리 → 20110817 (8자리) 충분히 수용
    entry_date          NUMERIC(14, 4)  NOT NULL,

    -- 복식부기 왼쪽 (차변)
    l_account           VARCHAR(20)     NOT NULL,   -- 계정 타입 (예: expenses)
    l_account_id        VARCHAR(20)     NOT NULL,   -- 항목 ID. x0이면 삭제된 항목 기록

    -- 복식부기 오른쪽 (대변)
    r_account           VARCHAR(20)     NOT NULL,
    r_account_id        VARCHAR(20)     NOT NULL,

    item                VARCHAR(255),               -- 거래 내용/거래처. 괄호 안에 상세메모 포함 가능
    money               NUMERIC(12, 2)  NOT NULL,   -- 거래액 (항상 양수)
    total               NUMERIC(12, 2),             -- r_account_id 항목 기준 누적 잔액
    memo                TEXT,
    app_id              INTEGER         DEFAULT 0,  -- 입력에 사용된 앱 ID. 0=후잉 공식 UI

    synced_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    original_ref_id     VARCHAR(100)
);

COMMENT ON TABLE  whooing.entries               IS '거래내역. GET /api/entries.json. 복식부기 구조';
COMMENT ON COLUMN whooing.entries.entry_date    IS '후잉 고유 날짜+순번 형식 NUMERIC(14,4). 정수부=YYYYMMDD, 소수부=당일 순번(0001~). API 커서 페이징(max 파라미터)에도 사용됨';
COMMENT ON COLUMN whooing.entries.l_account     IS '차변 계정 타입 (assets/liabilities/capital/expenses/income)';
COMMENT ON COLUMN whooing.entries.l_account_id  IS '차변 항목 ID. x0이면 삭제된 항목에 대한 역사적 기록';
COMMENT ON COLUMN whooing.entries.r_account     IS '대변 계정 타입';
COMMENT ON COLUMN whooing.entries.r_account_id  IS '대변 항목 ID. x0이면 삭제된 항목에 대한 역사적 기록';
COMMENT ON COLUMN whooing.entries.item          IS '거래 내용 또는 거래처명. 형식: "아이템(괄호메모)"';
COMMENT ON COLUMN whooing.entries.money         IS '거래액. 항상 양수. NUMERIC(12,2) = 최대 999억 처리';
COMMENT ON COLUMN whooing.entries.total         IS 'r_account_id 항목의 해당 시점 누적 잔액 (API가 반환하는 스냅샷 값)';
COMMENT ON COLUMN whooing.entries.app_id        IS '입력 앱 ID (0=후잉 공식 UI, 양수=서드파티 앱)';

-- 날짜 범위 조회 (가장 빈번한 쿼리 패턴)
CREATE INDEX idx_entries_section_date   ON whooing.entries(section_id, entry_date DESC);
-- 계정/항목 필터 조회
CREATE INDEX idx_entries_l_account      ON whooing.entries(section_id, l_account, l_account_id);
CREATE INDEX idx_entries_r_account      ON whooing.entries(section_id, r_account, r_account_id);


-- ============================================================
-- 7. Entry Attachments  거래 첨부파일
--    entries와 1:N 관계 — 별도 테이블 분리
-- ============================================================
CREATE TABLE whooing.entry_attachments (
    uuid                VARCHAR(100)    PRIMARY KEY,    -- 후잉 파일 UUID (예: "810cbdb1b-7486jvk57")
    entry_id            BIGINT          NOT NULL
                            REFERENCES whooing.entries(entry_id) ON DELETE CASCADE,

    src                 VARCHAR(500)    NOT NULL,   -- 파일 서빙 URL
    filename            VARCHAR(255),
    mime_type           VARCHAR(100),
    file_size           INTEGER,                    -- 파일 크기 (bytes)

    synced_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    original_ref_id     VARCHAR(100)
);

COMMENT ON TABLE  whooing.entry_attachments             IS '거래 첨부파일. entries.attachments 배열을 1:N으로 정규화. GET /api/entries.json 응답 내 포함';
COMMENT ON COLUMN whooing.entry_attachments.uuid        IS '후잉 파일 UUID. POST /api/upload.json 으로 발급';
COMMENT ON COLUMN whooing.entry_attachments.src         IS '파일 서빙 URL (예: https://static.whooing.com/get/{uuid})';
COMMENT ON COLUMN whooing.entry_attachments.mime_type   IS 'MIME 타입 (예: image/jpeg)';
COMMENT ON COLUMN whooing.entry_attachments.file_size   IS '파일 크기 (bytes). 최대 20MB = 20,971,520 bytes';

CREATE INDEX idx_entry_attachments_entry ON whooing.entry_attachments(entry_id);


-- ============================================================
-- 8. Frequent Items  자주입력 거래 템플릿
--    GET /api/frequent_items.json
-- ============================================================
CREATE TABLE whooing.frequent_items (
    item_id             VARCHAR(20)     NOT NULL,   -- 예: "f4"
    section_id          VARCHAR(20)     NOT NULL
                            REFERENCES whooing.sections(section_id),
    slot                VARCHAR(10)     NOT NULL
                            CHECK (slot IN ('slot1', 'slot2', 'slot3')),

    item                VARCHAR(255)    NOT NULL,
    money               NUMERIC(12, 2)  DEFAULT 0,
    l_account           VARCHAR(20)     NOT NULL,
    l_account_id        VARCHAR(20),
    r_account           VARCHAR(20)     NOT NULL,
    r_account_id        VARCHAR(20),

    sort_order          SMALLINT        DEFAULT 0,

    synced_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    original_ref_id     VARCHAR(100),

    PRIMARY KEY (item_id, section_id)
);

COMMENT ON TABLE  whooing.frequent_items            IS '자주입력 거래 템플릿. GET /api/frequent_items.json';
COMMENT ON COLUMN whooing.frequent_items.item_id    IS '후잉 고유 ID. 문자 f + 숫자 (예: "f4"). 섹션 내에서 고유';
COMMENT ON COLUMN whooing.frequent_items.slot       IS '버튼 그룹 슬롯 (slot1~slot3). sections.ui.insertSlot으로 사용 슬롯 수 결정';
COMMENT ON COLUMN whooing.frequent_items.sort_order IS '슬롯 내 정렬 순서 (PUT /api/frequent_items/:slot/sort.json)';

CREATE INDEX idx_frequent_items_section_slot ON whooing.frequent_items(section_id, slot);


-- ============================================================
-- 9. Monthly Items  매월자동입력 거래 템플릿
--    GET /api/monthly_items.json
-- ============================================================
CREATE TABLE whooing.monthly_items (
    item_id             VARCHAR(20)     NOT NULL,   -- 예: "m4"
    section_id          VARCHAR(20)     NOT NULL
                            REFERENCES whooing.sections(section_id),

    item                VARCHAR(255)    NOT NULL,
    money               NUMERIC(12, 2)  DEFAULT 0,
    l_account           VARCHAR(20),
    l_account_id        VARCHAR(20),
    r_account           VARCHAR(20),
    r_account_id        VARCHAR(20),

    pay_date            SMALLINT        NOT NULL
                            CHECK (pay_date BETWEEN 1 AND 31),
    skip_holiday        VARCHAR(10)     DEFAULT 'none'
                            CHECK (skip_holiday IN ('none', 'before', 'after')),

    -- API 응답에 포함된 계산값 (동기화 시 갱신)
    due_date            DATE,       -- 다음 결제 예정일
    d_day               SMALLINT,   -- 결제까지 남은 일수 (음수=연체)
    paid_date           DATE,       -- 마지막 결제 완료일

    synced_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    original_ref_id     VARCHAR(100),

    PRIMARY KEY (item_id, section_id)
);

COMMENT ON TABLE  whooing.monthly_items                 IS '매월 자동입력 거래 템플릿. GET /api/monthly_items.json';
COMMENT ON COLUMN whooing.monthly_items.item_id         IS '후잉 고유 ID. 문자 m + 숫자 (예: "m4"). 섹션 내에서 고유';
COMMENT ON COLUMN whooing.monthly_items.pay_date        IS '매월 결제 지정일 (1~31)';
COMMENT ON COLUMN whooing.monthly_items.skip_holiday    IS '공휴일/주말 처리: none=그대로, before=전 영업일, after=다음 영업일';
COMMENT ON COLUMN whooing.monthly_items.due_date        IS 'API가 계산하여 반환하는 다음 결제 예정일 (동기화 시만 최신)';
COMMENT ON COLUMN whooing.monthly_items.d_day           IS '오늘 기준 결제 D-day. 0=오늘, 양수=N일 후, 음수=N일 연체';
COMMENT ON COLUMN whooing.monthly_items.paid_date       IS '마지막으로 결제 처리된 날짜';

CREATE INDEX idx_monthly_items_section ON whooing.monthly_items(section_id);


-- ============================================================
-- 10. Budgets  항목별 월 예산
--     GET /api/budget/:account.json
-- ============================================================
CREATE TABLE whooing.budgets (
    id                  BIGSERIAL       PRIMARY KEY,
    section_id          VARCHAR(20)     NOT NULL
                            REFERENCES whooing.sections(section_id),

    -- 예산 가능 계정: expenses(지출) / income(수입)
    account_type        VARCHAR(20)     NOT NULL
                            CHECK (account_type IN ('expenses', 'income')),

    -- 예산 대상 년월 (YYYYMM 정수, 예: 202601)
    target_ym           INTEGER         NOT NULL,

    -- 항목 ID별 예산 금액
    account_id          VARCHAR(20)     NOT NULL,
    budget_amount       NUMERIC(12, 2)  NOT NULL DEFAULT 0,

    synced_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    original_ref_id     VARCHAR(100),

    UNIQUE (section_id, account_type, target_ym, account_id)
);

COMMENT ON TABLE  whooing.budgets                   IS '항목별 월 예산. GET /api/budget/:account.json. expenses/income 계정만 설정 가능';
COMMENT ON COLUMN whooing.budgets.account_type      IS '예산 계정: expenses(지출) 또는 income(수입)';
COMMENT ON COLUMN whooing.budgets.target_ym         IS '예산 대상 년월 (YYYYMM 정수, 예: 202601)';
COMMENT ON COLUMN whooing.budgets.account_id        IS '예산을 설정한 항목 ID (예: x12)';
COMMENT ON COLUMN whooing.budgets.budget_amount     IS '해당 항목의 월 예산 금액';

CREATE INDEX idx_budgets_section_ym ON whooing.budgets(section_id, target_ym);


-- ============================================================
-- 11. Budget Goals  장기 예산목표 설정
--     GET /api/budget_goal.json — 섹션당 1개만 존재
-- ============================================================
CREATE TABLE whooing.budget_goals (
    set_id              INTEGER         PRIMARY KEY,    -- 0이면 설정 없음 (API 기본값)
    section_id          VARCHAR(20)     NOT NULL UNIQUE
                            REFERENCES whooing.sections(section_id),

    base_ym             INTEGER         NOT NULL,   -- 목표 시작 년월 (YYYYMM)
    goal_ym             INTEGER         NOT NULL,   -- 목표 종료 년월 (YYYYMM)

    base_money          NUMERIC(12, 2)  DEFAULT 0,  -- 시작 시점 자산
    goal_money          NUMERIC(12, 2)  NOT NULL,   -- 목표 자산
    base_income         NUMERIC(12, 2)  DEFAULT 0,  -- 연간 수입 예산
    base_expenses       NUMERIC(12, 2)  DEFAULT 0,  -- 연간 지출 예산

    -- 월별 배분 비율 [[수입 1~12월], [지출 1~12월]]
    each_months         JSONB,

    -- 배분 방식: auto(과거 데이터 기반) / equal(균등) / manual(직접입력)
    split_type          VARCHAR(10)     DEFAULT 'auto'
                            CHECK (split_type IN ('auto', 'equal', 'manual')),

    last_modified_at    TIMESTAMPTZ,
    synced_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    original_ref_id     VARCHAR(100)
);

COMMENT ON TABLE  whooing.budget_goals                  IS '섹션별 장기 예산목표 설정. GET /api/budget_goal.json. 섹션당 1개만 존재';
COMMENT ON COLUMN whooing.budget_goals.set_id           IS 'API 반환값 set_id. 0이면 설정 없음';
COMMENT ON COLUMN whooing.budget_goals.base_ym          IS '장기목표 시작 년월 (YYYYMM 정수)';
COMMENT ON COLUMN whooing.budget_goals.goal_ym          IS '장기목표 종료 년월 (YYYYMM 정수). 최소 base_ym+1년, 최대 +10년';
COMMENT ON COLUMN whooing.budget_goals.each_months      IS '월별 배분 비율 JSONB. 구조: [[수입1~12월 비율], [지출1~12월 비율]]';
COMMENT ON COLUMN whooing.budget_goals.split_type       IS 'auto=과거 데이터 기반 자동배분, equal=균등배분, manual=직접입력';
COMMENT ON COLUMN whooing.budget_goals.last_modified_at IS 'API 응답의 last_modified (Unix ts) → TIMESTAMPTZ';


-- ============================================================
-- 12. Goals  월별 자본 목표
--     GET /api/goal.json — budget_goal에서 파생, 산 차트 목표선
-- ============================================================
CREATE TABLE whooing.goals (
    id                  BIGSERIAL       PRIMARY KEY,
    section_id          VARCHAR(20)     NOT NULL
                            REFERENCES whooing.sections(section_id),

    target_ym           INTEGER         NOT NULL,       -- 목표 년월 (YYYYMM 정수)
    money               NUMERIC(12, 2)  NOT NULL,       -- 해당 월말 목표 자본 금액

    synced_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    original_ref_id     VARCHAR(100),

    UNIQUE (section_id, target_ym)
);

COMMENT ON TABLE  whooing.goals             IS '월별 자본 도달 목표. GET /api/goal.json. budget_goal에서 파생되며 산 차트(mountain) 목표 점선으로 시각화';
COMMENT ON COLUMN whooing.goals.target_ym   IS '목표 년월 (YYYYMM 정수, 예: 202601)';
COMMENT ON COLUMN whooing.goals.money       IS '해당 월말 기준 목표 자본 금액. PUT /api/goal.json으로 직접 수정 가능';

CREATE INDEX idx_goals_section_ym ON whooing.goals(section_id, target_ym);


-- ============================================================
-- 13. Post-its  포스트잇 메모
--     GET /api/post_it.json
-- ============================================================
CREATE TABLE whooing.post_its (
    post_it_id          INTEGER         NOT NULL,
    section_id          VARCHAR(20)     NOT NULL
                            REFERENCES whooing.sections(section_id),

    page                VARCHAR(100)    NOT NULL,   -- 표시 위치 페이지 (예: _main/index)
    everywhere          CHAR(1)         DEFAULT 'n'
                            CHECK (everywhere IN ('y', 'n')),
    contents            TEXT            NOT NULL,
    color               VARCHAR(10),                -- RGB 16진수 (예: ffbd94). NULL이면 기본색

    synced_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    original_ref_id     VARCHAR(100),

    PRIMARY KEY (post_it_id, section_id)
);

COMMENT ON TABLE  whooing.post_its              IS '포스트잇 메모. GET /api/post_it.json';
COMMENT ON COLUMN whooing.post_its.page         IS '포스트잇 표시 위치 페이지. _main/index, _main/insert, _main/entries 등 후잉 내부 경로';
COMMENT ON COLUMN whooing.post_its.everywhere   IS 'y이면 모든 페이지에 표시';
COMMENT ON COLUMN whooing.post_its.color        IS '배경색 RGB 16진수 (예: ffbd94). NULL이면 기본 배경색 사용';


-- ============================================================
-- 14. Report Customs  사용자 정의 보고서 행
--     GET /api/main/report_customs.json
-- ============================================================
CREATE TABLE whooing.report_customs (
    custom_id           INTEGER         NOT NULL,
    section_id          VARCHAR(20)     NOT NULL
                            REFERENCES whooing.sections(section_id),

    -- 표시 보고서: report_bs(재무상태표) / report_pl(손익계산서)
    report              VARCHAR(20)     NOT NULL
                            CHECK (report IN ('report_bs', 'report_pl')),

    title               VARCHAR(255)    NOT NULL,

    -- 더할 항목 배열 (예: ["assets_x11", "liabilities_total"])
    plus_items          JSONB           NOT NULL DEFAULT '[]',

    -- 뺄 항목 배열
    minus_items         JSONB           NOT NULL DEFAULT '[]',

    -- plus-minus 결과(x)에 적용할 사칙연산 변환식 (예: "x*0.1", "x+1000")
    addminus            VARCHAR(100)    NOT NULL DEFAULT 'x',

    -- API 응답에 포함된 계산 결과값 (동기화 시 갱신)
    money               NUMERIC(12, 2)  DEFAULT 0,

    sort_order          SMALLINT        DEFAULT 0,

    synced_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    original_ref_id     VARCHAR(100),

    PRIMARY KEY (custom_id, section_id)
);

COMMENT ON TABLE  whooing.report_customs                IS '사용자 정의 보고서 행. GET /api/main/report_customs.json';
COMMENT ON COLUMN whooing.report_customs.report         IS 'report_bs=재무상태표 하단 행, report_pl=손익계산서 하단 행';
COMMENT ON COLUMN whooing.report_customs.plus_items     IS '합산 항목 JSONB 배열. 원소 형식: "<account>_<account_id|total>"  예: ["assets_x11", "liabilities_total"]';
COMMENT ON COLUMN whooing.report_customs.minus_items    IS '차감 항목 JSONB 배열. plus_items와 동일 형식';
COMMENT ON COLUMN whooing.report_customs.addminus       IS 'plus-minus 합계(x)를 추가 변환하는 수식. 예: "x*0.1", "x+1000". 변환 없으면 "x"';
COMMENT ON COLUMN whooing.report_customs.money          IS 'API 계산 결과값 (동기화 시점 스냅샷)';


-- ============================================================
-- 15. Attachments  업로드 파일 레지스트리 (범용)
--     POST/GET /api/upload.json
--     BBS·메시지에도 첨부 가능하므로 entry_attachments와 별도 관리
-- ============================================================
CREATE TABLE whooing.attachments (
    uuid                VARCHAR(100)    PRIMARY KEY,

    src                 VARCHAR(500)    NOT NULL,
    filename            VARCHAR(255),
    mime_type           VARCHAR(100),
    file_size           INTEGER,                    -- bytes

    synced_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    original_ref_id     VARCHAR(100)
);

COMMENT ON TABLE  whooing.attachments           IS '범용 업로드 파일 레지스트리. POST/GET /api/upload.json. BBS·메시지 첨부에 공유 가능';
COMMENT ON COLUMN whooing.attachments.uuid      IS '후잉 파일 UUID (예: "810cbdb1b-7486jvk57"). GET /api/upload.json 응답에서 발급';
COMMENT ON COLUMN whooing.attachments.src       IS '파일 서빙 URL (예: https://static.whooing.com/get/{uuid})';
COMMENT ON COLUMN whooing.attachments.file_size IS '파일 크기 (bytes). API 최대 허용: 20MB = 20,971,520 bytes';


-- ============================================================
-- 16. Message Threads  쪽지 대화 스레드 목록
--     GET /api/messages.json
-- ============================================================
CREATE TABLE whooing.message_threads (
    opponent_user_id    INTEGER         PRIMARY KEY,

    opponent_username   VARCHAR(100),
    opponent_image_url  VARCHAR(500),

    last_summary        TEXT,           -- 마지막 메시지 요약 (API 응답값)
    last_message_at     TIMESTAMPTZ,    -- 마지막 메시지 시각
    last_timestamp_id   VARCHAR(50),    -- 커서 페이징용 ID (소수점 포함 타임스탬프 문자열)
    is_read             CHAR(1)         DEFAULT 'y'
                            CHECK (is_read IN ('y', 'n')),

    synced_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    original_ref_id     VARCHAR(100)
);

COMMENT ON TABLE  whooing.message_threads                   IS '쪽지 대화 목록(상대방별 스레드). GET /api/messages.json';
COMMENT ON COLUMN whooing.message_threads.opponent_user_id  IS '대화 상대의 후잉 user_id';
COMMENT ON COLUMN whooing.message_threads.last_timestamp_id IS 'API 커서 페이징용 timestamp_id (소수점 둘째 자리까지 포함하는 문자열)';
COMMENT ON COLUMN whooing.message_threads.is_read           IS 'n이면 읽지 않은 메시지 존재';


-- ============================================================
-- 17. BBS  게시판
--     GET /api/bbs/:category/:bbs_id.json
-- ============================================================
CREATE TABLE whooing.bbs_posts (
    bbs_id              INTEGER         NOT NULL,
    category            VARCHAR(50)     NOT NULL,   -- 예: free, developer

    group_name          VARCHAR(100),
    subject             VARCHAR(500)    NOT NULL,
    contents            TEXT,
    language            VARCHAR(10),

    writer_user_id      INTEGER,
    writer_username     VARCHAR(100),

    created_at          TIMESTAMPTZ,
    modified_at         TIMESTAMPTZ,

    synced_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    original_ref_id     VARCHAR(100),

    PRIMARY KEY (bbs_id, category)
);

COMMENT ON TABLE  whooing.bbs_posts             IS '게시판 게시글. GET /api/bbs/:category/:bbs_id.json';
COMMENT ON COLUMN whooing.bbs_posts.category    IS '게시판 카테고리 (예: free, developer, humor)';
COMMENT ON COLUMN whooing.bbs_posts.group_name  IS '게시글 그룹 태그';


-- ============================================================
-- 18. BBS Comments  게시판 댓글
-- ============================================================
CREATE TABLE whooing.bbs_comments (
    comment_id          VARCHAR(20)     NOT NULL,   -- 예: "c382445" (c 접두사 포함)
    bbs_id              INTEGER         NOT NULL,
    category            VARCHAR(50)     NOT NULL,

    contents            TEXT            NOT NULL,
    writer_user_id      INTEGER,
    writer_username     VARCHAR(100),

    created_at          TIMESTAMPTZ,
    modified_at         TIMESTAMPTZ,

    synced_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    original_ref_id     VARCHAR(100),

    PRIMARY KEY (comment_id, bbs_id, category),
    FOREIGN KEY (bbs_id, category) REFERENCES whooing.bbs_posts(bbs_id, category)
);

COMMENT ON TABLE  whooing.bbs_comments              IS '게시판 댓글';
COMMENT ON COLUMN whooing.bbs_comments.comment_id   IS '후잉 댓글 ID. 문자 c + 숫자 (예: "c382445")';


-- ============================================================
-- 19. BBS Replies  게시판 대댓글
-- ============================================================
CREATE TABLE whooing.bbs_replies (
    addition_id         INTEGER         NOT NULL,
    comment_id          VARCHAR(20)     NOT NULL,
    bbs_id              INTEGER         NOT NULL,
    category            VARCHAR(50)     NOT NULL,

    contents            VARCHAR(255)    NOT NULL,   -- API 최대 255자
    writer_user_id      INTEGER,
    writer_username     VARCHAR(100),

    created_at          TIMESTAMPTZ,

    synced_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    original_ref_id     VARCHAR(100),

    PRIMARY KEY (addition_id, comment_id, bbs_id, category),
    FOREIGN KEY (comment_id, bbs_id, category)
        REFERENCES whooing.bbs_comments(comment_id, bbs_id, category)
);

COMMENT ON TABLE  whooing.bbs_replies IS '게시판 대댓글 (댓글의 댓글). POST /api/bbs/:category/:bbs_id/:comment_id.json';


-- ============================================================
-- Appendix A: 날짜 필터링 개선 (선택 적용)
--
-- entries.entry_date는 NUMERIC(14,4) 형식이라 일반 DATE 연산이
-- 불편합니다. 아래 GENERATED ALWAYS 컬럼을 추가하면
-- WHERE entry_date_only BETWEEN '2024-01-01' AND '2024-12-31'
-- 형태의 직관적인 쿼리가 가능합니다.
--
-- ALTER TABLE whooing.entries
--     ADD COLUMN entry_date_only DATE
--         GENERATED ALWAYS AS (
--             TO_DATE(FLOOR(entry_date)::BIGINT::TEXT, 'YYYYMMDD')
--         ) STORED;
--
-- CREATE INDEX idx_entries_date_only
--     ON whooing.entries(section_id, entry_date_only DESC);
-- ============================================================

-- ============================================================
-- Appendix B: entries 연도별 파티셔닝 (대용량 대비, 선택 적용)
--
-- 수백만 건 이상의 거래 데이터를 다룬다면 entry_date_only 기준
-- RANGE 파티셔닝을 고려하세요.
-- 단, GENERATED ALWAYS 컬럼을 파티션 키로 쓰려면
-- PostgreSQL 17+ 또는 entry_date_only를 일반 컬럼으로 유지 필요.
-- ============================================================
