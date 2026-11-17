import { beforeEach, describe, expect, it, vi } from "vitest";

describe("useManageStore", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("reads the legacy vl_manage key on load and ignores junk", async () => {
    localStorage.setItem("vl_manage", JSON.stringify({ slug: "shop", key: "k1" }));
    const { useManageStore } = await import("./manage-store");
    expect(useManageStore.getState().creds).toEqual({ slug: "shop", key: "k1" });

    vi.resetModules();
    localStorage.setItem("vl_manage", "{not json");
    const again = await import("./manage-store");
    expect(again.useManageStore.getState().creds).toBeNull();
  });

  it("saves and clears", async () => {
    const { useManageStore, manageUrl } = await import("./manage-store");
    useManageStore.getState().setCreds({ slug: "a b", key: "k&1" });
    expect(JSON.parse(localStorage.getItem("vl_manage") ?? "null")).toEqual({
      slug: "a b",
      key: "k&1",
    });
    expect(manageUrl({ slug: "a b", key: "k&1" })).toBe(
      `${location.origin}/?manage=a%20b&key=k%261`,
    );
    useManageStore.getState().clear();
    expect(localStorage.getItem("vl_manage")).toBeNull();
    expect(useManageStore.getState().creds).toBeNull();
  });
});
