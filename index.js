const core = require("@actions/core");
const github = require("@actions/github");
const csv = require("csv-parse/sync");
const semver = require("semver");
const handlebars = require("handlebars");

async function run() {
  try {
    const tagsInput = core.getInput("tags", { required: true });
    const defaultRef = core.getInput("ref");
    const inputVersion = core.getInput("parse");
    const whenExists = core.getInput("when_exists") || "update";
    const whenParseFails = core.getInput("when_parse_fails") || "fail";
    const skipPrerelease = core.getInput("skip_prerelease") === "true";
    const token = core.getInput("github_token", { required: true });

    validateInput("when_exists", whenExists, [
      "update",
      "skip",
      "warn",
      "fail",
    ]);
    validateInput("when_parse_fails", whenParseFails, ["warn", "fail"]);

    const { owner, repo } = github.context.repo;
    const octokit = github.getOctokit(token);

    const tagsWithRefs = buildTags(
      core,
      tagsInput,
      defaultRef,
      inputVersion,
      whenParseFails,
      skipPrerelease
    );
    const tags = await resolveTags(core, octokit, owner, repo, tagsWithRefs);

    const created = [];
    const updated = [];

    // Create or update all tags
    for (const tagName in tags) {
      const sha = tags[tagName];

      const res = await createOrUpdateTag(
        core,
        octokit,
        owner,
        repo,
        tagName,
        sha,
        whenExists
      );

      if (res === "created") {
        created.push(tagName);
      } else if (res === "updated") {
        updated.push(tagName);
      }
    }

    core.setOutput("created", created);
    core.setOutput("updated", updated);
    core.setOutput("tags", created.concat(updated));
  } catch (error) {
    core.setFailed(`Action failed with error: ${error}`);
  }
}

function validateInput(name, value, allowedValues) {
  if (!allowedValues.includes(value)) {
    throw new Error(
      `Invalid value '${value}' for input '${name}'. ` +
      `Allowed values are: ${allowedValues.join(", ")}`
    );
  }
}

function buildTags(
  core,
  tags,
  defaultRef,
  inputVersion,
  whenParseFail,
  skipPrerelease
) {
  const list = csv
    .parse(tags, { delimiter: ",", trim: true, relax_column_count: true })
    .flat();

  const parsedTags = {};
  const version = parseVersion(core, inputVersion, whenParseFail);

  for (const item of list) {
    const [tag, ref] = item.split(":").map((s) => s.trim());
    const renderedTag = renderTag(core, tag, version, skipPrerelease);

    if (renderedTag) {
      parsedTags[renderedTag] = ref || defaultRef;
    }
  }

  return parsedTags;
}

function parseVersion(core, input, whenParseFail) {
  if (!input) {
    return;
  }
  const originalInput = input;

  if (input.includes("/")) {
    input = input.split("/").pop();
  }

  const version = semver.parse(input);
  if (version) {
    core.info(
      `Parsed input '${originalInput}' as semantic version: ${version.version}`
    );
    return version;
  }

  if (whenParseFail === "fail") {
    throw new Error(`Failed to parse '${input}' as semantic version.`);
  }

  core.warning(
    `Failed to parse '${input}'. Template-based tags will be skipped.`
  );
  return;
}

function renderTag(core, tag, version, skipPrerelease) {
  if (!version) {
    if (!tag.includes("{{")) {
      return tag;
    }

    core.warning(
      `Skipping templated tag '${tag}'. No version information is available.`
    );
    return;
  }

  if (version && version.includePrerelease && !skipPrerelease) {
    core.info(
      `Skipping templated tag '${tag}'. ` +
      `Parsed version '${version.version}' is a prerelease.`
    );
    return;
  }

  const template = handlebars.compile(tag);
  const emptyTag = template(semver.parse(""));
  const renderedTag = template(version);

  if (emptyTag === renderedTag) {
    core.info(
      `Skipping templated tag '${tag}', all used template variables are empty.`
    );
    return;
  }
  if (renderedTag.includes("{{")) {
    throw new Error(
      `Templated tag '${tag}' could not be renderd, some template ` +
      `variables could be resolved. Rendered to '${renderedTag}'.`
    );
  }

  return renderedTag;
}

async function resolveTags(core, octokit, owner, repo, tags) {
  const uniqueRefs = new Set();
  for (const tagName in tags) {
    uniqueRefs.add(tags[tagName]);
  }

  core.info(
    `Looking up commit details for: '${Array.from(uniqueRefs).join("', '")}'`
  );
  const refToSha = {};
  for (const ref of uniqueRefs) {
    const sha = await resolveRefToSha(core, octokit, owner, repo, ref);
    if (sha) {
      refToSha[ref] = sha;
    }
  }

  const tagShas = {};
  for (const tagName in tags) {
    const ref = tags[tagName];
    const sha = refToSha[ref];

    if (!sha) {
      core.warning(
        `Skipping tag '${tagName}'. No commit details found for '${ref}'.`
      );
      continue;
    }

    tagShas[tagName] = sha;
  }

  return tagShas;
}

async function createOrUpdateTag(
  core,
  octokit,
  owner,
  repo,
  tagName,
  sha,
  whenExists
) {
  try {
    const existing = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `tags/${tagName}`,
    });

    if (whenExists === "update") {
      const existingSHA = existing.data.object.sha;
      if (existingSHA === sha) {
        core.info(`Tag '${tagName}' already exists with desired SHA ${sha}.`);
        return;
      }

      core.info(
        `Tag '${tagName}' exists, updating to SHA ${sha} ` +
        `(was ${existingSHA}).`
      );
      await octokit.rest.git.updateRef({
        owner,
        repo,
        ref: `tags/${tagName}`,
        sha,
        force: true,
      });

      return "updated";
    } else if (whenExists === "skip") {
      core.info(`Tag '${tagName}' exists, skipping.`);
      return "skipped";
    } else if (whenExists === "warn") {
      core.warning(`Tag '${tagName}' exists, skipping.`);
      return "skipped";
    } else {
      throw new Error(`Tag '${tagName}' already exists.`);
    }
  } catch (error) {
    if (error.status === 404) {
      core.info(`Tag '${tagName}' does not exist, creating with SHA ${sha}.`);
      await octokit.rest.git.createRef({
        owner,
        repo,
        ref: `refs/tags/${tagName}`,
        sha,
      });

      return "created";
    } else {
      throw error;
    }
  }
}

async function resolveRefToSha(core, octokit, owner, repo, ref) {
  try {
    const {
      data: { sha },
    } = await octokit.rest.repos.getCommit({ owner, repo, ref });

    return sha;
  } catch (error) {
    core.warning(`Failed to fetch commit details for '${ref}'.`);
    return;
  }
}

// Export run function for testing
module.exports = {
  run,
  parseVersion,
  buildTags,
  renderTag,
  resolveTags,
  createOrUpdateTag,
  resolveRefToSha,
};

// Call run function to start action only if this file is being run directly.
if (require.main === module) {
  run();
}
