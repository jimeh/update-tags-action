import * as core from '@actions/core'
import * as github from '@actions/github'
import type { Inputs } from './inputs.js'

export interface ExistingTagInfo {
  commitSHA: string
  isAnnotated: boolean
  annotation?: string
}

interface BaseOperation {
  name: string
  ref: string
  sha: string
  owner: string
  repo: string
}

export interface CreateOperation extends BaseOperation {
  operation: 'create'
  annotation: string
}

export interface UpdateOperation extends BaseOperation {
  operation: 'update'
  annotation: string
  existingSHA: string
  existingIsAnnotated: boolean
  reasons: string[]
}

export interface SkipOperation extends BaseOperation {
  operation: 'skip'
  existingIsAnnotated: boolean
  reason: 'when_exists_skip' | 'already_matches'
}

export type TagOperation = CreateOperation | UpdateOperation | SkipOperation

interface Context {
  owner: string
  repo: string
  octokit: ReturnType<typeof github.getOctokit>
}

/**
 * Plan tag operations based on inputs.
 *
 * @param inputs - The validated inputs containing tags, refs, and configuration
 * @param octokit - The GitHub API client
 * @returns Array of planned tag operations (create, update, or skip)
 */
export async function planTagOperations(
  inputs: Inputs,
  octokit: ReturnType<typeof github.getOctokit>
): Promise<TagOperation[]> {
  const uniqueRefs = new Set<string>()
  const tagRefs: Record<string, string> = {}

  for (const tag of inputs.tags) {
    const parts = tag.split(':').map((s) => s.trim())
    if (parts.length > 2) {
      throw new Error(
        `Invalid tag specification '${tag}': too many colons. ` +
          `Format should be 'tag' or 'tag:ref'.`
      )
    }
    const [tagName, tagRef] = parts
    if (!tagName) {
      // Skip completely empty tags, but fail on invalid ones like ":main"
      if (tagRef) {
        throw new Error(`Invalid tag: '${tag}'`)
      }
      continue
    }

    const ref = tagRef || inputs.defaultRef
    if (!ref) {
      throw new Error("Missing ref: provide 'ref' input or specify per-tag ref")
    }

    // Check for duplicate tag with different ref
    if (tagRefs[tagName] && tagRefs[tagName] !== ref) {
      throw new Error(
        `Duplicate tag '${tagName}' with different refs: ` +
          `'${tagRefs[tagName]}' and '${ref}'`
      )
    }

    tagRefs[tagName] = ref
    uniqueRefs.add(ref)
  }

  // Pre-resolve all unique refs in parallel.
  const ctx: Context = { owner: inputs.owner, repo: inputs.repo, octokit }
  const refSHAs: Record<string, string> = {}
  await Promise.all(
    Array.from(uniqueRefs).map(async (ref) => {
      refSHAs[ref] = await resolveRefToSha(ctx, ref)
    })
  )

  // Build result array with planned operations
  const tagNames = Object.keys(tagRefs)
  const result: TagOperation[] = await Promise.all(
    tagNames.map(async (tagName) => {
      const tagRef = tagRefs[tagName]
      const sha = refSHAs[tagRef]

      // Check if tag already exists
      let existing: ExistingTagInfo | undefined
      try {
        existing = await fetchTagInfo(ctx, tagName)

        // Fail early if when_exists is 'fail'
        if (inputs.whenExists === 'fail') {
          throw new Error(`Tag '${tagName}' already exists.`)
        }
      } catch (error: unknown) {
        // Check if it's a GitHub API error with a status property
        if (typeof error === 'object' && error !== null && 'status' in error) {
          const apiError = error as { status: number; message?: string }
          if (apiError.status === 404) {
            // Tag doesn't exist, existing remains undefined
          } else {
            // Some other API error
            throw new Error(
              `Failed to check if tag '${tagName}' exists: ${apiError.message || String(error)}`
            )
          }
        } else {
          throw error
        }
      }

      const baseOp = {
        name: tagName,
        ref: tagRef,
        sha,
        owner: inputs.owner,
        repo: inputs.repo
      }

      // Tag doesn't exist - plan creation
      if (!existing) {
        return {
          ...baseOp,
          operation: 'create',
          annotation: inputs.annotation
        } as CreateOperation
      }

      // Tag exists - determine operation based on mode and state
      if (inputs.whenExists === 'skip') {
        return {
          ...baseOp,
          operation: 'skip',
          existingIsAnnotated: existing.isAnnotated,
          reason: 'when_exists_skip'
        } as SkipOperation
      }

      // whenExists === 'update' - check if update is needed
      const { commitMatches, annotationMatches } = compareTagState(
        sha,
        inputs.annotation,
        existing
      )

      if (commitMatches && annotationMatches) {
        return {
          ...baseOp,
          operation: 'skip',
          existingIsAnnotated: existing.isAnnotated,
          reason: 'already_matches'
        } as SkipOperation
      }

      // Plan update with reasons
      const reasons = getUpdateReasons(sha, inputs.annotation, existing)
      return {
        ...baseOp,
        operation: 'update',
        annotation: inputs.annotation,
        existingSHA: existing.commitSHA,
        existingIsAnnotated: existing.isAnnotated,
        reasons
      } as UpdateOperation
    })
  )

  return result
}

/**
 * Execute a planned tag operation.
 *
 * @param operation - The planned tag operation to execute
 * @param octokit - GitHub API client
 */
export async function executeTagOperation(
  operation: TagOperation,
  octokit: ReturnType<typeof github.getOctokit>
): Promise<void> {
  const ctx: Context = {
    owner: operation.owner,
    repo: operation.repo,
    octokit
  }

  if (operation.operation === 'skip') {
    if (operation.reason === 'when_exists_skip') {
      core.info(`Tag '${operation.name}' exists, skipping.`)
    } else {
      core.info(
        `Tag '${operation.name}' already exists with desired commit SHA ${operation.sha}` +
          (operation.existingIsAnnotated ? ' (annotated).' : '.')
      )
    }
    return
  }

  if (operation.operation === 'create') {
    await createTag(ctx, operation)
    return
  }

  if (operation.operation === 'update') {
    await updateExistingTag(ctx, operation)
    return
  }

  throw new Error(
    `Unknown operation type: ${(operation as TagOperation).operation}`
  )
}

/**
 * Fetch information about an existing tag, dereferencing if annotated.
 *
 * @param ctx - Operation context
 * @param tagName - The name of the tag to fetch
 * @returns Information about the existing tag
 */
async function fetchTagInfo(
  ctx: Context,
  tagName: string
): Promise<ExistingTagInfo> {
  const ref = await ctx.octokit.rest.git.getRef({
    owner: ctx.owner,
    repo: ctx.repo,
    ref: `tags/${tagName}`
  })
  const object = ref.data.object
  const isAnnotated = object.type === 'tag'

  if (!isAnnotated) {
    return {
      commitSHA: object.sha,
      isAnnotated: false
    }
  }

  // Dereference annotated tag to get underlying commit
  const tagRef = await ctx.octokit.rest.git.getTag({
    owner: ctx.owner,
    repo: ctx.repo,
    tag_sha: object.sha
  })

  return {
    commitSHA: tagRef.data.object.sha,
    isAnnotated: true,
    annotation: tagRef.data.message
  }
}

/**
 * Resolve a ref to a SHA.
 *
 * @param ctx - Operation context
 * @param ref - The ref to resolve
 * @returns The SHA
 */
async function resolveRefToSha(ctx: Context, ref: string): Promise<string> {
  try {
    const {
      data: { sha }
    } = await ctx.octokit.rest.repos.getCommit({
      owner: ctx.owner,
      repo: ctx.repo,
      ref
    })

    return sha
  } catch (error) {
    throw new Error(`Failed to resolve ref '${ref}' to a SHA: ${String(error)}`)
  }
}

/**
 * Update an existing tag to point to a new commit and/or annotation.
 */
async function updateExistingTag(
  ctx: Context,
  operation: UpdateOperation
): Promise<void> {
  const commitMatches = operation.existingSHA === operation.sha

  if (commitMatches) {
    core.info(
      `Tag '${operation.name}' exists with same commit but ${operation.reasons.join(', ')}.`
    )
  } else {
    core.info(
      `Tag '${operation.name}' exists` +
        `${operation.existingIsAnnotated ? ' (annotated)' : ''}` +
        `, updating to ${operation.reasons.join(', ')}.`
    )
  }

  const targetSha = await resolveTargetSHA(
    ctx,
    operation.name,
    operation.sha,
    operation.annotation
  )

  await ctx.octokit.rest.git.updateRef({
    owner: ctx.owner,
    repo: ctx.repo,
    ref: `tags/${operation.name}`,
    sha: targetSha,
    force: true
  })
}

/**
 * Create a tag (doesn't exist yet).
 */
async function createTag(
  ctx: Context,
  operation: CreateOperation
): Promise<void> {
  core.info(
    `Tag '${operation.name}' does not exist, creating with commit SHA ${operation.sha}.`
  )

  const targetSha = await resolveTargetSHA(
    ctx,
    operation.name,
    operation.sha,
    operation.annotation
  )

  await ctx.octokit.rest.git.createRef({
    owner: ctx.owner,
    repo: ctx.repo,
    ref: `refs/tags/${operation.name}`,
    sha: targetSha
  })
}

/**
 * Resolve the target SHA for a tag (creates annotated tag object if needed).
 *
 * @param ctx - Operation context
 * @param tagName - The tag name
 * @param commitSha - The commit SHA
 * @param annotation - The annotation message (if any)
 * @returns The SHA to use (tag object SHA if annotated, commit SHA otherwise)
 */
async function resolveTargetSHA(
  ctx: Context,
  tagName: string,
  commitSha: string,
  annotation: string
): Promise<string> {
  if (!annotation) {
    return commitSha
  }

  const tagObject = await ctx.octokit.rest.git.createTag({
    owner: ctx.owner,
    repo: ctx.repo,
    tag: tagName,
    message: annotation,
    object: commitSha,
    type: 'commit'
  })

  return tagObject.data.sha
}

/**
 * Compare existing tag state with desired target state.
 *
 * @param sha - The desired commit SHA
 * @param annotation - The desired annotation
 * @param existing - Information about the existing tag
 * @returns Object indicating whether commit and annotation match
 */
function compareTagState(
  sha: string,
  annotation: string,
  existing: ExistingTagInfo
): {
  commitMatches: boolean
  annotationMatches: boolean
} {
  const isAnnotated = existing.isAnnotated === true

  const commitMatches = existing.commitSHA === sha
  const annotationMatches =
    (isAnnotated && !!annotation && existing.annotation === annotation) ||
    (!isAnnotated && !annotation) ||
    false

  return { commitMatches, annotationMatches }
}

/**
 * Get update reason messages based on what changed.
 *
 * @param sha - The desired commit SHA
 * @param annotation - The desired annotation
 * @param existing - Information about the existing tag
 * @returns Array of reason strings
 */
function getUpdateReasons(
  sha: string,
  annotation: string,
  existing: ExistingTagInfo
): string[] {
  const { commitMatches, annotationMatches } = compareTagState(
    sha,
    annotation,
    existing
  )
  const reasons: string[] = []

  if (!commitMatches) {
    reasons.push(`commit SHA ${sha} (was ${existing.commitSHA})`)
  }

  if (!annotationMatches && annotation) {
    if (existing.isAnnotated === true) {
      reasons.push('annotation message changed')
    } else {
      reasons.push('adding annotation')
    }
  } else if (
    !annotationMatches &&
    !annotation &&
    existing.isAnnotated === true
  ) {
    reasons.push('removing annotation')
  }

  return reasons
}
