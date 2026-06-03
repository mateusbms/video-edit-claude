import { describe, expect, it } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import { ToolCard } from "../ToolCard";

describe("ToolCard", () => {
  it("renders label and body content", () => {
    const { getByText } = render(
      <ToolCard
        x={0}
        y={0}
        rotation={0}
        dotColor="#2563eb"
        label="Email API"
        body={<span>POST /v1/send</span>}
      />,
    );
    expect(getByText("Email API")).toBeInTheDocument();
    expect(getByText("POST /v1/send")).toBeInTheDocument();
  });

  it("applies rotation via transform style", () => {
    const { container } = render(
      <ToolCard
        x={100}
        y={50}
        rotation={-6}
        dotColor="#7c3aed"
        label="Template Builder"
        body={<span>body</span>}
      />,
    );
    const el = container.firstChild as HTMLElement;
    expect(el.style.transform).toContain("rotate(-6deg)");
  });
});
