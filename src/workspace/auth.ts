export interface WorkspaceSession {
  email: string;
  name: string;
}

const SESSION_KEY = "zhijian.workspace.session";
const REGISTRATION_CODE = "nihaozhijian";

export function validateLogin(email: string, password: string) {
  return validateCredentials(email, password);
}

export function validateRegistration(name: string, email: string, password: string, code = "") {
  const normalizedName = name.trim();
  if (!normalizedName) return { error: "请输入用户名。" };
  if (code.trim() !== REGISTRATION_CODE) return { error: "注册码不正确。" };
  return validateCredentials(email, password, normalizedName);
}

function validateCredentials(email: string, password: string, name?: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) return { error: "请输入有效的邮箱地址。" };
  if (password.length < 6) return { error: "密码至少需要 6 个字符。" };
  return {
    session: {
      email: normalizedEmail,
      name: name ?? displayNameFromEmail(normalizedEmail),
    } satisfies WorkspaceSession,
  };
}

export function loadWorkspaceSession(): WorkspaceSession | null {
  try {
    const value = sessionStorage.getItem(SESSION_KEY);
    if (!value) return null;
    const session = JSON.parse(value) as WorkspaceSession;
    return session.email && session.name ? session : null;
  } catch {
    return null;
  }
}

export function saveWorkspaceSession(session: WorkspaceSession) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearWorkspaceSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

function displayNameFromEmail(email: string) {
  const source = email.split("@")[0]?.replace(/[._-]+/g, " ").trim() || "用户";
  return source.replace(/\b\w/g, (character) => character.toUpperCase());
}
