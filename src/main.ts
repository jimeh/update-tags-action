import * as core from '@actions/core'
import * as github from '@actions/github'
import { getInputs } from './inputs.js'
import { resolveDesiredTags, processTag } from './tags.js'

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const inputs = getInputs()
    const octokit = github.getOctokit(inputs.token)
    const tags = await resolveDesiredTags(inputs, octokit)

    const created: string[] = []
    const updated: string[] = []
    const skipped: string[] = []

    // Create or update all tags.
    for (const tag of tags) {
      const result = await processTag(tag, octokit)

      if (result === 'created') {
        created.push(tag.name)
      } else if (result === 'updated') {
        updated.push(tag.name)
      } else if (result === 'skipped') {
        skipped.push(tag.name)
      }
    }

    core.setOutput('created', created)
    core.setOutput('updated', updated)
    core.setOutput('skipped', skipped)
    core.setOutput('tags', created.concat(updated))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    core.setFailed(message)
  }
}
