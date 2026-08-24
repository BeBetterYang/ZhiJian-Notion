import { useState, type FormEvent } from "react";
import { FiEye, FiEyeOff } from "react-icons/fi";
import type { WorkspaceSession } from "./auth";
import { validateLogin, validateRegistration } from "./auth";
import logoUrl from "./assets/zhijian-logo.png";

interface LoginScreenProps {
  onLogin: (session: WorkspaceSession) => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [mode, setMode] = useState<"login" | "register">(() => new URLSearchParams(window.location.search).get("auth") === "register" ? "register" : "login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [registrationCode, setRegistrationCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = mode === "register" ? validateRegistration(username, email, password, registrationCode) : validateLogin(email, password);
    if (!result.session) {
      setError(result.error ?? (mode === "register" ? "注册失败，请重试。" : "登录失败，请重试。"));
      return;
    }
    setError("");
    const url = new URL(window.location.href);
    url.searchParams.delete("auth");
    window.history.replaceState({}, "", url);
    onLogin(result.session);
  };

  const switchMode = (nextMode: "login" | "register") => {
    const url = new URL(window.location.href);
    if (nextMode === "register") url.searchParams.set("auth", "register"); else url.searchParams.delete("auth");
    window.history.replaceState({}, "", url);
    setMode(nextMode);
    setUsername("");
    setRegistrationCode("");
    setPassword("");
    setError("");
  };

  return (
    <main className={`login-screen ${mode === "register" ? "is-register" : "is-login"}`}>
      <section className={`login-panel ${mode === "register" ? "is-register" : ""}`} aria-labelledby="login-title">
        <div className="login-heading">
          <img className="login-logo" src={logoUrl} alt="枝间 Logo" />
          <h1 id="login-title">{mode === "register" ? "注册枝间" : "登录枝间"}</h1>
          <p>{mode === "register" ? "创建你的枝间账户" : "继续进入你的工作空间"}</p>
        </div>
        <form className="login-form" onSubmit={submit} noValidate>
          {mode === "register" ? (
            <label className="auth-form-item">
              <span className="auth-form-label">用户名</span>
              <span className="auth-input">
                <input
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="输入用户名"
                  autoFocus
                />
              </span>
            </label>
          ) : null}
          {mode === "register" ? (
            <label className="auth-form-item">
              <span className="auth-form-label">注册码</span>
              <span className="auth-input">
                <input
                  type="text"
                  autoComplete="off"
                  value={registrationCode}
                  onChange={(event) => setRegistrationCode(event.target.value)}
                  placeholder="输入注册码"
                />
              </span>
            </label>
          ) : null}
          <label className="auth-form-item">
            <span className="auth-form-label">邮箱</span>
            <span className="auth-input">
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
                autoFocus={mode === "login"}
              />
            </span>
          </label>
          <label className="auth-form-item">
            <span className="auth-form-label">密码</span>
            <span className="auth-input password-field">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="输入密码"
              />
              <button
                type="button"
                className="icon-button password-toggle"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
                title={showPassword ? "隐藏密码" : "显示密码"}
              >
                {showPassword ? <FiEyeOff /> : <FiEye />}
              </button>
            </span>
          </label>
          <div className="form-error" role="alert">{error}</div>
          <button type="submit" className="primary-button">{mode === "register" ? "注册" : "继续"}</button>
          <p className="auth-switch">
            {mode === "register" ? "已有账户？" : "是新用户吗？"}
            <a href={mode === "register" ? "/workspace.html" : "/workspace.html?auth=register"} onClick={(event) => { event.preventDefault(); switchMode(mode === "register" ? "login" : "register"); }}>{mode === "register" ? "请登录" : "请注册"}</a>
          </p>
        </form>
      </section>
    </main>
  );
}
