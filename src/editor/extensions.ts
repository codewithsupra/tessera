import { getSchema, type AnyExtension } from '@tiptap/core'
import Highlight from '@tiptap/extension-highlight'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import StarterKit from '@tiptap/starter-kit'

/**
 * The document model: every node and mark a page can contain. Shared by the editor, the
 * onboarding seed, Markdown export and the landing-page demo so they can never disagree.
 * (Collaboration, carets, placeholder and slash menu are behavior, not schema.)
 */
export const contentExtensions: AnyExtension[] = [
  StarterKit.configure({ undoRedo: false, link: { openOnClick: false, autolink: true } }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Highlight,
]

let cached: ReturnType<typeof getSchema> | null = null
export function contentSchema() {
  return (cached ??= getSchema(contentExtensions))
}
