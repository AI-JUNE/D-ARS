'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState({ enforced: false, demo: true });

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => setInfo({ enforced: !!d.enforced, demo: !!d.demo })).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const d = await r.json();
      if (!d.ok) { setErr(d.error || '로그인에 실패했습니다.'); setBusy(false); return; }
      const params = new URLSearchParams(window.location.search);
      const next = params.get('next') || '/dashboard';
      window.location.href = next.startsWith('/') ? next : '/dashboard';
    } catch {
      setErr('네트워크 오류로 로그인하지 못했습니다.'); setBusy(false);
    }
  };

  const fill = (u) => { setUsername(u); setPassword('dars2026!'); setErr(''); };

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand"><span className="auth-dot" /><b>D-ARS</b><small>보이는 ARS 관리자</small></div>
        <h1 className="auth-h1">로그인</h1>
        <p className="auth-sub">운영 포털에 접속하려면 계정으로 로그인하세요.</p>

        {err && <div className="auth-err" role="alert">{err}</div>}

        <label className="auth-lbl">아이디</label>
        <input className="input auth-inp" value={username} onChange={e => setUsername(e.target.value)}
          autoComplete="username" autoFocus placeholder="admin / operator / viewer" />

        <label className="auth-lbl">비밀번호</label>
        <input className="input auth-inp" type="password" value={password} onChange={e => setPassword(e.target.value)}
          autoComplete="current-password" placeholder="비밀번호" />

        <button className="btn primary auth-btn" type="submit" disabled={busy}>
          {busy ? '확인 중…' : '로그인'}
        </button>

        {info.demo && (
          <div className="auth-demo">
            <div className="auth-demo-t">데모 계정 {info.enforced ? '' : '· 현재 접근 제한 미적용(운영자가 AUTH_ENFORCE=1로 활성화)'}</div>
            <div className="auth-chips">
              <button type="button" className="auth-chip" onClick={() => fill('admin')}>admin · 관리자</button>
              <button type="button" className="auth-chip" onClick={() => fill('operator')}>operator · 상담</button>
              <button type="button" className="auth-chip" onClick={() => fill('viewer')}>viewer · 뷰어</button>
            </div>
            <div className="auth-demo-p">비밀번호 공통: <code>dars2026!</code></div>
          </div>
        )}
        <div className="auth-foot"><Link href="/">← 서비스 홈으로</Link></div>
      </form>

      <style>{`
        .auth-wrap{min-height:100dvh;display:grid;place-items:center;padding:24px 16px;background:linear-gradient(160deg,#fbf3ef,#f0d9cf);}
        .auth-card{width:100%;max-width:380px;background:#fff;border:1px solid #e8ddd6;border-radius:18px;padding:26px 22px;box-shadow:0 12px 40px rgba(70,35,22,.14);}
        .auth-brand{display:flex;align-items:center;gap:8px;color:#9c4025;font-size:16px;margin-bottom:18px;flex-wrap:wrap}
        .auth-brand small{color:#8a7a72;font-weight:600;font-size:12px}
        .auth-dot{width:12px;height:12px;border-radius:50%;background:#be5535;box-shadow:0 0 0 4px rgba(190,85,53,.28)}
        .auth-h1{margin:0 0 4px;font-size:22px;color:#241a16}
        .auth-sub{margin:0 0 18px;color:#8a7a72;font-size:13px}
        .auth-lbl{display:block;font-size:12.5px;font-weight:700;color:#241a16;margin:12px 0 6px}
        .auth-inp{width:100%;box-sizing:border-box}
        .auth-btn{width:100%;justify-content:center;margin-top:18px;padding:12px;font-size:15px}
        .auth-err{background:#fbeceb;color:#c0392b;border:1px solid #f0c9c4;border-radius:9px;padding:10px 12px;font-size:13px;font-weight:600;margin-bottom:4px}
        .auth-demo{margin-top:20px;padding-top:16px;border-top:1px dashed #e8ddd6}
        .auth-demo-t{font-size:11.5px;color:#8a7a72;font-weight:700;margin-bottom:9px;line-height:1.5}
        .auth-chips{display:flex;flex-wrap:wrap;gap:7px}
        .auth-chip{border:1px solid #e8ddd6;background:#fbf3ef;color:#9c4025;border-radius:999px;padding:6px 11px;font-size:12px;font-weight:700;cursor:pointer}
        .auth-chip:hover{background:#f0d9cf}
        .auth-demo-p{margin-top:10px;font-size:12px;color:#8a7a72}
        .auth-demo-p code{background:#f5f2ef;border:1px solid #e8ddd6;border-radius:6px;padding:1px 6px;font-size:12px}
        .auth-foot{margin-top:18px;text-align:center;font-size:13px}
        .auth-foot a{color:#9c4025;font-weight:600;text-decoration:none}
        .auth-foot a:hover{text-decoration:underline}
      `}</style>
    </div>
  );
}
