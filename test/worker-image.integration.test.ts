import { describe, it, expect } from "vitest";
import { ContainerRunner } from "../src/container-runner.js";
import Dockerode from "dockerode";

const RUN_INTEGRATION = process.env.RUN_INTEGRATION_TESTS === "true";
const WORKER_IMAGE = "qbadger-worker:latest";

describe.skipIf(!RUN_INTEGRATION)("worker image integration", () => {
  const docker = new Dockerode();
  const runner = new ContainerRunner(docker);

  it("has node 22 installed", async () => {
    const result = await runner.run({
      image: WORKER_IMAGE,
      command: ["node", "--version"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.logs).toMatch(/v22\./);
  }, 30_000);

  it("has git installed", async () => {
    const result = await runner.run({
      image: WORKER_IMAGE,
      command: ["git", "--version"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.logs).toMatch(/git version/);
  }, 30_000);

  it("has gh CLI installed", async () => {
    const result = await runner.run({
      image: WORKER_IMAGE,
      command: ["gh", "--version"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.logs).toMatch(/gh version/);
  }, 30_000);

  it("has pnpm installed", async () => {
    const result = await runner.run({
      image: WORKER_IMAGE,
      command: ["pnpm", "--version"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.logs).toMatch(/10\./);
  }, 30_000);

  it("has claude CLI installed", async () => {
    const result = await runner.run({
      image: WORKER_IMAGE,
      command: ["claude", "--version"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.logs).toMatch(/\d+\.\d+/);
  }, 30_000);

  it("runs as non-root user", async () => {
    const result = await runner.run({
      image: WORKER_IMAGE,
      command: ["whoami"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.logs).toMatch(/worker/);
  }, 30_000);
});
