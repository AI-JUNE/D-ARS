-- Seed data (개발/데모)
insert into scenarios (id,name,type,status,version,nodes,updated_by,updated_at) values
('SC-01','반품·교환·환불','인바운드','운영',7,
 '[{"id":1,"type":"VISUAL_LAUNCH","label":"상담 시작 화면 런칭"},{"id":2,"type":"SHOW_CARD","label":"주문 상세 카드"},{"id":3,"type":"REQUEST_DOC","label":"반품 접수서 안내+문자"},{"id":4,"type":"CHANNEL_SWITCH","label":"상담원 전환(미해결)"},{"id":5,"type":"END","label":"만족도 조사"}]'::jsonb,
 '김운영','2026-06-28'),
('SC-02','주문/배송 조회','인바운드','운영',4,
 '[{"id":1,"type":"VISUAL_LAUNCH","label":"조회 화면 런칭"},{"id":2,"type":"SHOW_CARD","label":"배송 추적 카드"},{"id":3,"type":"RAG_ANSWER","label":"배송 FAQ"},{"id":4,"type":"END","label":"종료"}]'::jsonb,
 '김운영','2026-06-20'),
('SC-03','영수증·증빙 발급','인바운드','운영',2,
 '[{"id":1,"type":"VISUAL_LAUNCH","label":"발급 화면 런칭"},{"id":2,"type":"SHOW_CARD","label":"전자 영수증 카드"},{"id":3,"type":"REQUEST_DOC","label":"거래 영수증 UMS"},{"id":4,"type":"END","label":"종료"}]'::jsonb,
 '박환불','2026-06-25'),
('SC-04','이탈고객 재안내(OB)','아웃바운드','미운영',1,
 '[{"id":1,"type":"VISUAL_LAUNCH","label":"재안내 화면"},{"id":2,"type":"SHOW_MENU","label":"재예약 메뉴"},{"id":3,"type":"END","label":"종료"}]'::jsonb,
 '박환불','2026-06-29')
on conflict (id) do nothing;

insert into docs (id,biz,name,req,sent,done,in_use) values
('D1','반품·교환','반품 접수서',540,512,430,true),
('D2','결제','거래 영수증',420,400,352,true),
('D3','배송','배송 확인서',260,248,201,true),
('D4','멤버십','등급 안내문',180,170,120,true),
('D5','결제','세금계산서',96,88,70,false)
on conflict (id) do nothing;

insert into daily_stats (day,inbound,multimodal,completed,dropped) values
('2026-06-27',3980,505,860,300),
('2026-06-28',4120,528,880,312),
('2026-06-29',4050,516,872,305),
('2026-06-30',4210,540,905,318),
('2026-07-01',4080,505,860,309),
('2026-07-02',4260,560,918,320),
('2026-07-03',4182,540,902,318)
on conflict (day) do nothing;
