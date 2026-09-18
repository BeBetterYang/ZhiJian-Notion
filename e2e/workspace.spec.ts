import { expect, test, type Page } from "@playwright/test";
import { jsPDF } from "jspdf";
import { enableLocalTestAIImport, keepSidebarExpanded, resetLocalTestWorkspace, signInAsLocalTestUser } from "./localSession";

type E2EAIChatRequestBody = {
  documentId?: string;
  document?: { content?: string };
  messages?: Array<{ role: string; content: string }>;
  provider?: { apiKey?: string; model?: string; apiUrl?: string };
};

test("workspace login entry renders", async ({ page }) => {
  await page.goto("/workspace.html");
  await expect(page.getByRole("heading", { name: "登录枝间" })).toBeVisible();
  await expect(page.getByRole("button", { name: "继续" })).toBeVisible();
});

/**
 * 侧栏的默认状态和浏览器记忆。放在真浏览器里验：收起靠的是 `is-collapsed` 那几条 CSS，jsdom 不套
 * 样式表，只有这里能看出「收起之后侧栏真的不在画面上」。
 */
test("桌面端侧栏默认收起，展开和收起都被浏览器记住", async ({ page }) => {
  await resetLocalTestWorkspace();
  await signInAsLocalTestUser(page);

  const shell = page.locator(".workspace-shell-ui");
  const sidebar = page.locator(".workspace-sidebar");
  async function openWorkspace() {
    await page.goto("/workspace.html");
    // 加载遮罩盖着的时候正文整块是 aria-hidden 的，点不到，等它撤掉。
    await expect(page.locator(".zhijian-loading-screen")).toHaveCount(0);
  }

  await openWorkspace();
  await expect(shell).toHaveClass(/is-collapsed/);
  // 收起不是把侧栏从 DOM 里删掉，是整块移出画面，所以按位置验才算数。
  await expect(sidebar).not.toBeInViewport();

  await page.getByRole("button", { name: "展开侧栏" }).click();
  await expect(shell).not.toHaveClass(/is-collapsed/);
  await expect(sidebar).toBeInViewport();

  await openWorkspace();
  await expect(shell).not.toHaveClass(/is-collapsed/);

  await page.getByRole("button", { name: "收起侧栏" }).click();
  await expect(shell).toHaveClass(/is-collapsed/);

  await openWorkspace();
  await expect(shell).toHaveClass(/is-collapsed/);
});

test("侧栏搜索和账号固定，最近、星标与文档共用滚动区", async ({ page }) => {
  await resetLocalTestWorkspace();
  await signInAsLocalTestUser(page);
  await keepSidebarExpanded(page);
  await page.goto("/workspace.html");
  await expect(page.locator(".zhijian-loading-screen")).toHaveCount(0);

  const sidebar = page.locator(".workspace-sidebar");
  const scroll = sidebar.locator(".sidebar-scroll");
  const sections = scroll.locator(".quick-file-section");
  await expect(sections).toHaveCount(3);
  await expect(sections.nth(0).locator(".sidebar-section-toggle")).toContainText("最近打开");
  await expect(sections.nth(1).locator(".sidebar-section-toggle")).toContainText("星标文件");
  await expect(sections.nth(2).locator(".sidebar-section-toggle")).toContainText("我的文档");

  const searchBox = await sidebar.locator(".sidebar-search").boundingBox();
  const scrollBox = await scroll.boundingBox();
  const footerBox = await sidebar.locator(".sidebar-footer").boundingBox();
  expect(searchBox && scrollBox && footerBox).toBeTruthy();
  expect(searchBox!.y + searchBox!.height).toBeLessThanOrEqual(scrollBox!.y);
  expect(scrollBox!.y + scrollBox!.height).toBeLessThanOrEqual(footerBox!.y);

  await sidebar.getByRole("button", { name: "新增", exact: true }).click();
  await expect(sidebar.getByRole("button", { name: "新增文档" })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "设置" })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "回收站" })).toBeVisible();
  await sidebar.locator(".workspace-switcher").click();
  await expect(sidebar.getByRole("button", { name: "退出登录" })).toBeVisible();
});

test("侧边栏导入菜单打开 AI 文档解析预览", async ({ page }) => {
  await resetLocalTestWorkspace();
  await signInAsLocalTestUser(page);
  await keepSidebarExpanded(page);
  await enableLocalTestAIImport(page);
  await page.goto("/workspace.html");
  await expect(page.locator(".zhijian-loading-screen")).toHaveCount(0);

  const sidebar = page.locator(".workspace-sidebar");
  await sidebar.getByRole("button", { name: "导入文档" }).click();
  const markdownImport = sidebar.getByRole("button", { name: "导入 Markdown" });
  const aiImport = sidebar.getByRole("button", { name: "AI文档导入" });
  await expect(markdownImport).toBeVisible();
  await expect(markdownImport.locator("svg")).toHaveClass(/lucide-file-up/);
  await expect(aiImport).toBeVisible();
  await expect(aiImport.locator("svg")).toHaveClass(/lucide-cloud-upload/);
  await sidebar.getByRole("button", { name: "AI文档导入" }).click();
  await expect(page.getByRole("heading", { name: "从 PDF / Word 生成大纲" })).toBeVisible();
  await expect(page.getByText("拖入 PDF 或 DOCX 文件")).toBeVisible();
  await page.getByRole("button", { name: "关闭文件导入" }).click();
  await expect(page.getByRole("heading", { name: "从 PDF / Word 生成大纲" })).toHaveCount(0);
});

test("PDF 解析、AI 草稿编辑和创建工作区文档", async ({ page }) => {
  await resetLocalTestWorkspace();
  await signInAsLocalTestUser(page);
  await keepSidebarExpanded(page);
  await enableLocalTestAIImport(page);
  await page.route("**/api/ai/outline", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        type: "ai-outline-draft",
        version: 1,
        title: "AI 课程大纲",
        source: { fileName: "课程.pdf", title: "课程讲义", pageCount: 2 },
        nodes: [{ id: "chapter-1", title: "第一章", summary: "课程重点", sourcePages: { startPage: 1, endPage: 2 }, children: [] }],
      }),
    });
  });
  await page.goto("/workspace.html");
  await expect(page.locator(".zhijian-loading-screen")).toHaveCount(0);

  const pdf = new jsPDF();
  pdf.text(Array.from({ length: 40 }, (_, index) => `课程测试文本 ${index + 1}，用于验证 PDF 导入和 AI 草稿流程。`), 20, 20);
  pdf.addPage();
  pdf.text(Array.from({ length: 40 }, (_, index) => `第二页测试文本 ${index + 1}，用于验证页码引用。`), 20, 20);
  const buffer = Buffer.from(pdf.output("arraybuffer"));

  const sidebar = page.locator(".workspace-sidebar");
  await sidebar.getByRole("button", { name: "新增", exact: true }).click();
  await sidebar.getByRole("button", { name: "导入文档" }).click();
  await sidebar.getByRole("button", { name: "AI文档导入" }).click();
  const dialog = page.getByRole("dialog", { name: "从 PDF / Word 生成大纲" });
  await dialog.locator("input[type=file]").setInputFiles({ name: "课程.pdf", mimeType: "application/pdf", buffer });
  await expect(dialog.getByText("内容分块")).toBeVisible({ timeout: 30000 });
  await dialog.getByRole("button", { name: "生成 AI 大纲" }).click();
  await expect(dialog.locator('input[aria-label="大纲标题"]')).toHaveValue("AI 课程大纲");
  await dialog.getByRole("button", { name: "创建工作区文档" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(sidebar.getByText("AI 课程大纲", { exact: true })).toBeVisible();
});

test("AI Chat 基于当前文档读取并渲染流式回答", async ({ page }) => {
  await resetLocalTestWorkspace();
  await signInAsLocalTestUser(page);
  await keepSidebarExpanded(page);
  await enableLocalTestAIImport(page);

  let requestBody: E2EAIChatRequestBody | null = null;
  await page.route("**/api/ai/chat", async (route) => {
    requestBody = JSON.parse(route.request().postData() ?? "null");
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
      body: [
        'data: {"type":"text-delta","text":"这是来自当前文档的"}\n\n',
        'data: {"type":"text-delta","text":"流式回答。"}\n\n',
        'data: {"type":"done"}\n\n',
      ].join(""),
    });
  });

  await page.goto("/workspace.html");
  await expect(page.locator(".zhijian-loading-screen")).toHaveCount(0);
  const sidebar = page.locator(".workspace-sidebar");
  await sidebar.getByRole("button", { name: "新增", exact: true }).click();
  await sidebar.getByRole("button", { name: "新增文档" }).click();
  const titleEditor = page.locator('[contenteditable="true"]').first();
  await expect(titleEditor).toBeFocused();
  await titleEditor.fill("E2E AI 当前文档");

  await page.locator(".ai-chat-launcher").click();
  const panel = page.getByRole("dialog", { name: "和 AI 聊聊" });
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "总结文档" }).click();
  await expect(panel.locator(".ai-chat-message.is-assistant")).toContainText("这是来自当前文档的流式回答。");

  expect(requestBody).toEqual(expect.objectContaining({ documentId: expect.any(String) }));
  expect(requestBody?.document?.content).toContain("E2E AI 当前文档");
  expect(requestBody?.document?.content).not.toContain(requestBody?.documentId);
  expect(requestBody?.messages).toEqual([{ role: "user", content: "总结文档" }]);
  expect(requestBody?.provider).toEqual({ apiKey: "e2e-test-key", model: "e2e-test-model", apiUrl: "https://ai.test/v1/chat/completions" });
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
    await keepSidebarExpanded(page);
  });

  function sidebar(page: Page) {
    return page.locator(".workspace-files");
  }

  function editor(page: Page) {
    return page.locator('[contenteditable="true"]').first();
  }

  function waitForDocumentSave(page: Page) {
    return page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "PUT"
        && url.pathname.startsWith("/api/workspace/documents/")
        && response.ok();
    });
  }

  async function openWorkspace(page: Page) {
    await page.goto("/workspace.html");
    await expect(page.getByRole("button", { name: "新增", exact: true })).toBeVisible();
  }

  /** 新建一篇文档并命名。新建后标题编辑器会自动聚焦，直接输入就是改名。 */
  async function createDocument(page: Page, title: string) {
    await page.getByRole("button", { name: "新增", exact: true }).click();
    await page.getByRole("button", { name: "新增文档" }).click();
    const titleEditor = editor(page);
    await expect(titleEditor).toBeFocused();
    await titleEditor.fill(title);
    await expect(sidebar(page).getByText(title, { exact: true })).toBeVisible();
  }

  /** 在文档正文里补一行内容，并等到确认已经写回服务器。 */
  async function typeIntoDocument(page: Page, text: string) {
    const saved = waitForDocumentSave(page);
    await editor(page).click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type(text);
    await saved;
  }

  /**
   * 刷新页面，但先等导航树那一次保存落地。
   *
   * 文档内容和导航树是两条独立的保存：内容 2000ms 防抖，导航树（节点、标题、回收站）500ms。
   * `typeIntoDocument` 只确认内容保存完成，紧接着刷新仍可能赶在导航树保存之前，看到空工作区。
   */
  async function reloadWorkspace(page: Page) {
    await page.waitForTimeout(900);
    await page.reload();
    await expect(page.getByRole("button", { name: "新增", exact: true })).toBeVisible();
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
    const copied = waitForDocumentSave(page);
    await page.getByRole("button", { name: "创建副本" }).click();
    await expect(sidebar(page).getByText("E2E 源文档 副本", { exact: true })).toBeVisible();
    await copied;

    // 关键：副本创建之后一个字都不改，直接刷新。内容还在，说明服务器上真的建了一行。
    await reloadWorkspace(page);
    await sidebar(page).getByText("E2E 源文档 副本", { exact: true }).click();

    await expect(editor(page)).toContainText("源文档的内容");
  });

  test("复制含子文档的文件夹后刷新，子文档内容仍在", async ({ page }) => {
    await openWorkspace(page);
    await page.getByRole("button", { name: "新增", exact: true }).click();
    await page.getByRole("button", { name: "新增文件夹" }).click();
    const renameInput = page.locator(".tree-rename-input");
    await renameInput.fill("E2E 项目");
    await renameInput.press("Enter");

    await page.getByRole("button", { name: "在E2E 项目中新建文档" }).click();
    const childTitleEditor = editor(page);
    await expect(childTitleEditor).toBeFocused();
    await childTitleEditor.fill("E2E 子文档");
    await typeIntoDocument(page, "子文档的内容");

    await openNodeMenu(page, "E2E 项目");
    const copied = waitForDocumentSave(page);
    await page.getByRole("button", { name: "创建副本" }).click();
    await expect(sidebar(page).getByText("E2E 项目 副本", { exact: true })).toBeVisible();
    await copied;

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

  /**
   * 用户报的问题：拷贝文档链接、在新标签页打开，之前会被顶回登录页。
   *
   * 登录态只写给第一个标签页（`signInAsLocalTestUser` 挂的是 page 级 initScript），新标签页拿不到
   * 这段脚本，只能从同源共享的 localStorage 里读。所以这一条能过就说明登录态真的存在 localStorage
   * 里——换回 sessionStorage 的话新标签页读不到，会重新要求登录。
   */
  test("拷贝的文档链接在新标签页打开不用重新登录", async ({ page, context }) => {
    await openWorkspace(page);
    await createDocument(page, "E2E 跨标签页");
    await typeIntoDocument(page, "另一个标签页也该看到这行");
    const fileUrl = page.url();
    // 导航树是另一条 500ms 防抖的保存，等它落地，新标签页才找得到这个节点。
    await page.waitForTimeout(900);

    const newTab = await context.newPage();
    await newTab.goto(fileUrl);

    await expect(editor(newTab)).toContainText("另一个标签页也该看到这行");
    await expect(newTab.getByRole("heading", { name: "登录枝间" })).toHaveCount(0);
    await newTab.close();
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
    const shareToggle = shareDialog.getByRole("switch", { name: "文档开启分享" });
    await shareToggle.click();
    await expect(shareToggle).toHaveAttribute("aria-checked", "true");
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
