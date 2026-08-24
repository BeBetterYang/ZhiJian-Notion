export interface WorkspaceSession {
  email: string;
  name: string;
  userId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

const SESSION_KEY = "zhijian.workspace.session";
const REGISTRATION_CODE = "nihaozhijian";

export interface AuthResult {
  session?: WorkspaceSession;
  error?: string;
  message?: string;
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const validation = validateCredentials(email, password);
  if (validation.error) return validation;
  return requestAuth("/api/auth/login", { email, password });
}

export async function register(name: string, email: string, password: string, code = ""): Promise<AuthResult> {
  const normalizedName = name.trim();
  if (!normalizedName) return { error: "请输入用户名。" };
  if (code.trim() !== REGISTRATION_CODE) return { error: "注册码不正确。" };
  const validation = validateCredentials(email, password);
  if (validation.error) return validation;
  return requestAuth("/api/auth/register", { name: normalizedName, email, password, code });
}

function validateCredentials(email: string, password: string, name?: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) return { error: "请输入有效的邮箱地址。" };
  if (password.length < 6) return { error: "密码至少需要 6 个字符。" };
  return { email: normalizedEmail, name: name ?? displayNameFromEmail(normalizedEmail) };
}

async function requestAuth(path: string, payload: Record<string, string>): Promise<AuthResult> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json() as AuthResult;
    if (!response.ok) return { error: result.error ?? "认证失败，请重试。" };
    return result;
  } catch {
    return { error: "无法连接认证服务器。" };
  }
}

export function loadWorkspaceSession(): WorkspaceSession | null {
  try {
    const value = sessionStorage.getItem(SESSION_KEY);
    if (!value) return null;
    const session = JSON.parse(value) as WorkspaceSession;
    return session.email && session.name && session.accessToken ? session : null;
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
