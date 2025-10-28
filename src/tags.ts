import * as core from '@actions/core'
import * as github from '@actions/github'
import type { Inputs, WhenExistsMode } from './inputs.js'

export interface ExistingTagInfo {
  commitSHA: string
  isAnnotated: boolean
  annotation?: string
}

export interface DesiredTag {
  name: string
  ref: string
  sha: string
  whenExists: WhenExistsMode
  annotation: string
  owner: string
  repo: string
  existing?: ExistingTagInfo
}

export type TagResult = 'created' | 'updated' | 'skipped' | 'failed'

interface TagOperationContext {
  owner: string
  repo: string
  octokit: ReturnType<typeof github.getOctokit>
}

/**
 * Fetch information about an existing tag, dereferencing if annotated.
 *
 * @param ctx - Operation context
 * @param existing - The existing tag reference data
 * @returns Information about the existing tag
 */
async function fetchExistingTagInfo(
  ctx: TagOperationContext,
  existing: { data: { object: { sha: string; type: string } } }
): Promise<ExistingTagInfo> {
  const existingObject = existing.data.object
  const isAnnotated = existingObject.type === 'tag'

  if (!isAnnotated) {
    return {
      commitSHA: existingObject.sha,
      isAnnotated: false
    }
  }

  // Dereference annotated tag to get underlying commit
  const tagObject = await ctx.octokit.rest.git.getTag({
    owner: ctx.owner,
    repo: ctx.repo,
    tag_sha: existingObject.sha
  })

  return {
    commitSHA: tagObject.data.object.sha,
    isAnnotated: true,
    annotation: tagObject.data.message
  }
}

/**
 * Resolve desired tag objects from inputs.
 *
 * @param inputs - The validated inputs containing tags, refs, and configuration
 * @param octokit - The GitHub API client
 * @returns Array of desired tags with resolved SHAs and configuration
 */
export async function resolveDesiredTags(
  inputs: Inputs,
  octokit: ReturnType<typeof github.getOctokit>
): Promise<DesiredTag[]> {
  const {
    tags: parsedTags,
    defaultRef,
    whenExists,
    annotation,
    owner,
    repo
  } = inputs

  const uniqueRefs = new Set<string>()
  const tags: Record<string, string> = {}

  for (const tag of parsedTags) {
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

    const ref = tagRef || defaultRef
    if (!ref) {
      throw new Error("Missing ref: provide 'ref' input or specify per-tag ref")
    }

    // Check for duplicate tag with different ref
    if (tags[tagName] && tags[tagName] !== ref) {
      throw new Error(
        `Duplicate tag '${tagName}' with different refs: ` +
          `'${tags[tagName]}' and '${ref}'`
      )
    }

    tags[tagName] = ref
    uniqueRefs.add(ref)
  }

  // Pre-resolve all unique refs in parallel.
  const ctx: TagOperationContext = { owner, repo, octokit }
  const refToSha: Record<string, string> = {}
  await Promise.all(
    Array.from(uniqueRefs).map(async (ref) => {
      refToSha[ref] = await resolveRefToSha(ctx, ref)
    })
  )

  // Build result array with resolved SHAs and check for existing tags.
  const tagNames = Object.keys(tags)
  const result: DesiredTag[] = await Promise.all(
    tagNames.map(async (tagName) => {
      const tagRef = tags[tagName]
      const sha = refToSha[tagRef]

      // Check if tag already exists
      let existing: ExistingTagInfo | undefined
      try {
        const existingRef = await ctx.octokit.rest.git.getRef({
          owner: ctx.owner,
          repo: ctx.repo,
          ref: `tags/${tagName}`
        })
        existing = await fetchExistingTagInfo(ctx, existingRef)

        // Fail early if when_exists is 'fail'
        if (whenExists === 'fail') {
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
        } else if (error instanceof Error) {
          // Already an Error (e.g., from when_exists === 'fail')
          throw error
        } else {
          // Unknown error type
          throw new Error(
            `Failed to check if tag '${tagName}' exists: ${String(error)}`
          )
        }
      }

      return {
        name: tagName,
        ref: tagRef,
        sha,
        whenExists,
        annotation,
        owner,
        repo,
        existing
      }
    })
  )

  return result
}

async function resolveRefToSha(
  ctx: TagOperationContext,
  ref: string
): Promise<string> {
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
 * Process a single desired tag: create or update it based on configuration.
 *
 * @param tag - The desired tag to process (with existing info if applicable)
 * @param octokit - GitHub API client
 * @returns The result of the tag operation
 */
export async function processTag(
  tag: DesiredTag,
  octokit: ReturnType<typeof github.getOctokit>
): Promise<TagResult> {
  const ctx: TagOperationContext = { owner: tag.owner, repo: tag.repo, octokit }

  // Tag doesn't exist, create it
  if (!tag.existing) {
    return await createTag(ctx, tag)
  }

  // Tag exists - handle based on when_exists strategy
  if (tag.whenExists === 'skip') {
    core.info(`Tag '${tag.name}' exists, skipping.`)
    return 'skipped'
  }

  if (tag.whenExists === 'fail') {
    // This should not happen as we fail early in resolveDesiredTags
    core.setFailed(`Tag '${tag.name}' already exists.`)
    return 'failed'
  }

  // whenExists === 'update' - check if update is needed
  if (tagMatchesTarget(tag)) {
    core.info(
      `Tag '${tag.name}' already exists with desired commit SHA ${tag.sha}` +
        (tag.existing.isAnnotated ? ' (annotated).' : '.')
    )
    return 'skipped'
  }

  return await updateExistingTag(ctx, tag)
}

/**
 * Update an existing tag to point to a new commit and/or annotation.
 */
async function updateExistingTag(
  ctx: TagOperationContext,
  tag: DesiredTag
): Promise<TagResult> {
  if (!tag.existing) {
    throw new Error(`Cannot update non-existent tag '${tag.name}'`)
  }

  const reasons = getUpdateReasons(tag)
  const commitMatches = tag.existing.commitSHA === tag.sha

  if (commitMatches) {
    core.info(
      `Tag '${tag.name}' exists with same commit but ${reasons.join(', ')}.`
    )
  } else {
    core.info(
      `Tag '${tag.name}' exists` +
        `${tag.existing.isAnnotated ? ' (annotated)' : ''}` +
        `, updating to ${reasons.join(', ')}.`
    )
  }

  const targetSha = await resolveTargetSHA(ctx, tag)

  await ctx.octokit.rest.git.updateRef({
    owner: ctx.owner,
    repo: ctx.repo,
    ref: `tags/${tag.name}`,
    sha: targetSha,
    force: true
  })

  return 'updated'
}

/**
 * Create a tag (doesn't exist yet).
 */
async function createTag(
  ctx: TagOperationContext,
  tag: DesiredTag
): Promise<TagResult> {
  core.info(
    `Tag '${tag.name}' does not exist, creating with commit SHA ${tag.sha}.`
  )

  const targetSha = await resolveTargetSHA(ctx, tag)

  await ctx.octokit.rest.git.createRef({
    owner: ctx.owner,
    repo: ctx.repo,
    ref: `refs/tags/${tag.name}`,
    sha: targetSha
  })

  return 'created'
}

/**
 * Resolve the target SHA for a tag (creates annotated tag object if needed).
 *
 * @param ctx - Operation context
 * @param tag - The tag to create
 * @returns The SHA to use (tag object SHA if annotated, commit SHA otherwise)
 */
async function resolveTargetSHA(
  ctx: TagOperationContext,
  tag: DesiredTag
): Promise<string> {
  if (!tag.annotation) {
    return tag.sha
  }

  const tagObject = await ctx.octokit.rest.git.createTag({
    owner: ctx.owner,
    repo: ctx.repo,
    tag: tag.name,
    message: tag.annotation,
    object: tag.sha,
    type: 'commit'
  })

  return tagObject.data.sha
}

/**
 * Compare existing tag state with desired target state.
 *
 * @param tag - The desired tag with existing info
 * @returns Object indicating whether commit and annotation match
 */
function compareTagState(tag: DesiredTag): {
  commitMatches: boolean
  annotationMatches: boolean
} {
  if (!tag.existing) {
    return { commitMatches: false, annotationMatches: false }
  }

  const commitMatches = tag.existing.commitSHA === tag.sha
  const annotationMatches =
    tag.existing.isAnnotated && tag.annotation
      ? tag.existing.annotation === tag.annotation
      : !tag.existing.isAnnotated && !tag.annotation

  return { commitMatches, annotationMatches }
}

/**
 * Check if a tag needs to be updated based on commit and annotation.
 *
 * @param tag - The desired tag with existing info
 * @returns True if the tag matches the target state
 */
function tagMatchesTarget(tag: DesiredTag): boolean {
  const { commitMatches, annotationMatches } = compareTagState(tag)
  return commitMatches && annotationMatches
}

/**
 * Get update reason messages based on what changed.
 *
 * @param tag - The desired tag with existing info
 * @returns Array of reason strings
 */
function getUpdateReasons(tag: DesiredTag): string[] {
  if (!tag.existing) return []

  const { commitMatches, annotationMatches } = compareTagState(tag)
  const reasons: string[] = []

  if (!commitMatches) {
    reasons.push(`commit SHA ${tag.sha} (was ${tag.existing.commitSHA})`)
  }

  if (!annotationMatches && tag.annotation) {
    if (tag.existing.isAnnotated) {
      reasons.push('annotation message changed')
    } else {
      reasons.push('adding annotation')
    }
  } else if (
    !annotationMatches &&
    !tag.annotation &&
    tag.existing.isAnnotated
  ) {
    reasons.push('removing annotation')
  }

  return reasons
}
