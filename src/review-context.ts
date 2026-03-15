export interface ReviewComment {
  path: string;
  line: number | null;
  body: string;
}

export interface ReviewContext {
  prNumber: number;
  prTitle: string;
  prBody: string | null;
  branchName: string;
  reviewBody: string | null;
  reviewerLogin: string;
  reviewComments: ReviewComment[];
}
