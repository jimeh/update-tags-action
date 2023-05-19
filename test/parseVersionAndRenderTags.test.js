const semver = require("semver");
const handlebars = require("handlebars");
const { parseVersionAndRenderTags } = require("../index"); // replace 'your-file' with the actual file name

describe("parseVersionAndRenderTags", () => {
  it("handles empty parseVersion input", () => {
    const tags = "v1.0.0";
    expect(parseVersionAndRenderTags("", tags)).toBe(tags);
  });

  it('removes "refs/tags/" prefix from parseVersion', () => {
    const parseVersion = "refs/tags/v1.2.3";
    const tags = "M={{major}}, m={{minor}}, p={{patch}}";
    const expectedTags = "M=1, m=2, p=3";
    expect(parseVersionAndRenderTags(parseVersion, tags)).toBe(expectedTags);
  });

  it("throws an error if parseVersion is invalid and tags contains placeholders", () => {
    const parseVersion = "invalid-version-string";
    const tags = "{{major}}.{{minor}}.{{patch}}";
    expect(() => parseVersionAndRenderTags(parseVersion, tags)).toThrow(
      `Invalid version string: ${parseVersion}`
    );
  });

  it("does not throw an error if parseVersion is invalid and tags does not contain placeholders", () => {
    const parseVersion = "invalid-version-string";
    const tags = "v1.0.0";
    expect(parseVersionAndRenderTags(parseVersion, tags)).toBe(tags);
  });

  it("renders the tags template with the parsed version", () => {
    const parseVersion = "v1.2.3";
    const tags = "M={{major}}, m={{minor}}, p={{patch}}";
    const expectedTags = "M=1, m=2, p=3";
    expect(parseVersionAndRenderTags(parseVersion, tags)).toBe(expectedTags);
  });
});
