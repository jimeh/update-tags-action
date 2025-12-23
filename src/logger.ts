import * as core from '@actions/core'
import type { AnnotationProperties } from '@actions/core'

/**
 * Logger interface that mirrors @actions/core logging functions.
 */
export interface Logger {
  debug: (message: string) => void
  info: (message: string) => void
  notice: (message: string | Error, properties?: AnnotationProperties) => void
  warning: (message: string | Error, properties?: AnnotationProperties) => void
  error: (message: string | Error, properties?: AnnotationProperties) => void
}

/**
 * Create a logger that optionally prefixes all messages.
 *
 * @param prefix - Optional prefix to prepend to all log messages
 * @returns Logger instance with prefixed messages
 */
export function createLogger(prefix: string = ''): Logger {
  const prefixMessage = (msg: string | Error): string | Error => {
    if (!prefix) {
      return msg
    }
    if (typeof msg === 'string') {
      return `${prefix}${msg}`
    }
    // Wrap Error with prefixed message, preserving the original as cause
    const wrapped = new Error(`${prefix}${msg.message}`, { cause: msg })
    if (msg.stack) {
      wrapped.stack = msg.stack
    }
    return wrapped
  }

  return {
    debug: (message: string) => core.debug(`${prefix}${message}`),
    info: (message: string) => core.info(`${prefix}${message}`),
    notice: (message: string | Error, properties?: AnnotationProperties) =>
      core.notice(prefixMessage(message), properties),
    warning: (message: string | Error, properties?: AnnotationProperties) =>
      core.warning(prefixMessage(message), properties),
    error: (message: string | Error, properties?: AnnotationProperties) =>
      core.error(prefixMessage(message), properties)
  }
}
