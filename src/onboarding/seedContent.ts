/**
 * First-run sample pages, as TipTap/ProseMirror JSON. Converted to Yjs with the real editor
 * schema (see seed.ts), so they behave exactly like pages a user wrote.
 */
type Mark = { type: 'bold' | 'italic' | 'code' | 'highlight' }
type TextNode = { type: 'text'; text: string; marks?: Mark[] }
export type JSONNode = { type: string; attrs?: Record<string, unknown>; content?: (JSONNode | TextNode)[] }

const t = (text: string, ...marks: Mark['type'][]): TextNode => (marks.length ? { type: 'text', text, marks: marks.map((type) => ({ type })) } : { type: 'text', text })
const p = (...content: (TextNode | string)[]): JSONNode => ({ type: 'paragraph', content: content.map((c) => (typeof c === 'string' ? t(c) : c)) })
const h = (level: 1 | 2 | 3, text: string): JSONNode => ({ type: 'heading', attrs: { level }, content: [t(text)] })
const bullets = (...items: (TextNode | string)[][]): JSONNode => ({ type: 'bulletList', content: items.map((parts) => ({ type: 'listItem', content: [p(...parts)] })) })
const tasks = (...items: [boolean, string][]): JSONNode => ({
  type: 'taskList',
  content: items.map(([checked, text]) => ({ type: 'taskItem', attrs: { checked }, content: [p(text)] })),
})
const quote = (text: string): JSONNode => ({ type: 'blockquote', content: [p(text)] })
const doc = (...content: JSONNode[]): JSONNode => ({ type: 'doc', content })

export type SeedPage = { key: string; title: string; parent?: string; content: JSONNode }

export const seedPages: SeedPage[] = [
  {
    key: 'welcome',
    title: 'Welcome to Tessera',
    content: doc(
      p('Tessera is a notes workspace that lives on your device first. It opens instantly, works offline, and syncs when you’re back online.'),
      h(2, 'Try these'),
      bullets(
        ['Type ', t('/', 'code'), ' on an empty line to add headings, to-dos, quotes and code.'],
        ['Drag the ', t('⋮⋮', 'bold'), ' handle beside any block to move it.'],
        ['Press ', t('Ctrl/⌘ K', 'code'), ' to jump to any page or run a command.'],
        ['Turn off your Wi-Fi and keep writing — nothing is lost.'],
      ),
      h(2, 'Write with other people'),
      p('Create a team workspace from the switcher at the top of the sidebar, then invite people as editors or viewers. Everyone sees each other’s cursors as they type.'),
      quote('Every edit is a CRDT update: people can write in the same paragraph at once, even offline, and it always merges.'),
      p(t('Your notes are yours.', 'bold'), ' Export any workspace as plain Markdown files whenever you like.'),
    ),
  },
  {
    key: 'checklist',
    title: 'Getting started checklist',
    parent: 'welcome',
    content: doc(
      p('Check things off as you go — this is a real to-do list.'),
      tasks(
        [true, 'Open Tessera'],
        [false, 'Rename this page by clicking its title'],
        [false, 'Add a page inside this one with the + next to it in the sidebar'],
        [false, 'Open the “Try multiplayer” page in a second tab'],
        [false, 'Export your workspace as Markdown'],
      ),
    ),
  },
  {
    key: 'multiplayer',
    title: 'Try multiplayer',
    content: doc(
      p('Open this page in a second browser tab (or on your phone) and type in both. You’ll see a named cursor for each one, and edits appear in about a second.'),
      p('Now go offline in one of them, keep typing in both, and reconnect. Both versions merge — no conflict dialogs, no lost words.'),
      p(t('Why it works: ', 'bold'), 'each page is a ', t('Yjs', 'code'), ' document stored in your browser. Changes are sent to the server as small updates and broadcast to everyone on the page.'),
    ),
  },
]
