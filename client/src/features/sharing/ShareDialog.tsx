import { useState } from 'react'
import { Copy, Globe2, Link2, ShieldCheck } from 'lucide-react'
import { useApp } from '../../app/providers'
import { Dialog } from '../../components/Dialog'
import { useResource } from '../../lib/use-resource'

export function ShareDialog({ chatId, onClose }: { chatId: string; onClose: () => void }) {
  const { service, notify, preview } = useApp()
  const [revision, setRevision] = useState(0)
  const { data, loading, error } = useResource(() => service.getShare(chatId), [service, chatId, revision])
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  async function mutate(disable = false) {
    setBusy(true); setActionError('')
    try {
      if (disable) await service.revokeShare(chatId)
      else await service.createShare(chatId)
      setRevision(r => r + 1)
      notify(disable ? 'Public link disabled.' : data?.url ? 'Snapshot refreshed. The old link is now disabled.' : 'Shared snapshot created.')
    } catch (err) { setActionError(err instanceof Error ? err.message : 'Could not update sharing.') }
    finally { setBusy(false) }
  }
  return <Dialog title="Share a little perspective" onClose={onClose} busy={busy}>
    <div className="share-illustration"><Globe2 size={29} /><span><Link2 size={14} /></span></div>
    <p className="dialog-copy">Create a read-only snapshot of this conversation. <strong>Anyone with the link can read all completed messages.</strong></p>
    <div className="share-details"><ShieldCheck size={19} /><p>Future messages stay private. Refreshing the snapshot creates a new link and disables the old one. Copied content can’t be recalled.</p></div>
    {preview && <p className="notice preview-share-note">Preview links work only in this tab until you refresh. They aren’t published.</p>}
    {loading && <p role="status" className="muted">Checking sharing status…</p>}
    {error && <div className="inline-error" role="alert">{error.message} <button className="text-button" onClick={() => setRevision(r => r + 1)}>Try again</button></div>}
    {data?.url && <><label className="field-label" htmlFor="share-url">Current snapshot link</label><div className="share-url"><input id="share-url" readOnly value={data.url} onFocus={event => event.target.select()} /><button className="icon-button" aria-label="Copy share link" onClick={async () => { try { await navigator.clipboard.writeText(data.url!); notify('Link copied.') } catch { notify('Select the link and copy it manually.', true) } }}><Copy size={17} /></button></div><a className="text-link share-open" href={data.url} target={preview ? undefined : '_blank'} rel="noopener noreferrer">Open shared view ↗</a><p className="dialog-note">Refreshing replaces this snapshot and revokes its current URL.</p></>}
    {actionError && <p role="alert" className="inline-error">{actionError}</p>}
    <div className="dialog-actions share-actions">{data?.url ? <button className="text-button text-danger" onClick={() => void mutate(true)} disabled={busy}>Disable link</button> : <button className="button button-secondary" onClick={onClose} disabled={busy}>Cancel</button>}<button className="button button-primary" onClick={() => void mutate()} disabled={busy || loading || !!error}>{busy ? 'Working…' : data?.url ? 'Refresh shared snapshot' : 'Confirm & create link'}</button></div>
  </Dialog>
}
