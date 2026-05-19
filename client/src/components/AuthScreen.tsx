import { useState } from "react";
import { API_URL } from "../hooks/useBoardSocket";

interface AuthScreenProps {
  mode: "signin" | "signup";
  onBack: () => void;
  onSuccess: (token: string) => void;
}

export function AuthScreen({ mode, onBack, onSuccess }: AuthScreenProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"owner" | "instructor">("owner");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [currentMode, setCurrentMode] = useState(mode);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (currentMode === "signup") {
      if (!name.trim()) { setError("Name is required"); return; }
      if (!email.trim()) { setError("Email is required"); return; }
      if (password.length < 12) { setError("Password must be at least 12 characters"); return; }
    } else {
      if (!email.trim()) { setError("Email is required"); return; }
      if (!password.trim()) { setError("Password is required"); return; }
    }

    setLoading(true);
    try {
      const endpoint = currentMode === "signup" ? "/api/auth/register" : "/api/auth/login";
      const body = currentMode === "signup"
        ? { name: name.trim(), email: email.trim(), password, role }
        : { email: email.trim(), password };

      const res = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Authentication failed");
      }

      if (data.token) {
        window.localStorage.setItem("daedalus.authToken", data.token);
        onSuccess(data.token);
      } else {
        throw new Error("No token received");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleGuestAccess() {
    setLoading(true);
    setError("");
    try {
      const roomId = crypto.randomUUID().slice(0, 8);
      const res = await fetch(`${API_URL}/api/auth/guest-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, name: "Guest", role: "editor" })
      });
      const data = await res.json();
      if (data.token) {
        window.localStorage.setItem("daedalus.authToken", data.token);
        onSuccess(data.token);
      } else {
        // Guest tokens may require auth — fall through to app without token
        onSuccess("");
      }
    } catch {
      // If guest token fails, just proceed without auth (the app handles guest mode)
      onSuccess("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-root">
      <div className="auth-bg">
        <div className="lp-orb lp-orb1" />
        <div className="lp-orb lp-orb2" />
      </div>
      <div className="auth-card">
        <button className="auth-back" onClick={onBack}>← Back to home</button>
        <div className="auth-logo">
          <svg viewBox="0 0 32 32" fill="none" width="36" height="36">
            <path d="M16 2L28 8V24L16 30L4 24V8L16 2Z" stroke="currentColor" strokeWidth="2" />
            <circle cx="16" cy="16" r="4" fill="currentColor" opacity="0.6" />
          </svg>
        </div>
        <h2>{currentMode === "signin" ? "Welcome back" : "Get started"}</h2>
        <p className="auth-sub">{currentMode === "signin" ? "Sign in to your account" : "Create your Daedalus account"}</p>

        <form onSubmit={handleSubmit} className="auth-form">
          {currentMode === "signup" && (
            <div className="auth-field">
              <label htmlFor="auth-name">Display Name</label>
              <input id="auth-name" type="text" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
          )}
          <div className="auth-field">
            <label htmlFor="auth-email">Email</label>
            <input id="auth-email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus={currentMode === "signin"} />
          </div>
          <div className="auth-field">
            <label htmlFor="auth-password">Password {currentMode === "signup" && <span className="auth-opt">(min 12 chars)</span>}</label>
            <input id="auth-password" type="password" placeholder="••••••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {currentMode === "signup" && (
            <div className="auth-field">
              <label>I am a</label>
              <div className="auth-roles">
                <button type="button" className={`auth-role ${role === "owner" ? "active" : ""}`} onClick={() => setRole("owner")}>🎓 Student</button>
                <button type="button" className={`auth-role ${role === "instructor" ? "active" : ""}`} onClick={() => setRole("instructor")}>👨‍🏫 Instructor</button>
              </div>
            </div>
          )}
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="lp-btn-primary auth-submit" disabled={loading}>
            {loading ? "Please wait..." : currentMode === "signin" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <div className="auth-divider"><span>or</span></div>

        <button className="lp-btn-ghost auth-guest" onClick={handleGuestAccess} disabled={loading}>
          Continue as Guest
        </button>

        <p className="auth-switch">
          {currentMode === "signin" ? (
            <>Don't have an account? <button onClick={() => setCurrentMode("signup")}>Sign up</button></>
          ) : (
            <>Already have an account? <button onClick={() => setCurrentMode("signin")}>Sign in</button></>
          )}
        </p>
      </div>
    </div>
  );
}
