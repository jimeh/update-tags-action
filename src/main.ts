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
    let inputs
    try {
      inputs = getInputs()
    } catch (error) {
      // For parsing/validation errors, pass message directly.
      const message = error instanceof Error ? error.message : String(error)
      core.setFailed(message)
      return
    }

    // Create GitHub API client
    const octokit = github.getOctokit(inputs.token)

    let tags
    try {
      tags = await resolveDesiredTags(inputs, octokit)
    } catch (error) {
      // For tag resolution errors (ref resolution, tag existence checks), pass
      // message directly.
      const message = error instanceof Error ? error.message : String(error)
      core.setFailed(message)
      return
    }

    const created: string[] = []
    const updated: string[] = []

    // Create or update all tags.
    for (const tag of tags) {
      const result = await processTag(tag, octokit)

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
