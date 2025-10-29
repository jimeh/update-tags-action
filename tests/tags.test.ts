/**
 * Unit tests for tag operation execution, src/tags.ts
 */
import { jest } from '@jest/globals'
import * as core from './fixtures/core.js'
import * as github from './fixtures/github.js'

// Mocks should be declared before the module being tested is imported.
jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/github', () => github)

// The module being tested should be imported dynamically.
const { executeTagOperation } = await import('../src/tags.js')
import type { TagOperation } from '../src/tags.js'

describe('executeTagOperation', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    github.getOctokit.mockReturnValue(github.mockOctokit)
  })

  it('throws error for unknown operation type', async () => {
    const invalidOperation = {
      operation: 'invalid',
      name: 'v1',
      ref: 'main',
      sha: 'abc123',
      owner: 'test-owner',
      repo: 'test-repo'
    } as unknown as TagOperation

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      executeTagOperation(invalidOperation, github.mockOctokit as any)
    ).rejects.toThrow('Unknown operation type: invalid')
  })
})
