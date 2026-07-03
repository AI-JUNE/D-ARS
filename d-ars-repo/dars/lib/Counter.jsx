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
  const started = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') { setN(target); return; }
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setN(target); return; }
    const run = () => {
      if (started.current) return; started.current = true;
      const t0 = performance.now();
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
        setN(target * e);
        if (p < 1) requestAnimationFrame(tick); else setN(target);
      };
      requestAnimationFrame(tick);
    };
    const el = ref.current;
    if (el && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver((es) => {
        es.forEach(x => { if (x.isIntersecting) { run(); io.disconnect(); } });
      }, { threshold: 0.3 });
      io.observe(el);
      return () => io.disconnect();
    }
    run();
  }, [target, dur]);

  const shown = decimals > 0 ? n.toFixed(decimals) : Math.round(n);
  const formatted = hasComma ? Number(shown).toLocaleString('ko-KR') : String(shown);
  return <span ref={ref}>{prefix}{formatted}{suffix}</span>;
}
