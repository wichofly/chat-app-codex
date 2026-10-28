import { HttpError } from '../../middleware/errors.js'
import type { ChatRepository } from './repository.js'

export function chatService(repository: ChatRepository) {
  async function ownedChat(id: string, userId: string) {
    const chat = await repository.find(id, userId)
    if (!chat) throw new HttpError(404, 'NOT_FOUND', 'Conversation not found.')
    return chat
  }
  return {
    list: repository.list,
    create: repository.create,
    get: ownedChat,
    rename: async (id: string, userId: string, title: string) => {
      const result = await repository.rename(id, userId, title)
      if (!result.count) throw new HttpError(404, 'NOT_FOUND', 'Conversation not found.')
      return ownedChat(id, userId)
    },
    delete: async (id: string, userId: string) => {
      const result = await repository.delete(id, userId)
      if (!result.count) throw new HttpError(404, 'NOT_FOUND', 'Conversation not found.')
    },
  }
}
