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
      .from("members").select("id,username,active,notes")
      .eq("username", username.trim().toLowerCase())
      .eq("password", password.trim()).single();
    if (dbErr || !data) { setError("Falscher Benutzername oder Passwort."); setLoading(false); return; }
    if (!data.active) { setError("Dein Zugang wurde deaktiviert."); setLoading(false); return; }
    const isAdmin = data.notes?.toLowerCase().includes("admin") || data.username === "mo";
    sessionStorage.setItem("mp_user", JSON.stringify({ id: data.id, username: data.username, isAdmin }));
    onLogin({ id: data.id, username: data.username, isAdmin });
    setLoading(false);
  };

  return (
    <div style={{ background:"#0a0806", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Georgia,serif", position:"relative", overflow:"hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Lato:wght@300;400;700&display=swap');
        @keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes flicker{0%,100%{opacity:1}92%{opacity:.95}96%{opacity:.85}}
        @keyframes particleFloat{0%{transform:translateY(0) translateX(0);opacity:0}10%{opacity:.6}90%{opacity:.2}100%{transform:translateY(-120vh) translateX(40px);opacity:0}}
        *{box-sizing:border-box;} input{outline:none;}
        .linput:focus{border-color:#D4AF37!important;box-shadow:0 0 12px rgba(212,175,55,.15)!important;}
        .lbtn:not(:disabled):hover{transform:translateY(-3px)!important;box-shadow:0 14px 40px rgba(212,175,55,.45)!important;}
        .lbtn{transition:all .3s!important;}
      `}</style>

      {/* Cinematic background */}
      <div style={{ position:"fixed",inset:0,background:"radial-gradient(ellipse 80% 60% at 50% 30%,rgba(180,120,40,.18) 0%,rgba(120,60,10,.12) 40%,transparent 70%)",pointerEvents:"none" }}/>
      <div style={{ position:"fixed",inset:0,backgroundImage:"repeating-linear-gradient(0deg,rgba(212,175,55,.008) 0,rgba(212,175,55,.008) 1px,transparent 1px,transparent 60px),repeating-linear-gradient(90deg,rgba(212,175,55,.008) 0,rgba(212,175,55,.008) 1px,transparent 1px,transparent 60px)",pointerEvents:"none" }}/>

      {/* Floating particles */}
      {[...Array(8)].map((_,i)=>(
        <div key={i} style={{ position:"fixed", left:`${10+i*12}%`, bottom:"-5%", width:2, height:2, background:"rgba(212,175,55,.5)", borderRadius:"50%", animation:`particleFloat ${6+i*1.5}s ${i*0.8}s infinite linear`, pointerEvents:"none" }}/>
      ))}

      <div style={{ position:"relative",zIndex:1,width:"100%",maxWidth:420,margin:"0 auto",padding:"0 20px",animation:"fadeIn .6s ease" }}>

        {/* Logo area */}
        <div style={{ textAlign:"center",marginBottom:36 }}>
          {/* Decorative line */}
          <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:20 }}>
            <div style={{ flex:1,height:1,background:"linear-gradient(90deg,transparent,rgba(212,175,55,.4))" }}/>
            <div style={{ width:56,height:56,border:"2px solid #D4AF37",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(212,175,55,.06)",boxShadow:"0 0 30px rgba(212,175,55,.25),inset 0 0 20px rgba(212,175,55,.05)" }}>
              <span style={{ fontFamily:"'Cinzel',serif",fontSize:22,fontWeight:900,color:"#D4AF37",animation:"flicker 4s ease infinite" }}>M</span>
            </div>
            <div style={{ flex:1,height:1,background:"linear-gradient(90deg,rgba(212,175,55,.4),transparent)" }}/>
          </div>

          <div style={{ fontFamily:"'Cinzel',serif",fontWeight:900,fontSize:28,letterSpacing:8,background:"linear-gradient(180deg,#F5E27A 0%,#D4AF37 40%,#8B6914 100%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",marginBottom:5,animation:"flicker 4s ease infinite" }}>MANPOWER</div>
          <div style={{ fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:10,color:"rgba(212,175,55,.5)",marginBottom:4 }}>BRUDERSCHAFT</div>
          <div style={{ fontFamily:"'Lato',sans-serif",fontSize:11,letterSpacing:3,color:"rgba(212,175,55,.3)",fontStyle:"italic" }}>Elite Date Coach</div>
        </div>

        {/* Card */}
        <div style={{ background:"linear-gradient(160deg,rgba(30,20,10,.95),rgba(15,10,5,.98))",border:"1px solid rgba(212,175,55,.25)",borderRadius:3,padding:"32px 26px",boxShadow:"0 30px 80px rgba(0,0,0,.6),0 0 0 1px rgba(212,175,55,.08),inset 0 1px 0 rgba(212,175,55,.1)" }}>

          <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:24 }}>
            <div style={{ flex:1,height:1,background:"rgba(212,175,55,.15)" }}/>
            <span style={{ fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:5,color:"rgba(212,175,55,.5)" }}>MEMBER ACCESS</span>
            <div style={{ flex:1,height:1,background:"rgba(212,175,55,.15)" }}/>
          </div>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:4,color:"rgba(212,175,55,.45)",marginBottom:7 }}>BENUTZERNAME</div>
              <input className="linput" type="text" value={username} onChange={e=>setUsername(e.target.value)} placeholder="dein-name" autoComplete="username"
                style={{ width:"100%",background:"rgba(0,0,0,.5)",border:"1px solid rgba(212,175,55,.2)",borderRadius:2,padding:"12px 14px",color:"#F5F0E8",fontFamily:"'Lato',sans-serif",fontSize:14,transition:"all .25s",letterSpacing:.5 }}/>
            </div>
            <div style={{ marginBottom:22 }}>
              <div style={{ fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:4,color:"rgba(212,175,55,.45)",marginBottom:7 }}>PASSWORT</div>
              <div style={{ position:"relative" }}>
                <input className="linput" type={showPw?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password"
                  style={{ width:"100%",background:"rgba(0,0,0,.5)",border:"1px solid rgba(212,175,55,.2)",borderRadius:2,padding:"12px 44px 12px 14px",color:"#F5F0E8",fontFamily:"'Lato',sans-serif",fontSize:14,transition:"all .25s",letterSpacing:.5 }}/>
                <button type="button" onClick={()=>setShowPw(s=>!s)} style={{ position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"rgba(212,175,55,.35)",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:1 }}>{showPw?"HIDE":"SHOW"}</button>
              </div>
            </div>

            {error && (
              <div style={{ background:"rgba(180,40,40,.15)",border:"1px solid rgba(200,60,60,.3)",borderRadius:2,padding:"10px 14px",color:"#ff8080",fontFamily:"'Lato',sans-serif",fontSize:12,marginBottom:16,textAlign:"center",letterSpacing:.3 }}>{error}</div>
            )}

            <button className="lbtn" type="submit" disabled={loading}
              style={{ width:"100%",position:"relative",overflow:"hidden",background:loading?"rgba(212,175,55,.08)":"linear-gradient(135deg,#6B4F0A 0%,#D4AF37 35%,#F5E27A 50%,#D4AF37 65%,#6B4F0A 100%)",backgroundSize:"200% auto",animation:loading?"none":"shimmer 3s linear infinite",border:"none",borderRadius:2,padding:"15px",color:loading?"rgba(212,175,55,.3)":"#0a0806",fontFamily:"'Cinzel',serif",fontWeight:900,fontSize:12,letterSpacing:5,cursor:loading?"not-allowed":"pointer",boxShadow:loading?"none":"0 4px 20px rgba(212,175,55,.25)" }}>
              {loading ? "WIRD GEPRÜFT…" : "🔑  LOG IN"}
            </button>
          </form>
        </div>

        <div style={{ textAlign:"center",marginTop:20 }}>
          <div style={{ display:"flex",alignItems:"center",gap:10 }}>
            <div style={{ flex:1,height:1,background:"linear-gradient(90deg,transparent,rgba(212,175,55,.15))" }}/>
            <span style={{ fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:4,color:"rgba(212,175,55,.2)" }}>ELITE MEMBERS ONLY</span>
            <div style={{ flex:1,height:1,background:"linear-gradient(90deg,rgba(212,175,55,.15),transparent)" }}/>
          </div>
        </div>
      </div>
    </div>
  );
}
