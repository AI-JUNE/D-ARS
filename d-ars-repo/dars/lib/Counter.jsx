'use client';
import { useEffect, useRef, useState } from 'react';

// KPI 숫자("1,220" · "74%" · "4,182")를 카운트업 애니메이션으로 표시.
// 접두/접미 기호(예: %, 쉼표)를 보존하고, 화면에 들어올 때 1회 실행.
// prefers-reduced-motion 사용자는 즉시 최종값 표시(접근성).
export default function Counter({ value, dur = 900 }) {
  const raw = String(value);
  const m = raw.match(/^([^0-9.-]*)([0-9,.]+)(.*)$/) || [null, '', raw, ''];
  const prefix = m[1] || '';
  const numStr = m[2] || '0';
  const suffix = m[3] || '';
  const target = parseFloat(numStr.replace(/,/g, '')) || 0;
  const hasComma = numStr.includes(',');
  const decimals = (numStr.split('.')[1] || '').length;

  const [n, setN] = useState(0);
  const ref = useRef(null);
  const started = useRef(false); // 화면 진입(IntersectionObserver) 1회 트리거 여부
  const cur = useRef(0);         // 현재 표시값 — 값이 갱신되면 여기서 새 목표로 이어서 애니메이션
  const raf = useRef(0);

  // 값이 서버 데이터로 나중에 갱신되어도(KPI 하드코딩 → 서버 집계 전환) 반드시 새 목표로 다시 움직인다.
  // (기존 구현은 최초 1회만 실행돼, 데이터 도착 후 값이 갱신되지 않는 버그가 있었다.)
  useEffect(() => {
    const set = (v) => { cur.current = v; setN(v); };
    if (typeof window === 'undefined') { set(target); return; }
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { set(target); return; }

    const run = () => {
      const from = cur.current;
      if (from === target) { set(target); return; }
      const t0 = performance.now();
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
        set(from + (target - from) * e);
        if (p < 1) raf.current = requestAnimationFrame(tick); else set(target);
      };
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(tick);
    };

    const el = ref.current;
    if (!started.current && el && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver((es) => {
        es.forEach(x => { if (x.isIntersecting) { started.current = true; run(); io.disconnect(); } });
      }, { threshold: 0.3 });
      io.observe(el);
      return () => { io.disconnect(); cancelAnimationFrame(raf.current); };
    }
    started.current = true;
    run();
    return () => cancelAnimationFrame(raf.current);
  }, [target, dur]);

  const shown = decimals > 0 ? n.toFixed(decimals) : Math.round(n);
  const formatted = hasComma ? Number(shown).toLocaleString('ko-KR') : String(shown);
  return <span ref={ref}>{prefix}{formatted}{suffix}</span>;
}
