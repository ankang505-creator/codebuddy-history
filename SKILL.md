---
name: codebuddy-history
description: "管理和浏览本机所有 CodeBuddy 历史会话。支持交互式 TUI 浏览、列表、搜索、查看详情和导出。当用户询问查找、浏览、搜索历史会话，或想恢复某次对话时使用。"
description_zh: "管理和浏览 CodeBuddy 历史会话，支持交互式 TUI 浏览、列表、搜索、查看和导出"
description_en: "Manage and browse CodeBuddy session history with interactive TUI"
version: 1.1.0
allowed-tools: Bash,Read
metadata:
  openclaw:
    emoji: "📚"
    requires:
      bins:
        - node
---

# CodeBuddy History Manager

浏览和管理本机 `~/.codebuddy/projects/` 下的所有历史会话。

## 交互式 TUI（推荐）

直接运行脚本，进入全屏交互界面：

```bash
node {baseDir}/scripts/history.mjs
```

**列表视图快捷键：**
- `↑↓` / `j k` — 上下导航
- `PgUp / PgDn` — 翻页
- `g / G` — 跳到顶部 / 底部
- `Enter` — 打开会话详情
- `/` — 实时搜索（按标题和项目名过滤）
- `Esc / q` — 退出

**详情视图快捷键：**
- `↑↓` / `j k` — 滚动内容
- `PgUp / PgDn` — 翻页
- `g / G` — 跳到顶部 / 底部
- `e` — 导出当前会话为 Markdown
- `Esc / q` — 返回列表

## 列出会话

```bash
node {baseDir}/scripts/history.mjs list [选项]
```

选项：
- `--project <名称>`: 按项目名过滤（支持模糊匹配）
- `--limit <n>`: 最多显示 n 条（默认 20）
- `--format <table|json>`: 输出格式（默认 table）
- `--since <YYYY-MM-DD>`: 只显示该日期之后的会话

示例：
```bash
node {baseDir}/scripts/history.mjs list
node {baseDir}/scripts/history.mjs list --limit 50
node {baseDir}/scripts/history.mjs list --project markting
node {baseDir}/scripts/history.mjs list --since 2025-01-01
```

## 搜索会话

在所有会话的标题和消息内容中搜索关键词：

```bash
node {baseDir}/scripts/history.mjs search <关键词> [--limit <n>]
```

示例：
```bash
node {baseDir}/scripts/history.mjs search "API 设计"
node {baseDir}/scripts/history.mjs search "数据库" --limit 5
```

## 查看会话详情

显示某个会话的完整对话内容：

```bash
node {baseDir}/scripts/history.mjs view <session-id> [--limit <n>]
```

session-id 支持前缀匹配（输入前 8 位即可）。

示例：
```bash
node {baseDir}/scripts/history.mjs view afc76c62
node {baseDir}/scripts/history.mjs view afc76c62-ca90-4ba6-ba5c-d83afbca6a40 --limit 20
```

## 导出会话为 Markdown

```bash
node {baseDir}/scripts/history.mjs export <session-id> [--output <路径>]
```

示例：
```bash
node {baseDir}/scripts/history.mjs export afc76c62
node {baseDir}/scripts/history.mjs export afc76c62 --output ~/Desktop/session.md
```

## 统计信息

```bash
node {baseDir}/scripts/history.mjs stats
```

显示总会话数、项目数、对话轮数、最活跃项目等。

## 恢复会话

查到 session-id 后，用以下命令恢复：

```bash
buddycn --resume <session-id>
```

## 说明

- 会话文件存储在 `~/.codebuddy/projects/<项目名>/<session-id>.jsonl`
- 项目名格式为 `Users-<用户名>-<路径>` 的连字符形式
- `ai-title` 字段为 AI 自动生成的会话标题
