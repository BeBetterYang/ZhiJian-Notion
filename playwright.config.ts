import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://127.0.0.1:4173", trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --port 4173",
    url: "http://127.0.0.1:4173/workspace.html",
    // 端到端测试用开发服务器里的本地假身份登录，不碰真实 Supabase 账号，也不碰真人数据。
    env: { ZHIJIAN_LOCAL_AUTH: "1" },
    reuseExistingServer: !process.env.CI,
  },
});
