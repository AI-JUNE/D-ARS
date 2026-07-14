// lib/rbac.js — 역할 기반 접근제어 규칙(순수·무부작용) · 로그인·RBAC 제안
//
// 역할 계층: admin > operator > viewer
//   - operator↑: 운영 변경 화면(시나리오·런처·UMS·서류·템플릿)
//   - viewer↑: 조회 중심 화면(대시보드·세션·이력·통계·리포트·알림·도움말)
//   - 규칙에 없는 경로(랜딩 '/', 고객용 '/visual', '/login')는 공개.

export const ROLES = ['admin', 'operator', 'viewer'];
export const RANK = { admin: 3, operator: 2, viewer: 1 };

// 접두사 우선순위(구체적 규칙을 먼저 두지 않아도 prefix 정확 매칭으로 충돌 없음)
export const ROUTE_RULES = [
  { prefix: '/scenarios', min: 'operator' },
  { prefix: '/launcher', min: 'operator' },
  { prefix: '/ums', min: 'operator' },
  { prefix: '/docs', min: 'operator' },
  { prefix: '/templates', min: 'operator' },
  { prefix: '/dashboard', min: 'viewer' },
  { prefix: '/sessions', min: 'viewer' },
  { prefix: '/history', min: 'viewer' },
  { prefix: '/stats', min: 'viewer' },
  { prefix: '/report', min: 'viewer' },
  { prefix: '/notifications', min: 'viewer' },
  { prefix: '/help', min: 'viewer' },
];

// 경로에 필요한 최소 역할. 규칙이 없으면 null(공개).
export function requiredRole(path) {
  const p = String(path || '');
  for (const r of ROUTE_RULES) {
    if (p === r.prefix || p.startsWith(r.prefix + '/')) return r.min;
  }
  return null;
}

// 역할이 경로에 접근 가능한지
export function canAccess(role, path) {
  const need = requiredRole(path);
  if (!need) return true; // 공개 경로
  return (RANK[role] || 0) >= (RANK[need] || 99);
}
