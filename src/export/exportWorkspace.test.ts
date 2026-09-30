import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap'
import { strFromU8, unzipSync } from 'fflate'
import * as Y from 'yjs'
import type { PageRow } from '../data/tree'
import { writeSeedDoc } from '../onboarding/seed'
import { seedPages } from '../onboarding/seedContent'
import type { PMNode } from './markdown'
import { exportPaths, safeName } from './paths'

vi.mock('../lib/insforge', () => ({ insforge: {} }))
const { buildWorkspaceZip } = await import('./exportWorkspace')

let clock = 0
const row = (id: string, title: string, parentId: string | null = null, extra: Partial<PageRow> = {}): PageRow => ({
  id,
  workspaceId: 'w',
  parentId,
  title,
  icon: null,
  kind: 'page',
  order: clock++,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  deletedAt: null,
  ...extra,
})

describe('safeName', () => {
  it('produces portable file names', () => {
    expect(safeName('Q3: plan/review?')).toBe('Q3- plan-review-')
    expect(safeName('  ')).toBe('Untitled')
    expect(safeName('...hidden')).toBe('hidden')
    expect(safeName('CON')).toBe('CON_')
    expect(safeName('a'.repeat(200)).length).toBe(88)
    expect(safeName('tab\there')).toBe('tab here')
    expect(safeName('bell\u0007char')).toBe('bell-char')
  })
})

describe('exportPaths', () => {
  it('nests children in folders and dedupes siblings case-insensitively', () => {
    const rows = [row('a', 'Plan'), row('b', 'plan'), row('c', 'Child', 'a'), row('d', 'Grandchild', 'c'), row('e', 'Gone', null, { deletedAt: 1 })]
    const paths = exportPaths(rows)
    expect(paths.get('a')).toBe('Plan.md')
    expect(paths.get('b')).toBe('plan (2).md')
    expect(paths.get('c')).toBe('Plan/Child.md')
    expect(paths.get('d')).toBe('Plan/Child/Grandchild.md')
    expect(paths.has('e')).toBe(false)
  })
})

describe('buildWorkspaceZip', () => {
  function seedJson(key: string): PMNode {
    const page = seedPages.find((p) => p.key === key)!
    const doc = new Y.Doc()
    writeSeedDoc(doc, page.title, page.content)
    return yXmlFragmentToProsemirrorJSON(doc.getXmlFragment('content')) as PMNode
  }

  it('exports real editor content (via Yjs) as a readable Markdown zip', async () => {
    const rows = [row('w', 'Welcome to Tessera'), row('c', 'Getting started checklist', 'w'), row('t', 'Old', null, { deletedAt: 5 })]
    const docs: Record<string, PMNode> = { w: seedJson('welcome'), c: seedJson('checklist') }
    const progress: number[] = []
    const res = await buildWorkspaceZip(rows, async (id) => ({ doc: docs[id] ?? null, complete: id !== 'c' }), (d) => progress.push(d))

    expect(res.files).toBe(2)
    expect(res.incomplete).toBe(1)
    expect(progress).toEqual([1, 2])
    const files = unzipSync(res.zip)
    expect(Object.keys(files).sort()).toEqual(['Welcome to Tessera.md', 'Welcome to Tessera/Getting started checklist.md'])

    const welcome = strFromU8(files['Welcome to Tessera.md'])
    expect(welcome).toMatch(/^---\ntitle: "Welcome to Tessera"\ntessera_id: w\n/)
    expect(welcome).toContain('# Welcome to Tessera')
    expect(welcome).toContain('## Try these')
    expect(welcome).toContain('- Type `/` on an empty line')
    expect(welcome).toContain('> Every edit is a CRDT update')
    expect(welcome).toContain('**Your notes are yours.**')

    const checklist = strFromU8(files['Welcome to Tessera/Getting started checklist.md'])
    expect(checklist).toContain('- [x] Open Tessera')
    expect(checklist).toContain('- [ ] Export your workspace as Markdown')
  })
})
