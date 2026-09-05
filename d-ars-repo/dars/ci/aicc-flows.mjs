// CI 전용 — 적합성 검사에 넘기는 D-ARS 시나리오(§5.3).
//
// 실고객 자료가 아니며 개인정보를 담지 않는다(§10.3).
// 보이는 ARS 는 화면 채널이므로 버튼·폼 노드를 쓴다. 음성 전용 표현이 섞이면 검사에서 걸린다.
export const flows = [
  {
    id: 'f_dars_ci',
    version: 1,
    startNodeId: 'n_greet',
    nodes: {
      n_greet: { id: 'n_greet', kind: 'Say', text: '보이는 ARS 입니다. 원하시는 업무를 선택해 주세요.', next: 'n_menu' },
      n_menu: {
        id: 'n_menu',
        kind: 'Choice',
        prompt: '업무를 선택해 주세요.',
        options: [
          { label: '조회', value: 'lookup', next: 'n_ask' },
          { label: '상담사 연결', value: 'agent', next: 'n_transfer' },
        ],
      },
      n_ask: { id: 'n_ask', kind: 'Collect', slot: 'purpose', prompt: '조회할 항목을 입력해 주세요.', next: 'n_transfer' },
      n_transfer: { id: 'n_transfer', kind: 'Transfer', queue: 'q_dars_default', reason: '상담사 연결' },
    },
  },
];
