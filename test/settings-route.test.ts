import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));
vi.mock("@/db/queries", () => ({
  getSettings: vi.fn(),
  upsertHskLevel: vi.fn(),
}));

import { auth } from "@clerk/nextjs/server";
import { getSettings, upsertHskLevel } from "@/db/queries";

const mockAuth = vi.mocked(auth);
const mockGetSettings = vi.mocked(getSettings);
const mockUpsertHskLevel = vi.mocked(upsertHskLevel);

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: "user_123" } as never);
});

describe("GET /api/settings", () => {
  it("returns the settings getSettings resolves, scoped to the authed user", async () => {
    mockGetSettings.mockResolvedValue({ hskLevel: 3 });
    const { GET } = await import("@/app/api/settings/route");
    const res = await GET();
    expect(await res.json()).toEqual({ hskLevel: 3 });
    expect(mockGetSettings).toHaveBeenCalledWith("user_123");
  });
});

describe("PATCH /api/settings", () => {
  it("calls upsertHskLevel with the authed user and the valid level, and returns it", async () => {
    const { PATCH } = await import("@/app/api/settings/route");
    const res = await PATCH(
      new Request("http://localhost/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ hskLevel: 5 }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hskLevel: 5 });
    expect(mockUpsertHskLevel).toHaveBeenCalledWith("user_123", 5);
  });

  it("rejects an out-of-range hskLevel with 400 before calling upsertHskLevel", async () => {
    const { PATCH } = await import("@/app/api/settings/route");
    const res = await PATCH(
      new Request("http://localhost/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ hskLevel: 7 }),
      }),
    );
    expect(res.status).toBe(400);
    expect(mockUpsertHskLevel).not.toHaveBeenCalled();
  });

  it("rejects a missing hskLevel field with 400", async () => {
    const { PATCH } = await import("@/app/api/settings/route");
    const res = await PATCH(
      new Request("http://localhost/api/settings", {
        method: "PATCH",
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
    expect(mockUpsertHskLevel).not.toHaveBeenCalled();
  });
});
