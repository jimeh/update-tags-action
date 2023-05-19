const nock = require("nock");
const { resolveRefToSha } = require("../index");

describe("resolveRefToSha", () => {
  const octokit = { rest: { repos: { getCommit: jest.fn() } } };
  const owner = "testOwner";
  const repo = "testRepo";
  const ref = "testRef";

  afterEach(() => {
    jest.clearAllMocks();
    nock.cleanAll();
  });

  test("it returns the correct SHA when the API call is successful", async () => {
    const expectedSha = "abc123";
    octokit.rest.repos.getCommit.mockResolvedValueOnce({
      data: { sha: expectedSha },
    });

    const sha = await resolveRefToSha(octokit, owner, repo, ref);

    expect(octokit.rest.repos.getCommit).toHaveBeenCalledWith({
      owner,
      repo,
      ref,
    });
    expect(sha).toEqual(expectedSha);
  });

  test("it throws an error when the API call fails with a 404", async () => {
    octokit.rest.repos.getCommit.mockRejectedValueOnce({
      status: 404,
      message: "Not Found",
    });

    await expect(resolveRefToSha(octokit, owner, repo, ref)).rejects.toThrow(
      "Failed to resolve ref"
    );
  });

  test("it throws an error when the API call fails with a 500", async () => {
    octokit.rest.repos.getCommit.mockRejectedValueOnce({
      status: 500,
      message: "Internal Server Error",
    });

    await expect(resolveRefToSha(octokit, owner, repo, ref)).rejects.toThrow(
      "Failed to resolve ref"
    );
  });

  // Add more test cases as needed for other error scenarios
});
