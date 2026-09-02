import { expect, test, type Page } from "@playwright/test";
import { resetLocalTestWorkspace, signInAsLocalTestUser } from "./localSession";

test("workspace login entry renders", async ({ page }) => {
  await page.goto("/workspace.html");
  await expect(page.getByRole("heading", { name: "登录枝间" })).toBeVisible();
  await expect(page.getByRole("button", { name: "继续" })).toBeVisible();
});

/**
 * 文档内容的落地测试：这些用例只关心「刷新之后内容还在不在」，也就是每一个 fileId 在服务器上
 * 是否真的有自己的一行。用的是开发服务器里的本地假身份，不碰真实 Supabase 账号和真人数据。
 */
test.describe("文档内容在刷新后仍然存在", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await resetLocalTestWorkspace();
    await signInAsLocalTestUser(page);
  });

  function sidebar(page: Page) {
    return page.locator(".workspace-files");
  }

  function editor(page: Page) {
    return page.locator('[contenteditable="true"]').first();
  }

  async function openWorkspace(page: Page) {
    await page.goto("/workspace.html");
    await expect(page.getByRole("button", { name: "新增" })).toBeVisible();
  }

  /** 新建一篇文档并命名。新建后侧栏会直接进入重命名状态，名字整段选中，直接打字就是改名。 */
  async function createDocument(page: Page, title: string) {
    await page.getByRole("button", { name: "新增" }).click();
    await page.getByRole("button", { name: "新增文档" }).click();
    const renameInput = page.locator(".tree-rename-input");
    await expect(renameInput).toBeVisible();
    await renameInput.fill(title);
    await renameInput.press("Enter");
    await expect(sidebar(page).getByText(title, { exact: true })).toBeVisible();
  }

  /** 在文档正文里补一行内容，并等到确认已经写回服务器。 */
  async function typeIntoDocument(page: Page, text: string) {
    await editor(page).click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type(text);
    await expect(page.getByText("已保存")).toBeVisible();
  }

  /**
   * 刷新页面，但先等导航树那一次保存落地。
   *
   * 文档内容和导航树是两条独立的保存：内容 400ms 防抖，导航树（节点、标题、回收站）500ms。
   * 「已保存」只代表内容那一条，紧接着刷新会赶在导航树保存之前，看到的就是一个空工作区。
   */
  async function reloadWorkspace(page: Page) {
    await page.waitForTimeout(900);
    await page.reload();
    await expect(page.getByRole("button", { name: "新增" })).toBeVisible();
    // 「新增」在加载遮罩后面就已经存在了。等正文出现才说明工作区数据真的到了：在那之前点侧栏，
    // 加载完成后的「展开当前文档所在文件夹」会把刚点出来的展开状态覆盖掉。
    await expect(editor(page)).toBeVisible();
  }

  async function openNodeMenu(page: Page, title: string) {
    await page.getByRole("button", { name: `${title}的更多操作` }).click();
  }

  test("新建文档输入内容后刷新仍在", async ({ page }) => {
    await openWorkspace(page);
    await createDocument(page, "E2E 新建文档");
    await typeIntoDocument(page, "新建之后写的内容");

    await reloadWorkspace(page);

    await expect(editor(page)).toContainText("新建之后写的内容");
  });

  test("复制文档后不再编辑，刷新仍有内容", async ({ page }) => {
    await openWorkspace(page);
    await createDocument(page, "E2E 源文档");
    await typeIntoDocument(page, "源文档的内容");

    await openNodeMenu(page, "E2E 源文档");
    await page.getByRole("button", { name: "创建副本" }).click();
    await expect(sidebar(page).getByText("E2E 源文档 副本", { exact: true })).toBeVisible();
    await expect(page.getByText("已保存")).toBeVisible();

    // 关键：副本创建之后一个字都不改，直接刷新。内容还在，说明服务器上真的建了一行。
    await reloadWorkspace(page);
    await sidebar(page).getByText("E2E 源文档 副本", { exact: true }).click();

    await expect(editor(page)).toContainText("源文档的内容");
  });

  test("复制含子文档的文件夹后刷新，子文档内容仍在", async ({ page }) => {
    await openWorkspace(page);
    await page.getByRole("button", { name: "新增" }).click();
    await page.getByRole("button", { name: "新增文件夹" }).click();
    const renameInput = page.locator(".tree-rename-input");
    await renameInput.fill("E2E 项目");
    await renameInput.press("Enter");

    await page.getByRole("button", { name: "在E2E 项目中新建文档" }).click();
    const childRename = page.locator(".tree-rename-input");
    await childRename.fill("E2E 子文档");
    await childRename.press("Enter");
    await typeIntoDocument(page, "子文档的内容");

    await openNodeMenu(page, "E2E 项目");
    await page.getByRole("button", { name: "创建副本" }).click();
    await expect(sidebar(page).getByText("E2E 项目 副本", { exact: true })).toBeVisible();
    await expect(page.getByText("已保存")).toBeVisible();

    await reloadWorkspace(page);
    // 副本文件夹里的子文档保持原名，只有根节点带「副本」，所以按副本那一支子树来定位。
    const copyBranch = sidebar(page).locator(".tree-branch").filter({ hasText: "E2E 项目 副本" });
    // 文件夹刷新后是展开还是收起要看上次的展开状态，收起时先点开。
    const expandCopy = copyBranch.getByRole("button", { name: "展开E2E 项目 副本" });
    if (await expandCopy.count()) await expandCopy.click();
    await copyBranch.getByText("E2E 子文档", { exact: true }).click();

    await expect(editor(page)).toContainText("子文档的内容");
  });

  test("?file= 打开指定文档", async ({ page }) => {
    await openWorkspace(page);
    await createDocument(page, "E2E 第一篇");
    await typeIntoDocument(page, "第一篇的内容");
    const firstFileUrl = page.url();
    await createDocument(page, "E2E 第二篇");
    await typeIntoDocument(page, "第二篇的内容");
    expect(page.url()).not.toBe(firstFileUrl);

    // 同样要等导航树保存落地，否则回到 ?file= 时工作区里还没有这两个节点。
    await page.waitForTimeout(900);
    await page.goto(firstFileUrl);

    await expect(editor(page)).toContainText("第一篇的内容");
  });

  test("删除进回收站再恢复，内容仍在", async ({ page }) => {
    await openWorkspace(page);
    await createDocument(page, "E2E 待删除");
    await typeIntoDocument(page, "删除前写的内容");

    await openNodeMenu(page, "E2E 待删除");
    await page.getByRole("button", { name: "删除", exact: true }).click();
    await page.getByRole("button", { name: "移到回收站" }).click();
    await expect(sidebar(page).getByText("E2E 待删除", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: /E2E 用户/ }).click();
    await page.getByRole("button", { name: /回收站/ }).click();
    await page.getByRole("button", { name: "恢复E2E 待删除" }).click();
    await page.getByRole("button", { name: "关闭回收站" }).click();

    await reloadWorkspace(page);
    await sidebar(page).getByText("E2E 待删除", { exact: true }).click();

    await expect(editor(page)).toContainText("删除前写的内容");
  });

  test("复制文档链接用顶部 Toast 提示且侧栏不跳动", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openWorkspace(page);
    await createDocument(page, "E2E 复制链接");
    const searchBox = page.locator(".sidebar-search");
    const before = await searchBox.boundingBox();

    await openNodeMenu(page, "E2E 复制链接");
    await page.getByRole("button", { name: "拷贝链接" }).click();

    await expect(page.getByText("链接已复制", { exact: true })).toBeVisible();
    await expect(page.locator(".server-status")).toHaveCount(0);
    const after = await searchBox.boundingBox();
    expect(after?.y).toBe(before?.y);
  });

  test("复制分享链接用顶部 Toast 提示且按钮文案保持不变", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openWorkspace(page);
    await createDocument(page, "E2E 分享链接");

    await page.getByRole("button", { name: "分享", exact: true }).click();
    const shareDialog = page.getByRole("dialog", { name: "分享文档" });
    const shareToggle = shareDialog.getByRole("checkbox");
    await shareToggle.click();
    await expect(shareToggle).toBeChecked();
    const copyButton = shareDialog.getByRole("button", { name: "复制链接" });
    await expect(copyButton).toBeVisible();
    await copyButton.click();

    await expect(page.getByText("分享链接已复制", { exact: true })).toBeVisible();
    await expect(copyButton).toHaveText("复制链接");
  });

  /**
   * 大纲和思维导图是同一棵树的两个视图，切换视图不该丢字，也不该只在一边生效。
   * 这里只验证「同一段文字在两个视图里都看得到」，不去碰导图的布局细节。
   */
  test("大纲里写的内容在思维导图里也在", async ({ page }) => {
    await openWorkspace(page);
    await createDocument(page, "E2E 双视图");
    await typeIntoDocument(page, "大纲这边写的一行");

    await page.getByRole("button", { name: "切换到思维导图" }).click();

    await expect(page.locator(".mindmap-canvas").getByText("大纲这边写的一行")).toBeVisible();
  });

  test("思维导图里改的内容回到大纲也在", async ({ page }) => {
    await openWorkspace(page);
    await createDocument(page, "E2E 导图改写");
    await typeIntoDocument(page, "改之前的一行");

    await page.getByRole("button", { name: "切换到思维导图" }).click();
    const topic = page.locator(".mindmap-canvas").getByText("改之前的一行");
    await topic.dblclick();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("导图这边改过的一行");
    await page.keyboard.press("Enter");
    await expect(page.locator(".mindmap-canvas").getByText("导图这边改过的一行")).toBeVisible();

    await page.getByRole("button", { name: "切换到大纲" }).click();

    await expect(editor(page)).toContainText("导图这边改过的一行");
  });
});
