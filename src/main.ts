import * as core from '@actions/core'
import * as github from '@actions/github'
import { getInputs } from './inputs.js'
import { planTagOperations, executeTagOperation } from './tags.js'

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const inputs = getInputs()
    const octokit = github.getOctokit(inputs.token)
    const operations = await planTagOperations(inputs, octokit)

    const created: string[] = []
    const updated: string[] = []
    const skipped: string[] = []

    // Execute all planned operations.
    for (const operation of operations) {
      await executeTagOperation(operation, octokit)

      if (operation.operation === 'create') {
        created.push(operation.name)
      } else if (operation.operation === 'update') {
        updated.push(operation.name)
      } else if (operation.operation === 'skip') {
        skipped.push(operation.name)
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
