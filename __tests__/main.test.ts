/**
 * Unit tests for the action's main functionality, src/main.ts
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'
import * as github from '../__fixtures__/github.js'
import * as csvParse from '../__fixtures__/csv-parse.js'

// Mocks should be declared before the module being tested is imported.
jest.unstable_mockModule('@actions/core', () => core)
jest.unstable_mockModule('@actions/github', () => github)
jest.unstable_mockModule('csv-parse/sync', () => csvParse)

// The module being tested should be imported dynamically. This ensures that
// the mocks are used in place of any actual dependencies.
const { run } = await import('../src/main.js')

// Helper functions for cleaner test setup
const setupInputs = (inputs: Record<string, string>): void => {
  core.getInput.mockImplementation((name: string) => {
    return inputs[name] || ''
  })
}

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

const setupTagExists = (
  tagName: string,
  sha: string,
  type: 'commit' | 'tag' = 'commit'
): void => {
  github.mockOctokit.rest.git.getRef.mockImplementation(
    async (args: unknown) => {
      const { ref } = args as { ref: string }
      if (ref === `tags/${tagName}`) {
        return {
          data: { ref: `refs/tags/${tagName}`, object: { sha, type } }
        }
      }
      throw { status: 404 }
    }
  )
}

const setupTagExistsForAll = (
  sha: string,
  type: 'commit' | 'tag' = 'commit'
): void => {
  github.mockOctokit.rest.git.getRef.mockResolvedValue({
    data: { ref: 'refs/tags/v1', object: { sha, type } }
  })
}

describe('run', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    // Re-setup mocks after reset
    github.getOctokit.mockReturnValue(github.mockOctokit)
    csvParse.resetToRealImplementation()
  })

  it('creates new tags when they do not exist', async () => {
    setupInputs({
      tags: 'v1,v1.0',
      ref: 'abc123',
      github_token: 'test-token',
      when_exists: 'update'
    })
    setupCommitResolver('sha-abc123')
    setupTagDoesNotExist()

    await run()

    expect(github.mockOctokit.rest.git.createRef).toHaveBeenCalledTimes(2)
    expect(github.mockOctokit.rest.git.createRef).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      ref: 'refs/tags/v1',
      sha: 'sha-abc123'
    })
    expect(github.mockOctokit.rest.git.createRef).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      ref: 'refs/tags/v1.0',
      sha: 'sha-abc123'
    })

    expect(core.info).toHaveBeenCalledWith(
      "Tag 'v1' does not exist, creating with commit SHA sha-abc123."
    )
    expect(core.setOutput).toHaveBeenCalledWith('created', ['v1', 'v1.0'])
    expect(core.setOutput).toHaveBeenCalledWith('updated', [])
    expect(core.setOutput).toHaveBeenCalledWith('tags', ['v1', 'v1.0'])
  })

  it('updates existing tags when commit SHA differs', async () => {
    setupInputs({
      tags: 'v1',
      ref: 'def456',
      github_token: 'test-token',
      when_exists: 'update'
    })
    setupCommitResolver('sha-def456')
    setupTagExistsForAll('sha-old123')

    await run()

    expect(github.mockOctokit.rest.git.updateRef).toHaveBeenCalledTimes(1)
    expect(github.mockOctokit.rest.git.updateRef).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      ref: 'tags/v1',
      sha: 'sha-def456',
      force: true
    })

    expect(core.info).toHaveBeenCalledWith(
      "Tag 'v1' exists, updating to commit SHA sha-def456 (was sha-old123)."
    )
    expect(core.setOutput).toHaveBeenCalledWith('created', [])
    expect(core.setOutput).toHaveBeenCalledWith('updated', ['v1'])
    expect(core.setOutput).toHaveBeenCalledWith('tags', ['v1'])
  })

  it('skips updating when tag exists with same commit SHA', async () => {
    setupInputs({
      tags: 'v1',
      ref: 'abc123',
      github_token: 'test-token',
      when_exists: 'update'
    })
    setupCommitResolver('sha-abc123')
    setupTagExistsForAll('sha-abc123')

    await run()

    expect(github.mockOctokit.rest.git.updateRef).not.toHaveBeenCalled()
    expect(github.mockOctokit.rest.git.createRef).not.toHaveBeenCalled()
    expect(core.info).toHaveBeenCalledWith(
      "Tag 'v1' already exists with desired commit SHA sha-abc123."
    )
    expect(core.setOutput).toHaveBeenCalledWith('created', [])
    expect(core.setOutput).toHaveBeenCalledWith('updated', [])
    expect(core.setOutput).toHaveBeenCalledWith('tags', [])
  })

  it('skips tags when when_exists is skip', async () => {
    setupInputs({
      tags: 'v1',
      ref: 'abc123',
      github_token: 'test-token',
      when_exists: 'skip'
    })
    setupCommitResolver('sha-abc123')
    setupTagExistsForAll('sha-old123')

    await run()

    expect(github.mockOctokit.rest.git.updateRef).not.toHaveBeenCalled()
    expect(github.mockOctokit.rest.git.createRef).not.toHaveBeenCalled()
    expect(core.info).toHaveBeenCalledWith("Tag 'v1' exists, skipping.")
    expect(core.setOutput).toHaveBeenCalledWith('created', [])
    expect(core.setOutput).toHaveBeenCalledWith('updated', [])
    expect(core.setOutput).toHaveBeenCalledWith('tags', [])
  })

  it('handles per-tag ref overrides', async () => {
    setupInputs({
      tags: 'v1:main,v2:develop',
      ref: '',
      github_token: 'test-token',
      when_exists: 'update'
    })
    setupCommitResolver({
      main: 'sha-main',
      develop: 'sha-develop'
    })
    setupTagDoesNotExist()

    await run()

    expect(github.mockOctokit.rest.repos.getCommit).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      ref: 'main'
    })
    expect(github.mockOctokit.rest.repos.getCommit).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      ref: 'develop'
    })

    expect(github.mockOctokit.rest.git.createRef).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      ref: 'refs/tags/v1',
      sha: 'sha-main'
    })
    expect(github.mockOctokit.rest.git.createRef).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      ref: 'refs/tags/v2',
      sha: 'sha-develop'
    })

    expect(core.setOutput).toHaveBeenCalledWith('created', ['v1', 'v2'])
  })

  it('handles various input formats (newlines and whitespace)', async () => {
    setupInputs({
      tags: ' v1 \n v1.0 \n v1.0.1 ',
      ref: 'abc123',
      github_token: 'test-token',
      when_exists: 'update'
    })
    setupCommitResolver('sha-abc123')
    setupTagDoesNotExist()

    await run()

    expect(github.mockOctokit.rest.git.createRef).toHaveBeenCalledTimes(3)
    expect(core.setOutput).toHaveBeenCalledWith('created', [
      'v1',
      'v1.0',
      'v1.0.1'
    ])
  })

  it('creates and updates tags in single run', async () => {
    setupInputs({
      tags: 'v1,v2',
      ref: 'abc123',
      github_token: 'test-token',
      when_exists: 'update'
    })
    setupCommitResolver('sha-abc123')
    setupTagExists('v1', 'sha-old')

    await run()

    expect(github.mockOctokit.rest.git.updateRef).toHaveBeenCalledTimes(1)
    expect(github.mockOctokit.rest.git.createRef).toHaveBeenCalledTimes(1)
    expect(core.setOutput).toHaveBeenCalledWith('created', ['v2'])
    expect(core.setOutput).toHaveBeenCalledWith('updated', ['v1'])
    expect(core.setOutput).toHaveBeenCalledWith('tags', ['v2', 'v1'])
  })

  it('fails when ref is missing', async () => {
    setupInputs({
      tags: 'v1',
      ref: '',
      github_token: 'test-token',
      when_exists: 'update'
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("Missing ref: provide 'ref' input")
    )
  })

  it('fails when when_exists is fail and tag exists', async () => {
    setupInputs({
      tags: 'v1',
      ref: 'abc123',
      github_token: 'test-token',
      when_exists: 'fail'
    })
    setupCommitResolver('sha-abc123')
    setupTagExistsForAll('sha-old123')

    await run()

    expect(core.setFailed).toHaveBeenCalledWith("Tag 'v1' already exists.")
    expect(github.mockOctokit.rest.git.updateRef).not.toHaveBeenCalled()
    expect(github.mockOctokit.rest.git.createRef).not.toHaveBeenCalled()
  })

  it('fails fast when when_exists is fail and one of multiple tags exists', async () => {
    setupInputs({
      tags: 'v1,v2,v3',
      ref: 'abc123',
      github_token: 'test-token',
      when_exists: 'fail'
    })
    setupCommitResolver('sha-abc123')

    // Only v2 exists
    github.mockOctokit.rest.git.getRef.mockImplementation(
      async (args: unknown) => {
        const { ref } = args as { ref: string }
        if (ref === 'tags/v2') {
          return {
            data: {
              ref: 'refs/tags/v2',
              object: { sha: 'sha-old123', type: 'commit' }
            }
          }
        }
        throw { status: 404 }
      }
    )

    await run()

    // Should fail during desired tags resolution (resolveDesiredTags() in
    // tags.ts), before any tags are created
    expect(core.setFailed).toHaveBeenCalledWith("Tag 'v2' already exists.")
    expect(github.mockOctokit.rest.git.updateRef).not.toHaveBeenCalled()
    expect(github.mockOctokit.rest.git.createRef).not.toHaveBeenCalled()
  })

  it('fails when when_exists has invalid value', async () => {
    setupInputs({
      tags: 'v1',
      ref: 'abc123',
      github_token: 'test-token',
      when_exists: 'invalid'
    })
    setupCommitResolver('sha-abc123')
    setupTagExistsForAll('sha-old123')

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("Invalid value for 'when_exists'")
    )
  })

  it('handles non-404 errors when checking if tag exists', async () => {
    setupInputs({
      tags: 'v1',
      ref: 'abc123',
      github_token: 'test-token',
      when_exists: 'update'
    })
    setupCommitResolver('sha-abc123')
    github.mockOctokit.rest.git.getRef.mockRejectedValue({
      status: 500,
      message: 'Internal Server Error'
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("Failed to check if tag 'v1' exists")
    )
  })

  it('handles errors when resolving ref to SHA', async () => {
    setupInputs({
      tags: 'v1',
      ref: 'invalid-ref',
      github_token: 'test-token',
      when_exists: 'update'
    })
    github.mockOctokit.rest.repos.getCommit.mockRejectedValue(
      new Error('Reference not found')
    )

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("Failed to resolve ref 'invalid-ref'")
    )
  })

  it('handles non-Error thrown when parsing tags', async () => {
    setupInputs({
      tags: 'v1',
      ref: 'abc123',
      github_token: 'test-token',
      when_exists: 'update'
    })
    csvParse.parse.mockImplementation(() => {
      throw 'Parse error: not an Error instance'
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      'Parse error: not an Error instance'
    )
  })

  it('defaults to update mode when when_exists is empty', async () => {
    setupInputs({
      tags: 'v1',
      ref: 'abc123',
      github_token: 'test-token',
      when_exists: ''
    })
    setupCommitResolver('sha-abc123')
    setupTagExistsForAll('sha-old123')

    await run()

    expect(github.mockOctokit.rest.git.updateRef).toHaveBeenCalledTimes(1)
    expect(core.setOutput).toHaveBeenCalledWith('updated', ['v1'])
  })

  it('handles duplicate tags by using last occurrence', async () => {
    setupInputs({
      tags: 'v1,v2,v1',
      ref: 'abc123',
      github_token: 'test-token',
      when_exists: 'update'
    })
    setupCommitResolver('sha-abc123')
    setupTagDoesNotExist()

    await run()

    // Should only create 2 tags (v1 and v2), not 3
    expect(github.mockOctokit.rest.git.createRef).toHaveBeenCalledTimes(2)
    expect(core.setOutput).toHaveBeenCalledWith('created', ['v1', 'v2'])
  })

  it('optimizes by resolving unique refs only once', async () => {
    setupInputs({
      tags: 'v1:main,v2:main,v3:develop',
      ref: '',
      github_token: 'test-token',
      when_exists: 'update'
    })
    setupCommitResolver({
      main: 'sha-main',
      develop: 'sha-develop'
    })
    setupTagDoesNotExist()

    await run()

    // Should only call getCommit 2 times (main and develop), not 3
    expect(github.mockOctokit.rest.repos.getCommit).toHaveBeenCalledTimes(2)
    expect(github.mockOctokit.rest.git.createRef).toHaveBeenCalledTimes(3)
  })

  it('handles tag with colon but empty ref part', async () => {
    setupInputs({
      tags: 'v1:,v2',
      ref: 'abc123',
      github_token: 'test-token',
      when_exists: 'update'
    })
    setupCommitResolver('sha-abc123')
    setupTagDoesNotExist()

    await run()

    // Both should use default ref
    expect(github.mockOctokit.rest.git.createRef).toHaveBeenCalledTimes(2)
    expect(core.setOutput).toHaveBeenCalledWith('created', ['v1', 'v2'])
  })

  it('fails when tag specification has multiple colons', async () => {
    setupInputs({
      tags: 'stable:refs/heads/main:latest',
      ref: '',
      github_token: 'test-token',
      when_exists: 'update'
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('Invalid tag specification')
    )
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('too many colons')
    )
  })

  it('handles mixed scenario with multiple tags', async () => {
    setupInputs({
      tags: 'v1,v2,v3',
      ref: 'abc123',
      github_token: 'test-token',
      when_exists: 'skip'
    })
    setupCommitResolver('sha-abc123')

    // v1 exists, v2 and v3 don't
    github.mockOctokit.rest.git.getRef.mockImplementation(
      async (args: unknown) => {
        const { ref } = args as { ref: string }
        if (ref === 'tags/v1') {
          return {
            data: { ref: 'refs/tags/v1', object: { sha: 'sha-old' } }
          }
        }
        throw { status: 404 }
      }
    )

    await run()

    // Should skip v1, create v2 and v3
    expect(core.info).toHaveBeenCalledWith("Tag 'v1' exists, skipping.")
    expect(github.mockOctokit.rest.git.createRef).toHaveBeenCalledTimes(2)
    expect(core.setOutput).toHaveBeenCalledWith('created', ['v2', 'v3'])
    expect(core.setOutput).toHaveBeenCalledWith('updated', [])
  })

  it('fails when tag name is empty (e.g., ":main")', async () => {
    setupInputs({
      tags: ':main',
      ref: '',
      github_token: 'test-token',
      when_exists: 'update'
    })
    setupCommitResolver('sha-main')

    await run()

    expect(core.setFailed).toHaveBeenCalledWith("Invalid tag: ':main'")
    expect(github.mockOctokit.rest.git.createRef).not.toHaveBeenCalled()
    expect(github.mockOctokit.rest.git.updateRef).not.toHaveBeenCalled()
  })

  it('fails when one of multiple tags has empty name with ref', async () => {
    setupInputs({
      tags: 'v1,:develop,v2',
      ref: 'abc123',
      github_token: 'test-token',
      when_exists: 'update'
    })
    setupCommitResolver({
      abc123: 'sha-abc123',
      develop: 'sha-develop'
    })
    setupTagDoesNotExist()

    await run()

    // Should fail on invalid tag during parsing, before processing any tags
    expect(core.setFailed).toHaveBeenCalledWith("Invalid tag: ':develop'")
    expect(github.mockOctokit.rest.git.createRef).not.toHaveBeenCalled()
  })

  it('fails when duplicate tag has different refs (explicit)', async () => {
    setupInputs({
      tags: 'v1:main,v1:develop',
      ref: '',
      github_token: 'test-token'
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      "Duplicate tag 'v1' with different refs: 'main' and 'develop'"
    )
    expect(github.mockOctokit.rest.git.createRef).not.toHaveBeenCalled()
  })

  it('fails when duplicate tag has different refs (default vs explicit)', async () => {
    setupInputs({
      tags: 'v1,v1:develop',
      ref: 'main',
      github_token: 'test-token'
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      "Duplicate tag 'v1' with different refs: 'main' and 'develop'"
    )
    expect(github.mockOctokit.rest.git.createRef).not.toHaveBeenCalled()
  })

  it('skips empty tags from double commas (e.g., "v1,,v2")', async () => {
    setupInputs({
      tags: 'v1,,v2',
      ref: 'abc123',
      github_token: 'test-token',
      when_exists: 'update'
    })
    setupCommitResolver('sha-abc123')
    setupTagDoesNotExist()

    await run()

    // Should skip empty tag and process v1 and v2
    expect(github.mockOctokit.rest.git.createRef).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      ref: 'refs/tags/v1',
      sha: 'sha-abc123'
    })
    expect(github.mockOctokit.rest.git.createRef).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      ref: 'refs/tags/v2',
      sha: 'sha-abc123'
    })
    expect(github.mockOctokit.rest.git.createRef).toHaveBeenCalledTimes(2)
    expect(core.setOutput).toHaveBeenCalledWith('created', ['v1', 'v2'])
  })

  it('skips empty lines in multi-line input (e.g., "v1\\n\\nv2")', async () => {
    setupInputs({
      tags: 'v1\n\nv2',
      ref: 'abc123',
      github_token: 'test-token',
      when_exists: 'update'
    })
    setupCommitResolver('sha-abc123')
    setupTagDoesNotExist()

    await run()

    // Should skip empty line and process v1 and v2
    expect(github.mockOctokit.rest.git.createRef).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      ref: 'refs/tags/v1',
      sha: 'sha-abc123'
    })
    expect(github.mockOctokit.rest.git.createRef).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      ref: 'refs/tags/v2',
      sha: 'sha-abc123'
    })
    expect(github.mockOctokit.rest.git.createRef).toHaveBeenCalledTimes(2)
    expect(core.setOutput).toHaveBeenCalledWith('created', ['v1', 'v2'])
  })

  it('skips empty tags from mix of empty CSV fields and empty lines', async () => {
    setupInputs({
      tags: 'v1,,v2\n\nv3,v4',
      ref: 'abc123',
      github_token: 'test-token',
      when_exists: 'update'
    })
    setupCommitResolver('sha-abc123')
    setupTagDoesNotExist()

    await run()

    // Should skip all empty tags and process v1, v2, v3, v4
    expect(github.mockOctokit.rest.git.createRef).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      ref: 'refs/tags/v1',
      sha: 'sha-abc123'
    })
    expect(github.mockOctokit.rest.git.createRef).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      ref: 'refs/tags/v2',
      sha: 'sha-abc123'
    })
    expect(github.mockOctokit.rest.git.createRef).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      ref: 'refs/tags/v3',
      sha: 'sha-abc123'
    })
    expect(github.mockOctokit.rest.git.createRef).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      ref: 'refs/tags/v4',
      sha: 'sha-abc123'
    })
    expect(github.mockOctokit.rest.git.createRef).toHaveBeenCalledTimes(4)
    expect(core.setOutput).toHaveBeenCalledWith('created', [
      'v1',
      'v2',
      'v3',
      'v4'
    ])
  })

  it('creates annotated tags when annotation is provided', async () => {
    setupInputs({
      tags: 'v1,v1.0',
      ref: 'abc123',
      github_token: 'test-token',
      when_exists: 'update',
      annotation: 'Release v1.0'
    })
    setupCommitResolver('sha-abc123')
    setupTagDoesNotExist()

    github.mockOctokit.rest.git.createTag.mockImplementation(
      async (args: unknown) => {
        const { tag } = args as { tag: string }
        return { data: { sha: `sha-tag-object-${tag}` } }
      }
    )

    await run()

    expect(github.mockOctokit.rest.git.createTag).toHaveBeenCalledTimes(2)
    expect(github.mockOctokit.rest.git.createTag).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      tag: 'v1',
      message: 'Release v1.0',
      object: 'sha-abc123',
      type: 'commit'
    })
    expect(github.mockOctokit.rest.git.createTag).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      tag: 'v1.0',
      message: 'Release v1.0',
      object: 'sha-abc123',
      type: 'commit'
    })

    expect(github.mockOctokit.rest.git.createRef).toHaveBeenCalledTimes(2)
    expect(github.mockOctokit.rest.git.createRef).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      ref: 'refs/tags/v1',
      sha: 'sha-tag-object-v1'
    })
    expect(github.mockOctokit.rest.git.createRef).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      ref: 'refs/tags/v1.0',
      sha: 'sha-tag-object-v1.0'
    })

    expect(core.setOutput).toHaveBeenCalledWith('created', ['v1', 'v1.0'])
  })

  it('updates existing tags with annotation', async () => {
    setupInputs({
      tags: 'v1',
      ref: 'def456',
      github_token: 'test-token',
      when_exists: 'update',
      annotation: 'Updated release'
    })
    setupCommitResolver('sha-def456')
    setupTagExistsForAll('sha-old123')

    github.mockOctokit.rest.git.createTag.mockResolvedValue({
      data: { sha: 'sha-tag-object-456' }
    })

    await run()

    expect(github.mockOctokit.rest.git.createTag).toHaveBeenCalledTimes(1)
    expect(github.mockOctokit.rest.git.createTag).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      tag: 'v1',
      message: 'Updated release',
      object: 'sha-def456',
      type: 'commit'
    })

    expect(github.mockOctokit.rest.git.updateRef).toHaveBeenCalledTimes(1)
    expect(github.mockOctokit.rest.git.updateRef).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      ref: 'tags/v1',
      sha: 'sha-tag-object-456',
      force: true
    })

    expect(core.setOutput).toHaveBeenCalledWith('updated', ['v1'])
  })

  it('creates lightweight tags when annotation is empty', async () => {
    setupInputs({
      tags: 'v1',
      ref: 'abc123',
      github_token: 'test-token',
      when_exists: 'update',
      annotation: ''
    })
    setupCommitResolver('sha-abc123')
    setupTagDoesNotExist()

    await run()

    expect(github.mockOctokit.rest.git.createTag).not.toHaveBeenCalled()
    expect(github.mockOctokit.rest.git.createRef).toHaveBeenCalledTimes(1)
    expect(github.mockOctokit.rest.git.createRef).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      ref: 'refs/tags/v1',
      sha: 'sha-abc123'
    })

    expect(core.setOutput).toHaveBeenCalledWith('created', ['v1'])
  })

  it('updates lightweight tags when annotation is empty', async () => {
    setupInputs({
      tags: 'v1',
      ref: 'def456',
      github_token: 'test-token',
      when_exists: 'update',
      annotation: ''
    })
    setupCommitResolver('sha-def456')
    setupTagExistsForAll('sha-old123')

    await run()

    expect(github.mockOctokit.rest.git.createTag).not.toHaveBeenCalled()
    expect(github.mockOctokit.rest.git.updateRef).toHaveBeenCalledTimes(1)
    expect(github.mockOctokit.rest.git.updateRef).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      ref: 'tags/v1',
      sha: 'sha-def456',
      force: true
    })

    expect(core.setOutput).toHaveBeenCalledWith('updated', ['v1'])
  })

  it('detects and dereferences existing annotated tags', async () => {
    setupInputs({
      tags: 'v1',
      ref: 'def456',
      github_token: 'test-token',
      when_exists: 'update'
    })
    setupCommitResolver('sha-def456')
    // Tag exists as annotated tag (type: 'tag', sha is tag object SHA)
    setupTagExistsForAll('sha-tag-object-old', 'tag')

    // Mock getTag to return the underlying commit SHA
    github.mockOctokit.rest.git.getTag.mockResolvedValue({
      data: {
        sha: 'sha-tag-object-old',
        object: { sha: 'sha-old-commit', type: 'commit' }
      }
    })

    await run()

    // Should have called getTag to dereference the annotated tag
    expect(github.mockOctokit.rest.git.getTag).toHaveBeenCalledTimes(1)
    expect(github.mockOctokit.rest.git.getTag).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      tag_sha: 'sha-tag-object-old'
    })

    // Should update because commit SHAs differ
    expect(github.mockOctokit.rest.git.updateRef).toHaveBeenCalledTimes(1)
    expect(core.setOutput).toHaveBeenCalledWith('updated', ['v1'])
  })

  it('updates existing annotated tags with new annotated tags', async () => {
    setupInputs({
      tags: 'v1',
      ref: 'def456',
      github_token: 'test-token',
      when_exists: 'update',
      annotation: 'Updated release'
    })
    setupCommitResolver('sha-def456')
    // Tag exists as annotated tag
    setupTagExistsForAll('sha-tag-object-old', 'tag')

    // Mock getTag to return the underlying commit SHA
    github.mockOctokit.rest.git.getTag.mockResolvedValue({
      data: {
        sha: 'sha-tag-object-old',
        object: { sha: 'sha-old-commit', type: 'commit' }
      }
    })

    // Mock createTag for the new annotated tag
    github.mockOctokit.rest.git.createTag.mockResolvedValue({
      data: { sha: 'sha-tag-object-new' }
    })

    await run()

    // Should have called getTag to dereference the existing annotated tag
    expect(github.mockOctokit.rest.git.getTag).toHaveBeenCalledTimes(1)
    expect(github.mockOctokit.rest.git.getTag).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      tag_sha: 'sha-tag-object-old'
    })

    // Should create new annotated tag
    expect(github.mockOctokit.rest.git.createTag).toHaveBeenCalledTimes(1)
    expect(github.mockOctokit.rest.git.createTag).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      tag: 'v1',
      message: 'Updated release',
      object: 'sha-def456',
      type: 'commit'
    })

    // Should update to new tag object SHA
    expect(github.mockOctokit.rest.git.updateRef).toHaveBeenCalledTimes(1)
    expect(github.mockOctokit.rest.git.updateRef).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      ref: 'tags/v1',
      sha: 'sha-tag-object-new',
      force: true
    })

    expect(core.setOutput).toHaveBeenCalledWith('updated', ['v1'])
  })

  it('updates annotated tag to lightweight when annotation removed', async () => {
    setupInputs({
      tags: 'v1',
      ref: 'abc123',
      github_token: 'test-token',
      when_exists: 'update',
      annotation: '' // No annotation = lightweight tag
    })
    setupCommitResolver('sha-abc123')
    // Tag exists as annotated tag pointing to same commit
    setupTagExistsForAll('sha-tag-object', 'tag')

    // Mock getTag to return the same commit SHA as target
    github.mockOctokit.rest.git.getTag.mockResolvedValue({
      data: {
        sha: 'sha-tag-object',
        message: 'Old annotation',
        object: { sha: 'sha-abc123', type: 'commit' }
      }
    })

    await run()

    // Should have called getTag to dereference
    expect(github.mockOctokit.rest.git.getTag).toHaveBeenCalledTimes(1)

    // Should update to remove annotation
    expect(github.mockOctokit.rest.git.createTag).not.toHaveBeenCalled()
    expect(github.mockOctokit.rest.git.updateRef).toHaveBeenCalledTimes(1)
    expect(github.mockOctokit.rest.git.updateRef).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      ref: 'tags/v1',
      sha: 'sha-abc123',
      force: true
    })
    expect(core.setOutput).toHaveBeenCalledWith('updated', ['v1'])
  })

  it('skips when annotated tag has same commit and same annotation', async () => {
    setupInputs({
      tags: 'v1',
      ref: 'abc123',
      github_token: 'test-token',
      when_exists: 'update',
      annotation: 'Release v1'
    })
    setupCommitResolver('sha-abc123')
    setupTagExistsForAll('sha-tag-object', 'tag')

    github.mockOctokit.rest.git.getTag.mockResolvedValue({
      data: {
        sha: 'sha-tag-object',
        message: 'Release v1', // Same annotation
        object: { sha: 'sha-abc123', type: 'commit' }
      }
    })

    await run()

    // Should have called getTag to dereference
    expect(github.mockOctokit.rest.git.getTag).toHaveBeenCalledTimes(1)

    // Should NOT update because both commit and annotation match
    expect(github.mockOctokit.rest.git.updateRef).not.toHaveBeenCalled()
    expect(github.mockOctokit.rest.git.createRef).not.toHaveBeenCalled()
    expect(core.setOutput).toHaveBeenCalledWith('tags', [])
  })

  it('updates when annotated tag has same commit but different annotation', async () => {
    setupInputs({
      tags: 'v1',
      ref: 'abc123',
      github_token: 'test-token',
      when_exists: 'update',
      annotation: 'Updated release message'
    })
    setupCommitResolver('sha-abc123')
    setupTagExistsForAll('sha-tag-object-old', 'tag')

    github.mockOctokit.rest.git.getTag.mockResolvedValue({
      data: {
        sha: 'sha-tag-object-old',
        message: 'Old release message', // Different annotation
        object: { sha: 'sha-abc123', type: 'commit' }
      }
    })

    github.mockOctokit.rest.git.createTag.mockResolvedValue({
      data: { sha: 'sha-tag-object-new' }
    })

    await run()

    // Should have called getTag to check existing annotation
    expect(github.mockOctokit.rest.git.getTag).toHaveBeenCalledTimes(1)

    // Should create new annotated tag with new message
    expect(github.mockOctokit.rest.git.createTag).toHaveBeenCalledTimes(1)
    expect(github.mockOctokit.rest.git.createTag).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      tag: 'v1',
      message: 'Updated release message',
      object: 'sha-abc123',
      type: 'commit'
    })

    // Should update to new tag object
    expect(github.mockOctokit.rest.git.updateRef).toHaveBeenCalledTimes(1)
    expect(github.mockOctokit.rest.git.updateRef).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      ref: 'tags/v1',
      sha: 'sha-tag-object-new',
      force: true
    })

    expect(core.setOutput).toHaveBeenCalledWith('updated', ['v1'])
  })

  it('updates lightweight tag to annotated when annotation added', async () => {
    setupInputs({
      tags: 'v1',
      ref: 'abc123',
      github_token: 'test-token',
      when_exists: 'update',
      annotation: 'New annotation'
    })
    setupCommitResolver('sha-abc123')
    // Tag exists as lightweight tag pointing to same commit
    setupTagExistsForAll('sha-abc123', 'commit')

    github.mockOctokit.rest.git.createTag.mockResolvedValue({
      data: { sha: 'sha-tag-object-new' }
    })

    await run()

    // Should NOT call getTag since existing tag is lightweight
    expect(github.mockOctokit.rest.git.getTag).not.toHaveBeenCalled()

    // Should create annotated tag
    expect(github.mockOctokit.rest.git.createTag).toHaveBeenCalledTimes(1)
    expect(github.mockOctokit.rest.git.createTag).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      tag: 'v1',
      message: 'New annotation',
      object: 'sha-abc123',
      type: 'commit'
    })

    // Should update to tag object
    expect(github.mockOctokit.rest.git.updateRef).toHaveBeenCalledTimes(1)
    expect(github.mockOctokit.rest.git.updateRef).toHaveBeenCalledWith({
      owner: 'test-owner',
      repo: 'test-repo',
      ref: 'tags/v1',
      sha: 'sha-tag-object-new',
      force: true
    })

    expect(core.setOutput).toHaveBeenCalledWith('updated', ['v1'])
  })
})
