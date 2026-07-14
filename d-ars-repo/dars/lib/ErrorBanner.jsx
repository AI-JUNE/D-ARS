'use client';
import { useEffect, useState } from 'react';
// lib/ErrorBanner.jsx — 데이터 로드/저장 실패를 알리는 공통 인라인 배너 (상용 에러처리 UX)
// 디자인 원칙: 모바일 무붕괴·무오버랩 — 폭 100%, 긴 메시지는 줄바꿈, 버튼은 축소되지 않음.
export default function ErrorBanner({ message, onRetry, retryLabel = '다시 시도' }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        margin: '12px 0', padding: '10px 12px', borderRadius: 10,
        background: '#fdf3f0', border: '1px solid #eccdc4', color: '#8c3a27',
        fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word',
      }}
    >
      <span aria-hidden="true" style={{ flex: '0 0 auto' }}>⚠️</span>
      <span style={{ flex: '1 1 160px', minWidth: 0 }}>{message}</span>
      {onRetry && (
        <button className="btn sm" style={{ flex: '0 0 auto' }} onClick={onRetry}>{retryLabel}</button>
      )}
    </div>
  );
}

// 브라우저 온라인 상태 구독 훅(SSR 안전: 서버 렌더 시 항상 true → 하이드레이션 불일치 없음).
export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(typeof navigator === 'undefined' ? true : navigator.onLine !== false);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);
  return online;
}

// 전역 오프라인 배너: 네트워크가 끊기면 포털 상단에 노출되어
// "화면이 갱신되지 않는 이유"를 사용자에게 즉시 알린다. 온라인 복귀 시 자동으로 사라진다.
// 레이아웃 무붕괴: 문서 흐름 안(인라인)에 배치 — 겹침·가림 없음, 모바일에서 줄바꿈.
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        margin: '0 0 12px', padding: '10px 12px', borderRadius: 10,
        background: '#fff8e6', border: '1px solid #eddcb0', color: '#7a5a12',
        fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word',
      }}
    >
      <span aria-hidden="true" style={{ flex: '0 0 auto' }}>📶</span>
      <span style={{ flex: '1 1 160px', minWidth: 0 }}>
        오프라인 상태입니다. 네트워크 연결을 확인해 주세요. 연결이 복구되면 자동으로 갱신됩니다.
      </span>
    </div>
  );
}
