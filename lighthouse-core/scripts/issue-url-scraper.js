/**
 * @license Copyright 2021 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */

/**
 * @fileoverview
 * List URLs mentioned in all comments in an issue, including referenced issues.
 *
 * Make a token: https://github.com/settings/tokens
 *
 * Ex: GH_TOKEN_ISSUE_SCRAPER=... node lighthouse-core/scripts/issue-url-scraper.js 6512
 */

'use strict';

/* eslint-disable no-console */

const ARGS = {
  number: process.argv[2],
  token: process.env.GH_TOKEN_ISSUE_SCRAPER,
};

const {graphql} = require('@octokit/graphql');

/**
 * @param {string} qs
 */
async function query(qs) {
  return await graphql(qs, {
    owner: 'GooglChrome',
    repo: 'Lighthouse',
    headers: {
      authorization: `token ${ARGS.token}`,
    },
  });
}

/**
 * @param {string} comment
 */
function parseCommentForUrl(comment) {
  // https://stackoverflow.com/a/29288898
  // eslint-disable-next-line max-len
  const matches = /(?:(?:https?|file):\/\/|www\.)(?:\([-A-Z0-9+&@#/%=~_|$?!:,.]*\)|[-A-Z0-9+&@#/%=~_|$?!:,.])*(?:\([-A-Z0-9+&@#/%=~_|$?!:,.]*\)|[A-Z0-9+&@#/%=~_|$])/igm.exec(comment);
  if (!matches) return null;

  try {
    const url = new URL(matches[0]);

    if (url.href.match(/localhost|github.com/)) {
      return null;
    }

    return url.href;
  } catch (_) {
    return null;
  }
}

/**
 * @param {number} number
 * @return {Promise<string[]>}
 */
async function getCommentsForIssue(number) {
  const response = await query(`query {
    repository(owner: "GoogleChrome", name: "Lighthouse") {
      issue(number: ${number}) {
        body

        comments(first: 100) {
          nodes {
            body
          }
        }
      }
    }
  }`);

  const first = response.repository.issue.body;
  // @ts-expect-error: octokit graphql has no types.
  const rest = response.repository.issue.comments.nodes.map((node => node.body));
  return [first, ...rest];
}

async function main() {
  const response = await query(`query {
    repository(owner: "GoogleChrome", name: "Lighthouse") {
      issue(number: ${ARGS.number}) {
        title

        timelineItems(first: 250) {
          nodes {
            ... on CrossReferencedEvent {
              source {
                ... on Issue {
                  number
                  title
                }
              }
            }
          }
        }
      }
    }
  }`);

  const issues = response.repository.issue.timelineItems.nodes
    // @ts-expect-error: octokit graphql has no types.
    .filter((node) => node.source && node.source.number)
    .filter(Boolean)
    // @ts-expect-error: octokit graphql has no types.
    .map((node) => node.source);
  issues.unshift({number: ARGS.number});

  console.log(`title: ${response.repository.issue.title}`);
  console.log(`parsing ${issues.length} issues for URLs`);

  /** @type {Set<string>} */
  const urls = new Set();
  for (const issue of issues) {
    for (const comment of await getCommentsForIssue(issue.number)) {
      const url = parseCommentForUrl(comment);
      if (url) urls.add(url);
    }
  }

  for (const url of urls) {
    console.log(url);
  }
}

main();