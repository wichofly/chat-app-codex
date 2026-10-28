import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { ArrowUpRight, BookOpen, Lightbulb, LockKeyhole, MessageSquare, PencilLine, Share2 } from 'lucide-react'
import { useApp } from '../../app/providers'
import { ApiError } from '../../lib/api'
import { useResource } from '../../lib/use-resource'
import { ThreadMark } from '../../components/Brand'
import { Composer } from '../../components/Composer'
import { MessageList } from '../../components/MessageList'
import { ChatActionsDialog } from '../../components/ChatActionsDialog'
import { ConversationSkeleton, ErrorState, NotFound } from '../../components/States'
import { ShareDialog } from '../sharing/ShareDialog'

const suggestions = [
  { Icon: Lightbulb, label: 'Find a fresh angle', description: 'Give an idea a little room to grow', prompt: 'Help me brainstorm a small creative project I can finish this weekend.' },
  { Icon: PencilLine, label: 'Find the right words', description: 'From a rough thought to a first draft', prompt: 'Help me turn a rough idea into a clear first draft. What should I start with?' },
  { Icon: BookOpen, label: 'Make sense of something', description: 'Go from “wait, what?” to “got it”', prompt: 'How can I make learning something new feel less overwhelming?' },
]

export function ChatPage() {
  const { chatId } = useParams()
  const { service, revision, refresh } = useApp()
  const { data: chat, loading, error } = useResource(() => chatId ? service.getChat(chatId) : Promise.resolve(null), [service, chatId, revision])
  const [sharing, setSharing] = useState(false)
  const [rename, setRename] = useState(false)
  const [prompt, setPrompt] = useState<{ text: string; key: number }>()
  const [sendError, setSendError] = useState('')
  useEffect(() => { setSendError(''); setPrompt(undefined); setSharing(false); setRename(false) }, [chatId])
  useEffect(() => { document.title = `${chat?.title || 'Your space'} — Thread` }, [chat?.title])
  if (error instanceof ApiError && error.status === 404) return <NotFound nested />
  if (error) return <ErrorState message={error.message} retry={refresh} />
  const hasMessages = !!chat?.messages.length
  return <div className="chat-page">
    <header className="chat-header"><div className="chat-heading">{chat ? <><h1>{chat.title}</h1><button className="icon-button title-rename" aria-label="Rename conversation" onClick={() => setRename(true)}><PencilLine size={14} /></button></> : <span className="header-label">Your space to think</span>}</div><div className="chat-header-actions"><span className="private-label"><LockKeyhole size={13} />Private</span>{chat && <button className="button button-secondary share-button" onClick={() => setSharing(true)}><Share2 size={14} />Share</button>}</div></header>
    <div className={`chat-content ${hasMessages ? 'chat-content-conversation' : ''}`}>
      {loading && chatId ? <ConversationSkeleton /> : hasMessages ? <><div className="conversation-intro"><span className="eyebrow"><MessageSquare size={12} />A THOUGHT IN PROGRESS</span></div><MessageList messages={chat.messages} /></> : <section className="welcome"><div className="welcome-mark"><ThreadMark /><span className="welcome-spark" aria-hidden="true">✳</span></div><span className="eyebrow">A CLEAR SPACE. A FRESH PERSPECTIVE.</span><h1>Where shall we<br className="mobile-break" /> go from here?</h1><p>Bring a question, an idea, or a thought that isn’t quite there yet.<br className="desktop-break" /> We’ll work through it together.</p><div className="suggestion-grid">{suggestions.map(({ Icon, label, description, prompt: text }) => <button className="suggestion-card" key={label} onClick={() => setPrompt({ text, key: Date.now() })}><div><span className="suggestion-icon"><Icon size={19} strokeWidth={1.6} /></span><ArrowUpRight size={16} className="suggestion-arrow" /></div><strong>{label}</strong><span>{description}</span></button>)}</div></section>}
    </div>
    <div className="composer-dock">{sendError && <div className="send-error" role="alert"><strong>AI isn’t connected yet.</strong><p>{sendError}</p><button className="text-button" onClick={() => setSendError('')}>Dismiss</button></div>}<Composer key={chatId || 'new-chat'} prompt={prompt} onSend={async () => { setSendError('This is the page and layout foundation. Sending and streaming will be enabled when the AI service is implemented. Your draft is still here.'); return false }} /></div>
    {sharing && chat && <ShareDialog chatId={chat.id} onClose={() => setSharing(false)} />}
    {rename && chat && <ChatActionsDialog chat={chat} action="rename" onClose={() => setRename(false)} />}
  </div>
}
