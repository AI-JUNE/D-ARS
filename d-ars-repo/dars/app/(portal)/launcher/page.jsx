'use client';
import { useMemo, useState } from 'react';

/* 런처 설정 — 보이는 ARS가 고객 휴대폰에 "언제/어떻게" 표출되는지 구성.
   단일 HTML 포털의 런처 설정을 Next로 이식. 정적/클라이언트 상태 · 모바일 우선 · 브랜드 #be5535.
   저장은 데모(로컬 상태)로 동작하며 실제 반영은 콜봇 런처 연동 예정. */

const DEFAULTS = {
  trigger: 'auto',
  invite: true,
  inviteText: '[GOWON] 보이는 ARS로 더 편하게 안내해 드릴게요. 아래 링크를 눌러 화면으로 확인하세요 ▶ https://d-ars.app/v/{code}',
  header: '보이는 ARS · 화면 안내',
  brandName: 'GOWON',
  fallbackVoice: true,
  timeout: 5,
  autoClose: true,
};

const TRIGGERS = [
  ['auto', '🚀', '통화 연결 시 자동', '연결 즉시 지원 단말에 런처를 표출'],
  ['agent', '🙋', '상담원 요청 시', '상담원이 "화면 안내"를 누르면 표출'],
  ['scenario', '🧩', '지정 시나리오만', '런처 노드가 포함된 시나리오에서만 표출'],
];

function Row({ label, hint, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px dashed var(--line)', flexWrap: 'wrap' }}>
      <div style={{ minWidth: 130, flex: '1 1 130px' }}>
        <b style={{ fontSize: 13 }}>{label}</b>
        {hint && <div className="muted" style={{ fontSize: 11.5, marginTop: 2, lineHeight: 1.4 }}>{hint}</div>}
      </div>
      <div style={{ flex: '2 1 220px', minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>{children}</div>
    </div>
  );
}

function Toggle({ on, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      style={{
        width: 46, height: 26, borderRadius: 999, border: 0, cursor: 'pointer', padding: 3,
        background: on ? 'var(--brand)' : '#cfc3bc', transition: 'background .15s', flex: '0 0 auto',
        display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start',
      }}>
      <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.25)' }} />
    </button>
  );
}

export default function Launcher() {
  const [cfg, setCfg] = useState(DEFAULTS);
  const [saved, setSaved] = useState(false);
  const set = (k, v) => { setCfg(c => ({ ...c, [k]: v })); setSaved(false); };
  const dirty = useMemo(() => JSON.stringify(cfg) !== JSON.stringify(DEFAULTS), [cfg]);
  const trg = TRIGGERS.find(t => t[0] === cfg.trigger);

  return (
    <>
      <div className="sectionhead">
        <h2>런처 설정</h2>
        <span className="d">보이는 ARS가 고객 휴대폰에 표출되는 방식 · 초대 문구 · 폴백 정책을 구성</span>
      </div>

      <div className="grid g2" style={{ alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <b style={{ fontSize: 14 }}>표출 트리거</b>
            <div className="muted" style={{ fontSize: 12, margin: '4px 0 12px' }}>런처를 언제 띄울지 선택합니다.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {TRIGGERS.map(([id, ic, name, desc]) => {
                const on = cfg.trigger === id;
                return (
                  <button key={id} type="button" onClick={() => set('trigger', id)}
                    style={{
                      textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                      padding: 11, borderRadius: 11, background: on ? 'var(--brand-xl)' : '#fff',
                      border: '1.5px solid ' + (on ? 'var(--brand)' : 'var(--line)'),
                    }}>
                    <span style={{ fontSize: 18 }}>{ic}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b style={{ fontSize: 13 }}>{name}</b>
                      <div className="muted" style={{ fontSize: 11.5, marginTop: 1, lineHeight: 1.4 }}>{desc}</div>
                    </span>
                    <span style={{
                      width: 18, height: 18, borderRadius: '50%', flex: '0 0 auto',
                      border: '2px solid ' + (on ? 'var(--brand)' : '#cbbfb8'),
                      background: on ? 'var(--brand)' : '#fff',
                      boxShadow: on ? 'inset 0 0 0 3px #fff' : 'none',
                    }} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="card">
            <b style={{ fontSize: 14 }}>초대 · 브랜딩</b>
            <div style={{ marginTop: 6 }}>
              <Row label="문자(SMS) 초대" hint="미지원 단말/미응답 시 초대 링크를 문자로 발송">
                <Toggle on={cfg.invite} onClick={() => set('invite', !cfg.invite)} />
              </Row>
              <div style={{ padding: '12px 0', borderBottom: '1px dashed var(--line)', opacity: cfg.invite ? 1 : .45 }}>
                <b style={{ fontSize: 13 }}>초대 문구</b>
                <div className="muted" style={{ fontSize: 11.5, margin: '2px 0 8px' }}>{'{code}'}는 세션 코드로 자동 치환됩니다.</div>
                <textarea className="input" rows={3} value={cfg.inviteText} disabled={!cfg.invite}
                  onChange={e => set('inviteText', e.target.value)}
                  style={{ width: '100%', resize: 'vertical', fontSize: 12.5, lineHeight: 1.5, fontFamily: 'inherit' }} />
              </div>
              <Row label="상단 헤더 문구" hint="런처 화면 최상단에 표시">
                <input className="input" value={cfg.header} onChange={e => set('header', e.target.value)} style={{ width: '100%', maxWidth: 240 }} />
              </Row>
              <Row label="브랜드 표기" hint="발신 주체 · 로고 텍스트">
                <input className="input" value={cfg.brandName} onChange={e => set('brandName', e.target.value)} style={{ width: '100%', maxWidth: 240 }} />
              </Row>
              <Row label="브랜드 컬러" hint="전 화면 공통(고정)">
                <span className="tag" style={{ background: 'var(--brand)', color: '#fff' }}>#be5535</span>
              </Row>
            </div>
          </div>

          <div className="card">
            <b style={{ fontSize: 14 }}>세션 · 폴백 정책</b>
            <div style={{ marginTop: 6 }}>
              <Row label="음성 ARS 유지" hint="화면 미지원/미응답 시 기존 음성 흐름 계속">
                <Toggle on={cfg.fallbackVoice} onClick={() => set('fallbackVoice', !cfg.fallbackVoice)} />
              </Row>
              <Row label="세션 타임아웃" hint="무응답 시 런처 자동 종료(분)">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="range" min={1} max={15} value={cfg.timeout} onChange={e => set('timeout', +e.target.value)} style={{ accentColor: 'var(--brand)' }} />
                  <b style={{ fontSize: 13, minWidth: 42, textAlign: 'right' }}>{cfg.timeout}분</b>
                </div>
              </Row>
              <Row label="완료 시 자동 종료" hint="시나리오 종료 노드 도달 시 런처 닫기">
                <Toggle on={cfg.autoClose} onClick={() => set('autoClose', !cfg.autoClose)} />
              </Row>
            </div>
          </div>

          <div className="toolbar" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="btn primary" onClick={() => setSaved(true)}>설정 저장</button>
            <button className="btn sm" onClick={() => { setCfg(DEFAULTS); setSaved(false); }} disabled={!dirty}>기본값 복원</button>
            <span className="sp" />
            {saved && <span className="tag t-ok">✓ 저장됨(데모)</span>}
            {!saved && dirty && <span className="tag t-warn">저장되지 않은 변경</span>}
          </div>
        </div>

        <div className="card" style={{ position: 'sticky', top: 76 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <b style={{ fontSize: 14 }}>라이브 미리보기</b>
            <span className="sp" />
            <span className="tag t-info">{trg ? trg[1] + ' ' + trg[2] : ''}</span>
          </div>

          <div style={{ maxWidth: 300, margin: '0 auto' }}>
            {cfg.invite && (
              <div style={{ marginBottom: 14 }}>
                <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>① 문자 초대</div>
                <div style={{ background: '#e9f0f7', border: '1px solid #d3e0ee', borderRadius: '4px 14px 14px 14px', padding: '10px 12px', fontSize: 12.5, lineHeight: 1.55, color: '#1f3b57' }}>
                  {cfg.inviteText.replace('{code}', '8F2K')}
                </div>
              </div>
            )}

            <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>② 런처 화면</div>
            <div style={{ border: '9px solid #201814', borderRadius: 30, overflow: 'hidden', boxShadow: 'var(--shadow)', background: '#201814' }}>
              <div style={{ background: '#f4f1ee' }}>
                <div style={{ background: 'linear-gradient(135deg,#be5535,#9c4025)', color: '#fff', padding: '14px 14px 12px' }}>
                  <div style={{ fontSize: 10.5, opacity: .85, fontWeight: 700, letterSpacing: .3 }}>📞 {cfg.brandName || 'GOWON'}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, marginTop: 3 }}>{cfg.header || '보이는 ARS'}</div>
                </div>
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ background: '#fff', border: '1px solid #e6ddd7', borderRadius: 12, padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ width: 26, height: 26, borderRadius: 8, background: '#2e8b57', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 14 }}>🗂️</span>
                      <b style={{ fontSize: 12.5 }}>주문 상세 카드</b>
                    </div>
                    {[['상품', '한우 등심 세트'], ['주문번호', '2026-0703-8841'], ['결제금액', '₩129,000']].map(([k, v], i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px dashed #eee', fontSize: 11.5 }}>
                        <span className="muted">{k}</span><b>{v}</b>
                      </div>
                    ))}
                  </div>
                  <button style={{ background: 'var(--brand)', color: '#fff', border: 0, borderRadius: 10, padding: '10px', fontSize: 12.5, fontWeight: 700 }}>필요서류 안내받기</button>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 5, fontSize: 10, color: '#9a8a82', marginTop: 2 }}>
                    <span>⏱ {cfg.timeout}분 무응답 시 종료</span>
                    {cfg.fallbackVoice && <span>· 🎧 음성 유지</span>}
                  </div>
                </div>
              </div>
            </div>
            <div className="muted" style={{ fontSize: 11, textAlign: 'center', marginTop: 10, lineHeight: 1.5 }}>
              위 미리보기는 현재 설정을 실시간 반영합니다.<br />실제 표출은 콜봇 런처 연동 시 적용됩니다.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
