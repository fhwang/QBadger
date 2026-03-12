export interface IssueSummary {
  issueNumber: number;
  issueTitle: string;
  issueBody: string | null;
  branchName: string;
}

export function parseIssueFromWebhook(
  body: Record<string, unknown>,
  branchName: string,
): IssueSummary {
  const issue = body.issue as Record<string, unknown>;
  return {
    issueNumber: issue.number as number,
    issueTitle: issue.title as string,
    issueBody: (issue.body as string | null) ?? null,
    branchName,
  };
}
