import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPreviewService, SAMPLE_RESPONSE } from '../features/chats/preview'
import { paragraph } from '../lib/rich-text'

describe('preview generation', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  async function setup() {
    const service = createPreviewService()
    const chat = await service.createChat()
    return { service, id: chat.id }
  }

  it('publishes stable immutable snapshots and optimistic messages, then progressive content', async () => {
    const { service, id } = await setup()
    const original = service.getChatSnapshot(id)!
    const listener = vi.fn()
    const unsubscribe = service.subscribe(listener)
    expect(service.getChatSnapshot(id)).toBe(original)
    service.send(id, paragraph('A new idea'), 'normal')
    const pending = service.getChatSnapshot(id)!
    expect(original.chat.messages).toHaveLength(0)
    expect(pending.chat.messages).toHaveLength(2)
    expect(pending.chat.messages[0]).toMatchObject({ role: 'USER', status: 'COMPLETED', plainText: 'A new idea' })
    expect(pending.chat.messages[1]).toMatchObject({ role: 'ASSISTANT', status: 'PENDING', contentJson: null })
    expect(service.getChatSnapshot(id)).toBe(pending)
    vi.advanceTimersByTime(399)
    expect(service.getChatSnapshot(id)).toBe(pending)
    vi.advanceTimersByTime(1)
    const first = service.getChatSnapshot(id)!
    expect(first.chat.messages[1].plainText).toBe('This is a simulated')
    vi.advanceTimersByTime(250)
    expect(service.getChatSnapshot(id)!.chat.messages[1].plainText.length).toBeGreaterThan(first.chat.messages[1].plainText.length)
    expect(pending.chat.messages[1].plainText).toBe('')
    vi.runAllTimers()
    expect(service.getChatSnapshot(id)!.chat.messages[1]).toMatchObject({ status: 'COMPLETED', plainText: SAMPLE_RESPONSE })
    expect(service.getChatSnapshot(id)!.generation.phase).toBe('idle')
    expect(listener).toHaveBeenCalled()
    unsubscribe()
    listener.mockClear()
    await service.renameChat(id, 'After unsubscribe')
    expect(listener).not.toHaveBeenCalled()
    service.dispose()
  })

  it.each(['fail-before', 'fail-during'] as const)('supports %s and retries without duplicating either message', async outcome => {
    const { service, id } = await setup()
    service.send(id, paragraph('Retry this prompt'), outcome)
    vi.runAllTimers()
    const failed = service.getChatSnapshot(id)!
    expect(failed.generation.phase).toBe('failed')
    expect(failed.chat.messages[1].status).toBe('FAILED')
    expect(!!failed.chat.messages[1].plainText).toBe(outcome === 'fail-during')
    const ids = failed.chat.messages.map(message => message.id)
    service.retry(id, 'normal')
    expect(service.getChatSnapshot(id)!.chat.messages[1]).toMatchObject({ contentJson: null, plainText: '', status: 'PENDING' })
    vi.runAllTimers()
    expect(service.getChatSnapshot(id)!.chat.messages.map(message => message.id)).toEqual(ids)
    expect(service.getChatSnapshot(id)!.chat.messages[1].plainText).toBe(SAMPLE_RESPONSE)
    service.dispose()
  })

  it.each([0, 900])('stops at %i ms, retains partial text and allows retry', async delay => {
    const { service, id } = await setup()
    service.send(id, paragraph('Stop this'), 'normal')
    vi.advanceTimersByTime(delay)
    service.stop(id)
    const stopped = service.getChatSnapshot(id)!
    expect(stopped.generation.phase).toBe('stopped')
    expect(stopped.chat.messages[1].status).toBe('FAILED')
    expect(!!stopped.chat.messages[1].plainText).toBe(delay > 0)
    vi.runAllTimers()
    expect(service.getChatSnapshot(id)).toBe(stopped)
    service.retry(id, 'normal')
    vi.runAllTimers()
    expect(service.getChatSnapshot(id)!.chat.messages).toHaveLength(2)
    expect(service.getChatSnapshot(id)!.generation.phase).toBe('idle')
    service.dispose()
  })

  it('blocks concurrent sends and invalid retries only in the generating chat', async () => {
    const { service, id } = await setup()
    const other = await service.createChat()
    service.send(id, paragraph('First prompt'), 'normal')
    expect(() => service.send(id, paragraph('Duplicate'), 'normal')).toThrow(/already generating/)
    expect(() => service.retry(id, 'normal')).toThrow(/cannot be retried/)
    service.send(other.id, paragraph('Independent prompt'), 'normal')
    vi.runAllTimers()
    expect(service.getChatSnapshot(id)!.chat.messages).toHaveLength(2)
    expect(service.getChatSnapshot(other.id)!.generation.phase).toBe('idle')
    service.dispose()
  })

  it('clears timers and data on disposal, and cancels generation when deleting a chat', async () => {
    const { service, id } = await setup()
    service.send(id, paragraph('Delete me'), 'normal')
    await service.deleteChat(id)
    expect(vi.getTimerCount()).toBe(0)
    expect(service.getChatSnapshot(id)).toBeUndefined()
    const other = await service.createChat()
    service.send(other.id, paragraph('Leave preview'), 'normal')
    service.dispose()
    expect(vi.getTimerCount()).toBe(0)
    expect(service.getListSnapshot()).toEqual([])
    expect(service.getChatSnapshot(other.id)).toBeUndefined()
    await expect(service.getSnapshot('demo')).rejects.toMatchObject({ status: 404 })
    expect(() => service.send(other.id, paragraph('Ended'), 'normal')).toThrow(/preview has ended/)
  })

  it('snapshots only completed messages and never updates an existing snapshot', async () => {
    const { service, id } = await setup()
    service.send(id, paragraph('A private follow-up'), 'normal')
    vi.advanceTimersByTime(650)
    const share = await service.createShare(id)
    const token = new URL(share.url!).pathname.split('/').pop()!
    expect((await service.getSnapshot(token)).messages).toHaveLength(1)
    vi.runAllTimers()
    expect((await service.getSnapshot(token)).messages).toHaveLength(1)
    const newShare = await service.createShare(id)
    const newToken = new URL(newShare.url!).pathname.split('/').pop()!
    expect((await service.getSnapshot(newToken)).messages).toHaveLength(2)
    await expect(service.getSnapshot(token)).rejects.toMatchObject({ status: 404 })
    service.dispose()
  })
})
