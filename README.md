# 枝间 V2 编辑器

基于 BlockNote 和 MindElixir 组合的新一代枝间编辑器原型。

核心原则：

- `ZhiJianTree` 是唯一数据源
- BlockNote 只作为大纲编辑视图
- MindElixir 只作为思维导图视图
- 两个视图通过 adapter 和 TreeStore command 同步

## 开发

```bash
npm install
npm run dev
```

## 验证

```bash
npm test
npm run lint
npm run build
```
