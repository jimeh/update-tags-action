/**
 * Unit tests for the logger module, src/logger.ts
 */
import { jest } from '@jest/globals'
import * as core from './fixtures/core.js'

jest.unstable_mockModule('@actions/core', () => core)

const { createLogger } = await import('../src/logger.js')

describe('createLogger', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  describe('without prefix', () => {
    it('calls core.debug with the message', () => {
      const log = createLogger()
      log.debug('test debug message')
      expect(core.debug).toHaveBeenCalledWith('test debug message')
    })

    it('calls core.info with the message', () => {
      const log = createLogger()
      log.info('test info message')
      expect(core.info).toHaveBeenCalledWith('test info message')
    })

    it('calls core.notice with string message', () => {
      const log = createLogger()
      log.notice('test notice message')
      expect(core.notice).toHaveBeenCalledWith('test notice message', undefined)
    })

    it('calls core.notice with Error unchanged', () => {
      const log = createLogger()
      const error = new Error('test error')
      log.notice(error)
      expect(core.notice).toHaveBeenCalledWith(error, undefined)
    })

    it('calls core.notice with properties', () => {
      const log = createLogger()
      const props = { title: 'Notice Title' }
      log.notice('test notice', props)
      expect(core.notice).toHaveBeenCalledWith('test notice', props)
    })

    it('calls core.warning with string message', () => {
      const log = createLogger()
      log.warning('test warning message')
      expect(core.warning).toHaveBeenCalledWith(
        'test warning message',
        undefined
      )
    })

    it('calls core.warning with Error unchanged', () => {
      const log = createLogger()
      const error = new Error('warning error')
      log.warning(error)
      expect(core.warning).toHaveBeenCalledWith(error, undefined)
    })

    it('calls core.warning with properties', () => {
      const log = createLogger()
      const props = { title: 'Warning Title' }
      log.warning('test warning', props)
      expect(core.warning).toHaveBeenCalledWith('test warning', props)
    })

    it('calls core.error with string message', () => {
      const log = createLogger()
      log.error('test error message')
      expect(core.error).toHaveBeenCalledWith('test error message', undefined)
    })

    it('calls core.error with Error unchanged', () => {
      const log = createLogger()
      const error = new Error('error error')
      log.error(error)
      expect(core.error).toHaveBeenCalledWith(error, undefined)
    })

    it('calls core.error with properties', () => {
      const log = createLogger()
      const props = { title: 'Error Title' }
      log.error('test error', props)
      expect(core.error).toHaveBeenCalledWith('test error', props)
    })
  })

  describe('with prefix', () => {
    it('prefixes debug messages', () => {
      const log = createLogger('[dry-run] ')
      log.debug('test debug message')
      expect(core.debug).toHaveBeenCalledWith('[dry-run] test debug message')
    })

    it('prefixes info messages', () => {
      const log = createLogger('[dry-run] ')
      log.info('test info message')
      expect(core.info).toHaveBeenCalledWith('[dry-run] test info message')
    })

    it('prefixes notice string messages', () => {
      const log = createLogger('[dry-run] ')
      log.notice('test notice message')
      expect(core.notice).toHaveBeenCalledWith(
        '[dry-run] test notice message',
        undefined
      )
    })

    it('wraps notice Error with prefixed message and cause', () => {
      const log = createLogger('[dry-run] ')
      const original = new Error('notice error')
      log.notice(original)

      expect(core.notice).toHaveBeenCalledTimes(1)
      const [wrapped, props] = core.notice.mock.calls[0]
      expect(wrapped).toBeInstanceOf(Error)
      expect((wrapped as Error).message).toBe('[dry-run] notice error')
      expect((wrapped as Error).cause).toBe(original)
      expect((wrapped as Error).stack).toBe(original.stack)
      expect(props).toBeUndefined()
    })

    it('prefixes warning string messages', () => {
      const log = createLogger('[dry-run] ')
      log.warning('test warning message')
      expect(core.warning).toHaveBeenCalledWith(
        '[dry-run] test warning message',
        undefined
      )
    })

    it('wraps warning Error with prefixed message and cause', () => {
      const log = createLogger('[dry-run] ')
      const original = new Error('warning error')
      log.warning(original)

      expect(core.warning).toHaveBeenCalledTimes(1)
      const [wrapped, props] = core.warning.mock.calls[0]
      expect(wrapped).toBeInstanceOf(Error)
      expect((wrapped as Error).message).toBe('[dry-run] warning error')
      expect((wrapped as Error).cause).toBe(original)
      expect((wrapped as Error).stack).toBe(original.stack)
      expect(props).toBeUndefined()
    })

    it('prefixes error string messages', () => {
      const log = createLogger('[dry-run] ')
      log.error('test error message')
      expect(core.error).toHaveBeenCalledWith(
        '[dry-run] test error message',
        undefined
      )
    })

    it('wraps error Error with prefixed message and cause', () => {
      const log = createLogger('[dry-run] ')
      const original = new Error('error error')
      log.error(original)

      expect(core.error).toHaveBeenCalledTimes(1)
      const [wrapped, props] = core.error.mock.calls[0]
      expect(wrapped).toBeInstanceOf(Error)
      expect((wrapped as Error).message).toBe('[dry-run] error error')
      expect((wrapped as Error).cause).toBe(original)
      expect((wrapped as Error).stack).toBe(original.stack)
      expect(props).toBeUndefined()
    })

    it('preserves properties when prefixing', () => {
      const log = createLogger('[test] ')
      const props = { title: 'Test Title', file: 'test.ts', startLine: 10 }
      log.warning('message with props', props)
      expect(core.warning).toHaveBeenCalledWith(
        '[test] message with props',
        props
      )
    })
  })

  describe('with empty prefix', () => {
    it('behaves the same as no prefix', () => {
      const log = createLogger('')
      log.info('test message')
      expect(core.info).toHaveBeenCalledWith('test message')
    })
  })
})
