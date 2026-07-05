export default function Loading() {
  return (
    <main style={{minHeight:'60dvh',display:'grid',placeItems:'center',padding:'24px',
      background:'var(--bg)',color:'var(--muted)',
      fontFamily:'"Segoe UI","Malgun Gothic","맑은 고딕",system-ui,sans-serif'}}>
      <style>{`@keyframes dars-spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{textAlign:'center'}}>
        <div aria-hidden style={{width:40,height:40,margin:'0 auto 14px',borderRadius:'50%',
          border:'3px solid var(--line)',borderTopColor:'var(--brand)',
          animation:'dars-spin .8s linear infinite'}} />
        <div style={{fontSize:13,fontWeight:600}}>불러오는 중…</div>
      </div>
    </main>
  );
}
