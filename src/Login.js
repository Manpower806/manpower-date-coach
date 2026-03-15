import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";

// Generate or get persistent device ID
function getDeviceId() {
  let id = localStorage.getItem("mp_device_id");
  if (!id) {
    id = "dev_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    localStorage.setItem("mp_device_id", id);
  }
  return id;
}

// Generate session token
function genToken() {
  return "sess_" + Date.now() + "_" + Math.random().toString(36).slice(2);
}

function MatrixCanvas() {
  const canvasRef = useRef(null);
  useEffect(()=>{
    const canvas = canvasRef.current;
    if(!canvas) return;
    const ctx = canvas.getContext("2d");
    const resize = ()=>{ canvas.width=window.innerWidth; canvas.height=window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);

    const words = ["MANPOWER","BROTHERHOOD","ELITE","POWER","STRENGTH","ALPHA","DOMINANCE","STOIC","SIGMA"];
    const fontSize = 11;
    const colWidth = 90; // wider columns = fewer, no overlap
    const cols = Math.floor(window.innerWidth / colWidth);

    // Each column: independent y position, speed, word - staggered start
    const columns = Array(cols).fill(0).map((_, i) => ({
      y: -(Math.random() * canvas.height * 1.5), // start well above, staggered
      speed: 0.4 + Math.random() * 0.3,          // slow: 0.4–0.7 px per frame
      wordIdx: Math.floor(Math.random() * words.length),
      x: i * colWidth + 10,
    }));

    let animId;
    const draw = ()=>{
      ctx.fillStyle = "rgba(8,6,4,0.04)";
      ctx.fillRect(0,0,canvas.width,canvas.height);

      columns.forEach(col => {
        const word = words[col.wordIdx];
        const y = col.y;

        // Leading word - bright
        ctx.font = `700 ${fontSize}px Cinzel, serif`;
        ctx.fillStyle = "rgba(245,226,122,0.85)";
        ctx.shadowColor = "rgba(212,175,55,0.6)";
        ctx.shadowBlur = 6;
        ctx.fillText(word, col.x, y);

        // Trail - 4 fading words above
        ctx.shadowBlur = 0;
        const trailAlphas = [0.45, 0.28, 0.15, 0.07];
        trailAlphas.forEach((alpha, t) => {
          ctx.fillStyle = `rgba(212,175,55,${alpha})`;
          ctx.font = `400 ${fontSize}px Cinzel, serif`;
          ctx.fillText(words[(col.wordIdx + t + 1) % words.length], col.x, y - (t+1) * fontSize * 2.2);
        });

        col.y += col.speed;

        // Reset when fully off screen bottom
        if(col.y > canvas.height + fontSize * 12) {
          col.y = -fontSize * (10 + Math.random() * 20); // restart above screen
          col.wordIdx = Math.floor(Math.random() * words.length);
          col.speed = 0.4 + Math.random() * 0.3;
        }
      });

      animId = requestAnimationFrame(draw);
    };
    animId = requestAnimationFrame(draw);
    return ()=>{ cancelAnimationFrame(animId); window.removeEventListener("resize",resize); };
  },[]);
  return <canvas ref={canvasRef} style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",zIndex:0,pointerEvents:"none",opacity:0.2}}/>;
}

const LANGS = {
  de: { cc:"de", label:"DE", name:"Deutsch", user:"BENUTZERNAME", pass:"PASSWORT", ph_user:"dein-name", ph_pass:"••••••••", btn:"LOG IN", checking:"WIRD GEPRÜFT…", access:"MEMBER ACCESS", bottom:"ELITE MEMBERS ONLY", err_empty:"Bitte alles ausfüllen.", err_wrong:"Falscher Benutzername oder Passwort.", err_inactive:"Dein Zugang wurde deaktiviert. Kontaktiere den Admin.", err_expired:"Dein Zugang ist abgelaufen. Kontaktiere den Admin.", err_device:"Dieser Account ist an ein anderes Gerät gebunden. Kontaktiere den Admin." },
  en: { cc:"gb", label:"EN", name:"English", user:"USERNAME", pass:"PASSWORD", ph_user:"your-name", ph_pass:"••••••••", btn:"LOG IN", checking:"CHECKING…", access:"MEMBER ACCESS", bottom:"ELITE MEMBERS ONLY", err_empty:"Please fill in all fields.", err_wrong:"Wrong username or password.", err_inactive:"Your access has been deactivated. Contact the admin.", err_expired:"Your access has expired. Contact the admin.", err_device:"This account is bound to another device. Contact the admin." },
  tr: { cc:"tr", label:"TR", name:"Türkçe", user:"KULLANICI ADI", pass:"ŞİFRE", ph_user:"adın", ph_pass:"••••••••", btn:"GİRİŞ", checking:"KONTROL EDİLİYOR…", access:"ÜYE ERİŞİMİ", bottom:"SADECE ELİT ÜYELER", err_empty:"Lütfen tüm alanları doldurun.", err_wrong:"Yanlış kullanıcı adı veya şifre.", err_inactive:"Erişiminiz devre dışı bırakıldı. Yönetici ile iletişime geçin.", err_expired:"Erişim süreniz doldu. Yönetici ile iletişime geçin.", err_device:"Bu hesap başka bir cihaza bağlı. Yönetici ile iletişime geçin." },
  ar: { cc:"sa", label:"AR", name:"العربية", user:"اسم المستخدم", pass:"كلمة المرور", ph_user:"اسمك", ph_pass:"••••••••", btn:"دخول", checking:"جارٍ التحقق…", access:"وصول الأعضاء", bottom:"للأعضاء النخبة فقط", err_empty:"يرجى ملء جميع الحقول.", err_wrong:"اسم مستخدم أو كلمة مرور خاطئة.", err_inactive:"تم تعطيل وصولك. تواصل مع المسؤول.", err_expired:"انتهت صلاحية وصولك. تواصل مع المسؤول.", err_device:"هذا الحساب مرتبط بجهاز آخر. تواصل مع المسؤول." },
  es: { cc:"es", label:"ES", name:"Español", user:"USUARIO", pass:"CONTRASEÑA", ph_user:"tu-nombre", ph_pass:"••••••••", btn:"ENTRAR", checking:"VERIFICANDO…", access:"ACCESO MIEMBRO", bottom:"SOLO MIEMBROS ELITE", err_empty:"Por favor rellena todos los campos.", err_wrong:"Usuario o contraseña incorrectos.", err_inactive:"Tu acceso ha sido desactivado. Contacta al admin.", err_expired:"Tu acceso ha caducado. Contacta al admin.", err_device:"Esta cuenta está vinculada a otro dispositivo. Contacta al admin." },
  it: { cc:"it", label:"IT", name:"Italiano", user:"NOME UTENTE", pass:"PASSWORD", ph_user:"tuo-nome", ph_pass:"••••••••", btn:"ACCEDI", checking:"VERIFICA…", access:"ACCESSO MEMBRO", bottom:"SOLO MEMBRI ELITE", err_empty:"Compila tutti i campi.", err_wrong:"Nome utente o password errati.", err_inactive:"Il tuo accesso è stato disattivato. Contatta l'admin.", err_expired:"Il tuo accesso è scaduto. Contatta l'admin.", err_device:"Questo account è legato a un altro dispositivo. Contatta l'admin." },
  fr: { cc:"fr", label:"FR", name:"Français", user:"NOM D'UTILISATEUR", pass:"MOT DE PASSE", ph_user:"ton-nom", ph_pass:"••••••••", btn:"CONNEXION", checking:"VÉRIFICATION…", access:"ACCÈS MEMBRE", bottom:"MEMBRES ÉLITE SEULEMENT", err_empty:"Veuillez remplir tous les champs.", err_wrong:"Nom d'utilisateur ou mot de passe incorrect.", err_inactive:"Votre accès a été désactivé. Contactez l'admin.", err_expired:"Votre accès a expiré. Contactez l'admin.", err_device:"Ce compte est lié à un autre appareil. Contactez l'admin." },
  ru: { cc:"ru", label:"RU", name:"Русский", user:"ИМЯ ПОЛЬЗОВАТЕЛЯ", pass:"ПАРОЛЬ", ph_user:"твоё-имя", ph_pass:"••••••••", btn:"ВОЙТИ", checking:"ПРОВЕРКА…", access:"ДОСТУП УЧАСТНИКА", bottom:"ТОЛЬКО ЭЛИТНЫЕ УЧАСТНИКИ", err_empty:"Пожалуйста, заполните все поля.", err_wrong:"Неверное имя пользователя или пароль.", err_inactive:"Ваш доступ деактивирован. Свяжитесь с администратором.", err_expired:"Срок вашего доступа истёк. Свяжитесь с администратором.", err_device:"Этот аккаунт привязан к другому устройству. Свяжитесь с администратором." },
};

function FlagImg({ cc, size=18 }) {
  return <img src={`https://flagcdn.com/w40/${cc}.png`} alt={cc} style={{width:size,height:size*0.67,objectFit:"cover",borderRadius:2,display:"block"}} />;
}

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [showPw,   setShowPw]   = useState(false);
  const [lang,     setLang]     = useState(()=>localStorage.getItem("mp_lang")||"de");
  const [langOpen,  setLangOpen]  = useState(false);
  const t = LANGS[lang] || LANGS.de;
  const changeLang = (l) => { setLang(l); localStorage.setItem("mp_lang", l); setError(null); };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) { setError(t.err_empty); return; }
    setLoading(true); setError(null);

    const deviceId = getDeviceId();
    const userAgent = navigator.userAgent.slice(0,120);

    // Fetch member
    const { data, error: dbErr } = await supabase
      .from("members")
      .select("id,username,active,notes,device_id,expires_at")
      .eq("username", username.trim().toLowerCase())
      .eq("password", password.trim())
      .single();

    // Log attempt
    await supabase.from("login_logs").insert({
      username: username.trim().toLowerCase(),
      device_id: deviceId,
      user_agent: userAgent,
      status: dbErr || !data ? "failed" : "attempt",
    });

    if (dbErr || !data) {
      setError(t.err_wrong);
      setLoading(false); return;
    }

    if (!data.active) {
      setError(t.err_inactive);
      await supabase.from("login_logs").insert({ username: data.username, device_id: deviceId, user_agent: userAgent, status: "blocked_inactive" });
      setLoading(false); return;
    }

    // Check expiry
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      setError(t.err_expired);
      await supabase.from("login_logs").insert({ username: data.username, device_id: deviceId, user_agent: userAgent, status: "blocked_expired" });
      setLoading(false); return;
    }

    const isAdmin = data.notes?.toLowerCase().includes("admin") || data.username === "mo";

    // Device binding check (skip for admin)
    if (!isAdmin && data.device_id && data.device_id !== deviceId) {
      setError(t.err_device);
      await supabase.from("login_logs").insert({ username: data.username, device_id: deviceId, user_agent: userAgent, status: "blocked_device" });
      setLoading(false); return;
    }

    // Generate new session token
    const sessionToken = genToken();

    // Admin: no device binding, no session token overwrite (can login from anywhere)
    if (isAdmin) {
      await supabase.from("members").update({
        last_seen: new Date().toISOString(),
      }).eq("id", data.id);
    } else {
      // Update: bind device (first login), set session token, last_seen
      await supabase.from("members").update({
        device_id: data.device_id || deviceId,
        session_token: sessionToken,
        last_seen: new Date().toISOString(),
      }).eq("id", data.id);
    }

    // Log success
    await supabase.from("login_logs").insert({
      username: data.username, device_id: deviceId, user_agent: userAgent, status: "success"
    });

    const userData = { id: data.id, username: data.username, isAdmin, sessionToken, deviceId };
    sessionStorage.setItem("mp_user", JSON.stringify(userData));
    onLogin(userData);
    setLoading(false);
  };

  return (
    <div style={{ background:"#0a0806", height:"100vh", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Georgia,serif", position:"relative", overflow:"hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Lato:wght@300;400;700&display=swap');
        @keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes flicker{0%,100%{opacity:1}92%{opacity:.95}96%{opacity:.85}}
        @keyframes matrixRise{0%{transform:translateY(110vh);opacity:0}5%{opacity:1}80%{opacity:.7}100%{transform:translateY(-10vh);opacity:0}}
        @keyframes matrixFade{0%,100%{opacity:0.05}50%{opacity:1}}
        @keyframes matrixGlitch{0%,95%,100%{opacity:1;transform:skewX(0)}96%{opacity:.8;transform:skewX(-2deg)}97%{opacity:.9;transform:skewX(1deg)}}
        *{box-sizing:border-box;} input{outline:none;}
        .linput:focus{border-color:#D4AF37!important;box-shadow:0 0 12px rgba(212,175,55,.15)!important;}
        .lbtn:not(:disabled):hover{transform:translateY(-3px)!important;box-shadow:0 14px 40px rgba(212,175,55,.45)!important;}
        .lbtn{transition:all .3s!important;}
      `}</style>

      <div style={{ position:"fixed",inset:0,background:"radial-gradient(ellipse 80% 60% at 50% 30%,rgba(180,120,40,.18) 0%,rgba(120,60,10,.12) 40%,transparent 70%)",pointerEvents:"none" }}/>
      <div style={{ position:"fixed",inset:0,backgroundImage:"repeating-linear-gradient(0deg,rgba(212,175,55,.008) 0,rgba(212,175,55,.008) 1px,transparent 1px,transparent 60px),repeating-linear-gradient(90deg,rgba(212,175,55,.008) 0,rgba(212,175,55,.008) 1px,transparent 1px,transparent 60px)",pointerEvents:"none" }}/>
      {/* Matrix Canvas Background */}
      <MatrixCanvas />

      <div style={{ position:"relative",zIndex:1,width:"100%",maxWidth:420,margin:"0 auto",padding:"0 20px",animation:"fadeIn .6s ease" }}>
        {/* Logo */}
        <div style={{ textAlign:"center", marginBottom:10 }}>
          <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:10,justifyContent:"center" }}>
            <div style={{ flex:1,height:1,background:"linear-gradient(to right,transparent,rgba(212,175,55,.3))" }}/>
            <div style={{ width:54,height:54,border:"2px solid #D4AF37",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(20,14,4,.9)",boxShadow:"0 0 30px rgba(212,175,55,.25),inset 0 0 20px rgba(212,175,55,.05)" }}>
              <span style={{ fontFamily:"'Cinzel',serif",fontSize:26,fontWeight:900,background:"linear-gradient(180deg,#F5E27A 0%,#D4AF37 40%,#8B6914 100%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text" }}>M</span>
            </div>
            <div style={{ flex:1,height:1,background:"linear-gradient(to left,transparent,rgba(212,175,55,.3))" }}/>
          </div>
          <div style={{ fontFamily:"'Cinzel',serif",fontWeight:900,fontSize:24,letterSpacing:6,background:"linear-gradient(180deg,#F5E27A 0%,#D4AF37 40%,#8B6914 100%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",marginBottom:5,animation:"flicker 4s ease infinite" }}>MANPOWER</div>
          <div style={{ fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:10,color:"rgba(212,175,55,.5)",marginBottom:12 }}>BRUDERSCHAFT</div>
          <div style={{ fontFamily:"'Lato',sans-serif",fontSize:10,letterSpacing:3,color:"rgba(212,175,55,.3)",fontStyle:"italic",marginBottom:16 }}>Elite Date Coach</div>
          <div style={{ display:"flex",justifyContent:"center",marginBottom:12,position:"relative" }}>
            <button onClick={()=>setLangOpen(s=>!s)}
              style={{ background:"rgba(212,175,55,.08)", border:"1px solid rgba(212,175,55,.25)", borderRadius:20, padding:"5px 12px", cursor:"pointer", display:"flex", alignItems:"center", gap:7, transition:"all .2s" }}>
              <FlagImg cc={LANGS[lang].cc} size={18}/>
              <span style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2,color:"#D4AF37"}}>{LANGS[lang].label}</span>
              <span style={{fontSize:8,color:"rgba(212,175,55,.5)"}}>▼</span>
            </button>
            {langOpen&&(
              <div style={{ position:"absolute",top:"110%",left:"50%",transform:"translateX(-50%)",background:"rgba(10,6,2,.97)",border:"1px solid rgba(212,175,55,.25)",borderRadius:8,overflow:"hidden",zIndex:100,minWidth:160,boxShadow:"0 8px 32px rgba(0,0,0,.6)" }}>
                {Object.entries(LANGS).map(([key,val])=>(
                  <button key={key} onClick={()=>{changeLang(key);setLangOpen(false);}}
                    style={{ width:"100%",background:lang===key?"rgba(212,175,55,.12)":"transparent", border:"none", borderBottom:"1px solid rgba(212,175,55,.08)", padding:"7px 14px", cursor:"pointer", display:"flex", alignItems:"center", gap:9 }}>
                    <FlagImg cc={val.cc} size={20}/>
                    <span style={{fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:2,color:lang===key?"#D4AF37":"rgba(212,175,55,.45)"}}>{val.label}</span>
                    <span style={{fontFamily:"'Lato',sans-serif",fontSize:10,color:lang===key?"rgba(212,175,55,.7)":"rgba(212,175,55,.3)",marginLeft:"auto"}}>{val.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Form */}
        <div style={{ background:"rgba(12,8,2,.85)",border:"1px solid rgba(212,175,55,.18)",borderRadius:4,padding:"18px 22px",backdropFilter:"blur(20px)" }}>
          <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:14,justifyContent:"center" }}>
            <div style={{ flex:1,height:1,background:"rgba(212,175,55,.15)" }}/>
            <span style={{ fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:5,color:"rgba(212,175,55,.5)" }}>{t.access}</span>
            <div style={{ flex:1,height:1,background:"rgba(212,175,55,.15)" }}/>
          </div>
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom:8 }}>
              <div style={{ fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:4,color:"rgba(212,175,55,.45)",marginBottom:7 }}>{t.user}</div>
              <input className="linput" value={username} onChange={e=>setUsername(e.target.value)} placeholder={t.ph_user}
                style={{ width:"100%",background:"rgba(0,0,0,.5)",border:"1px solid rgba(212,175,55,.2)",borderRadius:2,padding:"12px 14px",color:"#F5F0E8",fontFamily:"'Lato',sans-serif",fontSize:14,transition:"all .25s",letterSpacing:.5 }}/>
            </div>
            <div style={{ marginBottom:12 }}>
              <div style={{ fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:4,color:"rgba(212,175,55,.45)",marginBottom:7 }}>{t.pass}</div>
              <div style={{ position:"relative" }}>
                <input className="linput" type={showPw?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"
                  style={{ width:"100%",background:"rgba(0,0,0,.5)",border:"1px solid rgba(212,175,55,.2)",borderRadius:2,padding:"12px 44px 12px 14px",color:"#F5F0E8",fontFamily:"'Lato',sans-serif",fontSize:14,transition:"all .25s",letterSpacing:.5 }}/>
                <button type="button" onClick={()=>setShowPw(s=>!s)} style={{ position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"rgba(212,175,55,.35)",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:1 }}>{showPw?"HIDE":"SHOW"}</button>
              </div>
            </div>
            {error && (
              <div style={{ background:"rgba(180,40,40,.15)",border:"1px solid rgba(200,60,60,.3)",borderRadius:2,padding:"10px 14px",color:"#ff8080",fontFamily:"'Lato',sans-serif",fontSize:12,marginBottom:16,textAlign:"center",letterSpacing:.3 }}>{error}</div>
            )}
            <button className="lbtn" type="submit" disabled={loading}
              style={{ width:"100%",position:"relative",overflow:"hidden",background:loading?"rgba(212,175,55,.08)":"linear-gradient(135deg,#6B4F0A 0%,#D4AF37 35%,#F5E27A 50%,#D4AF37 65%,#6B4F0A 100%)",backgroundSize:"200% auto",animation:loading?"none":"shimmer 3s linear infinite",border:"none",borderRadius:2,padding:"15px",color:loading?"rgba(212,175,55,.3)":"#0a0806",fontFamily:"'Cinzel',serif",fontWeight:900,fontSize:12,letterSpacing:5,cursor:loading?"not-allowed":"pointer",boxShadow:loading?"none":"0 4px 20px rgba(212,175,55,.25)" }}>
              {loading?t.checking:"🔑  "+t.btn}
            </button>
          </form>
        </div>
        <div style={{ textAlign:"center",marginTop:10 }}>
          <span style={{ fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:4,color:"rgba(212,175,55,.2)" }}>{t.bottom}</span>
        </div>
      </div>
    </div>
  );
}
