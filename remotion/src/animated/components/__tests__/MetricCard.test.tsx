import { describe, expect, it } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import { MetricCard } from "../MetricCard";

describe("MetricCard", () => {
  it("renders label and value", () => {
    const { getByText } = render(
      <MetricCard dotColor="#16a34a" label="Conversions" value="+32%" />,
    );
    expect(getByText("Conversions")).toBeInTheDocument();
    expect(getByText("+32%")).toBeInTheDocument();
  });

  it("renders avatars when avatars prop is provided", () => {
    const { container } = render(
      <MetricCard dotColor="#7c3aed" label="Customers" value="847" avatars={3} />,
    );
    // avatars rendered as div circles — check there are 3 avatar elements
    const avatarEls = container.querySelectorAll("[data-testid='avatar-circle']");
    expect(avatarEls).toHaveLength(3);
  });

  it("renders without optional props", () => {
    const { getByText } = render(
      <MetricCard dotColor="#2563eb" label="Revenue" value="$12,400" />,
    );
    expect(getByText("Revenue")).toBeInTheDocument();
  });
});
