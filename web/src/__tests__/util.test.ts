import { describe, it, expect } from "vitest";
import { formatSeconds, percentage } from "../util";

describe("util", () => {
  it("formatSeconds mostra mm:ss", () => {
    expect(formatSeconds(75)).toBe("01:15");
    expect(formatSeconds(3)).toBe("00:03");
  });
  it("percentage clamp 0-100 e arredonda", () => {
    expect(percentage(50, 100)).toBe(50);
    expect(percentage(0, 0)).toBe(0);
    expect(percentage(150, 100)).toBe(100);
  });
});
