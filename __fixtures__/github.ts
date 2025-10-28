import { jest } from '@jest/globals'

export const mockOctokit = {
  rest: {
    git: {
      getRef: jest.fn<(args: unknown) => Promise<unknown>>(),
      createRef: jest.fn<(args: unknown) => Promise<unknown>>(),
      updateRef: jest.fn<(args: unknown) => Promise<unknown>>(),
      createTag: jest.fn<(args: unknown) => Promise<unknown>>(),
      getTag: jest.fn<(args: unknown) => Promise<unknown>>()
    },
    repos: {
      getCommit: jest.fn<(args: unknown) => Promise<unknown>>()
    }
  }
}

export const getOctokit = jest
  .fn<(token: string) => typeof mockOctokit>()
  .mockReturnValue(mockOctokit)

export const context = {
  repo: {
    owner: 'test-owner',
    repo: 'test-repo'
  }
}
