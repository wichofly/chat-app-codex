import { describe, expect, it } from 'vitest'
import { createPreviewService } from '../features/chats/preview'

describe('in-memory preview snapshots', () => {
  it('preserves a snapshot on rename, rotates its token, and revokes it on delete', async () => {
    const service = createPreviewService()
    const chat = (await service.listChats())[0]
    const original = await service.createShare(chat.id)
    const token = new URL(original.url!).pathname.split('/').pop()!
    await service.renameChat(chat.id, 'A private new title')
    expect((await service.getSnapshot(token)).title).toBe(chat.title)
    const refreshed = await service.createShare(chat.id)
    expect(refreshed.url).not.toBe(original.url)
    await expect(service.getSnapshot(token)).rejects.toMatchObject({ status: 404 })
    const newToken = new URL(refreshed.url!).pathname.split('/').pop()!
    expect((await service.getSnapshot(newToken)).title).toBe('A private new title')
    await service.deleteChat(chat.id)
    await expect(service.getSnapshot(newToken)).rejects.toMatchObject({ status: 404 })
  })

  it('disables the active snapshot and starts a fresh preview without saved changes', async () => {
    const service = createPreviewService()
    await service.revokeShare('a-fresh-perspective')
    expect((await service.getShare('a-fresh-perspective')).url).toBeNull()
    await expect(service.getSnapshot('demo')).rejects.toMatchObject({ status: 404 })
    expect((await createPreviewService().getSnapshot('demo')).title).toBe('A fresh perspective on learning')
  })
})
