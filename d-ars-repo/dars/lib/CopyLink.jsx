'use client';
// lib/CopyLink.jsx — **🔗 링크 복사**(현재 조회 조건의 공유 링크를 클립보드에 복사)
//
//   <CopyLink />   ← 목록 화면 툴바(저장된 뷰 줄)에 자동 배치된다(SavedViews 가 품는다)
//
// 무엇을 복사하나: **현재 주소의 절대 URL**(기간·검색어·필터·뷰·정렬이 모두 쿼리에 들어 있다).
//   → 받는 사람이 열면 **내가 보던 화면 그대로** 재현된다(저장된 뷰가 localStorage 전용이라
//     남에게 건넬 수 없던 문제를 해소 — 21회차).
// 복사 실패(권한 거부·비보안 컨텍스트) 시에는 링크를 **prompt 로 띄워** 직접 복사할 수 있게 한다
//   → 어떤 환경에서도 "복사할 수 없다"로 끝나지 않는다.
//
// 상태 표기: 복사 성공 시 1.6초간 '✓ 복사됨'(aria-live 로 스크린리더에도 알림).
// SSR 안전: 렌더에 location 을 읽지 않는다(클릭 시점에만 읽는다) → 하이드레이션 불일치 없음.
// 모바일: flex-wrap 으로 줄바꿈 → 320px 무붕괴·무오버랩. 인쇄 시 숨김.

import { useCallback, useEffect, useRef, useState } from 'react';
import { copyText, shareUrl } from '@/lib/shareLink';

export default function CopyLink({ label = '링크 복사', style }) {
  const [done, setDone] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = useCallback(async () => {
    let url = '';
    try {
      url = shareUrl(window.location.origin, window.location.pathname, window.location.search);
    } catch {
      return; // location 접근 실패(샌드박스 iframe 등) → 아무 일도 일어나지 않는다
    }
    const ok = await copyText(url);
    if (ok) {
      setDone(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setDone(false), 1600);
      return;
    }
    try { window.prompt('아래 링크를 복사하세요', url); } catch { /* noop */ }
  }, []);

  return (
    <button
      type="button"
      className="btn sm noprint"
      title="현재 기간·검색어·필터·정렬 조건이 그대로 담긴 링크를 복사합니다(받는 사람이 같은 화면을 봅니다)"
      onClick={copy}
      style={{ flex: '0 0 auto', ...style }}
    >
      <span aria-live="polite">{done ? '✓ 복사됨' : `🔗 ${label}`}</span>
    </button>
  );
}
