const core = require("@actions/core");
const github = require("@actions/github");
const { parse } = require("csv-parse/sync");

async function run() {
  try {
    const tagsInput = core.getInput("tags", { required: true });
    const defaultRef = core.getInput("ref");
    const token = core.getInput("github_token", { required: true });
    const whenExists = core.getInput("when_exists") || "update";

    const octokit = github.getOctokit(token);

    const parsedTags = parse(tagsInput, {
      delimiter: ",",
      trim: true,
      relax_column_count: true,
    }).flat();

    const { owner, repo } = github.context.repo;

    const uniqueRefs = new Set();
    const refToSha = {};
    const tags = {};

    for (const tag of parsedTags) {
      const [t, tagRef] = tag.split(":").map((s) => s.trim());
      const ref = tagRef || defaultRef;
      tags[t] = ref;
      uniqueRefs.add(ref);
    }

    // Pre-resolve all unique refs
    for (const ref of uniqueRefs) {
      refToSha[ref] = await resolveRefToSha(octokit, owner, repo, ref);
    }

    const created = [];
    const updated = [];

    // Create or update all tags by looping through tags
    for (const tagName in tags) {
      if (!tagName) {
        core.setFailed(`Invalid tag: '${tagName}'`);
        return;
      }

      const tagRef = tags[tagName];
      const sha = refToSha[tagRef];

      try {
        // Check if the ref exists
        const existing = await octokit.rest.git.getRef({
          owner,
          repo,
          ref: `tags/${tagName}`,
        });

        // If the ref exists, decide action based on 'when_exists'
        if (whenExists === "update") {
          const existingSHA = existing.data.object.sha;
          if (existingSHA === sha) {
            core.info(
              `Tag '${tagName}' already exists with desired SHA ${sha}.`
            );
            continue;
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
          updated.push(tagName);
        } else if (whenExists === "skip") {
          core.info(`Tag '${tagName}' exists, skipping.`);
        } else if (whenExists === "fail") {
          core.setFailed(`Tag '${tagName}' already exists.`);
          return;
        } else {
          core.setFailed(
            `Invalid value for 'when_exists': '${whenExists}'. ` +
            `Valid values are 'update', 'skip', and 'fail'.`
          );
          return;
        }
      } catch (error) {
        if (error.status !== 404) {
          throw error;
        }

        // If the ref doesn't exist, create it
        core.info(`Tag '${tagName}' does not exist, creating with SHA ${sha}.`);
        await octokit.rest.git.createRef({
          owner,
          repo,
          ref: `refs/tags/${tagName}`,
          sha,
        });
        created.push(tagName);
      }
    }

    core.setOutput("created", created);
    core.setOutput("updated", updated);
    core.setOutput("tags", created.concat(updated));
  } catch (error) {
    core.setFailed(`Action failed with error: ${error}`);
  }
}

async function resolveRefToSha(octokit, owner, repo, ref) {
  try {
    const {
      data: { sha },
    } = await octokit.rest.repos.getCommit({
      owner,
      repo,
      ref,
    });

    return sha;
  } catch (error) {
    core.setFailed(`Failed to resolve ref '${ref}' to a SHA: ${error}`);
  }
}

run();
