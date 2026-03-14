import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import Login from './Login';

function Root() {
  const [user, setUser] = useState(() => {
    try { const s = sessionStorage.getItem("mp_user"); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const handleLogout = () => { sessionStorage.removeItem("mp_user"); setUser(null); };
  if (!user) return <Login onLogin={setUser} />;
  return <App user={user} onLogout={handleLogout} />;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><Root /></React.StrictMode>);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(()=>{}));
}
