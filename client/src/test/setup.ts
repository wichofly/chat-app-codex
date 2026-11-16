import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Lazy routes import the editor/SDK on cold workers; allow bounded async rendering.
configure({ asyncUtilTimeout: 5000 })

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', '') } })
Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open') } })
HTMLElement.prototype.scrollIntoView = () => {}
Range.prototype.getClientRects = () => [] as unknown as DOMRectList
Range.prototype.getBoundingClientRect = () => new DOMRect()
document.elementFromPoint = () => null

Object.defineProperty(window, 'matchMedia', { writable: true, value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }) })
