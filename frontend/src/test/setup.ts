import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Clean up the DOM between tests so each test starts fresh.
afterEach(() => {
  cleanup()
})
