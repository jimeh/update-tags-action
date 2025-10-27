import * as core from '@actions/core'
import * as github from '@actions/github'
import { parse } from 'csv-parse/sync'

export interface Tag {
  name: string
  ref: string
  sha: string
}

export type TagResult = 'created' | 'updated' | 'skipped' | 'failed'

/**
 * Parse tags input string and resolve refs to SHAs.
 *
 * @param octokit - The GitHub API client
 * @param tagsInput - The raw tags input string
 * @param defaultRef - The default ref to use if not specified per-tag
 * @param owner - The repository owner
 * @param repo - The repository name
 * @returns Array of desired tags with resolved SHAs
 */
export async function parseTagsInput(
  octokit: ReturnType<typeof github.getOctokit>,
  tagsInput: string,
  defaultRef: string,
  owner: string,
  repo: string
): Promise<Tag[]> {
  const parsedTags: string[] = (
    parse(tagsInput, {
      delimiter: ',',
      trim: true,
      relax_column_count: true
    }) as string[][]
  ).flat()

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

    // Check for duplicate tag with different ref.
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
  const refToSha: Record<string, string> = {}
  await Promise.all(
    Array.from(uniqueRefs).map(async (ref) => {
      refToSha[ref] = await resolveRefToSha(octokit, owner, repo, ref)
    })
  )

  // Build result array with resolved SHAs.
  const result: Tag[] = []
  for (const tagName in tags) {
    const tagRef = tags[tagName]
    result.push({
      name: tagName,
      ref: tagRef,
      sha: refToSha[tagRef]
    })
  }

  return result
}

/**
 * Process a single desired tag: create or update it based on configuration.
 *
 * @param tag - The desired tag to process
 * @param whenExists - What to do if the tag already exists
 * @param annotation - Optional annotation message for the tag
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param octokit - GitHub API client
 * @returns The result of the tag operation
 */
export async function processTag(
  tag: Tag,
  whenExists: 'update' | 'skip' | 'fail',
  annotation: string,
  owner: string,
  repo: string,
  octokit: ReturnType<typeof github.getOctokit>
): Promise<TagResult> {
  const { name: tagName, sha } = tag

  try {
    // Check if the tag exists.
    const existing = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `tags/${tagName}`
    })

    // If the tag exists, decide action based on 'when_exists'.
    if (whenExists === 'update') {
      const existingSHA = existing.data.object.sha

      // For annotated tags, we need to get the commit SHA from the tag object
      let existingCommitSHA = existingSHA
      if (existing.data.object.type === 'tag') {
        const tagObject = await octokit.rest.git.getTag({
          owner,
          repo,
          tag_sha: existingSHA
        })
        existingCommitSHA = tagObject.data.object.sha
      }

      if (existingCommitSHA === sha) {
        core.info(`Tag '${tagName}' already exists with desired SHA ${sha}.`)
        return 'skipped'
      }

      core.info(
        `Tag '${tagName}' exists, updating to SHA ${sha} ` +
          `(was ${existingCommitSHA}).`
      )
      await updateTag(tagName, sha, annotation, owner, repo, octokit)
      return 'updated'
    } else if (whenExists === 'skip') {
      core.info(`Tag '${tagName}' exists, skipping.`)
      return 'skipped'
    } else {
      // whenExists === 'fail'
      core.setFailed(`Tag '${tagName}' already exists.`)
      return 'failed'
    }
  } catch (error: unknown) {
    const err = error as { status?: number }
    if (err?.status !== 404) {
      throw error
    }

    // If the tag doesn't exist (404), create it.
    core.info(`Tag '${tagName}' does not exist, creating with SHA ${sha}.`)
    await createTag(tagName, sha, annotation, owner, repo, octokit)
    return 'created'
  }
}

/**
 * Create a tag (annotated or lightweight based on annotation parameter).
 *
 * @param tagName - Name of the tag
 * @param sha - Commit SHA to tag
 * @param annotation - Optional annotation message
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param octokit - GitHub API client
 */
async function createTag(
  tagName: string,
  sha: string,
  annotation: string,
  owner: string,
  repo: string,
  octokit: ReturnType<typeof github.getOctokit>
): Promise<void> {
  let refSha = sha

  // If annotation is provided, create an annotated tag object first
  if (annotation) {
    const tagObject = await octokit.rest.git.createTag({
      owner,
      repo,
      tag: tagName,
      message: annotation,
      object: sha,
      type: 'commit'
    })
    refSha = tagObject.data.sha
  }

  // Create the reference pointing to the tag object (or commit for lightweight)
  await octokit.rest.git.createRef({
    owner,
    repo,
    ref: `refs/tags/${tagName}`,
    sha: refSha
  })
}

/**
 * Update a tag to point to a new SHA.
 *
 * @param tagName - Name of the tag
 * @param sha - New commit SHA
 * @param annotation - Optional annotation message
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param octokit - GitHub API client
 */
async function updateTag(
  tagName: string,
  sha: string,
  annotation: string,
  owner: string,
  repo: string,
  octokit: ReturnType<typeof github.getOctokit>
): Promise<void> {
  let refSha = sha

  // If annotation is provided, create an annotated tag object first
  if (annotation) {
    const tagObject = await octokit.rest.git.createTag({
      owner,
      repo,
      tag: tagName,
      message: annotation,
      object: sha,
      type: 'commit'
    })
    refSha = tagObject.data.sha
  }

  // Update the reference
  await octokit.rest.git.updateRef({
    owner,
    repo,
    ref: `tags/${tagName}`,
    sha: refSha,
    force: true
  })
}

async function resolveRefToSha(
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  ref: string
): Promise<string> {
  try {
    const {
      data: { sha }
    } = await octokit.rest.repos.getCommit({
      owner,
      repo,
      ref
    })

    return sha
  } catch (error) {
    throw new Error(`Failed to resolve ref '${ref}' to a SHA: ${String(error)}`)
  }
}
