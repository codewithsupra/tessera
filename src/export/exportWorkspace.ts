import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap'
import { strToU8, zipSync, type Zippable } from 'fflate'
import { listPages } from '../data/pages'
import type { PageRow } from '../data/tree'
import { acquireSync } from '../sync/registry'
import { pageToMarkdown, type PMNode } from './markdown'
import { exportPaths, safeName } from './paths'

export type LoadedPage = { doc: PMNode | null; complete: boolean }

/**
 * A page's content for export: the local copy merged with the server's (read-only — exporting
 * never writes). `complete` is false if the server couldn't be reached.
 */
export async function loadPageContent(pageId: string): Promise<LoadedPage> {
  const h = acquireSync(pageId, { readOnly: true })
  try {
    const sync = await h.ready
    const json = yXmlFragmentToProsemirrorJSON(h.doc.getXmlFragment('content')) as PMNode
    return { doc: json, complete: sync.status === 'synced' }
  } finally {
    await h.release()
  }
}

export type ExportResult = { zip: Uint8Array; files: number; incomplete: number }

/** Builds the zip from rows and a content loader (injected so it's testable without a backend). */
export async function buildWorkspaceZip(
  rows: PageRow[],
  load: (pageId: string) => Promise<LoadedPage>,
  onProgress?: (done: number, total: number) => void,
): Promise<ExportResult> {
  const live = rows.filter((r) => r.deletedAt === null)
  const paths = exportPaths(live)
  const files: Zippable = {}
  let incomplete = 0
  let done = 0
  for (const row of live) {
    const path = paths.get(row.id)
    if (!path) continue // orphan whose parent is trashed: not in the tree
    const { doc, complete } = await load(row.id)
    if (!complete) incomplete++
    files[path] = strToU8(pageToMarkdown({ id: row.id, title: row.title, createdAt: row.createdAt, updatedAt: row.updatedAt }, doc))
    onProgress?.(++done, live.length)
  }
  return { zip: zipSync(files, { level: 6 }), files: Object.keys(files).length, incomplete }
}

export async function exportWorkspace(workspaceId: string, onProgress?: (done: number, total: number) => void): Promise<ExportResult> {
  return buildWorkspaceZip(await listPages(workspaceId), loadPageContent, onProgress)
}

export async function exportPage(row: PageRow): Promise<{ markdown: string; complete: boolean; filename: string }> {
  const { doc, complete } = await loadPageContent(row.id)
  return { markdown: pageToMarkdown({ id: row.id, title: row.title, createdAt: row.createdAt, updatedAt: row.updatedAt }, doc), complete, filename: `${safeName(row.title)}.md` }
}

/** Saves bytes as a file download. */
export function download(filename: string, data: Uint8Array | string, type: string) {
  const blob = new Blob([typeof data === 'string' ? data : new Uint8Array(data)], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
