# Zotero Bases

Zotero Bases 是独立的 Zotero 10 插件，把文库变成可编辑的表格。通过 **工具 → Zotero Bases** 打开主窗口标签页，也可将当前视图移到独立窗口。不需要安装 Zotero Neo。

- 自定义文本、数值、复选框、单选和多选属性；直接编辑表格中的属性和 Zotero 标签。
- 为不同阅读任务保存视图；每个视图记住范围、列、筛选和排序。
- 属性值以可读文本写入 Zotero `Extra`，跟随条目同步。属性定义和表格视图保存在本机。

[使用指南](docs/GUIDE.md)

## 构建和安装

需要 Node.js 24 或更新版本。

```sh
npm ci --ignore-scripts
npm run verify
```

在 Zotero 打开 **工具 → 插件**，从齿轮菜单选择从文件安装，打开生成的 `zotero-bases.xpi`。也可从通过验证的 GitHub Actions 运行下载 `zotero-bases` 构建产物。

[AGPL-3.0](LICENSE)
