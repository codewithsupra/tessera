import type { Editor, Range } from '@tiptap/core'

export type SlashCommand = {
  id: string
  title: string
  description: string
  keywords: string[]
  run: (editor: Editor, range: Range) => void
}

const chain = (editor: Editor, range: Range) => editor.chain().focus().deleteRange(range)

export const slashCommands: SlashCommand[] = [
  { id: 'text', title: 'Text', description: 'Plain paragraph', keywords: ['paragraph', 'p', 'plain'], run: (e, r) => chain(e, r).setParagraph().run() },
  { id: 'h1', title: 'Heading 1', description: 'Large section heading', keywords: ['title', 'h1', '#'], run: (e, r) => chain(e, r).setHeading({ level: 1 }).run() },
  { id: 'h2', title: 'Heading 2', description: 'Medium section heading', keywords: ['subtitle', 'h2', '##'], run: (e, r) => chain(e, r).setHeading({ level: 2 }).run() },
  { id: 'h3', title: 'Heading 3', description: 'Small section heading', keywords: ['h3', '###'], run: (e, r) => chain(e, r).setHeading({ level: 3 }).run() },
  { id: 'todo', title: 'To-do list', description: 'Track tasks with checkboxes', keywords: ['task', 'checkbox', 'check', '[]'], run: (e, r) => chain(e, r).toggleTaskList().run() },
  { id: 'bullet', title: 'Bulleted list', description: 'Simple unordered list', keywords: ['ul', 'unordered', '-'], run: (e, r) => chain(e, r).toggleBulletList().run() },
  { id: 'numbered', title: 'Numbered list', description: 'List with numbers', keywords: ['ol', 'ordered', '1.'], run: (e, r) => chain(e, r).toggleOrderedList().run() },
  { id: 'quote', title: 'Quote', description: 'Set off a quotation', keywords: ['blockquote', 'cite', '>'], run: (e, r) => chain(e, r).toggleBlockquote().run() },
  { id: 'code', title: 'Code block', description: 'Monospaced code', keywords: ['pre', 'snippet', '```'], run: (e, r) => chain(e, r).toggleCodeBlock().run() },
  { id: 'divider', title: 'Divider', description: 'Horizontal rule between sections', keywords: ['hr', 'rule', 'line', '---'], run: (e, r) => chain(e, r).setHorizontalRule().run() },
]

/** Ranks commands for a slash query: title prefix, then word prefix, then keyword, then substring. */
export function filterCommands(query: string, commands: SlashCommand[] = slashCommands): SlashCommand[] {
  const q = query.trim().toLowerCase()
  if (!q) return commands
  const score = (c: SlashCommand) => {
    const title = c.title.toLowerCase()
    if (title.startsWith(q)) return 0
    if (title.split(/\s+/).some((w) => w.startsWith(q))) return 1
    if (c.keywords.some((k) => k.toLowerCase().startsWith(q))) return 2
    if (title.includes(q) || c.description.toLowerCase().includes(q)) return 3
    return -1
  }
  return commands
    .map((c, i) => ({ c, s: score(c), i }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map((x) => x.c)
}
