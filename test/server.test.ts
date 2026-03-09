import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import request from "supertest";
import { createApp } from "../src/server.js";

const WEBHOOK_SECRET = "test-webhook-secret";

function sign(body: string, secret: string): string {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(body);
  return `sha256=${hmac.digest("hex")}`;
}

function webhookRequest(app: Express.Application, {
  body,
  event = "issues",
  signature,
}: {
  body: Record<string, unknown>;
  event?: string;
  signature?: string;
}) {
  const rawBody = JSON.stringify(body);
  const sig = signature ?? sign(rawBody, WEBHOOK_SECRET);
  return request(app)
    .post("/webhook")
    .set("content-type", "application/json")
    .set("x-github-event", event)
    .set("x-hub-signature-256", sig)
    .send(rawBody);
}

describe("Health check", () => {
  it("returns 200 with status ok", async () => {
    const app = createApp(WEBHOOK_SECRET);
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("Webhook signature verification", () => {
  it("rejects requests with missing signature", async () => {
    const app = createApp(WEBHOOK_SECRET);
    const res = await request(app)
      .post("/webhook")
      .set("content-type", "application/json")
      .set("x-github-event", "issues")
      .send(JSON.stringify({ action: "assigned" }));
    expect(res.status).toBe(401);
  });

  it("rejects requests with invalid signature", async () => {
    const app = createApp(WEBHOOK_SECRET);
    const res = await webhookRequest(app, {
      body: { action: "assigned" },
      signature: "sha256=invalid",
    });
    expect(res.status).toBe(401);
  });

  it("accepts requests with valid signature", async () => {
    const app = createApp(WEBHOOK_SECRET);
    const res = await webhookRequest(app, {
      body: { action: "assigned" },
      event: "issues",
    });
    expect(res.status).toBe(200);
  });
});

describe("Event routing", () => {
  it("routes issues.assigned events", async () => {
    const app = createApp(WEBHOOK_SECRET);
    const res = await webhookRequest(app, {
      body: { action: "assigned" },
      event: "issues",
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      event: "issues",
      action: "assigned",
      handled: true,
    });
  });

  it("routes issue_comment.created events", async () => {
    const app = createApp(WEBHOOK_SECRET);
    const res = await webhookRequest(app, {
      body: { action: "created" },
      event: "issue_comment",
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      event: "issue_comment",
      action: "created",
      handled: true,
    });
  });

  it("routes check_suite.completed events", async () => {
    const app = createApp(WEBHOOK_SECRET);
    const res = await webhookRequest(app, {
      body: { action: "completed" },
      event: "check_suite",
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      event: "check_suite",
      action: "completed",
      handled: true,
    });
  });

  it("routes pull_request_review.submitted events", async () => {
    const app = createApp(WEBHOOK_SECRET);
    const res = await webhookRequest(app, {
      body: { action: "submitted" },
      event: "pull_request_review",
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      event: "pull_request_review",
      action: "submitted",
      handled: true,
    });
  });

  it("returns 200 with handled:false for unhandled event types", async () => {
    const app = createApp(WEBHOOK_SECRET);
    const res = await webhookRequest(app, {
      body: { action: "opened" },
      event: "pull_request",
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      event: "pull_request",
      action: "opened",
      handled: false,
    });
  });

  it("returns 200 with handled:false for unhandled action on handled event", async () => {
    const app = createApp(WEBHOOK_SECRET);
    const res = await webhookRequest(app, {
      body: { action: "opened" },
      event: "issues",
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      event: "issues",
      action: "opened",
      handled: false,
    });
  });
});
