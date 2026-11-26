import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "@/app/page";

describe("الصفحة الرئيسية", () => {
  it("تعرض اسم المتجر", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1, name: "باندا ستور" })).toBeInTheDocument();
  });
});
