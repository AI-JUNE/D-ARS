'use client';
// lib/RangeSeg.jsx — 기간 선택 세그먼트 컨트롤(7·30·90일/전체) 공통 컴포넌트.
//
// 배경: dashboard·stats·report 는 기간 선택이 있는데 **목록 화면(/history·/ums)에는 없었다** →
//       "지난달 발송 내역만" 같은 감사·정산 조회가 불가능했고, 화면은 항상 전 기간을 훑었다.
//       세 화면이 각자 인라인 세그를 갖고 있어 프리셋이 흩어지는 것도 막는다(RANGE_PRESETS 단일 출처).
//
// 레이아웃: `.seg` 는 flex-wrap 이라 초소형(320px)에서도 줄바꿈으로 흡수된다(무붕괴·무오버랩).
// 접근성: 세그먼트는 라디오 그룹 의미 → role="group" + aria-pressed 로 현재 선택을 읽어 준다.

import { RANGE_PRESETS } from '@/lib/statsRange';

export default function RangeSeg({ value, onChange, label = '기간' }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {RANGE_PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          className={value === p.key ? 'on' : ''}
          aria-pressed={value === p.key}
          onClick={() => onChange(p.key)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
