/**
 * TipTap/ProseMirror JSON → Markdown (CommonMark + GFM task lists, ~~strike~~, ==highlight==).
 * Covers every node and mark in the editor schema (see editor/extensions.ts).
 */
export type PMMark = { type: string; attrs?: Record<string, unknown> }
export type PMNode = { type: string; attrs?: Record<string, unknown>; content?: PMNode[]; text?: string; marks?: PMMark[] }

// Mark nesting order: outermost first. Code is innermost and never escaped.
const MARK_ORDER = ['link', 'bold', 'italic', 'strike', 'underline', 'highlight', 'code'] as const
const DELIM: Record<string, [string, string]> = {
  bold: ['**', '**'],
  italic: ['*', '*'],
  strike: ['~~', '~~'],
  underline: ['<u>', '</u>'],
  highlight: ['==', '=='],
}

/** Escapes characters that would otherwise become Markdown syntax. */
export function escapeInline(text: string): string {
  return text.replace(/[\\`*_[\]<>~=|]/g, (c) => `\\${c}`)
}

/** Escapes a line start that would turn into a heading, quote, list or rule. */
function escapeLineStart(line: string): string {
  return line.replace(/^(\s*)(#{1,6}\s|>|[-+*]\s|\d+[.)]\s|-{3,}\s*$)/, (_m, ws: string, tok: string) => `${ws}\\${tok}`)
}

function codeSpan(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((m) => m.length))
  const fence = '`'.repeat(longest + 1)
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : ''
  return `${fence}${pad}${text}${pad}${fence}`
}

function linkHref(mark: PMMark): string {
  const href = String(mark.attrs?.href ?? '')
  return href.replace(/[()\s]/g, (c) => encodeURIComponent(c))
}

const sortMarks = (marks: PMMark[] = []) =>
  marks.filter((m) => MARK_ORDER.includes(m.type as (typeof MARK_ORDER)[number])).sort((a, b) => MARK_ORDER.indexOf(a.type as never) - MARK_ORDER.indexOf(b.type as never))

const sameMark = (a: PMMark, b: PMMark) => a.type === b.type && (a.type !== 'link' || a.attrs?.href === b.attrs?.href)

/** Inline content with a mark stack, so adjacent runs share delimiters: **bold *both*** not **bold****both**. */
export function renderInline(nodes: PMNode[] = []): string {
  let out = ''
  const open: PMMark[] = []
  const close = (to: number) => {
    while (open.length > to) {
      const m = open.pop()!
      out += m.type === 'link' ? `](${linkHref(m)})` : DELIM[m.type][1]
    }
  }
  for (const node of nodes) {
    if (node.type === 'hardBreak') {
      close(0)
      out += '\\\n'
      continue
    }
    if (node.type !== 'text' || !node.text) continue
    const marks = sortMarks(node.marks)
    const code = marks.find((m) => m.type === 'code')
    const wrapping = marks.filter((m) => m.type !== 'code')
    let keep = 0
    while (keep < open.length && keep < wrapping.length && sameMark(open[keep], wrapping[keep])) keep++
    close(keep)
    for (const m of wrapping.slice(keep)) {
      open.push(m)
      out += m.type === 'link' ? '[' : DELIM[m.type][0]
    }
    out += code ? codeSpan(node.text) : escapeInline(node.text)
  }
  close(0)
  return out
}

const indent = (text: string, prefix: string, first = prefix) =>
  text
    .split('\n')
    .map((line, i) => (i === 0 ? first : line ? prefix : prefix.trimEnd()) + line)
    .join('\n')

function renderListItem(item: PMNode, marker: string): string {
  const [first, ...rest] = item.content ?? []
  const head = first ? renderBlock(first) : ''
  const pad = ' '.repeat(marker.length)
  const tail = rest.map((b) => indent(renderBlock(b), pad)).join('\n')
  return indent(head, pad, marker) + (tail ? `\n${tail}` : '')
}

export function renderBlock(node: PMNode): string {
  switch (node.type) {
    case 'paragraph':
      return escapeLineStart(renderInline(node.content))
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)))
      return `${'#'.repeat(level)} ${renderInline(node.content)}`
    }
    case 'bulletList':
      return (node.content ?? []).map((li) => renderListItem(li, '- ')).join('\n')
    case 'orderedList': {
      const start = Number(node.attrs?.start ?? 1)
      return (node.content ?? []).map((li, i) => renderListItem(li, `${start + i}. `)).join('\n')
    }
    case 'taskList':
      return (node.content ?? []).map((li) => renderListItem(li, li.attrs?.checked ? '- [x] ' : '- [ ] ')).join('\n')
    case 'blockquote':
      return indent(renderBlocks(node.content), '> ')
    case 'codeBlock': {
      const text = (node.content ?? []).map((t) => t.text ?? '').join('')
      const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((m) => m.length))
      const fence = '`'.repeat(longest + 1)
      return `${fence}${String(node.attrs?.language ?? '')}\n${text}\n${fence}`
    }
    case 'horizontalRule':
      return '---'
    case 'listItem':
    case 'taskItem':
      return renderBlocks(node.content)
    default:
      // Unknown block: keep its text rather than silently dropping content.
      return node.content ? renderBlocks(node.content) : escapeInline(node.text ?? '')
  }
}

export function renderBlocks(nodes: PMNode[] = []): string {
  return nodes.map(renderBlock).join('\n\n')
}

export type PageMeta = { id: string; title: string; createdAt: number; updatedAt: number }

export function frontmatter(meta: PageMeta): string {
  return ['---', `title: ${JSON.stringify(meta.title)}`, `tessera_id: ${meta.id}`, `created: ${new Date(meta.createdAt).toISOString()}`, `updated: ${new Date(meta.updatedAt).toISOString()}`, '---'].join('\n')
}

/** A complete .md file: frontmatter, H1 title, body. */
export function pageToMarkdown(meta: PageMeta, doc: PMNode | null): string {
  const title = meta.title.trim() || 'Untitled'
  const body = doc?.content?.length ? renderBlocks(doc.content).trim() : ''
  return `${frontmatter({ ...meta, title })}\n\n# ${escapeInline(title)}\n${body ? `\n${body}\n` : ''}`
}
