// AICC-Core 채널 어댑터 — D-ARS(보이는 ARS)가 Core를 실제로 소비하는 지점.
//
// 역할 분담(설계서 §1.2·§5.2·§5.3·§6.2)
//  - Core(`aicc-core/channels/basePort`)가 세션·시나리오·이벤트·폴백·마스킹·종료 멱등을 책임진다.
//  - 이 저장소가 책임지는 것은 **화면으로 내보내는 한 가지**뿐이다: 렌더된 단계를 화면 카드로 바꿔
//    전송기(sink)에 넘긴다. 그래서 이 파일에는 세션도 DB도 없다.
//
// 왜 Core 타입을 import 하지 않는가
//  - 이 파일은 Next 빌드에 들어가므로, Core 패키지가 없는 환경에서도 앱이 빌드돼야 한다.
//    계약이 실제로 맞는지는 CI에서 Core의 적합성 실행기(`npm run conformance:aicc`)가 판정한다.
//    주석이 아니라 실행기가 드리프트를 잡는다.
//
// build now, activate on approval
//  - 기본은 dry_run 이다. `DARS_AICC_LIVE=true` 와 승인 근거(`DARS_AICC_APPROVAL_REF`)가
//    **둘 다** 있어야 live 다. 하나만으로는 켜지지 않는다 — [승인 필요]
//  - 실제 화면 푸시(고객 단말)는 sink 구현이 하고, 이 파일은 sink 를 호출만 한다.

/** 고객 화면에 보이는 문구. 시나리오 텍스트가 아닌 것은 여기 한 곳에만 둔다. */
export const AICC_SCREEN_KO = {
  transfer: '상담사에게 연결하고 있습니다. 화면을 닫지 말고 잠시만 기다려 주세요.',
  end: '상담이 종료되었습니다. 이용해 주셔서 감사합니다.',
};

/**
 * 지시 → 화면 카드. 순수 함수이므로 전송 없이 그대로 테스트한다.
 *
 * 반드시 지키는 두 가지
 *  1) `silent` 단계(내부 API 대기)는 화면에 빈 카드로 나가지 않는다.
 *  2) `summaryMasked`(상담사용 요약)는 **고객 화면에 절대 넣지 않는다**(§2·§10.3).
 *     마스킹을 거쳤다는 사실이 "고객에게 보여도 된다"는 뜻은 아니다.
 *
 * @param {{interactionId:string, kind:string, steps?:Array<object>, queue?:string, summaryMasked?:string, reasonKo?:string, target?:string}} env
 * @returns {Array<{interactionId:string, kind:string, text:string, choices?:Array<{label:string,value:string}>, slot?:string, queue?:string}>}
 */
export function renderEnvelope(env) {
  const id = env?.interactionId;
  if (typeof id !== 'string' || id.length === 0) return [];
  switch (env.kind) {
    case 'present': {
      const steps = Array.isArray(env.steps) ? env.steps : [];
      const out = [];
      for (const s of steps) {
        if (!s || s.silent === true) continue;
        if (typeof s.text !== 'string' || s.text.length === 0) continue;
        const ui = s.ui;
        if (ui && (ui.type === 'buttons' || ui.type === 'confirm')) {
          out.push({
            interactionId: id,
            kind: 'choice',
            text: s.text,
            choices: (Array.isArray(ui.items) ? ui.items : []).map((i) => ({ label: i.label, value: i.value })),
          });
          continue;
        }
        if (ui && ui.type === 'form') {
          const card = { interactionId: id, kind: 'form', text: s.text };
          if (ui.slot !== undefined) card.slot = ui.slot;
          out.push(card);
          continue;
        }
        out.push({ interactionId: id, kind: 'say', text: s.text });
      }
      return out;
    }
    case 'transfer': {
      const card = { interactionId: id, kind: 'notice', text: AICC_SCREEN_KO.transfer };
      if (env.queue !== undefined) card.queue = env.queue;
      return [card];
    }
    case 'end':
      return [{ interactionId: id, kind: 'notice', text: AICC_SCREEN_KO.end }];
    default:
      // routeToLegacyIvr 는 통화측(Callbot)이 하고, invite 는 화면 채널의 능력이 아니다
      // (profiles: routeToLegacyIvr=false, crossChannelInvite=false). 불려도 엉뚱한 화면을 띄우지 않는다.
      return [];
  }
}

/**
 * Core의 `ChannelTransport` 구현(deliver 하나).
 * 내보낼 카드가 없으면 sink 를 부르지 않는다 — 빈 푸시는 화면에서 빈 카드가 된다.
 * **전송 실패는 던진다.** 삼키면 고객은 멈춘 화면을 보고 Core는 성공으로 기록한다(품질기준 §3).
 *
 * @param {{sink:(cards:Array<object>)=>Promise<void>, name?:string}} opts
 */
export function createAiccTransport(opts) {
  if (!opts || typeof opts.sink !== 'function') {
    throw new Error('AICC transport: sink 구현이 필요합니다. 내보낼 화면이 없습니다.');
  }
  return {
    name: typeof opts.name === 'string' && opts.name ? opts.name : 'dars-screen-push',
    async deliver(env) {
      const cards = renderEnvelope(env);
      if (cards.length === 0) return;
      await opts.sink(cards);
    },
  };
}

/**
 * 환경변수 → 활성화 상태. 기본 dry_run, 플래그+승인 근거가 **둘 다** 있어야 live.
 * 플래그 하나로 실푸시가 열리면 설정 실수 한 번이 고객 화면 사고가 된다.
 *
 * @param {Record<string,string|undefined>} env
 */
export function aiccActivation(env = {}) {
  const flag = env.DARS_AICC_LIVE === 'true';
  const ref = typeof env.DARS_AICC_APPROVAL_REF === 'string' ? env.DARS_AICC_APPROVAL_REF.trim() : '';
  if (flag && ref) return { activation: 'live', approvalRef: ref };
  if (flag) return { activation: 'dry_run', reasonKo: '[승인 필요] DARS_AICC_APPROVAL_REF 가 없어 실푸시를 켜지 않았습니다.' };
  return { activation: 'dry_run', reasonKo: '기본값(dry_run)입니다. 실푸시는 [승인 필요].' };
}

/**
 * Core의 `createChannelPort` 에 넘길 옵션. Core를 import 하지 않고 옵션만 만든다.
 * 조립은 `ci/aicc-port.mjs`(검사용)와 런타임 진입점(승인 후)이 한다.
 *
 * @param {Record<string,string|undefined>} env
 * @param {(cards:Array<object>)=>Promise<void>} [sink]
 */
export function aiccPortOptions(env = {}, sink) {
  const state = aiccActivation(env);
  const parsed = Number(env.DARS_AICC_TIMEOUT_MS);
  // 응답 예산은 계약값이다. 없거나 해석 불가면 만들어 넣지 않는다(§13-3).
  const timeoutMs = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;

  const live = state.activation === 'live' && typeof sink === 'function';
  const reasonKo = state.activation === 'live' && typeof sink !== 'function'
    ? 'live 로 선언됐으나 전송기(sink)가 없어 dry_run 으로 내렸습니다.'
    : state.reasonKo;

  const out = { id: 'dars', activation: live ? 'live' : 'dry_run' };
  if (live && state.approvalRef) out.approvalRef = state.approvalRef;
  if (typeof sink === 'function') out.transport = createAiccTransport({ sink });
  if (timeoutMs !== undefined) out.timeoutMs = timeoutMs;
  if (reasonKo !== undefined) out.reasonKo = reasonKo;
  return out;
}
