'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/* 전역 커맨드 팔레트 (prism-pms 빠른 이동 UX 반영)
   - Cmd/Ctrl+K 또는 상단 검색 버튼으로 열기 · 초성/영문 키워드 검색
   - 키보드: ↑↓ 이동 · Enter 실행 · Esc 닫기 · 모바일 무붕괴 · prefers-reduced-motion 존중 */
const DESTS = [
  ['/dashboard','📊','대시보드','운영 · 대시보드','daeshiboard dashboard home hub 홈 운영'],
  ['/sessions','📡','실시간 세션','운영 · 모니터링','session sesyeon live monitor 실시간 모니터링 콜봇'],
  ['/history','🗂️','멀티모달 이력','운영 · 상호작용 로그','history log multimodal 이력 채널 로그 상호작용'],
  ['/stats','📈','이용 통계','분석 · 통계','stats tonggye analytics 통계 분석 이용'],
  ['/report','📄','운영 리포트','운영 · 리포트(PDF)','report riport pdf 리포트 인쇄'],
  ['/notifications','🔔','알림 센터','운영 · 알림','notification allim 알림 경고 벨'],
  ['/scenarios','🧩','시나리오 관리','콘텐츠 · 비주얼 시나리오','scenario sinario 시나리오 노드 보드 타임라인'],
  ['/templates','🖼️','화면 템플릿','콘텐츠 · 표출 화면','template templit 템플릿 화면 갤러리'],
  ['/launcher','⚙️','런처 설정','콘텐츠 · 보이는 ARS 런처','launcher reoncheo 런처 설정 트리거 sms'],
  ['/docs','📋','필요서류 관리','콘텐츠 · 서류','docs seoryu 서류 문서 필요서류'],
  ['/ums','✉️','UMS 문자발송','발송 · UMS','ums munja sms 문자 발송'],
  ['/help','❓','도움말','지원 · FAQ','help doumal faq 도움말 지원'],
  ['/visual','📱','보이는 ARS 데모','고객 화면','visual demo 보이는 데모 고객'],
  ['/','🏢','서비스 홈','랜딩','home service 홈 랜딩 서비스'],
];

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // 전역 단축키 (Cmd/Ctrl+K) + 커스텀 open 이벤트 (상단 버튼)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault(); setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('dars:cmdk', onOpen);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('dars:cmdk', onOpen); };
  }, []);

  useEffect(() => {
    if (open) { setQ(''); setI(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return DESTS;
    return DESTS.filter(([href, e, label, crumb, kw]) =>
      (label + ' ' + crumb + ' ' + kw + ' ' + href).toLowerCase().includes(s));
  }, [q]);

  useEffect(() => { setI(0); }, [q]);
  useEffect(() => {
    const el = listRef.current?.querySelector('.cmdk-item.on');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [i, results]);

  const go = (href) => { setOpen(false); router.push(href); };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setI((v) => Math.min(v + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setI((v) => Math.max(v - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const r = results[i]; if (r) go(r[0]); }
  };

  if (!open) return null;
  return (
    <div className="cmdk-scrim" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label="빠른 이동">
      <div className="cmdk" onClick={(e) => e.stopPropagation()}>
        <div className="cmdk-in">
          <span className="cmdk-ic" aria-hidden>🔍</span>
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder="페이지 이동 · 검색 (예: 세션, 통계, ums)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="빠른 이동 검색"
          />
          <kbd className="cmdk-esc">Esc</kbd>
        </div>
        <div className="cmdk-list" ref={listRef}>
          {results.length === 0 && <div className="cmdk-empty">결과 없음 · 다른 검색어를 입력하세요</div>}
          {results.map(([href, e, label, crumb], idx) => (
            <button
              key={href}
              className={'cmdk-item' + (idx === i ? ' on' : '')}
              onMouseEnter={() => setI(idx)}
              onClick={() => go(href)}
            >
              <span className="cmdk-e" aria-hidden>{e}</span>
              <span className="cmdk-t"><b>{label}</b><span>{crumb}</span></span>
              <span className="cmdk-go" aria-hidden>↵</span>
            </button>
          ))}
        </div>
        <div className="cmdk-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> 이동</span>
          <span><kbd>↵</kbd> 열기</span>
          <span><kbd>Esc</kbd> 닫기</span>
          <span className="sp" />
          <span className="muted">빠른 이동 · <kbd>Ctrl</kbd>+<kbd>K</kbd></span>
        </div>
      </div>
    </div>
  );
}
