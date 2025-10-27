import * as core from '@actions/core'
import * as github from '@actions/github'
import { parseTagsInput, type Tag } from './tags.js'

const WHEN_EXISTS_MODES = ['update', 'skip', 'fail'] as const
export type WhenExistsMode = (typeof WHEN_EXISTS_MODES)[number]

export interface Inputs {
  tags: Tag[]
  whenExists: WhenExistsMode
  owner: string
  repo: string
  octokit: ReturnType<typeof github.getOctokit>
}

/**
 * Validate when_exists input value.
 *
 * @param input - The when_exists input value to validate
 * @returns The validated when_exists mode
 */
function validateWhenExists(input: string): WhenExistsMode {
  if (!WHEN_EXISTS_MODES.includes(input as WhenExistsMode)) {
    const validList = WHEN_EXISTS_MODES.map((m) => `'${m}'`).join(', ')
    throw new Error(
      `Invalid value for 'when_exists': '${input}'. ` +
        `Valid values are ${validList}.`
    )
  }
  return input as WhenExistsMode
}

/**
 * Get and validate action inputs.
 *
 * @returns Parsed and validated inputs
 */
export async function getInputs(): Promise<Inputs> {
  const tagsInput: string = core.getInput('tags', { required: true })
  const defaultRef: string = core.getInput('ref')
  const whenExistsInput = core.getInput('when_exists') || 'update'
  const whenExists = validateWhenExists(whenExistsInput)
  const token: string = core.getInput('github_token', {
    required: true
  })

  const octokit = github.getOctokit(token)
  const { owner, repo } = github.context.repo

  const tags = await parseTagsInput(octokit, tagsInput, defaultRef, owner, repo)

  return {
    tags,
    whenExists,
    owner,
    repo,
    octokit
  }
}
