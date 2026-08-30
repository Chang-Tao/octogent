import { describe, expect, it } from "vitest";

import { normalizeFrontendUiStateSnapshot } from "../src/app/uiStateNormalizers";

describe("normalizeFrontendUiStateSnapshot", () => {
  it("keeps the operator's language so it survives a reload", () => {
    expect(normalizeFrontendUiStateSnapshot({ locale: "zh-CN" })?.locale).toBe("zh-CN");
    expect(normalizeFrontendUiStateSnapshot({ locale: "en" })?.locale).toBe("en");
  });

  it("drops a locale the build cannot render", () => {
    expect(normalizeFrontendUiStateSnapshot({ locale: "fr" })?.locale).toBeUndefined();
    expect(normalizeFrontendUiStateSnapshot({ locale: 42 })?.locale).toBeUndefined();
  });

  it("leaves the locale unset when the snapshot never carried one", () => {
    expect(normalizeFrontendUiStateSnapshot({})?.locale).toBeUndefined();
  });

  it("rejects a non-object snapshot", () => {
    expect(normalizeFrontendUiStateSnapshot(null)).toBeNull();
  });
});
