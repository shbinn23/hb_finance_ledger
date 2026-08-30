begin;

drop index if exists app.import_batches_source_file_hash_unique_idx;
create unique index import_batches_source_file_hash_unique_idx
  on app.import_batches(source, source_file_hash)
  where source_file_hash is not null
    and status in ('pending', 'applying', 'completed');

insert into app.import_mappings (
  source, mapping_type, source_key, whooing_account_id,
  whooing_account_type, confidence, is_active
) values
  ('pyeonhan_excel', 'asset', '하나 MG+S', 'x45', 'liabilities', 1, true),
  ('pyeonhan_excel', 'asset', '신한 레이디', 'x50', 'liabilities', 1, true),
  ('pyeonhan_excel', 'asset', '국민 CJ', 'x55', 'liabilities', 1, true),
  ('pyeonhan_excel', 'asset', '국민 톡톡', 'x56', 'liabilities', 1, true),
  ('pyeonhan_excel', 'asset', '우체국 개이득', 'x91', 'liabilities', 1, true),
  ('pyeonhan_excel', 'asset', '국민 나사카', 'x93', 'liabilities', 1, true),
  ('pyeonhan_excel', 'asset', '신한 하이패스', 'x94', 'liabilities', 1, true),
  ('pyeonhan_excel', 'asset', '국민 하나투어', 'x98', 'liabilities', 1, true),
  ('pyeonhan_excel', 'asset', '국민은행', 'x3', 'assets', 1, true),
  ('pyeonhan_excel', 'asset', '신한은행', 'x24', 'assets', 1, true),
  ('pyeonhan_excel', 'asset', '우체국', 'x28', 'assets', 1, true),
  ('pyeonhan_excel', 'asset', '새마을금고', 'x29', 'assets', 1, true),
  ('pyeonhan_excel', 'asset', '민생지원쿠폰', 'x41', 'assets', 1, true),
  ('pyeonhan_excel', 'asset', '신한 참신한파킹', 'x97', 'assets', 1, true),
  ('pyeonhan_excel', 'asset', '현금', 'x99', 'assets', 1, true),
  ('pyeonhan_excel', 'expense_category', '필수 / 식비', 'x61', 'expenses', 1, true),
  ('pyeonhan_excel', 'expense_category', '필수 / 통신', 'x62', 'expenses', 1, true),
  ('pyeonhan_excel', 'expense_category', '필수 / 생필품', 'x63', 'expenses', 1, true),
  ('pyeonhan_excel', 'expense_category', '필수 / 주거', 'x64', 'expenses', 1, true),
  ('pyeonhan_excel', 'expense_category', '필수 / 보험', 'x65', 'expenses', 1, true),
  ('pyeonhan_excel', 'expense_category', '필수 / 교통', 'x66', 'expenses', 1, true),
  ('pyeonhan_excel', 'expense_category', '준필수 / 구독', 'x68', 'expenses', 1, true),
  ('pyeonhan_excel', 'expense_category', '준필수 / 차량', 'x69', 'expenses', 1, true),
  ('pyeonhan_excel', 'expense_category', '준필수 / 피트니스', 'x70', 'expenses', 1, true),
  ('pyeonhan_excel', 'expense_category', '준필수 / 생필품', 'x71', 'expenses', 1, true),
  ('pyeonhan_excel', 'expense_category', '준필수 / 병원·약국', 'x72', 'expenses', 1, true),
  ('pyeonhan_excel', 'expense_category', '선택 / 식비', 'x74', 'expenses', 1, true),
  ('pyeonhan_excel', 'expense_category', '선택 / 카페·간식', 'x75', 'expenses', 1, true),
  ('pyeonhan_excel', 'expense_category', '선택 / 컨텐츠', 'x76', 'expenses', 1, true),
  ('pyeonhan_excel', 'expense_category', '선택 / 데이트', 'x77', 'expenses', 1, true),
  ('pyeonhan_excel', 'expense_category', '선택 / 담배', 'x78', 'expenses', 1, true),
  ('pyeonhan_excel', 'expense_category', '선택 / 라이프', 'x79', 'expenses', 1, true),
  ('pyeonhan_excel', 'expense_category', '예비·기타 / 이벤트', 'x83', 'expenses', 1, true),
  ('pyeonhan_excel', 'income_category', '기타', 'x10', 'income', 1, true),
  ('pyeonhan_excel', 'income_category', '💰 월급', 'x85', 'income', 1, true),
  ('pyeonhan_excel', 'income_category', '정산', 'x10', 'income', 1, true)
on conflict (source, mapping_type, source_key) do nothing;

commit;
