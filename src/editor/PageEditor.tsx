import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import DragHandle from '@tiptap/extension-drag-handle-react'
import Highlight from '@tiptap/extension-highlight'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { GripVertical } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type * as Y from 'yjs'
import { useAuth } from '../auth/context'
import { canEdit } from '../data/workspaces'
import { useSyncStore } from '../sync/syncStore'
import { applyTextDiff } from '../data/docs'
import { setPageTitle } from '../data/pages'
import type { DocSync } from '../sync/DocSync'
import { colorFor } from '../sync/identity'
import { acquireSync } from '../sync/registry'
import { PageStatusBar } from './PageStatusBar'
import { SlashExtension } from './SlashExtension'
import { SlashMenu } from './SlashMenu'

/** Opens the page's local Y.Doc (instant), starts cloud sync in the background, mounts the editor. */
export function PageEditor({ pageId }: { pageId: string }) {
  const [state, setState] = useState<{ doc: Y.Doc; sync: DocSync } | null>(null)
  const readOnly = !canEdit(useSyncStore((s) => s.role))

  useEffect(() => {
    const handle = acquireSync(pageId, { readOnly })
    let alive = true
    void handle.localReady.then((sync) => alive && setState({ doc: handle.doc, sync }))
    return () => {
      alive = false
      setState(null)
      void handle.release()
    }
    // A role change (rare) re-acquires the page with the right mode from the very first sync.
  }, [pageId, readOnly])

  if (!state) return <div className="mx-auto h-40 max-w-[720px]" aria-busy="true" />
  return <LoadedEditor key={pageId} pageId={pageId} doc={state.doc} sync={state.sync} />
}

function LoadedEditor({ pageId, doc, sync }: { pageId: string; doc: Y.Doc; sync: DocSync }) {
  const { user } = useAuth()
  const name = user?.name ?? user?.email ?? 'Someone'
  const color = colorFor(user?.id ?? 'anon')
  const editable = canEdit(useSyncStore((s) => s.role))

  const editor = useEditor({
    editable,
    extensions: [
      StarterKit.configure({ undoRedo: false, link: { openOnClick: false, autolink: true } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight,
      Placeholder.configure({
        placeholder: ({ node }) => (node.type.name === 'heading' ? 'Heading' : "Write, or type '/' for blocks"),
      }),
      Collaboration.configure({ document: doc, field: 'content' }),
      CollaborationCaret.configure({ provider: sync, user: { name, color, id: user?.id } }),
      SlashExtension,
    ],
    editorProps: { attributes: { class: 'tessera-prose', 'aria-label': 'Page content' } },
  })

  // Viewers get a read-only editor and a sync that never sends (the server would refuse anyway).
  useEffect(() => {
    sync.setReadOnly(!editable)
    if (editor && editor.isEditable !== editable) editor.setEditable(editable)
  }, [editor, sync, editable])

  return (
    <article className="mx-auto w-full max-w-[720px] px-5 pb-40 pt-6 sm:px-12">
      <PageStatusBar pageId={pageId} sync={sync} selfId={user?.id} readOnly={!editable} />
      <div className="pt-8">
        <TitleField pageId={pageId} doc={doc} editor={editor} readOnly={!editable} />
      </div>
      {editor && editable && (
        <DragHandle editor={editor}>
          <span className="flex h-6 w-5 cursor-grab items-center justify-center rounded text-ink-faint hover:bg-plaster-deep" aria-label="Drag to move block">
            <GripVertical size={16} aria-hidden="true" />
          </span>
        </DragHandle>
      )}
      <EditorContent editor={editor} />
      <SlashMenu />
    </article>
  )
}

function TitleField({ pageId, doc, editor, readOnly }: { pageId: string; doc: Y.Doc; editor: Editor | null; readOnly: boolean }) {
  const ytitle = doc.getText('title')
  const [title, setTitle] = useState(() => ytitle.toString())
  const ref = useRef<HTMLTextAreaElement>(null)

  // Y.Text is the source of truth (it merges remote edits); mirror it into the local index.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    // Viewers only display the title; mirroring it would mark the page dirty for a push they can't make.
    const sync = () => {
      const next = ytitle.toString()
      setTitle(next)
      clearTimeout(timer)
      if (!readOnly) timer = setTimeout(() => void setPageTitle(pageId, next), 250)
    }
    ytitle.observe(sync)
    return () => {
      ytitle.unobserve(sync)
      clearTimeout(timer)
      if (!readOnly) void setPageTitle(pageId, ytitle.toString())
    }
  }, [ytitle, pageId, readOnly])

  // Grow with content.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }, [title])

  // New, empty pages start with the cursor in the title.
  useEffect(() => {
    if (!ytitle.toString() && !readOnly) ref.current?.focus()
  }, [ytitle, readOnly])

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' || (e.key === 'ArrowDown' && e.currentTarget.selectionStart === title.length)) {
      e.preventDefault()
      if (!editor) return
      // TipTap's focus() is deferred to the next frame; focus the DOM now so keystrokes
      // typed immediately after Enter land in the body, not the title.
      editor.view.dom.focus()
      editor.commands.focus('start')
    }
  }

  return (
    <textarea
      ref={ref}
      rows={1}
      value={title}
      readOnly={readOnly}
      onChange={(e) => !readOnly && applyTextDiff(ytitle, e.target.value.replace(/\n/g, ' '))}
      onKeyDown={onKeyDown}
      placeholder="Untitled"
      aria-label="Page title"
      className="mb-4 w-full resize-none overflow-hidden bg-transparent font-display text-[2.6rem] font-medium leading-[1.1] tracking-[-0.015em] text-ink placeholder:text-ink-faint/60 focus:outline-none focus-visible:outline-none"
    />
  )
}
