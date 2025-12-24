/**
 * Unit tests for tag operation execution, src/tags.ts
 */
import { jest } from '@jest/globals'
import * as core from './fixtures/core.js'
import * as github from './fixtures/github.js'
import type { Inputs } from '../src/inputs.js'

// Mocks should be declared before the module being tested is imported.
jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/github', () => github)

// The module being tested should be imported dynamically.
const { executeTagOperation, planTagOperations } =
  await import('../src/tags.js')
import type {
  TagOperation,
  CreateOperation,
  UpdateOperation
} from '../src/tags.js'

// Helper to create a minimal Inputs object for testing
const createInputs = (overrides: Partial<Inputs> = {}): Inputs => ({
  tags: [],
  defaultRef: 'main',
  whenExists: 'update',
  annotation: '',
  dryRun: false,
  owner: 'test-owner',
  repo: 'test-repo',
  token: 'test-token',
  ...overrides
})

describe('planTagOperations', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    github.getOctokit.mockReturnValue(github.mockOctokit)
  })

  const setupCommitResolver = (
    refToSha: Record<string, string> | string
  ): void => {
    if (typeof refToSha === 'string') {
      github.mockOctokit.rest.repos.getCommit.mockResolvedValue({
        data: { sha: refToSha }
      })
    } else {
      github.mockOctokit.rest.repos.getCommit.mockImplementation(
        async (args: unknown) => {
          const { ref } = args as { ref: string }
          const sha = refToSha[ref]
          if (sha) return { data: { sha } }
          throw new Error(`Unknown ref: ${ref}`)
        }
      )
    }
  }

  const setupTagDoesNotExist = (): void => {
    github.mockOctokit.rest.git.getRef.mockRejectedValue({
      status: 404
    })
  }

  describe('per-tag annotations', () => {
    it('parses per-tag annotation with explicit ref', async () => {
      const inputs = createInputs({
        tags: ['v1:main:Custom annotation'],
        annotation: 'Global annotation'
      })
      setupCommitResolver('sha-main')
      setupTagDoesNotExist()

      const operations = await planTagOperations(
        inputs,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        github.mockOctokit as any
      )

      expect(operations).toHaveLength(1)
      expect(operations[0].operation).toBe('create')
      expect((operations[0] as CreateOperation).annotation).toBe(
        'Custom annotation'
      )
    })

    it('parses per-tag annotation with empty ref (fallback to default)', async () => {
      const inputs = createInputs({
        tags: ['v1::Custom annotation'],
        defaultRef: 'develop',
        annotation: 'Global annotation'
      })
      setupCommitResolver('sha-develop')
      setupTagDoesNotExist()

      const operations = await planTagOperations(
        inputs,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        github.mockOctokit as any
      )

      expect(operations).toHaveLength(1)
      expect(operations[0].operation).toBe('create')
      expect(operations[0].ref).toBe('develop')
      expect((operations[0] as CreateOperation).annotation).toBe(
        'Custom annotation'
      )
    })

    it('handles annotation containing colons', async () => {
      const inputs = createInputs({
        tags: ['v1:main:Release: v1.0.0'],
        annotation: ''
      })
      setupCommitResolver('sha-main')
      setupTagDoesNotExist()

      const operations = await planTagOperations(
        inputs,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        github.mockOctokit as any
      )

      expect(operations).toHaveLength(1)
      expect((operations[0] as CreateOperation).annotation).toBe(
        'Release: v1.0.0'
      )
    })

    it('falls back to global annotation when per-tag not specified', async () => {
      const inputs = createInputs({
        tags: ['v1', 'v2:main'],
        annotation: 'Global annotation'
      })
      setupCommitResolver('sha-main')
      setupTagDoesNotExist()

      const operations = await planTagOperations(
        inputs,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        github.mockOctokit as any
      )

      expect(operations).toHaveLength(2)
      expect((operations[0] as CreateOperation).annotation).toBe(
        'Global annotation'
      )
      expect((operations[1] as CreateOperation).annotation).toBe(
        'Global annotation'
      )
    })

    it('mixes per-tag and global annotations', async () => {
      const inputs = createInputs({
        tags: ['v1:main:Per-tag message', 'v2'],
        annotation: 'Global annotation'
      })
      setupCommitResolver('sha-main')
      setupTagDoesNotExist()

      const operations = await planTagOperations(
        inputs,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        github.mockOctokit as any
      )

      expect(operations).toHaveLength(2)
      expect((operations[0] as CreateOperation).annotation).toBe(
        'Per-tag message'
      )
      expect((operations[1] as CreateOperation).annotation).toBe(
        'Global annotation'
      )
    })

    it('uses per-tag annotation for update comparison', async () => {
      const inputs = createInputs({
        tags: ['v1:main:New annotation'],
        annotation: 'Global annotation',
        whenExists: 'update'
      })
      setupCommitResolver('sha-main')

      // Tag exists with same commit but different annotation
      github.mockOctokit.rest.git.getRef.mockResolvedValue({
        data: {
          ref: 'refs/tags/v1',
          object: { sha: 'sha-tag-object', type: 'tag' }
        }
      })
      github.mockOctokit.rest.git.getTag.mockResolvedValue({
        data: {
          sha: 'sha-tag-object',
          message: 'Old annotation',
          object: { sha: 'sha-main', type: 'commit' }
        }
      })

      const operations = await planTagOperations(
        inputs,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        github.mockOctokit as any
      )

      expect(operations).toHaveLength(1)
      expect(operations[0].operation).toBe('update')
      expect((operations[0] as UpdateOperation).annotation).toBe(
        'New annotation'
      )
      expect((operations[0] as UpdateOperation).reasons).toContain(
        'annotation message changed'
      )
    })

    it('skips tag when per-tag annotation matches existing', async () => {
      const inputs = createInputs({
        tags: ['v1:main:Same annotation'],
        annotation: 'Global annotation',
        whenExists: 'update'
      })
      setupCommitResolver('sha-main')

      github.mockOctokit.rest.git.getRef.mockResolvedValue({
        data: {
          ref: 'refs/tags/v1',
          object: { sha: 'sha-tag-object', type: 'tag' }
        }
      })
      github.mockOctokit.rest.git.getTag.mockResolvedValue({
        data: {
          sha: 'sha-tag-object',
          message: 'Same annotation',
          object: { sha: 'sha-main', type: 'commit' }
        }
      })

      const operations = await planTagOperations(
        inputs,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        github.mockOctokit as any
      )

      expect(operations).toHaveLength(1)
      expect(operations[0].operation).toBe('skip')
    })

    it('rejects empty tag name with annotation', async () => {
      const inputs = createInputs({
        tags: ['::Some annotation']
      })

      await expect(
        planTagOperations(
          inputs,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          github.mockOctokit as any
        )
      ).rejects.toThrow("Invalid tag: '::Some annotation'")
    })
  })
})

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
