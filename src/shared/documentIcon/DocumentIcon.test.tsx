import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createInitialTree } from "../../core/tree";
import { TreeStore } from "../../core/treeStore";
import { DocumentIcon, DocumentIconControl } from "./DocumentIcon";
import { documentIconKey } from "./documentIconModel";

describe("DocumentIcon", () => {
  it("renders the fallback and Unicode emoji without duplicating icon logic", () => {
    const { rerender } = render(<DocumentIcon />);
    expect(document.querySelector(".document-icon-fallback")).toBeInTheDocument();
    expect(documentIconKey()).toBe("");

    rerender(<DocumentIcon icon={{ type: "emoji", value: "🌱" }} />);
    expect(screen.getByText("🌱")).toHaveClass("document-icon-emoji");
    expect(documentIconKey({ type: "emoji", value: "🌱" })).toBe("emoji:🌱");
  });

  it("does not expose an edit trigger in readonly mode", () => {
    const store = new TreeStore(createInitialTree());
    render(<DocumentIconControl store={store} readOnly />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("does not reserve an empty page-icon slot until the title row is active", () => {
    const store = new TreeStore(createInitialTree());
    const { rerender } = render(<DocumentIconControl store={store} showEmpty={false} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    rerender(<DocumentIconControl store={store} showEmpty />);
    expect(screen.getByRole("button", { name: "添加文档图标" })).toBeInTheDocument();
    expect(document.querySelector(".document-icon-fallback")).not.toBeInTheDocument();
  });
});
