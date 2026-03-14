import { useState } from "react";
import { supabase } from "./supabaseClient";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [showPw,   setShowPw]   = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) { setError("Bitte alles ausfüllen."); return; }
    setLoading(true); setError(null);
    const { data, error: dbErr } = await supabase
      .from("members").select("id,username,active")
      .eq("username", username.trim().toLowerCase())
      .eq("password", password.trim()).single();
    if (dbErr || !data) { setError("Falscher Benutzername oder Passwort."); setLoading(false); return; }
    if (!data.active)   { setError("Dein Zugang wurde deaktiviert."); setLoading(false); return; }
    sessionStorage.setItem("mp_user", JSON.stringify({ id: data.id, username: data.username }));
    onLogin({ id: data.id, username: data.username });
    setLoading(false);
  };

  return (
    <div style={{ background:"#080808",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Georgia,serif",position:"relative",overflow:"hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Lato:wght@400;700&display=swap');
        @keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes glow{0%,100%{box-shadow:0 0 10px rgba(212,175,55,.2)}50%{box-shadow:0 0 28px rgba(212,175,55,.5)}}
        *{box-sizing:border-box;} input{outline:none;}
        .linput:focus{border-color:#D4AF37!important;}
        .lbtn:not(:disabled):hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(212,175,55,.35)!important;}
        .lbtn{transition:all .25s;}
      `}</style>
      <div style={{ position:"fixed",inset:0,background:"radial-gradient(ellipse 60% 50% at 50% 0%,rgba(212,175,55,.08) 0%,transparent 60%)",pointerEvents:"none" }} />
      <div style={{ position:"fixed",inset:0,backgroundImage:"repeating-linear-gradient(0deg,rgba(212,175,55,.014) 0,rgba(212,175,55,.014) 1px,transparent 1px,transparent 80px),repeating-linear-gradient(90deg,rgba(212,175,55,.014) 0,rgba(212,175,55,.014) 1px,transparent 1px,transparent 80px)",pointerEvents:"none" }} />
      <div style={{ position:"relative",zIndex:1,width:"100%",maxWidth:390,margin:"0 auto",padding:"0 18px",animation:"fadeIn .5s ease" }}>
        <div style={{ textAlign:"center",marginBottom:32 }}>
          <div style={{ width:72,height:72,margin:"0 auto 14px",border:"2px solid #D4AF37",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",animation:"glow 3s ease infinite" }}>
            <span style={{ fontFamily:"'Cinzel',serif",fontSize:30,fontWeight:900,color:"#D4AF37" }}>M</span>
          </div>
          <div style={{ fontFamily:"'Cinzel',serif",fontWeight:900,fontSize:24,letterSpacing:6,background:"linear-gradient(90deg,#8B6914,#D4AF37,#F5E27A,#D4AF37,#8B6914)",backgroundSize:"200% auto",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",animation:"shimmer 4s linear infinite",marginBottom:4 }}>MANPOWER</div>
          <div style={{ fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:9,color:"rgba(212,175,55,.5)" }}>BRUDERSCHAFT</div>
        </div>
        <div style={{ background:"rgba(255,255,255,.02)",border:"1px solid rgba(212,175,55,.2)",borderRadius:6,padding:"28px 24px" }}>
          <div style={{ fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:4,color:"rgba(212,175,55,.45)",textAlign:"center",marginBottom:22 }}>ZUGANG · DATE COACH</div>
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom:12 }}>
              <div style={{ fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:3,color:"rgba(212,175,55,.4)",marginBottom:6 }}>BENUTZERNAME</div>
              <input className="linput" type="text" value={username} onChange={e=>setUsername(e.target.value)} placeholder="dein-name" autoComplete="username"
                style={{ width:"100%",background:"rgba(0,0,0,.4)",border:"1px solid rgba(212,175,55,.18)",borderRadius:3,padding:"11px 13px",color:"#F5F0E8",fontFamily:"'Lato',sans-serif",fontSize:14,transition:"border-color .2s" }} />
            </div>
            <div style={{ marginBottom:20 }}>
              <div style={{ fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:3,color:"rgba(212,175,55,.4)",marginBottom:6 }}>PASSWORT</div>
              <div style={{ position:"relative" }}>
                <input className="linput" type={showPw?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password"
                  style={{ width:"100%",background:"rgba(0,0,0,.4)",border:"1px solid rgba(212,175,55,.18)",borderRadius:3,padding:"11px 42px 11px 13px",color:"#F5F0E8",fontFamily:"'Lato',sans-serif",fontSize:14,transition:"border-color .2s" }} />
                <button type="button" onClick={()=>setShowPw(s=>!s)} style={{ position:"absolute",right:11,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"rgba(212,175,55,.38)",cursor:"pointer",fontSize:11,fontFamily:"'Cinzel',serif",letterSpacing:1 }}>{showPw?"HIDE":"SHOW"}</button>
              </div>
            </div>
            {error && <div style={{ background:"rgba(180,30,30,.1)",border:"1px solid rgba(180,30,30,.28)",borderRadius:3,padding:"9px 13px",color:"#ff6b6b",fontFamily:"'Lato',sans-serif",fontSize:12,marginBottom:14,textAlign:"center" }}>{error}</div>}
            <button className="lbtn" type="submit" disabled={loading}
              style={{ width:"100%",background:loading?"rgba(212,175,55,.07)":"linear-gradient(135deg,#8B6914,#D4AF37,#F5E27A,#D4AF37,#8B6914)",backgroundSize:"200% auto",border:"none",borderRadius:3,padding:"14px",color:loading?"rgba(212,175,55,.3)":"#080808",fontFamily:"'Cinzel',serif",fontWeight:900,fontSize:11,letterSpacing:4,cursor:loading?"not-allowed":"pointer",animation:loading?"none":"shimmer 3s linear infinite" }}>
              {loading?"PRÜFE…":"⚔  EINTRETEN"}
            </button>
          </form>
        </div>
        <div style={{ textAlign:"center",marginTop:18,fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:4,color:"rgba(212,175,55,.14)" }}>ELITE MEMBERS ONLY</div>
      </div>
    </div>
  );
}
