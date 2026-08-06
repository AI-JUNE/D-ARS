'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { makeToast } from '@/lib/toast';

// lib/Toast.jsx — 비차단 토스트 알림(108회차) — window.alert() 대체.
// 접근성: 호스트(role="status")를 **항상 마운트**해 두고 내용만 갈아끼운다
//   → 라이브 리전이 내용과 함께 삽입되면 스크린리더가 낭독을 건너뛸 수 있는
//     알려진 함정을 회피(빈 리전에 '내용이 추가'되는 형태라 확실히 낭독됨).
// 타이밍: 자동 소멸(길이 비례, lib/toast.js)이지만 ✕ 닫기 버튼도 제공(WCAG 2.2.1 취지).
// 레이아웃: position:fixed 하단 중앙(문서 흐름 밖) → 무붕괴·무오버랩,
//   모바일에선 하단 탭(.botnav) 위로 띄운다(globals.css). 인쇄 시 숨김(noprint).

// 화면당 1개(최신 우선) 토스트 훅. show() 는 이전 타이머를 정리하고 새로 시작한다.
export function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const seq = useRef(0);

  const clear = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  }, []);

  const dismiss = useCallback(() => { clear(); setToast(null); }, [clear]);

  const show = useCallback((msg, kind) => {
    const t = makeToast({ id: seq.current }, msg, kind);
    seq.current = t.id;
    clear();
    setToast(t);
    timer.current = setTimeout(() => { timer.current = null; setToast(null); }, t.ms);
  }, [clear]);

  useEffect(() => clear, [clear]); // 언마운트 시 타이머 정리(누수 방지)

  return { toast, show, dismiss };
}

export default function Toast({ t, onClose }) {
  return (
    <div className="toasthost noprint" role="status">
      {t && (
        <div key={t.id} className={'toast' + (t.kind === 'warn' ? ' warn' : '')}>
          <span className="msg">{t.msg}</span>
          <button type="button" className="x" aria-label="알림 닫기" onClick={onClose}>✕</button>
        </div>
      )}
    </div>
  );
}
