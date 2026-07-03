'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const NAV = [
  ['운영', [['/dashboard','📊','대시보드'],['/sessions','📡','실시간 세션'],['/dashboard#hist','🧾','멀티모달 이력']]],
  ['콘텐츠', [['/scenarios','🧩','시나리오 관리'],['/docs','📋','필요서류 관리']]],
  ['발송', [['/ums','✉️','UMS 문자발송']]],
  ['분석', [['/stats','📈','이용 통계']]],
];
const TITLES = {
  '/dashboard':['대시보드','운영 · 대시보드'],'/sessions':['실시간 세션','운영 · 모니터링'],
  '/scenarios':['시나리오 관리','콘텐츠 · 비주얼 시나리오'],'/docs':['필요서류 관리','콘텐츠 · 서류'],
  '/ums':['UMS 문자발송','발송 · UMS'],'/stats':['이용 통계','분석 · 통계'],
};

export default function PortalLayout({ children }) {
  const path = usePathname();
  const [meta, setMeta] = useState(['대시보드','운영']);
  const [live, setLive] = useState(0);
  useEffect(() => { setMeta(TITLES[path] || ['D-ARS','']); }, [path]);
  useEffect(() => {
    let t;
    const poll = () => fetch('/api/sessions').then(r=>r.json()).then(d=>setLive(d.filter(s=>s.step<4).length)).catch(()=>{});
    poll(); t = setInterval(poll, 5000); return () => clearInterval(t);
  }, []);
  return (
    <div className="app">
      <aside className="side">
        <div className="brand"><span className="dot" /><div>D-ARS<small>보이는 ARS 관리자</small></div></div>
        {NAV.map(([grp, items]) => (
          <div key={grp}>
            <div className="navgrp">{grp}</div>
            {items.map(([href, e, label]) => (
              <Link key={href} href={href} className={'nav' + (path === href ? ' on' : '')}>
                <span className="e">{e}</span>{label}
                {href === '/sessions' && <span className="cnt">{live}</span>}
              </Link>
            ))}
          </div>
        ))}
        <div className="navgrp">고객 화면</div>
        <Link href="/visual" className="nav"><span className="e">📱</span>보이는 ARS 데모</Link>
      </aside>
      <div className="main">
        <div className="top">
          <div><h1>{meta[0]}</h1><div className="crumb">{meta[1]}</div></div>
          <div className="sp" />
          <span className="chip"><i />콜봇 연동 정상</span>
          <div className="who"><div className="av">운</div>
            <div style={{fontSize:12}}><b>운영 관리자</b><br/><span className="muted">admin@d-ars</span></div></div>
        </div>
        <div className="wrap">{children}</div>
      </div>
    </div>
  );
}
