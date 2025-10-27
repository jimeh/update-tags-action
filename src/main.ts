import * as core from '@actions/core'
import { getInputs } from './inputs.js'
import { processTag } from './tags.js'

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    let inputs
    try {
      inputs = await getInputs()
    } catch (error) {
      // For parsing/validation errors, pass message directly.
      const message = error instanceof Error ? error.message : String(error)
      core.setFailed(message)
      return
    }

    const { tags, whenExists, owner, repo, octokit } = inputs

    const created: string[] = []
    const updated: string[] = []

    // Create or update all tags.
    for (const tag of tags) {
      const result = await processTag(tag, whenExists, owner, repo, octokit)

      if (result === 'failed') {
        return
      } else if (result === 'created') {
        created.push(tag.name)
      } else if (result === 'updated') {
        updated.push(tag.name)
      }
    }

    core.setOutput('created', created)
    core.setOutput('updated', updated)
    core.setOutput('tags', created.concat(updated))
  } catch (error) {
    core.setFailed(`Action failed with error: ${String(error)}`)
  }
}
