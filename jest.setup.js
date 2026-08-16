// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Mock environment variables for tests
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'

// Mock fetch for tests
global.fetch = jest.fn()

// Mock Web APIs needed for Next.js server components
if (typeof Request === 'undefined') {
  global.Request = class Request {
    constructor(input, init) {
      this.url = typeof input === 'string' ? input : input.url
      this.method = init?.method || 'GET'
      this.headers = new Map(Object.entries(init?.headers || {}))
      this.body = init?.body
    }
  }
}

if (typeof Response === 'undefined') {
  global.Response = class Response {
    constructor(body, init) {
      this.body = body
      this.status = init?.status || 200
      this.statusText = init?.statusText || 'OK'
      this.headers = new Map(Object.entries(init?.headers || {}))
    }
  }
}

if (typeof Headers === 'undefined') {
  global.Headers = Map
}

// Polyfill MessageChannel for React 19 react-dom/server in jsdom
// (react-dom/server.browser uses MessageChannel for concurrent rendering;
// jsdom doesn't include it by default but Node.js >= 15 has it globally).
if (typeof MessageChannel === 'undefined') {
  const { MessageChannel: NodeMessageChannel } = require('worker_threads')
  global.MessageChannel = NodeMessageChannel
}

// TextEncoder / TextDecoder / WebCrypto.
//
// jsdom ships none of these, but real code does use them: `lib/s3-put.ts` signs
// backup uploads with crypto.subtle, and `postal-mime` (pulled in by resend, via
// lib/email.ts) constructs a TextDecoder at import time. That missing global is
// why lib/email.test.ts and lib/email-links.test.ts have been failing to LOAD —
// not an assertion failure, the suite never started. Node has all three; hand
// them to jsdom rather than making every affected test opt out to the node
// environment.
{
  const { TextEncoder, TextDecoder } = require('util')
  if (typeof global.TextEncoder === 'undefined') global.TextEncoder = TextEncoder
  if (typeof global.TextDecoder === 'undefined') global.TextDecoder = TextDecoder
  if (typeof global.crypto === 'undefined' || !global.crypto.subtle) {
    const { webcrypto } = require('crypto')
    Object.defineProperty(global, 'crypto', { value: webcrypto, writable: true, configurable: true })
  }
}

// Mock window.matchMedia — guarded, because this same setup file runs for tests
// that declare `@jest-environment node` (server-only code, where there is no
// window at all) and an unguarded reference here crashes them before the first
// assertion.
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(), // deprecated
      removeListener: jest.fn(), // deprecated
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  })
}
