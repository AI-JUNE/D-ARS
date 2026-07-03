'use client';
import { useState } from 'react';
import { NODE_TYPES } from '@/lib/ui';

/* 화면 템플릿 — 보이는 ARS에서 고객 휴대폰에 표출되는 화면 카드 템플릿 갤러리.
   시나리오 노드에 연결해 재사용. 정적/읽기 전용 · 모바일 우선 · 브랜드 #be5535. */

const TEMPLATES = [
  { id: 'T-ORDER', node: 'SHOW_CARD', name: '주문 상세 카드', use: 8, desc: '상품·주문번호·결제금액을 카드로 안내',
    rows: [['상품', '한우 등심 세트 1.2kg'], ['주문번호', '2026-0703-8841'], ['결제금액', '₩129,000']] },
  { id: 'T-TRACK', node: 'SHOW_CARD', name: '배송 추적 카드', use: 6, desc: '송장·현재 위치·예상 도착 안내',
    rows: [['송장번호', '6483-1120-7755'], ['현재 위치', '동서울 물류센터'], ['예상 도착', '오늘 18시']] },
  { id: 'T-DOC', node: 'REQUEST_DOC', name: '필요서류 안내 카드', use: 7, desc: '접수서 작성·문자 발송 버튼 포함',
    rows: [['서류', '반품 접수서'], ['입력', '불량 사유·환불 계좌'], ['발송', '문자 링크']] },
  { id: 'T-MENU', node: 'SHOW_MENU', name: '메뉴 표출', use: 5, desc: '자주 찾는 업무를 버튼 메뉴로 제시',
    rows: [['① 주문상세', '조회'], ['② 배송추적', '조회'], ['③ 필요서류', '안내']] },
  { id: 'T-RAG', node: 'RAG_ANSWER', name: 'RAG 응답 카드', use: 4, desc: '지식베이스 기반 FAQ 답변 표출',
    rows: [['질문', '반품 기간이 어떻게 되나요?'], ['답변', '수령일로부터 7일 이내'], ['근거', '이용약관 §12']] },
  { id: 'T-SWITCH', node: 'CHANNEL_SWITCH', name: '채널 전환 카드', use: 3, desc: '상담원 연결·콜백 예약 안내',
    rows: [['대기', '약 1분'], ['옵션', '지금 연결 / 콜백 예약'], ['안내', '상담 이력 자동 전달']] },
];

function Preview({ t }) {
  const nt = NODE_TYPES[t.node] || { ic: '🗂️', c: '#be5535' };
  return (
    <div style={{ background: '#f4f1ee', borderRadius: 16, padding: 12, border: '1px solid var(--line)' }}>
      <div style={{ background: 'linear-gradient(135deg,#be5535,#9c4025)', color: '#fff', borderRadius: '12px 12px 0 0', padding: '10px 12px', fontSize: 12, fontWeight: 700 }}>
        📞 보이는 ARS · 화면 안내
      </div>
      <div style={{ background: '#fff', border: '1px solid #e6ddd7', borderTop: 0, borderRadius: '0 0 12px 12px', padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ width: 28, height: 28, borderRadius: 8, background: nt.c, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 15 }}>{nt.ic}</span>
          <b style={{ fontSize: 13 }}>{t.name}</b>
        </div>
        {t.rows.map(([k, v], i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px dashed #eee', fontSize: 12.5 }}>
            <span className="muted">{k}</span><b style={{ textAlign: 'right', maxWidth: '62%' }}>{v}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Templates() {
  const [active, setActive] = useState(null);
  return (
    <>
      <div className="sectionhead">
        <h2>화면 템플릿</h2>
        <span className="d">보이는 ARS 표출 화면 카드 · 시나리오 노드에 연결해 재사용</span>
      </div>

      <div className="grid g3">
        {TEMPLATES.map(t => {
          const nt = NODE_TYPES[t.node];
          return (
            <div key={t.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <b style={{ fontSize: 14 }}>{t.name}</b>
                <span className="sp" />
                <span className="tag t-mut">사용 {t.use}</span>
              </div>
              <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>{t.desc}</div>
              <Preview t={t} />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="tag t-info">{nt ? nt.ic + ' ' + nt.name : t.node}</span>
                <span className="sp" />
                <button className="btn sm" onClick={() => setActive(active === t.id ? null : t.id)}>
                  {active === t.id ? '닫기' : '연결 정보'}
                </button>
              </div>
              {active === t.id && (
                <div className="muted" style={{ fontSize: 12, background: 'var(--brand-xl)', borderRadius: 10, padding: 10, lineHeight: 1.6 }}>
                  템플릿 ID <b>{t.id}</b> · 노드 타입 <b>{t.node}</b><br />
                  [시나리오 관리]에서 해당 노드에 이 템플릿을 지정하면 통화 흐름에 맞춰 자동 표출됩니다.
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
          화면 템플릿은 시나리오 노드(정보 카드·필요서류 안내·메뉴 표출·RAG 응답·채널 전환)에 연결되어
          고객 휴대폰에 표출됩니다. 브랜드 컬러·레이아웃은 <b>#be5535</b> 기준으로 통일됩니다.
        </div>
      </div>
    </>
  );
}
