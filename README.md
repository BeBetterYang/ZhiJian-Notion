# 枝间

枝间是以大纲和思维导图编辑同一份结构化文档的 Web 应用。

## 数据模型

`ZhiJianTree` 是文档的唯一数据源。BlockNote 只负责大纲编辑视图，MindElixir 只负责思维导图视图；两个视图通过 adapter 和 `TreeStore` command 读取、修改同一棵树，不各自持久化业务数据。

Supabase 中的数据按 Auth 用户 UUID 归属：

- `workspace_states`：用户资料、文件夹/文件导航树和回收站。
- `workspace_documents`：每个 `user_id + file_id` 一行，保存 `tree`、`schema_version`、`revision` 和更新时间。
- `workspace_assets`：图片的稳定 `asset_id`、Storage 路径和文件元数据。
- `workspace_document_shares`：公开分享 token、所有者 UUID、文件 ID 和启用状态。

文档保存使用 optimistic concurrency。客户端提交当前 revision，服务端只更新 revision 匹配的行；冲突返回 HTTP 409，防止多标签页或多设备静默覆盖。回收站彻底删除会调用 `DELETE /api/workspace/documents/:fileId`，删除文档行，并清理该文档独占的图片资源。

## 图片资源

图片原文件保存在私有 Supabase Storage bucket `workspace-images`。文档树只保存稳定的 `assetId / storagePath`，页面加载和分享访问时由服务端签发短期（1 小时）访问 URL。IndexedDB 仅缓存图片 Blob：已缓存的图片优先使用本地 Blob URL，未缓存的会在加载后下载一次写入缓存，因此签名过期或换设备后图片仍可显示。缓存不是持久化来源，清空后会从 Storage 重新获取。保存分享文档时会复制其图片到当前用户目录并替换树中的资源引用。

## Auth 与分享

登录、注册、token 刷新以及邮箱/密码修改均调用 Supabase Auth。数据权限以 `user.id` 为准，email 只作为资料字段。Vercel API 使用 service role 访问已撤销客户端权限且启用 RLS 的数据表；service role 绝不能放入 `VITE_*` 环境变量。

分享页为只读视图，支持大纲/导图切换、搜索、展开收起和导出。分享 token 只允许读取启用的指定文档及该文档引用的图片。保存到自己的枝间时会创建独立文档和独立图片资源。

## 环境变量

本地 `.env.local` 和 Vercel Production/Preview 需要配置：

```bash
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
```

兼容旧项目时可使用 `SUPABASE_ANON_KEY` 代替 publishable key。`SUPABASE_SERVICE_ROLE_KEY` 只允许存在于服务端环境。

## 开发与数据库

```bash
npm ci
npm run dev
```

数据库结构位于 `supabase/migrations/`。新环境先应用 migration，再启动应用。当前上线前结构不包含旧版 email/JSONB documents 数据迁移。

`npm run dev` 由 `vite.config.ts` 内的开发用 API 提供 `/api/*`：认证仍走真实 Supabase Auth，工作区数据、文档 revision、图片字节则按 `user.id` 存放在本地 `.zhijian-server-data/`，接口契约与线上一致（含 409 冲突、图片上传和账号修改），因此本地和 Playwright 验证的行为与部署后相同。该目录只是本地临时数据，可随时删除。

## 测试

```bash
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

GitHub Actions 在 push 和 pull request 时使用 Node.js 22 执行以上检查。Playwright E2E 至少验证工作区真实入口可以启动并渲染登录界面。

## 部署

项目可部署到 Vercel。关联 GitHub 仓库后，推送 `main` 会触发 Production 部署；其他分支和 pull request 生成 Preview。部署前确认 Supabase migration 已应用、三个环境变量已配置，并检查 CI 全部通过。
