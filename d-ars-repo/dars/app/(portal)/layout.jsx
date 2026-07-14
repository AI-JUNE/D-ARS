'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import CommandPalette from './CommandPalette';
import { OfflineBanner } from '@/lib/ErrorBanner';
import { getJSON } from '@/lib/fetchJson';
import { aggUrl } from '@/lib/aggregate';
import { readSessionAgg } from '@/lib/sessionsAgg';
import { activeSessions } from '@/lib/kpi';
import { notifyUrl, loadThresholds, CHANGE_EVENT } from '@/lib/notifyRules';

const NAV = [
  ['운영', [['/dashboard','📊','대시보드'],['/sessions','📡','실시간 세션'],['/history','🗂️','멀티모달 이력'],['/stats','📈','이용 통계'],['/report','📄','운영 리포트'],['/notifications','🔔','알림 센터']]],
  ['콘텐츠', [['/scenarios','🧩','시나리오 관리'],['/templates','🖼️','화면 템플릿'],['/launcher','⚙️','런처 설정'],['/docs','📋','필요서류 관리']]],
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
  '/launcher':['런처 설정','콘텐츠 · 보이는 ARS 런처'],
};

export default function PortalLayout({ children }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);   // mobile drawer
  const [menu, setMenu] = useState(false);   // user menu
  const [big, setBig] = useState(false);
  const [live, setLive] = useState(0);
  const [noti, setNoti] = useState(0);
  const [me, setMe] = useState(null);
  const meta = TITLES[path] || ['D-ARS',''];

  useEffect(() => { setOpen(false); setMenu(false); }, [path]);
  useEffect(() => { document.documentElement.style.fontSize = big ? '18px' : ''; }, [big]);
  // 사이드바 세션 카운터: 기존엔 목록 배열 길이(최대 20건 상한)라 세션이 쌓이면 실제보다 적게 표시됐다.
  // → 서버 집계(/api/sessions?agg=1) 총계로 전환(진행 중 세션 전체). 실패해도 조용히 유지(배지만 미갱신).
  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      const { data, error } = await getJSON(aggUrl('/api/sessions'), { retries: 0 });
      if (stopped || error) return;
      setLive(activeSessions(readSessionAgg(data)));
    };
    poll();
    const t = setInterval(poll, 6000);
    return () => { stopped = true; clearInterval(t); };
  }, []);
  // 헤더 벨 배지: 알림 센터에서 운영자가 조정한 **임계값과 같은 기준**으로 센다(설정과 배지가 어긋나지 않게).
  // 원시 fetch → getJSON 으로 교체(타임아웃·재시도 정책 일원화). 실패 시 조용히 유지(30초 후 재조회가 곧 재시도).
  useEffect(() => {
    let stopped = false;
    const pn = async () => {
      const { data, error } = await getJSON(notifyUrl('/api/notifications', loadThresholds()), { retries: 0 });
      if (stopped || error) return;
      const s = data && data.summary;
      setNoti(s ? (s.bad || 0) + (s.warn || 0) : 0);
    };
    pn();
    const t = setInterval(pn, 30000);
    window.addEventListener(CHANGE_EVENT, pn); // 기준 변경 즉시 배지 동기화
    return () => { stopped = true; clearInterval(t); window.removeEventListener(CHANGE_EVENT, pn); };
  }, []);

  useEffect(() => { fetch('/api/auth/me').then(r=>r.json()).then(setMe).catch(()=>{}); }, [path]);
  const logout = async () => { try { await fetch('/api/auth/logout',{method:'POST'}); } catch {} window.location.href='/login'; };
  const roleLabel = { admin:'관리자', operator:'상담 운영자', viewer:'뷰어' };
  const openCmdk = () => window.dispatchEvent(new Event('dars:cmdk'));

  const UserMenu = () => (
    <div className="usermenu">
      <div className="um-head"><div className="um-av">👤</div><div><b>{me?.user?.name || '운영 관리자'}</b><br/><span className="muted" style={{fontSize:11}}>{me?.user ? (roleLabel[me.user.role]||me.user.role)+' · '+me.user.u : 'admin@d-ars'}</span></div></div>
      <Link href="/dashboard" className="um-item">📊 대시보드</Link>
      <Link href="/" className="um-item">🏢 서비스 홈</Link>
      <Link href="/visual" className="um-item">📱 보이는 ARS 데모</Link>
      <button className="um-item" onClick={()=>{setBig(v=>!v);setMenu(false);}}>🔠 {big?'큰글씨 끄기':'큰글씨 켜기'}</button>
      {me?.user
        ? <button className="um-item" onClick={logout}>↻ 로그아웃</button>
        : <Link href="/login" className="um-item">↝ 로그인</Link>}
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
          <div className="gw-build">D-ARS · 콜봇 연계 · v4</div>
        </div>
      </aside>

      <div className="main">
        <a href="#main" className="skip-link">본문 바로가기</a>
        {/* desktop top */}
        <div className="top">
          <div><h1>{meta[0]}</h1><div className="crumb">{meta[1]}</div></div>
          <div className="sp" />
          <button className="cmdk-btn" onClick={openCmdk} aria-label="빠른 이동 (Ctrl+K)" title="빠른 이동 (Ctrl+K)"><span aria-hidden>🔍</span><span className="cmdk-btn-t">빠른 이동</span><kbd>Ctrl K</kbd></button>
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
          <button className="bell" onClick={openCmdk} aria-label="빠른 이동">🔍</button>
          <Link href="/notifications" className="bell" aria-label="알림 센터">🔔{noti>0 && <span className="bell-badge">{noti>9?'9+':noti}</span>}</Link>
          <div style={{position:'relative'}}>
            <button className="av-btn" onClick={() => setMenu(v=>!v)} aria-label="사용자 메뉴">👤</button>
            {menu && <><div className="um-catch" onClick={()=>setMenu(false)} /><UserMenu/></>}
          </div>
        </div>

        <div className="wrap" id="main"><OfflineBanner />{children}</div>
      </div>

      <nav className="botnav">
        {BOTTOM.map(([href, e, label]) => (
          <Link key={href} href={href} className={path === href ? 'on' : ''}><span className="e">{e}</span>{label}</Link>
        ))}
        <a onClick={() => setOpen(true)}><span className="e">☰</span>메뉴</a>
      </nav>
      <CommandPalette />
    </div>
  );
}
