import { Octokit } from "@octokit/rest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GitHubService } from "../src/github.js";

function createMockOctokit() {
  return {
    rest: {
      issues: {
        get: vi.fn(),
        createComment: vi.fn(),
      },
      git: {
        getRef: vi.fn(),
        createRef: vi.fn(),
      },
      pulls: {
        create: vi.fn(),
        update: vi.fn(),
        listReviewComments: vi.fn(),
      },
      checks: {
        listForRef: vi.fn(),
      },
    },
  };
}

const TARGET_REPO = "my-org/my-repo";

describe("GitHubService", () => {
  let mockOctokit: ReturnType<typeof createMockOctokit>;
  let service: GitHubService;

  beforeEach(() => {
    mockOctokit = createMockOctokit();
    service = new GitHubService(mockOctokit as any, TARGET_REPO);
  });

  describe("getIssue", () => {
    it("returns issue data from octokit", async () => {
      const issueData = { id: 1, title: "Test issue", number: 42 };
      mockOctokit.rest.issues.get.mockResolvedValue({ data: issueData });

      const result = await service.getIssue(42);

      expect(result).toEqual(issueData);
    });

    it("calls octokit with correct params", async () => {
      mockOctokit.rest.issues.get.mockResolvedValue({ data: {} });

      await service.getIssue(42);

      expect(mockOctokit.rest.issues.get).toHaveBeenCalledWith({
        owner: "my-org",
        repo: "my-repo",
        issue_number: 42,
      });
    });
  });

  describe("createBranch", () => {
    it("returns created ref data from octokit", async () => {
      const sha = "abc123";
      const refData = { ref: "refs/heads/feature-branch", object: { sha } };
      mockOctokit.rest.git.getRef.mockResolvedValue({
        data: { object: { sha } },
      });
      mockOctokit.rest.git.createRef.mockResolvedValue({ data: refData });

      const result = await service.createBranch("feature-branch");

      expect(result).toEqual(refData);
    });

    it("gets sha from heads/main and creates ref with correct params", async () => {
      const sha = "abc123";
      mockOctokit.rest.git.getRef.mockResolvedValue({
        data: { object: { sha } },
      });
      mockOctokit.rest.git.createRef.mockResolvedValue({ data: {} });

      await service.createBranch("feature-branch");

      expect(mockOctokit.rest.git.getRef).toHaveBeenCalledWith({
        owner: "my-org",
        repo: "my-repo",
        ref: "heads/main",
      });
      expect(mockOctokit.rest.git.createRef).toHaveBeenCalledWith({
        owner: "my-org",
        repo: "my-repo",
        ref: "refs/heads/feature-branch",
        sha: "abc123",
      });
    });
  });

  describe("createPullRequest", () => {
    it("returns pull request data from octokit", async () => {
      const prData = { id: 1, number: 10, title: "My PR" };
      mockOctokit.rest.pulls.create.mockResolvedValue({ data: prData });

      const result = await service.createPullRequest({
        title: "My PR",
        body: "PR body",
        head: "feature-branch",
        base: "main",
      });

      expect(result).toEqual(prData);
    });

    it("calls octokit with correct params", async () => {
      mockOctokit.rest.pulls.create.mockResolvedValue({ data: {} });

      await service.createPullRequest({
        title: "My PR",
        body: "PR body",
        head: "feature-branch",
        base: "main",
      });

      expect(mockOctokit.rest.pulls.create).toHaveBeenCalledWith({
        owner: "my-org",
        repo: "my-repo",
        title: "My PR",
        body: "PR body",
        head: "feature-branch",
        base: "main",
      });
    });
  });

  describe("updatePullRequest", () => {
    it("returns updated pull request data from octokit", async () => {
      const prData = { id: 1, number: 10, title: "Updated PR" };
      mockOctokit.rest.pulls.update.mockResolvedValue({ data: prData });

      const result = await service.updatePullRequest(10, {
        title: "Updated PR",
      });

      expect(result).toEqual(prData);
    });

    it("calls octokit with correct params", async () => {
      mockOctokit.rest.pulls.update.mockResolvedValue({ data: {} });

      await service.updatePullRequest(10, {
        title: "Updated title",
        body: "Updated body",
      });

      expect(mockOctokit.rest.pulls.update).toHaveBeenCalledWith({
        owner: "my-org",
        repo: "my-repo",
        pull_number: 10,
        title: "Updated title",
        body: "Updated body",
      });
    });
  });

  describe("createComment", () => {
    it("returns comment data from octokit", async () => {
      const commentData = { id: 1, body: "A comment" };
      mockOctokit.rest.issues.createComment.mockResolvedValue({
        data: commentData,
      });

      const result = await service.createComment(42, "A comment");

      expect(result).toEqual(commentData);
    });

    it("calls octokit with correct params", async () => {
      mockOctokit.rest.issues.createComment.mockResolvedValue({ data: {} });

      await service.createComment(42, "A comment");

      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith({
        owner: "my-org",
        repo: "my-repo",
        issue_number: 42,
        body: "A comment",
      });
    });
  });

  describe("listReviewComments", () => {
    it("returns review comments data from octokit", async () => {
      const comments = [{ id: 1, body: "Review comment" }];
      mockOctokit.rest.pulls.listReviewComments.mockResolvedValue({
        data: comments,
      });

      const result = await service.listReviewComments(10);

      expect(result).toEqual(comments);
    });

    it("calls octokit with correct params", async () => {
      mockOctokit.rest.pulls.listReviewComments.mockResolvedValue({
        data: [],
      });

      await service.listReviewComments(10);

      expect(mockOctokit.rest.pulls.listReviewComments).toHaveBeenCalledWith({
        owner: "my-org",
        repo: "my-repo",
        pull_number: 10,
      });
    });
  });

  describe("listCheckRunsForRef", () => {
    it("returns check runs data from octokit", async () => {
      const checkData = {
        total_count: 1,
        check_runs: [{ id: 1, name: "CI" }],
      };
      mockOctokit.rest.checks.listForRef.mockResolvedValue({
        data: checkData,
      });

      const result = await service.listCheckRunsForRef("abc123");

      expect(result).toEqual(checkData);
    });

    it("calls octokit with correct params", async () => {
      mockOctokit.rest.checks.listForRef.mockResolvedValue({ data: {} });

      await service.listCheckRunsForRef("abc123");

      expect(mockOctokit.rest.checks.listForRef).toHaveBeenCalledWith({
        owner: "my-org",
        repo: "my-repo",
        ref: "abc123",
      });
    });
  });
});

describe("GitHubService integration", () => {
  const shouldRun =
    process.env.RUN_INTEGRATION_TESTS === "true" &&
    Boolean(process.env.GITHUB_TOKEN);

  it.skipIf(!shouldRun)(
    "reads a real issue from lost-atlas/lost-atlas",
    async () => {
      const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
      const service = new GitHubService(octokit, "lost-atlas/lost-atlas");
      const issue = await service.getIssue(1);

      expect(issue.number).toBe(1);
      expect(issue.title).toBeDefined();
    },
  );
});
