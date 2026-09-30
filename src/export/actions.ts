import { toast, useToasts } from '../components/toastStore'
import { db } from '../data/db'
import { track } from '../lib/telemetry'

/** Downloads a whole workspace as a zip of Markdown files. Loaded on demand. */
export async function runWorkspaceExport(workspaceId: string, workspaceName: string): Promise<void> {
  const { exportWorkspace, download } = await import('./exportWorkspace')
  const { safeName } = await import('./paths')
  const progressId = useToasts.getState().push('Preparing your export…', 'info', 0)
  try {
    const res = await exportWorkspace(workspaceId)
    if (res.files === 0) {
      toast.info('There are no pages to export yet.')
      return
    }
    download(`Tessera - ${safeName(workspaceName)}.zip`, res.zip, 'application/zip')
    track('export_downloaded', { scope: 'workspace', pages: res.files })
    if (res.incomplete) toast.info(`Exported ${res.files} pages. ${res.incomplete} may be missing recent edits made on other devices — you’re offline.`)
    else toast.success(`Exported ${res.files} ${res.files === 1 ? 'page' : 'pages'} as Markdown`)
  } catch {
    toast.error('The export didn’t finish. Please try again.')
  } finally {
    useToasts.getState().dismiss(progressId)
  }
}

/** Downloads one page as a Markdown file. */
export async function runPageExport(pageId: string): Promise<void> {
  const row = await db.pages.get(pageId)
  if (!row) return
  const { exportPage, download } = await import('./exportWorkspace')
  try {
    const { markdown, filename, complete } = await exportPage(row)
    download(filename, markdown, 'text/markdown;charset=utf-8')
    track('export_downloaded', { scope: 'page' })
    if (!complete) toast.info('Exported what’s on this device — you’re offline.')
  } catch {
    toast.error('Couldn’t export this page. Please try again.')
  }
}
