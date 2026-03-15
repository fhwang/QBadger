import type { Octokit, RestEndpointMethodTypes } from "@octokit/rest";

type PullsCreateParams =
  RestEndpointMethodTypes["pulls"]["create"]["parameters"];
type PullsUpdateParams =
  RestEndpointMethodTypes["pulls"]["update"]["parameters"];

export class GitHubService {
  private readonly owner: string;
  private readonly repo: string;
  private readonly octokit: Octokit;

  constructor(octokit: Octokit, targetRepo: string) {
    const slashIndex = targetRepo.indexOf("/");
    if (slashIndex < 1 || slashIndex === targetRepo.length - 1) {
      throw new Error(
        `Invalid targetRepo format: "${targetRepo}" (expected "owner/repo")`,
      );
    }
    this.owner = targetRepo.slice(0, slashIndex);
    this.repo = targetRepo.slice(slashIndex + 1);
    this.octokit = octokit;
  }

  async getIssue(issueNumber: number) {
    const { data } = await this.octokit.rest.issues.get({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
    });
    return data;
  }

  async createBranch(branchName: string) {
    const { data: refData } = await this.octokit.rest.git.getRef({
      owner: this.owner,
      repo: this.repo,
      ref: "heads/main",
    });
    const { data } = await this.octokit.rest.git.createRef({
      owner: this.owner,
      repo: this.repo,
      ref: `refs/heads/${branchName}`,
      sha: refData.object.sha,
    });
    return data;
  }

  async createPullRequest(
    params: Pick<PullsCreateParams, "title" | "body" | "head" | "base">,
  ) {
    const { data } = await this.octokit.rest.pulls.create({
      owner: this.owner,
      repo: this.repo,
      title: params.title,
      body: params.body,
      head: params.head,
      base: params.base,
    });
    return data;
  }

  async updatePullRequest(
    pullNumber: number,
    params: Pick<PullsUpdateParams, "title" | "body">,
  ) {
    const { data } = await this.octokit.rest.pulls.update({
      owner: this.owner,
      repo: this.repo,
      pull_number: pullNumber,
      ...params,
    });
    return data;
  }

  async createComment(issueNumber: number, body: string) {
    const { data } = await this.octokit.rest.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body,
    });
    return data;
  }

  async getPullRequest(pullNumber: number) {
    const { data } = await this.octokit.rest.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: pullNumber,
    });
    return data;
  }

  async getReview(pullNumber: number, reviewId: number) {
    const { data } = await this.octokit.rest.pulls.getReview({
      owner: this.owner,
      repo: this.repo,
      pull_number: pullNumber,
      review_id: reviewId,
    });
    return data;
  }

  async listReviewComments(pullNumber: number) {
    const { data } = await this.octokit.rest.pulls.listReviewComments({
      owner: this.owner,
      repo: this.repo,
      pull_number: pullNumber,
    });
    return data;
  }

  async findPullRequestForBranch(branchName: string) {
    const { data } = await this.octokit.rest.pulls.list({
      owner: this.owner,
      repo: this.repo,
      head: `${this.owner}:${branchName}`,
      state: "open",
    });
    return data.length > 0 ? data[0] : null;
  }

  async listCheckRunsForRef(ref: string) {
    const { data } = await this.octokit.rest.checks.listForRef({
      owner: this.owner,
      repo: this.repo,
      ref,
    });
    return data;
  }
}
