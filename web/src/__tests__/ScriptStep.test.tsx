import { describe, it, expect } from "vitest";
import { estimateCostUsd } from "../util/ttsCost";

describe("estimateCostUsd", () => {
  it("calculates per-char cost", () => {
    expect(estimateCostUsd(0)).toBe(0);
    expect(estimateCostUsd(1000)).toBeCloseTo(0.30, 2); // $0.30 / 1k chars
  });
});
