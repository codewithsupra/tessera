import { useNavigate } from '@tanstack/react-router'
import { Command } from 'cmdk'
import { useLiveQuery } from 'dexie-react-hooks'
import { FilePlus2, FileText, Keyboard, Download, Layers, PanelLeft, Palette, UserPlus, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/context'
import { createPage, listPages } from '../data/pages'
import { breadcrumb, displayTitle } from '../data/tree'
import { useUiStore } from '../data/uiStore'
import { useWorkspaceId } from '../data/workspace'
import { canEdit } from '../data/workspaces'
import { runWorkspaceExport } from '../export/actions'
import { track } from '../lib/telemetry'
import { useTheme } from '../lib/theme'
import { useSyncStore } from '../sync/syncStore'
import { switchWorkspace } from '../sync/workspaceActions'
import { Modal } from './Modal'

function Item({ onSelect, icon, children, hint, value, keywords }: { onSelect: () => void; icon: ReactNode; children: ReactNode; hint?: string; value: string; keywords?: string[] }) {
  return (
    <Command.Item value={value} keywords={keywords} onSelect={onSelect} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink data-[selected=true]:bg-lapis-soft">
      <span className="text-ink-faint" aria-hidden="true">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="truncate text-xs text-ink-faint">{hint}</span>}
    </Command.Item>
  )
}

const group = 'px-1 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-ink-faint'

export function CommandPalette() {
  const open = useUiStore((s) => s.dialog === 'palette')
  const setDialog = useUiStore((s) => s.setDialog)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const ws = useWorkspaceId()
  const { user } = useAuth()
  const navigate = useNavigate()
  const role = useSyncStore((s) => s.role)
  const workspaces = useSyncStore((s) => s.workspaces)
  const active = workspaces.find((w) => w.id === ws)
  const cycleTheme = useTheme((s) => s.cycle)
  const rows = useLiveQuery(async () => (open ? (await listPages(ws)).filter((p) => p.deletedAt === null) : []), [ws, open])

  const close = () => setDialog(null)
  const run = (fn: () => void | Promise<unknown>) => () => {
    close()
    void fn()
  }
  const byId = new Map((rows ?? []).map((r) => [r.id, r]))
  const pages = [...(rows ?? [])].sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <Modal open={open} onClose={close} title="Search and commands" width={560}>
      <Command label="Search pages and commands" loop className="-mx-1 -mt-2">
        <Command.Input
          data-autofocus
          placeholder="Search pages or type a command…"
          className="mx-1 mb-2 w-[calc(100%-0.5rem)] rounded-md border border-line bg-plaster px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-faint focus:border-lapis focus:outline-none"
        />
        <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto">
          <Command.Empty className="px-3 py-6 text-center text-sm text-ink-faint">No pages or commands match.</Command.Empty>

          {pages.length > 0 && (
            <Command.Group heading="Pages" className={group}>
              {pages.map((p) => (
                <Item
                  key={p.id}
                  value={`page ${p.id}`}
                  keywords={[displayTitle(p.title), breadcrumb(p, byId)]}
                  icon={<FileText size={15} />}
                  hint={breadcrumb(p, byId)}
                  onSelect={run(() => navigate({ to: '/app/p/$pageId', params: { pageId: p.id } }))}
                >
                  {displayTitle(p.title)}
                </Item>
              ))}
            </Command.Group>
          )}

          <Command.Group heading="Actions" className={group}>
            {canEdit(role) && (
              <Item
                value="new page"
                keywords={['create', 'add', 'note']}
                icon={<FilePlus2 size={15} />}
                hint="Alt N"
                onSelect={run(async () => {
                  const page = await createPage(ws)
                  track('page_created', { from: 'palette' })
                  await navigate({ to: '/app/p/$pageId', params: { pageId: page.id } })
                })}
              >
                New page
              </Item>
            )}
            {active && (
              <Item value="export markdown" keywords={['download', 'zip', 'backup']} icon={<Download size={15} />} onSelect={run(() => runWorkspaceExport(active.id, active.name))}>
                Export {active.name} as Markdown
              </Item>
            )}
            {active && !active.isPersonal && role === 'owner' && (
              <Item value="invite people" keywords={['members', 'share', 'team']} icon={<UserPlus size={15} />} onSelect={() => setDialog('members')}>
                Invite people to {active.name}
              </Item>
            )}
            <Item value="new team workspace" keywords={['create', 'workspace', 'team']} icon={<Plus size={15} />} onSelect={() => setDialog('create')}>
              New team workspace
            </Item>
            <Item value="toggle theme" keywords={['dark', 'light', 'appearance']} icon={<Palette size={15} />} onSelect={run(cycleTheme)}>
              Change theme
            </Item>
            <Item value="toggle sidebar" keywords={['hide', 'show', 'focus']} icon={<PanelLeft size={15} />} onSelect={run(toggleSidebar)}>
              Show or hide the sidebar
            </Item>
            <Item value="keyboard shortcuts" keywords={['keys', 'help', 'hotkeys']} icon={<Keyboard size={15} />} onSelect={() => setDialog('shortcuts')}>
              Keyboard shortcuts
            </Item>
          </Command.Group>

          {workspaces.length > 1 && user && (
            <Command.Group heading="Switch workspace" className={group}>
              {workspaces
                .filter((w) => w.id !== ws)
                .map((w) => (
                  <Item key={w.id} value={`workspace ${w.id}`} keywords={[w.name, 'switch']} icon={<Layers size={15} />} onSelect={run(() => (switchWorkspace(user.id, w.id), navigate({ to: '/app' })))}>
                    {w.name}
                  </Item>
                ))}
            </Command.Group>
          )}
        </Command.List>
      </Command>
    </Modal>
  )
}
