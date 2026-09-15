import { describe, expect, it, vi, beforeEach } from "vitest";

const { cleanupExpiredUsage } = vi.hoisted(() => ({
  cleanupExpiredUsage: vi.fn(),
}));

vi.mock("@/lib/ratelimit", () => ({ cleanupExpiredUsage }));

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.CRON_SECRET;
});

describe("GET /api/cron/cleanup-usage", () => {
  it("rejects Bearer undefined when CRON_SECRET is unset", async () => {
    const { GET } = await import("@/app/api/cron/cleanup-usage/route");
    const res = await GET(
      new Request("http://localhost/api/cron/cleanup-usage", {
        headers: { authorization: "Bearer undefined" },
      }),
    );

    expect(res.status).toBe(401);
    expect(cleanupExpiredUsage).not.toHaveBeenCalled();
  });

  it("allows a request with the configured secret", async () => {
    process.env.CRON_SECRET = "test-secret";
    const { GET } = await import("@/app/api/cron/cleanup-usage/route");
    const res = await GET(
      new Request("http://localhost/api/cron/cleanup-usage", {
        headers: { authorization: "Bearer test-secret" },
      }),
    );

    expect(res.status).toBe(200);
    expect(cleanupExpiredUsage).toHaveBeenCalledOnce();
  });
});
