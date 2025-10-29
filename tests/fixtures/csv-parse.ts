import { jest } from '@jest/globals'
import { parse as realParse } from 'csv-parse/sync'

export const parse = jest.fn()

// Helper to reset to real implementation after jest.resetAllMocks()
export const resetToRealImplementation = (): void => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parse.mockImplementation(realParse as any)
}

// Initialize with real implementation
resetToRealImplementation()
