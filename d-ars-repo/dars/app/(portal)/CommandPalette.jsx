'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { trapTabKey } from '@/lib/focusTrap';

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
  const boxRef = useRef(null); // Tab 포커스 트랩 경계(aria-modal 규격)
  const prevFocus = useRef(null); // 닫을 때 포커스 복귀용(WCAG 2.4.3 Focus Order)

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
    if (open) {
      // 열릴 때: 트리거 요소를 기억해 두고 입력으로 포커스 이동
      prevFocus.current = document.activeElement;
      setQ(''); setI(0); setTimeout(() => inputRef.current?.focus(), 30);
    } else if (prevFocus.current) {
      // 닫힐 때: 열었던 버튼(Ctrl+K 포함)으로 포커스 복귀 — 키보드 사용자가 문서 처음으로 튕기지 않게
      if (typeof prevFocus.current.focus === 'function') prevFocus.current.focus();
      prevFocus.current = null;
    }
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
      {/* Esc 는 입력뿐 아니라 결과 버튼에 포커스가 있어도 닫혀야 한다(다이얼로그 어디서든) —
          입력의 onKeyDown 과 중복 발화해도 setOpen(false) 멱등이라 무해.
          Tab 은 다이얼로그 경계에서 순환(trapTabKey) — aria-modal 인데 배경으로 새던 것을 차단(WAI-ARIA dialog 규격) */}
      <div
        className="cmdk"
        ref={boxRef}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); else if (e.key === 'Tab') trapTabKey(e, boxRef.current); }}
      >
        <div className="cmdk-in">
          <span className="cmdk-ic" aria-hidden>🔍</span>
          {/* combobox+listbox 시맨틱: 스크린리더가 "검색 → N개 결과 중 현재 항목"을 낭독(aria-activedescendant) */}
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder="페이지 이동 · 검색 (예: 세션, 통계, ums)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            enterKeyHint="go"
            aria-label="빠른 이동 검색"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-results"
            aria-activedescendant={results.length ? `cmdk-opt-${i}` : undefined}
            aria-autocomplete="list"
          />
          <kbd className="cmdk-esc" aria-hidden>Esc</kbd>
        </div>
        <div className="cmdk-list" ref={listRef} id="cmdk-results" role="listbox" aria-label="이동할 페이지">
          {results.length === 0 && <div className="cmdk-empty" role="status">결과 없음 · 다른 검색어를 입력하세요</div>}
          {results.map(([href, e, label, crumb], idx) => (
            <button
              key={href}
              type="button"
              id={`cmdk-opt-${idx}`}
              role="option"
              aria-selected={idx === i}
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
