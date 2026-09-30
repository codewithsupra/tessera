import Collaboration from '@tiptap/extension-collaboration'
import DragHandle from '@tiptap/extension-drag-handle-react'
import Highlight from '@tiptap/extension-highlight'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { GripVertical } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type * as Y from 'yjs'
import { applyTextDiff, openDoc } from '../data/docs'
import { setPageTitle } from '../data/pages'
import { SlashExtension } from './SlashExtension'
import { SlashMenu } from './SlashMenu'

/** Opens the page's local Y.Doc, waits for IndexedDB, then mounts the editor. */
export function PageEditor({ pageId }: { pageId: string }) {
  const [doc, setDoc] = useState<Y.Doc | null>(null)

  useEffect(() => {
    const handle = openDoc(pageId)
    let alive = true
    void handle.ready.then(() => alive && setDoc(handle.doc))
    return () => {
      alive = false
      setDoc(null)
      handle.release()
    }
  }, [pageId])

  if (!doc) return <div className="mx-auto h-40 max-w-[720px]" aria-busy="true" />
  return <LoadedEditor key={pageId} pageId={pageId} doc={doc} />
}

function LoadedEditor({ pageId, doc }: { pageId: string; doc: Y.Doc }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ undoRedo: false, link: { openOnClick: false, autolink: true } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight,
      Placeholder.configure({
        placeholder: ({ node }) => (node.type.name === 'heading' ? 'Heading' : "Write, or type '/' for blocks"),
      }),
      Collaboration.configure({ document: doc, field: 'content' }),
      SlashExtension,
    ],
    editorProps: { attributes: { class: 'tessera-prose', 'aria-label': 'Page content' } },
  })

  return (
    <article className="mx-auto w-full max-w-[720px] px-5 pb-40 pt-16 sm:px-12">
      <TitleField pageId={pageId} doc={doc} editor={editor} />
      {editor && (
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

function TitleField({ pageId, doc, editor }: { pageId: string; doc: Y.Doc; editor: Editor | null }) {
  const ytitle = doc.getText('title')
  const [title, setTitle] = useState(() => ytitle.toString())
  const ref = useRef<HTMLTextAreaElement>(null)

  // Y.Text is the source of truth (it merges remote edits); mirror it into the local index.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const sync = () => {
      const next = ytitle.toString()
      setTitle(next)
      clearTimeout(timer)
      timer = setTimeout(() => void setPageTitle(pageId, next), 250)
    }
    ytitle.observe(sync)
    return () => {
      ytitle.unobserve(sync)
      clearTimeout(timer)
      void setPageTitle(pageId, ytitle.toString())
    }
  }, [ytitle, pageId])

  // Grow with content.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }, [title])

  // New, empty pages start with the cursor in the title.
  useEffect(() => {
    if (!ytitle.toString()) ref.current?.focus()
  }, [ytitle])

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
      onChange={(e) => applyTextDiff(ytitle, e.target.value.replace(/\n/g, ' '))}
      onKeyDown={onKeyDown}
      placeholder="Untitled"
      aria-label="Page title"
      className="mb-4 w-full resize-none overflow-hidden bg-transparent font-display text-[2.6rem] font-medium leading-[1.1] tracking-[-0.015em] text-ink placeholder:text-ink-faint/60 focus:outline-none focus-visible:outline-none"
    />
  )
}
