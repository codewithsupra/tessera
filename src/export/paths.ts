import { buildTree, displayTitle, type PageRow, type TreeNode } from '../data/tree'

const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i

/** A title as a portable file or folder name (Windows, macOS, Linux, zip). */
export function safeName(title: string): string {
  let name = displayTitle(title)
    .normalize('NFC')
    .replace(/[\t\n\r]+/g, ' ')
    .replace(/[\\/:*?"<>|]/g, '-')
    .split('')
    .map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? '-' : c))
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s-]+|[.\s]+$/g, '')
  if (!name || RESERVED.test(name)) name = `${name || 'Untitled'}_`
  // Keep room for " (99).md" within a conservative 100-character component.
  return [...name].slice(0, 88).join('').trimEnd()
}

/**
 * Obsidian-style layout: every page is `Name.md`; a page with children also gets a
 * `Name/` folder holding them. Siblings with the same name get " (2)", " (3)", …
 */
export function exportPaths(rows: PageRow[]): Map<string, string> {
  const out = new Map<string, string>()
  const walk = (nodes: TreeNode[], dir: string) => {
    const used = new Map<string, number>()
    for (const node of nodes) {
      const base = safeName(node.title)
      const key = base.toLowerCase()
      const n = (used.get(key) ?? 0) + 1
      used.set(key, n)
      const name = n === 1 ? base : `${base} (${n})`
      out.set(node.id, `${dir}${name}.md`)
      if (node.children.length) walk(node.children, `${dir}${name}/`)
    }
  }
  walk(buildTree(rows), '')
  return out
}
