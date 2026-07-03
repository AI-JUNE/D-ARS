'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const NAV = [
  ['운영', [['/dashboard','📊','대시보드'],['/sessions','📡','실시간 세션'],['/history','🗂️','멀티모달 이력'],['/stats','📈','이용 통계'],['/report','📄','운영 리포트'],['/notifications','🔔','알림 센터']]],
  ['콘텐츠', [['/scenarios','🧩','시나리오 관리'],['/templates','🖼️','화면 템플릿'],['/docs','📋','필요서류 관리']]],
  ['발송', [['/ums','✉️','UMS 문자발송']]],
  ['고객 화면', [['/visual','📱','보이는 ARS 데모'],['/','🏢','서비스 홈']]],
];
const BOTTOM = [['/dashboard','🏠','홈'],['/sessions','📡','세션'],['/scenarios','🧩','시나리오'],['/stats','📈','통계']];
const TITLES = {
  '/dashboard':['대시보드','운영 · 대시보드'],'/sessions':['실시간 세션','운영 · 모니터링'],
  '/scenarios':['시나리오 관리','콘텐츠 · 비주얼 시나리오'],'/docs':['필요서류 관리','콘텐츠 · 서류'],
  '/ums':['UMS 문자발송','발송 · UMS'],'/stats':['이용 통계','분석 · 통계'],
  '/notifications':['알림 센터','운영 · 알림'],'/help':['도움말','지원 · FAQ'],
  '/history':['멀티모달 이력','운영 · 상호작용 로그'],
  '/report':['운영 리포트','운영 · 리포트(PDF)'],'/templates':['화면 템플릿','콘텐츠 · 표출 화면'],
};

export default function PortalLayout({ children }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);   // mobile drawer
  const [menu, setMenu] = useState(false);   // user menu
  const [big, setBig] = useState(false);
  const [live, setLive] = useState(0);
  const [noti, setNoti] = useState(0);
  const meta = TITLES[path] || ['D-ARS',''];

  useEffect(() => { setOpen(false); setMenu(false); }, [path]);
  useEffect(() => { document.documentElement.style.fontSize = big ? '18px' : ''; }, [big]);
  useEffect(() => {
    let t;
    const poll = () => fetch('/api/sessions').then(r=>r.json()).then(d=>setLive((d||[]).filter(s=>s.step<4).length)).catch(()=>{});
    poll(); t = setInterval(poll, 6000); return () => clearInterval(t);
  }, []);
  useEffect(() => {
    let t;
    const pn = () => fetch('/api/notifications').then(r=>r.json())
      .then(d=>setNoti(((d&&d.summary)?(d.summary.bad||0)+(d.summary.warn||0):0))).catch(()=>{});
    pn(); t = setInterval(pn, 30000); return () => clearInterval(t);
  }, []);

  const UserMenu = () => (
    <div className="usermenu">
      <div className="um-head"><div className="um-av">👤</div><div><b>운영 관리자</b><br/><span className="muted" style={{fontSize:11}}>admin@d-ars</span></div></div>
      <Link href="/dashboard" className="um-item">📊 대시보드</Link>
      <Link href="/" className="um-item">🏢 서비스 홈</Link>
      <Link href="/visual" className="um-item">📱 보이는 ARS 데모</Link>
      <button className="um-item" onClick={()=>{setBig(v=>!v);setMenu(false);}}>🔠 {big?'큰글씨 끄기':'큰글씨 켜기'}</button>
      <button className="um-item" onClick={()=>{alert('데모: 로그아웃');setMenu(false);}}>↻ 로그아웃</button>
    </div>
  );

  return (
    <div className={'app' + (open ? ' open' : '')}>
      <div className="overlay" onClick={() => setOpen(false)} />
      <aside className="side">
        <Link href="/" className="brand" title="서비스 홈으로">
          <span className="dot" /><div>D-ARS<small>보이는 ARS 관리자</small></div>
        </Link>
        <div className="side-nav">
          {NAV.map(([grp, items]) => (
            <div key={grp}>
              <div className="navgrp">{grp}</div>
              {items.map(([href, e, label]) => (
                <Link key={href+label} href={href} className={'nav' + (path === href ? ' on' : '')}>
                  <span className="e">{e}</span>{label}
                  {href === '/sessions' && <span className="cnt">{live}</span>}
                </Link>
              ))}
            </div>
          ))}
        </div>
        <div className="side-foot">
          <div className="gw-logo">GOWON</div>
          <div className="gw-stat"><span className="d" />연결됨 · Neon</div>
          <div className="gw-build">D-ARS · 콜봇 연계 · v3</div>
        </div>
      </aside>

      <div className="main">
        {/* desktop top */}
        <div className="top">
          <div><h1>{meta[0]}</h1><div className="crumb">{meta[1]}</div></div>
          <div className="sp" />
          <button className="btn sm" onClick={() => setBig(v => !v)} aria-pressed={big}>가 {big ? '작게' : '큰글씨'}</button>
          <span className="chip"><i />콜봇 연동 정상</span>
          <Link href="/notifications" className="bell" aria-label="알림 센터">🔔{noti>0 && <span className="bell-badge">{noti>9?'9+':noti}</span>}</Link>
          <div className="who" style={{position:'relative'}}>
            <button className="av-btn" onClick={() => setMenu(v=>!v)} aria-label="사용자 메뉴" aria-expanded={menu}>👤</button>
            {menu && <><div className="um-catch" onClick={()=>setMenu(false)} /><UserMenu/></>}
          </div>
        </div>
        {/* mobile top */}
        <div className="m-top">
          <button className="hamb" onClick={() => setOpen(true)} aria-label="메뉴 열기"><span>☰</span></button>
          <div><h1>{meta[0]}</h1><div className="crumb">{meta[1]}</div></div>
          <div className="sp" />
          <Link href="/notifications" className="bell" aria-label="알림 센터">🔔{noti>0 && <span className="bell-badge">{noti>9?'9+':noti}</span>}</Link>
          <div style={{position:'relative'}}>
            <button className="av-btn" onClick={() => setMenu(v=>!v)} aria-label="사용자 메뉴">👤</button>
            {menu && <><div className="um-catch" onClick={()=>setMenu(false)} /><UserMenu/></>}
          </div>
        </div>

        <div className="wrap">{children}</div>
      </div>

      <nav className="botnav">
        {BOTTOM.map(([href, e, label]) => (
          <Link key={href} href={href} className={path === href ? 'on' : ''}><span className="e">{e}</span>{label}</Link>
        ))}
        <a onClick={() => setOpen(true)}><span className="e">☰</span>메뉴</a>
      </nav>
    </div>
  );
}
