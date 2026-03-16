import crypto from "node:crypto";
import express, { type Request, type Response, type NextFunction } from "express";
import type { GitHubService } from "./github.js";
import type { Options, SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import type { TranscriptWriter } from "./transcript-writer.js";
import { handleIssuesAssigned } from "./handlers/issues-assigned.js";
import { handleIssueCommentCreated } from "./handlers/issue-comment-created.js";
import { handleCheckSuiteCompleted } from "./handlers/check-suite-completed.js";
import { handlePullRequestReviewSubmitted } from "./handlers/pull-request-review-submitted.js";
import type { HandlerConfig } from "./handler-config.js";
import type { SessionManager } from "./session-manager.js";
import { logger } from "./logger.js";

export type { HandlerConfig } from "./handler-config.js";

export interface HandlerDeps {
  github: GitHubService;
  runSession: (prompt: string, options?: Options, timeoutMs?: number, writer?: TranscriptWriter) => Promise<SDKResultMessage>;
  config: HandlerConfig;
  sessionManager?: SessionManager;
}

const HTTP_UNAUTHORIZED = 401;

type WebhookHandler = (body: Record<string, unknown>, deps: HandlerDeps) => void | Promise<void>;

const HANDLERS: Record<string, Record<string, WebhookHandler>> = {
  issues: {
    assigned: handleIssuesAssigned,
  },
  issue_comment: {
    created: handleIssueCommentCreated,
  },
  check_suite: {
    completed: handleCheckSuiteCompleted,
  },
  pull_request_review: {
    submitted: handlePullRequestReviewSubmitted,
  },
};

function fireAndForget(
  handler: WebhookHandler,
  body: Record<string, unknown>,
  deps: HandlerDeps,
): void {
  const maybePromise = handler(body, deps);
  if (maybePromise instanceof Promise) {
    maybePromise.catch((err: unknown) => {
      logger.error({ err }, "Webhook handler failed");
    });
  }
}

function verifySignature(
  secret: string,
  payload: string,
  signature: string,
): boolean {
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;
  return (
    signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  );
}

function registerSessionManagerRoutes(app: express.Express, sm: SessionManager): void {
  app.post("/kill", (_req: Request, res: Response) => {
    sm.kill();
    res.json({ killed: true });
  });

  app.get("/status", (_req: Request, res: Response) => {
    res.json(sm.status());
  });
}

function registerWebhookRoute(app: express.Express, webhookSecret: string, deps: HandlerDeps): void {
  app.post(
    "/webhook",
    (req: Request, res: Response, next: NextFunction) => {
      const signature = req.headers["x-hub-signature-256"] as string | undefined;
      const rawBody = (req as Request & { rawBody: string }).rawBody;

      if (!signature || !verifySignature(webhookSecret, rawBody, signature)) {
        logger.warn("Webhook signature verification failed");
        res.status(HTTP_UNAUTHORIZED).json({ error: "Invalid signature" });
        return;
      }
      next();
    },
    (req: Request, res: Response) => {
      const event = req.headers["x-github-event"] as string;
      const action = (req.body as Record<string, unknown>).action as string;
      const eventHandlers = HANDLERS[event];
      const handler = eventHandlers?.[action];

      if (handler) {
        logger.info({ event, action }, "Handling webhook event");
        fireAndForget(handler, req.body as Record<string, unknown>, deps);
        res.json({ event, action, handled: true });
      } else {
        logger.info({ event, action }, "Unhandled webhook event");
        res.json({ event, action, handled: false });
      }
    },
  );
}

export function createApp(webhookSecret: string, deps: HandlerDeps): express.Express {
  const app = express();

  app.use(
    express.json({
      verify: (req: Request, _res: Response, buf: Buffer) => {
        (req as Request & { rawBody: string }).rawBody = buf.toString("utf-8");
      },
    }),
  );

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  if (deps.sessionManager) {
    registerSessionManagerRoutes(app, deps.sessionManager);
  }

  registerWebhookRoute(app, webhookSecret, deps);

  return app;
}
