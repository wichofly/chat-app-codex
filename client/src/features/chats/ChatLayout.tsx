import { useEffect, useRef, useState } from 'react'
import { Navigate, Outlet } from 'react-router'
import { Menu, X } from 'lucide-react'
import { useApp } from '../../app/providers'
import { ChatSidebar } from '../../components/ChatSidebar'
import { Loading } from '../../components/States'

export function ChatLayout() {
  const { user, sessionLoading, preview } = useApp()
  const [mobileOpen, setMobileOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 681px)')
    const closeOnDesktop = () => { if (desktop.matches) setMobileOpen(false) }
    desktop.addEventListener('change', closeOnDesktop)
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [])
  useEffect(() => {
    if (!mobileOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const drawer = drawerRef.current!
    const focusable = () => [...drawer.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')]
    focusable()[0]?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false)
      if (event.key === 'Tab') {
        const items = focusable(), first = items[0], last = items[items.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKey); toggleRef.current?.focus() }
  }, [mobileOpen])
  if (sessionLoading) return <Loading />
  if (!user) return <Navigate to="/login" replace />
  return <div className="app-shell">
    {mobileOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <div ref={drawerRef} className="sidebar-container" role={mobileOpen ? 'dialog' : undefined} aria-modal={mobileOpen || undefined} aria-label={mobileOpen ? 'Navigation' : undefined}><ChatSidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} /></div>
    <div className="workspace">
      {preview && <div className="preview-banner"><span><strong>UI preview</strong><span className="preview-banner-detail"> · Sample data, stored in memory. AI and accounts aren’t connected.</span></span><a href="/login" aria-label="Leave preview"><X size={15} /></a></div>}
      <button ref={toggleRef} className="icon-button mobile-menu" aria-label="Open navigation" aria-expanded={mobileOpen} aria-controls="chat-sidebar" onClick={() => setMobileOpen(true)}><Menu size={21} /></button>
      <main id="main-content" className="workspace-main" inert={mobileOpen || undefined}><Outlet /></main>
    </div>
  </div>
}
