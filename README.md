# Zotero Bases

Zotero Bases 是独立的 Zotero 10 插件，把文库变成可编辑的表格。通过 **工具 → Zotero Bases** 打开主窗口标签页，也可将当前视图移到独立窗口。不需要安装 Zotero Neo。

- 直接编辑五类自定义属性和 Zotero 标签，也可跨页多选后批量设置或清空。
- 为不同阅读任务保存视图；每个视图记住范围、列、筛选、排序与分组。
- 属性值以可读文本写入 Zotero `Extra`。可选的文库同步通过 Zotero 的存储附件在设备间传递属性定义和视图，无需额外密钥。

[使用指南](docs/GUIDE.md)

## 下载与安装

从 [GitHub Releases](https://github.com/zhongyangchuwu/Zotero-Bases/releases/latest) 下载 `zotero-bases.xpi`（不是源码压缩包）。在 Zotero 打开 **工具 → 插件**，从齿轮菜单选择从文件安装并打开该文件。

## 从源码构建

需要 Node.js 24 或更新版本。

```sh
npm ci --ignore-scripts
npm run verify
```

构建生成的 `zotero-bases.xpi` 也可按上述方式安装。

[AGPL-3.0](LICENSE)
