import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { BrowserWindow } from "../BrowserWindow";

describe("BrowserWindow", () => {
  it("renders url and children", () => {
    const { getByText } = render(
      <BrowserWindow url="yourapp.com" width={700}>
        <div>body</div>
      </BrowserWindow>,
    );
    expect(getByText("yourapp.com")).toBeInTheDocument();
    expect(getByText("body")).toBeInTheDocument();
  });
});
