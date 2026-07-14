import { sql, safe, jsonCached } from '@/lib/db';
import { demoDaily, demoMultimodal, demoUms } from '@/lib/demo';
import { aggregateServiceRows, foldServiceGroups, LAUNCH_NODE, SMS_CHANNEL, SMS_SENT_STATUS, RESULT_DROP, RESULT_DONE } from '@/lib/services';
import { parseRangeParams, filterByDate, tailDays } from '@/lib/statsRange';

export const dynamic = 'force-dynamic';

// 통계 API(읽기 전용).
//  - daily    : daily_stats
//  - services : 실측 집계(multimodal_log `group by service` + ums_log(발송완료) `group by service` 병합)
//               DB 미설정·테이블 부재 시 데모 로그로 동일 의미의 집계 폴백 → 화면이 멈추지 않는다.
//
// **기간 파라미터(2026-07-13 야간 신규)**: `?days=N` 또는 `?from=&to=` 로 조회 구간을 좁힌다.
//   - 파라미터가 없으면 range=null → **기존 쿼리를 한 줄도 바꾸지 않고 전 기간 조회**(완전 하위호환).
//   - 지정 시 daily·services 가 **같은 구간**을 쓰므로 화면 라벨("최근 7일")과 숫자가 어긋나지 않는다.
//   - 날짜는 형식 검증(YYYY-MM-DD)을 통과한 값만 $n 바인딩으로 전달 → SQL 인젝션 무관.
// 전화번호(PII)는 집계·필터 대상 아님 · 인증/과금 로직 무관 → 저위험.
export async function GET(req) {
  const range = parseRangeParams(req?.url);

  const daily = await safe(
    () => (range
      ? sql`select day,inbound,multimodal,completed,dropped from daily_stats
            where day >= ${range.from} and day <= ${range.to} order by day`
      : sql`select day,inbound,multimodal,completed,dropped from daily_stats order by day`),
    null
  );

  const services = await safe(async () => {
    const mm = range
      ? await sql`select service,
            count(*)::int as sent,
            count(*) filter (where node = ${LAUNCH_NODE})::int as launch,
            count(*) filter (where channel = ${SMS_CHANNEL})::int as sms,
            count(*) filter (where result = ${RESULT_DROP})::int as dropped,
            count(*) filter (where result = ${RESULT_DONE})::int as done
          from multimodal_log
          where ts::date >= ${range.from}::date and ts::date <= ${range.to}::date
          group by service`
      : await sql`select service,
            count(*)::int as sent,
            count(*) filter (where node = ${LAUNCH_NODE})::int as launch,
            count(*) filter (where channel = ${SMS_CHANNEL})::int as sms,
            count(*) filter (where result = ${RESULT_DROP})::int as dropped,
            count(*) filter (where result = ${RESULT_DONE})::int as done
          from multimodal_log
          group by service`;
    const ums = await safe(
      () => (range
        ? sql`select service, count(*)::int as sms from ums_log
              where status = ${SMS_SENT_STATUS}
                and sent_at::date >= ${range.from}::date and sent_at::date <= ${range.to}::date
              group by service`
        : sql`select service, count(*)::int as sms from ums_log where status = ${SMS_SENT_STATUS} group by service`),
      []
    );
    const rows = foldServiceGroups(mm, ums);
    return rows.length ? rows : null;
  }, null);

  // 데모 폴백: 서비스 로그는 최근 시각으로 생성되므로 캘린더 필터가 그대로 통한다.
  // daily 데모는 **고정된 과거 날짜**라 캘린더 필터 시 0건이 되므로 tailDays(마지막 N일 근사)를 쓴다.
  const dailyOut = daily && daily.length ? daily : tailDays(demoDaily, range);
  const servicesOut = services && services.length
    ? services
    : aggregateServiceRows(
        filterByDate(demoMultimodal(48), range, 'ts'),
        filterByDate(demoUms(40), range, 'sent_at')
      );

  return jsonCached(
    {
      daily: dailyOut,
      services: servicesOut,
      range: range ? { from: range.from, to: range.to, days: range.days } : null, // 화면 라벨용(신규 필드 · 하위호환)
    },
    120
  );
}
