import { rm } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";

/** 与 vite.config.ts 里的 localTestUser() 必须完全一致。 */
export const LOCAL_TEST_ACCESS_TOKEN = "zhijian-local-e2e-token";
export const LOCAL_TEST_USER_ID = "00000000-0000-4000-8000-0000000e2e00";

const LOCAL_TEST_DATA_FILE = path.resolve(
  ".zhijian-server-data",
  "users",
  // 和 vite.config.ts 的 userFilePath() 一致：文件名是 user id 的 base64url。
  `${Buffer.from(LOCAL_TEST_USER_ID).toString("base64url")}.json`,
);

/**
 * 让页面「已经登录」这个假身份。
 *
 * 不走登录界面：真实登录必须打到 Supabase Auth，测试既不该依赖线上服务，也不该带着任何真人的
 * 账号密码。开发服务器认这个固定 token（只在 ZHIJIAN_LOCAL_AUTH=1 时），假用户的数据落在
 * `.zhijian-server-data` 里它自己那份文件下。
 *
 * 故意不给 refreshToken：这样客户端不会去调开发服务器没实现的 /api/auth/refresh。
 */
export async function signInAsLocalTestUser(page: Page) {
  await page.addInitScript(([token]) => {
    window.sessionStorage.setItem("zhijian.workspace.session", JSON.stringify({
      email: "e2e@local.test",
      name: "E2E 用户",
      userId: "00000000-0000-4000-8000-0000000e2e00",
      accessToken: token,
    }));
  }, [LOCAL_TEST_ACCESS_TOKEN]);
}

/** 清掉这个假用户在本地服务器上的全部数据，让每次跑测试都是同一个起点。 */
export async function resetLocalTestWorkspace() {
  await rm(LOCAL_TEST_DATA_FILE, { force: true });
}

/**
 * 让侧栏保持展开。
 *
 * 桌面端第一次打开侧栏是收起的（`is-collapsed` 会把它移出画面、pointer-events 设成 none），
 * 点不到里面的文档。下面那些用例点的都是侧栏，所以先写上「展开」这条偏好，等于模拟一个已经把侧栏
 * 拉开过的用户。key 必须和 WorkspaceShell.tsx 里的 SIDEBAR_COLLAPSED_KEY 一致。
 */
export async function keepSidebarExpanded(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("zhijian.workspace.sidebar-collapsed.v1", "false");
  });
}
