import * as core from '@actions/core'
import * as github from '@actions/github'
import { parse } from 'csv-parse/sync'

const WHEN_EXISTS_MODES = ['update', 'skip', 'fail'] as const
export type WhenExistsMode = (typeof WHEN_EXISTS_MODES)[number]

export interface Inputs {
  tags: string[]
  defaultRef: string
  whenExists: WhenExistsMode
  annotation: string
  owner: string
  repo: string
  token: string
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
export function getInputs(): Inputs {
  const tagsInput: string = core.getInput('tags', { required: true })
  const defaultRef: string = core.getInput('ref')
  const whenExistsInput = core.getInput('when_exists') || 'update'
  const whenExists = validateWhenExists(whenExistsInput)
  const annotation: string = core.getInput('annotation')
  const token: string = core.getInput('github_token', {
    required: true
  })

  const { owner, repo } = github.context.repo

  // Parse tags as CSV/newline delimited strings
  const tags = (
    parse(tagsInput, {
      delimiter: ',',
      trim: true,
      relax_column_count: true
    }) as string[][]
  ).flat()

  return {
    tags,
    defaultRef,
    whenExists,
    annotation,
    owner,
    repo,
    token
  }
}
