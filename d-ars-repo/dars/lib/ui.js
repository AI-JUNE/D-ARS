export const NODE_TYPES = {
  VISUAL_LAUNCH:{ic:'🚀',c:'#be5535',name:'보이는 ARS 런칭'},
  SHOW_MENU:{ic:'🧭',c:'#3b6ea5',name:'메뉴 표출'},
  SHOW_CARD:{ic:'🗂️',c:'#2e8b57',name:'정보 카드'},
  REQUEST_DOC:{ic:'📋',c:'#c9902a',name:'필요서류 안내'},
  RAG_ANSWER:{ic:'📚',c:'#7d5ba6',name:'RAG 응답'},
  CHANNEL_SWITCH:{ic:'🔀',c:'#c0392b',name:'채널 전환'},
  END:{ic:'🏁',c:'#555',name:'종료'},
};
export const journey=['런칭','본인확인','상담','안내·발송','완료'];
export const pct=(a,b)=>b?Math.round(a/b*100):0;
export const fmt=(s)=>String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
export function tagClass(s){const m={'운영':'t-ok','미운영':'t-mut','발송완료':'t-ok','대기':'t-warn','실패':'t-bad','진행':'t-info','완료':'t-ok'};return m[s]||'t-mut';}
