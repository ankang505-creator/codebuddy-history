#!/usr/bin/env node
import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';

const CODEBUDDY_DIR = join(homedir(), '.codebuddy');
const PROJECTS_DIR = join(CODEBUDDY_DIR, 'projects');

function parseJsonl(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  return content.trim().split('\n')
    .filter(line => line.trim())
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

function extractSessionMeta(entries, sessionId, projectName, filePath) {
  const aiTitleEntry = entries.find(e => e.type === 'ai-title');
  const summaryEntry = entries.find(
    e => e.type === 'summary' && e.providerData?.source === 'initial-user-message'
  );
  const firstUserMsg = entries.find(e => e.type === 'message' && e.role === 'user');
  const messages = entries.filter(e => e.type === 'message');
  const userMessages = messages.filter(e => e.role === 'user');
  const rawTitle =
    aiTitleEntry?.aiTitle ||
    summaryEntry?.summary ||
    firstUserMsg?.content?.[0]?.text ||
    'Untitled';
  const title = rawTitle.replace(/\s*\n\s*/g, ' ').trim().slice(0, 80);
  const timestamp = firstUserMsg?.timestamp || entries[0]?.timestamp;
  const cwd = firstUserMsg?.cwd || entries[0]?.cwd || '';
  const model = entries.find(e => e.providerData?.model)?.providerData?.model || '';
  return { sessionId, projectName, title, timestamp, cwd, model,
           messageCount: messages.length, userMessageCount: userMessages.length, filePath };
}

function getAllSessions() {
  const sessions = [];
  let projects;
  try { projects = readdirSync(PROJECTS_DIR); }
  catch (e) { console.error('无法读取会话目录:', e.message); process.exit(1); }
  for (const project of projects) {
    const projectPath = join(PROJECTS_DIR, project);
    try { if (!statSync(projectPath).isDirectory()) continue; } catch { continue; }
    let files;
    try { files = readdirSync(projectPath).filter(f => f.endsWith('.jsonl')); }
    catch { continue; }
    for (const file of files) {
      const sessionId = basename(file, '.jsonl');
      const filePath = join(projectPath, file);
      try {
        const entries = parseJsonl(filePath);
        if (entries.length === 0) continue;
        sessions.push(extractSessionMeta(entries, sessionId, project, filePath));
      } catch { /* skip corrupt files */ }
    }
  }
  return sessions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

function formatDate(ts) {
  if (!ts) return '未知时间';
  return new Date(ts).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatProject(name) {
  return name
    .replace(/^Users-[^-]+-/, '')
    .replace(/^private-tmp-codebuddy-workspace-[a-f0-9]+$/, 'workspace/tmp')
    .replace(/-/g, '/');
}

function parseArgs(args) {
  const opts = { _positional: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const next = args[i + 1];
      opts[key] = next && !next.startsWith('--') ? args[++i] : true;
    } else {
      opts._positional.push(args[i]);
    }
  }
  return opts;
}

// ── TUI helpers ───────────────────────────────────────────────────────────────

const W = () => process.stdout.columns || 100;
const H = () => process.stdout.rows || 30;

const A = {
  clear:  '\x1b[2J\x1b[H',
  hide:   '\x1b[?25l',
  show:   '\x1b[?25h',
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  blue:   '\x1b[34m',
  white:  '\x1b[37m',
  bgBlue: '\x1b[44m',
  rev:    '\x1b[7m',
  at: (r, c) => `\x1b[${r};${c}H`,
  col: (c) => `\x1b[${c}G`,
};

function pad(str, len) {
  const s = String(str);
  if (s.length >= len) return s.slice(0, len);
  return s + ' '.repeat(len - s.length);
}

function wrapText(text, width) {
  const lines = [];
  for (const raw of text.split('\n')) {
    if (raw.length === 0) { lines.push(''); continue; }
    let remaining = raw;
    while (remaining.length > width) {
      lines.push(remaining.slice(0, width));
      remaining = remaining.slice(width);
    }
    lines.push(remaining);
  }
  return lines;
}

// ── List view ─────────────────────────────────────────────────────────────────

function renderList(sessions, selIdx, scrollOff, searchMode, searchQuery) {
  const w = W(), h = H();
  const listH = h - 4;
  let out = A.clear + A.hide;

  // Header
  const title = searchMode
    ? `${A.bold}${A.yellow} 搜索: ${searchQuery}█${A.reset}`
    : `${A.bold}${A.cyan} CodeBuddy 历史会话${A.reset}`;
  const countStr = `${A.dim}共 ${sessions.length} 个会话 ${A.reset}`;
  out += A.at(1, 1) + title;
  out += A.at(1, w - 14) + countStr;
  out += A.at(2, 1) + A.dim + '─'.repeat(w) + A.reset;

  // Session rows
  const dateW = 16, projW = 18;
  const titleW = Math.max(10, w - dateW - projW - 5);
  const visible = sessions.slice(scrollOff, scrollOff + listH);

  for (let i = 0; i < listH; i++) {
    const s = visible[i];
    const row = i + 3;
    if (!s) { out += A.at(row, 1) + ' '.repeat(w); continue; }
    const absIdx = scrollOff + i;
    const isSel = absIdx === selIdx;
    const dateStr = formatDate(s.timestamp).slice(0, dateW);
    const projStr = pad(formatProject(s.projectName), projW);
    const titleStr = pad(s.title, titleW);
    const line = ` ${pad(dateStr, dateW)}  ${projStr}  ${titleStr}`;
    if (isSel) {
      out += A.at(row, 1) + A.bgBlue + A.white + A.bold + pad(line, w) + A.reset;
    } else {
      out += A.at(row, 1) + pad(line, w);
    }
  }

  // Footer
  out += A.at(h - 1, 1) + A.dim + '─'.repeat(w) + A.reset;
  const footer = searchMode
    ? ' Enter 确认  Esc 取消搜索  ↑↓ 导航'
    : ' ↑↓/jk 导航  Enter 查看详情  / 搜索  q 退出';
  out += A.at(h, 1) + A.dim + footer + A.reset;
  process.stdout.write(out);
}

// ── Detail view ───────────────────────────────────────────────────────────────

function buildDetailLines(entries, width) {
  const lines = [];
  const tw = width - 2;
  const sep = A.dim + ' ' + '─'.repeat(Math.min(50, tw)) + A.reset;

  const relevant = entries
    .filter(e => ['message', 'reasoning', 'function_call', 'function_call_result'].includes(e.type))
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  for (const entry of relevant) {
    const timeStr = A.dim + formatDate(entry.timestamp) + A.reset;

    if (entry.type === 'message') {
      const isUser = entry.role === 'user';
      const label = isUser ? `${A.yellow}▶ 用户${A.reset}` : `${A.green}◀ 助手${A.reset}`;
      lines.push(` ${label}  ${timeStr}`);
      lines.push(sep);
      const text = (entry.content || []).map(c => {
        if (c.type === 'input_text' || c.type === 'output_text') return c.text || '';
        return '';
      }).join('\n').trim();
      for (const l of wrapText(text, tw)) lines.push(' ' + l);

    } else if (entry.type === 'reasoning') {
      const think = (entry.rawContent || [])
        .filter(c => c.type === 'reasoning_text').map(c => c.text || '').join('\n').trim();
      if (!think) continue;
      lines.push(` \x1b[35m💭 思考\x1b[0m  ${timeStr}`);
      lines.push(sep);
      for (const l of wrapText(think, tw)) lines.push(A.dim + ' ' + l + A.reset);

    } else if (entry.type === 'function_call') {
      const name = entry.name || '?';
      const display = entry.providerData?.argumentsDisplayText || '';
      lines.push(` ${A.cyan}⚙ 工具调用: ${name}${A.reset}  ${timeStr}`);
      lines.push(sep);
      if (display) {
        for (const l of wrapText(display, tw)) lines.push(A.dim + ' ' + l + A.reset);
      } else if (entry.arguments) {
        try {
          const args = JSON.parse(entry.arguments);
          for (const [k, v] of Object.entries(args)) {
            const val = String(v).slice(0, 300);
            for (const l of wrapText(`${k}: ${val}`, tw)) lines.push(A.dim + ' ' + l + A.reset);
          }
        } catch {
          for (const l of wrapText(entry.arguments.slice(0, 300), tw)) lines.push(A.dim + ' ' + l + A.reset);
        }
      }

    } else if (entry.type === 'function_call_result') {
      const name = entry.name || '?';
      const output = (entry.output?.text || '').slice(0, 1000);
      const truncated = entry.output?.text?.length > 1000 ? output + '\n…(已截断)' : output;
      lines.push(` ${A.blue}✓ 工具结果: ${name}${A.reset}  ${timeStr}`);
      lines.push(sep);
      for (const l of wrapText(truncated, tw)) lines.push(A.dim + ' ' + l + A.reset);
    }

    lines.push('');
  }
  return lines;
}

function renderDetail(session, lines, scrollOff) {
  const w = W(), h = H();
  const contentH = h - 5;
  let out = A.clear + A.hide;

  // Header
  const titleStr = session.title.length > w - 4 ? session.title.slice(0, w - 7) + '…' : session.title;
  out += A.at(1, 1) + A.bold + A.cyan + ` ${titleStr}` + A.reset;
  const meta = ` 项目: ${formatProject(session.projectName)}  时间: ${formatDate(session.timestamp)}  ${session.userMessageCount} 轮对话`;
  out += A.at(2, 1) + A.dim + meta.slice(0, w - 1) + A.reset;
  out += A.at(3, 1) + A.dim + '─'.repeat(w) + A.reset;

  // Content
  const visible = lines.slice(scrollOff, scrollOff + contentH);
  for (let i = 0; i < contentH; i++) {
    out += A.at(i + 4, 1) + '\x1b[2K' + (visible[i] !== undefined ? visible[i] : '');
  }

  // Scroll indicator
  const maxScroll = Math.max(0, lines.length - contentH);
  const pct = maxScroll > 0 ? Math.round((scrollOff / maxScroll) * 100) : 100;
  const scrollBar = `[${pct}%  ${scrollOff + 1}-${Math.min(scrollOff + contentH, lines.length)}/${lines.length}]`;

  // Footer
  out += A.at(h - 1, 1) + A.dim + '─'.repeat(w) + A.reset;
  out += A.at(h, 1) + A.dim + ` ↑↓/jk 滚动  PgUp/PgDn 翻页  Esc 返回列表  e 导出  ${scrollBar}` + A.reset;
  process.stdout.write(out);
}

// ── TUI main ──────────────────────────────────────────────────────────────────

async function runTUI() {
  const allSessions = getAllSessions();
  if (allSessions.length === 0) { console.log('暂无会话记录'); return; }

  let mode = 'list';           // 'list' | 'detail'
  let selIdx = 0;
  let listScroll = 0;
  let detailScroll = 0;
  let detailLines = [];
  let detailSession = null;
  let searchMode = false;
  let searchQuery = '';
  let sessions = allSessions;

  const listH = () => H() - 4;
  const detailH = () => H() - 5;

  function clampList() {
    selIdx = Math.max(0, Math.min(selIdx, sessions.length - 1));
    if (selIdx < listScroll) listScroll = selIdx;
    if (selIdx >= listScroll + listH()) listScroll = selIdx - listH() + 1;
    listScroll = Math.max(0, listScroll);
  }

  function openDetail(idx) {
    detailSession = sessions[idx];
    const entries = parseJsonl(detailSession.filePath);
    detailLines = buildDetailLines(entries, W());
    detailScroll = 0;
    mode = 'detail';
  }

  function render() {
    if (mode === 'list') renderList(sessions, selIdx, listScroll, searchMode, searchQuery);
    else renderDetail(detailSession, detailLines, detailScroll);
  }

  function applySearch() {
    const q = searchQuery.toLowerCase();
    sessions = q ? allSessions.filter(s =>
      s.title.toLowerCase().includes(q) ||
      formatProject(s.projectName).toLowerCase().includes(q)
    ) : allSessions;
    selIdx = 0; listScroll = 0;
  }

  function cleanup() {
    process.stdout.write(A.show + A.clear);
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }

  process.stdout.write(A.hide);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  render();

  process.stdin.on('data', key => {
    if (key === '\x03') { cleanup(); process.exit(0); }

    if (mode === 'list') {
      if (searchMode) {
        if (key === '\x1b') { searchMode = false; searchQuery = ''; applySearch(); render(); }
        else if (key === '\r') { searchMode = false; render(); }
        else if (key === '\x7f') { searchQuery = searchQuery.slice(0, -1); applySearch(); render(); }
        else if (key.length === 1 && key >= ' ') { searchQuery += key; applySearch(); render(); }
        return;
      }
      if (key === 'q' || key === '\x1b') { cleanup(); process.exit(0); }
      else if (key === '\x1b[A' || key === 'k') { selIdx--; clampList(); render(); }
      else if (key === '\x1b[B' || key === 'j') { selIdx++; clampList(); render(); }
      else if (key === '\x1b[5~') { selIdx -= listH(); clampList(); render(); }
      else if (key === '\x1b[6~') { selIdx += listH(); clampList(); render(); }
      else if (key === 'g') { selIdx = 0; clampList(); render(); }
      else if (key === 'G') { selIdx = sessions.length - 1; clampList(); render(); }
      else if (key === '/') { searchMode = true; render(); }
      else if (key === '\r') { if (sessions.length > 0) { openDetail(selIdx); render(); } }
    } else {
      const maxScroll = Math.max(0, detailLines.length - detailH());
      if (key === '\x1b' || key === 'q') { mode = 'list'; render(); }
      else if (key === '\x1b[A' || key === 'k') { detailScroll = Math.max(0, detailScroll - 1); render(); }
      else if (key === '\x1b[B' || key === 'j') { detailScroll = Math.min(maxScroll, detailScroll + 1); render(); }
      else if (key === '\x1b[5~') { detailScroll = Math.max(0, detailScroll - detailH()); render(); }
      else if (key === '\x1b[6~') { detailScroll = Math.min(maxScroll, detailScroll + detailH()); render(); }
      else if (key === 'g') { detailScroll = 0; render(); }
      else if (key === 'G') { detailScroll = maxScroll; render(); }
      else if (key === 'e') {
        cleanup();
        const s = detailSession;
        const entries = parseJsonl(s.filePath);
        const msgs = entries.filter(e => e.type === 'message');
        let md = `# ${s.title}\n\n| 字段 | 值 |\n|------|----|\n`;
        md += `| 会话 ID | \`${s.sessionId}\` |\n| 项目 | ${formatProject(s.projectName)} |\n`;
        md += `| 时间 | ${formatDate(s.timestamp)} |\n| 目录 | \`${s.cwd}\` |\n\n---\n\n`;
        for (const msg of msgs) {
          const role = msg.role === 'user' ? '## 👤 用户' : '## 🤖 助手';
          const text = (msg.content || []).map(c =>
            (c.type === 'input_text' || c.type === 'output_text') ? c.text || '' :
            c.type === 'tool_use' ? `\`[工具: ${c.name}]\`` : ''
          ).join('\n').trim();
          md += `${role}\n\n${text}\n\n---\n\n`;
        }
        const safeName = s.title.replace(/[^\w一-龥]/g, '-').slice(0, 30);
        const out = `${s.sessionId.slice(0, 8)}-${safeName}.md`;
        writeFileSync(out, md, 'utf-8');
        console.log(`\n已导出到: ${out}\n`);
        process.exit(0);
      }
    }
  });

  process.stdout.on('resize', () => {
    if (mode === 'detail' && detailSession) {
      const entries = parseJsonl(detailSession.filePath);
      detailLines = buildDetailLines(entries, W());
    }
    render();
  });
}

// ── CLI commands ──────────────────────────────────────────────────────────────

const [,, command, ...rawArgs] = process.argv;
const opts = parseArgs(rawArgs);

switch (command) {
  case 'list': {
    const limit = parseInt(opts.limit) || 20;
    const projectFilter = opts.project;
    const format = opts.format || 'table';
    const since = opts.since ? new Date(opts.since).getTime() : null;
    let sessions = getAllSessions();
    if (projectFilter)
      sessions = sessions.filter(s => s.projectName.toLowerCase().includes(projectFilter.toLowerCase()));
    if (since)
      sessions = sessions.filter(s => (s.timestamp || 0) >= since);
    const total = sessions.length;
    sessions = sessions.slice(0, limit);
    if (format === 'json') { console.log(JSON.stringify(sessions, null, 2)); break; }
    console.log(`\n📚 CodeBuddy 历史会话  (显示 ${sessions.length} / ${total} 条)\n`);
    const LINE = '  ' + '─'.repeat(72);
    for (const s of sessions) {
      const title = s.title.length > 55 ? s.title.slice(0, 52) + '…' : s.title;
      console.log(`  ${formatDate(s.timestamp)}  ${title}`);
      console.log(`  ID: ${s.sessionId}`);
      console.log(`  项目: ${formatProject(s.projectName)}  消息: ${s.userMessageCount} 轮`);
      console.log(LINE);
    }
    if (total > limit) console.log(`\n  还有 ${total - limit} 条，使用 --limit ${total} 查看全部\n`);
    break;
  }

  case 'search': {
    const query = opts._positional[0];
    if (!query) { console.error('用法: history.mjs search <关键词>'); process.exit(1); }
    const limit = parseInt(opts.limit) || 10;
    const queryLower = query.toLowerCase();
    console.log(`\n🔍 搜索 "${query}"…\n`);
    const sessions = getAllSessions();
    const results = [];
    for (const session of sessions) {
      if (results.length >= limit) break;
      try {
        if (session.title.toLowerCase().includes(queryLower)) {
          results.push({ ...session, matchText: session.title, matchRole: 'title' }); continue;
        }
        const entries = parseJsonl(session.filePath);
        for (const msg of entries.filter(e => e.type === 'message')) {
          const text = msg.content?.map(c => c.text || '').join(' ') || '';
          if (text.toLowerCase().includes(queryLower)) {
            const idx = text.toLowerCase().indexOf(queryLower);
            const s = Math.max(0, idx - 40), e = Math.min(text.length, idx + query.length + 80);
            const snippet = (s > 0 ? '…' : '') + text.slice(s, e) + (e < text.length ? '…' : '');
            results.push({ ...session, matchText: snippet, matchRole: msg.role }); break;
          }
        }
      } catch { /* skip */ }
    }
    if (results.length === 0) { console.log('  未找到匹配的会话\n'); break; }
    console.log(`  找到 ${results.length} 个匹配会话:\n`);
    for (const r of results) {
      console.log(`  [${formatDate(r.timestamp)}] ${r.title}`);
      console.log(`  ID: ${r.sessionId}  项目: ${formatProject(r.projectName)}`);
      console.log(`  匹配 (${r.matchRole}): ${r.matchText}`);
      console.log('  ' + '─'.repeat(72));
    }
    break;
  }

  case 'view': {
    const sessionId = opts._positional[0];
    if (!sessionId) { console.error('用法: history.mjs view <session-id>'); process.exit(1); }
    const session = getAllSessions().find(s => s.sessionId === sessionId || s.sessionId.startsWith(sessionId));
    if (!session) { console.error(`未找到会话: ${sessionId}`); process.exit(1); }
    const allEntries = parseJsonl(session.filePath);
    console.log(`\n📖 会话详情`);
    console.log(`   标题: ${session.title}`);
    console.log(`   ID:   ${session.sessionId}`);
    console.log(`   项目: ${formatProject(session.projectName)}`);
    console.log(`   时间: ${formatDate(session.timestamp)}`);
    console.log(`   目录: ${session.cwd}`);
    console.log(`   消息: ${session.userMessageCount} 轮对话`);
    console.log('\n' + '═'.repeat(80));
    const relevant = allEntries
      .filter(e => ['message', 'reasoning', 'function_call', 'function_call_result'].includes(e.type))
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    for (const entry of relevant) {
      if (entry.type === 'message') {
        const role = entry.role === 'user' ? '👤 用户' : '🤖 助手';
        const text = (entry.content || []).map(c =>
          (c.type === 'input_text' || c.type === 'output_text') ? c.text || '' : ''
        ).join('\n').trim();
        const display = text.length > 1000 ? text.slice(0, 997) + '…' : text;
        console.log(`\n${role}  ${formatDate(entry.timestamp)}`);
        console.log('─'.repeat(40));
        console.log(display);
      } else if (entry.type === 'reasoning') {
        const think = (entry.rawContent || [])
          .filter(c => c.type === 'reasoning_text').map(c => c.text || '').join('\n').trim();
        if (!think) continue;
        console.log(`\n💭 思考  ${formatDate(entry.timestamp)}`);
        console.log('─'.repeat(40));
        console.log(think.length > 500 ? think.slice(0, 497) + '…' : think);
      } else if (entry.type === 'function_call') {
        const display = entry.providerData?.argumentsDisplayText || entry.arguments || '';
        console.log(`\n⚙ 工具调用: ${entry.name}  ${formatDate(entry.timestamp)}`);
        console.log('─'.repeat(40));
        console.log(String(display).slice(0, 500));
      } else if (entry.type === 'function_call_result') {
        const output = (entry.output?.text || '').slice(0, 800);
        const truncated = (entry.output?.text?.length || 0) > 800 ? output + '\n…(已截断)' : output;
        console.log(`\n✓ 工具结果: ${entry.name}  ${formatDate(entry.timestamp)}`);
        console.log('─'.repeat(40));
        console.log(truncated);
      }
    }
    console.log('');
    break;
  }

  case 'export': {
    const sessionId = opts._positional[0];
    if (!sessionId) { console.error('用法: history.mjs export <session-id>'); process.exit(1); }
    const session = getAllSessions().find(s => s.sessionId === sessionId || s.sessionId.startsWith(sessionId));
    if (!session) { console.error(`未找到会话: ${sessionId}`); process.exit(1); }
    const entries = parseJsonl(session.filePath);
    const messages = entries.filter(e => e.type === 'message');
    let md = `# ${session.title}\n\n| 字段 | 值 |\n|------|----|\n`;
    md += `| 会话 ID | \`${session.sessionId}\` |\n| 项目 | ${formatProject(session.projectName)} |\n`;
    md += `| 时间 | ${formatDate(session.timestamp)} |\n| 目录 | \`${session.cwd}\` |\n\n---\n\n`;
    for (const msg of messages) {
      const role = msg.role === 'user' ? '## 👤 用户' : '## 🤖 助手';
      const text = (msg.content || []).map(c =>
        (c.type === 'input_text' || c.type === 'output_text') ? c.text || '' :
        c.type === 'tool_use' ? `\`[工具: ${c.name}]\`` : ''
      ).join('\n').trim();
      md += `${role}\n\n${text}\n\n---\n\n`;
    }
    const safeName = session.title.replace(/[^\w一-龥]/g, '-').slice(0, 30);
    const outputPath = opts.output || `${session.sessionId.slice(0, 8)}-${safeName}.md`;
    writeFileSync(outputPath, md, 'utf-8');
    console.log(`\n✅ 已导出到: ${outputPath}\n`);
    break;
  }

  case 'stats': {
    console.log('\n📊 正在统计…\n');
    const sessions = getAllSessions();
    if (sessions.length === 0) { console.log('  暂无会话记录\n'); break; }
    const projects = new Set(sessions.map(s => s.projectName));
    const totalTurns = sessions.reduce((n, s) => n + s.userMessageCount, 0);
    const oldest = sessions[sessions.length - 1];
    const newest = sessions[0];
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = sessions.filter(s => (s.timestamp || 0) >= weekAgo).length;
    console.log(`  总会话数:   ${sessions.length}`);
    console.log(`  总项目数:   ${projects.size}`);
    console.log(`  总对话轮数: ${totalTurns}`);
    console.log(`  最早会话:   ${formatDate(oldest.timestamp)}`);
    console.log(`  最新会话:   ${formatDate(newest.timestamp)}`);
    console.log(`  最近 7 天:  ${recent} 个会话`);
    const counts = {};
    for (const s of sessions) counts[s.projectName] = (counts[s.projectName] || 0) + 1;
    console.log('\n  会话最多的项目 (Top 10):');
    Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .forEach(([name, n]) => console.log(`    ${formatProject(name)}: ${n} 个会话`));
    console.log('');
    break;
  }

  default: {
    if (!process.stdin.isTTY) {
      console.log('非交互模式，请使用子命令: list / search / view / export / stats');
      process.exit(1);
    }
    runTUI();
  }
}
