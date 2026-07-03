import { neon } from '@neondatabase/serverless';
export const hasDB = !!process.env.DATABASE_URL;
export const sql = hasDB ? neon(process.env.DATABASE_URL) : null;

// 읽기 API 공통 JSON 응답: CDN 엣지 캐시로 반복 조회를 즉시 응답
export function jsonCached(data, seconds = 60) {
  return Response.json(data, {
    headers: { 'Cache-Control': `public, s-maxage=${seconds}, stale-while-revalidate=${seconds * 5}` },
  });
}
// DB 쿼리를 안전하게 실행: 오류(테이블 없음/지연 등) 시 폴백 반환 → 화면이 멈추지 않음
export async function safe(run, fallback) {
  if (!hasDB) return fallback;
  try { return await run(); } catch (e) { console.error('DB fallback:', e?.message); return fallback; }
}
