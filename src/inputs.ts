import * as core from '@actions/core'
import * as github from '@actions/github'
import { parse } from 'csv-parse/sync'
import { deriveTags } from './derive.js'

const WHEN_EXISTS_MODES = ['update', 'skip', 'fail'] as const
export type WhenExistsMode = (typeof WHEN_EXISTS_MODES)[number]

export interface Inputs {
  tags: string[]
  defaultRef: string
  whenExists: WhenExistsMode
  annotation: string
  dryRun: boolean
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

const DEFAULT_DERIVE_FROM_TEMPLATE =
  '{{prefix}}{{major}},{{prefix}}{{major}}.{{minor}}'

/**
 * Get and validate action inputs.
 *
 * @returns Parsed and validated inputs
 */
export function getInputs(): Inputs {
  const tagsInput: string = core.getInput('tags')
  const deriveFrom: string = core.getInput('derive_from')
  const deriveFromTemplate: string =
    core.getInput('derive_from_template') || DEFAULT_DERIVE_FROM_TEMPLATE
  const defaultRef: string = core.getInput('ref')
  const whenExistsInput = core.getInput('when_exists') || 'update'
  const whenExists = validateWhenExists(whenExistsInput)
  const annotation: string = core.getInput('annotation')
  const dryRun: boolean = core.getBooleanInput('dry_run')
  const token: string = core.getInput('github_token', {
    required: true
  })

  const { owner, repo } = github.context.repo

  // Parse explicit tags as CSV/newline delimited strings
  const explicitTags: string[] = tagsInput
    ? (
        parse(tagsInput, {
          delimiter: ',',
          trim: true,
          relax_column_count: true
        }) as string[][]
      ).flat()
    : []

  // Derive tags from semver version string if provided
  const derivedTags: string[] = deriveFrom
    ? deriveTags(deriveFrom, deriveFromTemplate)
    : []

  // Combine explicit and derived tags
  const tags = [...explicitTags, ...derivedTags]

  // Validate that at least one tag source is provided
  if (tags.length === 0) {
    throw new Error(
      "No tags specified. Provide 'tags' input, 'derive_from' input, or both."
    )
  }

  return {
    tags,
    defaultRef,
    whenExists,
    annotation,
    dryRun,
    owner,
    repo,
    token
  }
}
