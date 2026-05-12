# codebuddy-history

浏览和管理本机 CodeBuddy 历史会话的工具，支持交互式 TUI 界面、命令行操作、搜索和导出。

## 功能

- **交互式 TUI**：全屏浏览所有历史会话，实时搜索，查看对话详情
- **列表**：按项目、时间过滤，支持 table / JSON 输出
- **搜索**：在标题和消息内容中全文搜索
- **查看详情**：展示完整对话，包含工具调用和思考过程
- **导出**：将会话导出为 Markdown 文件
- **统计**：总会话数、项目数、最活跃项目等

## 环境要求

- Node.js 18+
- CodeBuddy（会话文件存储在 `~/.codebuddy/projects/`）

## 使用方式

### 交互式 TUI（推荐）

```bash
node scripts/history.mjs
```

**列表视图**

| 按键 | 操作 |
|------|------|
| `↑↓` / `j k` | 上下导航 |
| `PgUp / PgDn` | 翻页 |
| `g / G` | 跳到顶部 / 底部 |
| `Enter` | 打开会话详情 |
| `/` | 实时搜索 |
| `q / Esc` | 退出 |

**详情视图**

| 按键 | 操作 |
|------|------|
| `↑↓` / `j k` | 滚动内容 |
| `PgUp / PgDn` | 翻页 |
| `g / G` | 跳到顶部 / 底部 |
| `e` | 导出为 Markdown |
| `q / Esc` | 返回列表 |

### 命令行

**列出会话**

```bash
node scripts/history.mjs list [选项]

# 选项
--project <名称>        按项目名过滤（支持模糊匹配）
--limit <n>             最多显示 n 条（默认 20）
--format <table|json>   输出格式（默认 table）
--since <YYYY-MM-DD>    只显示该日期之后的会话
```

**搜索会话**

```bash
node scripts/history.mjs search <关键词> [--limit <n>]
```

**查看会话详情**

```bash
# session-id 支持前缀匹配（输入前 8 位即可）
node scripts/history.mjs view <session-id> [--limit <n>]
```

**导出为 Markdown**

```bash
node scripts/history.mjs export <session-id> [--output <路径>]
```

**统计信息**

```bash
node scripts/history.mjs stats
```

### 恢复会话

找到 session-id 后，用以下命令在 CodeBuddy 中恢复：

```bash
buddycn --resume <session-id>
```

## 作为 Kiro Skill 使用

本项目包含 `SKILL.md`，可作为 Kiro skill 加载，让 AI 助手直接调用脚本来帮你查找和浏览历史会话。

## 数据说明

- 会话文件路径：`~/.codebuddy/projects/<项目名>/<session-id>.jsonl`
- 项目名格式：`Users-<用户名>-<路径>` 的连字符形式
- `ai-title` 字段为 AI 自动生成的会话标题
