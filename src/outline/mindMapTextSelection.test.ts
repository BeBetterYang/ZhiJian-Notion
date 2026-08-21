import { describe, expect, it } from "vitest";
import { resolveMindMapTextRange, textOffset } from "./mindMapTextSelection";

describe("textOffset", () => {
  it("counts visible characters up to a point in flat text", () => {
    const root = document.createElement("div");
    root.textContent = "产品规划";
    const text = root.firstChild!;

    expect(textOffset(root, text, 0)).toBe(0);
    expect(textOffset(root, text, 2)).toBe(2);
    expect(textOffset(root, text, 4)).toBe(4);
  });

  it("ignores inline markup nesting and counts only visible characters", () => {
    // Mirrors a rich mindmap node like 粗<b>体</b>字 where marks wrap the text in
    // extra <b>/<span> nodes. The offset must stay a visible-character count so it
    // lines up with resolveMindMapTextRange's BlockNote positions.
    const root = document.createElement("div");
    const first = document.createElement("span");
    first.className = "text";
    first.textContent = "粗";
    const bold = document.createElement("b");
    bold.textContent = "体";
    const tail = document.createTextNode("字");
    root.append(first, bold, tail);

    // Boundary between the plain span and the bold node: 1 visible char before it.
    expect(textOffset(root, root, 1)).toBe(1);
    // One character into the bold node's text: 粗 + 体 = 2 visible chars.
    expect(textOffset(root, bold.firstChild!, 1)).toBe(2);
    // End of the trailing text node: the whole visible string 粗体字 = 3.
    expect(textOffset(root, tail, 1)).toBe(3);
  });
});

describe("resolveMindMapTextRange", () => {
  const blockRange = { from: 10, to: 20 };

  it("maps a partial mindmap selection into the BlockNote range", () => {
    expect(
      resolveMindMapTextRange("node-a", blockRange, {
        nodeId: "node-a",
        from: 2,
        to: 6,
      }),
    ).toEqual({ from: 12, to: 16 });
  });

  it("normalizes reversed selections and clamps offsets", () => {
    expect(
      resolveMindMapTextRange("node-a", blockRange, {
        nodeId: "node-a",
        from: 30,
        to: -3,
      }),
    ).toEqual(blockRange);
  });

  it("uses the complete block for a different node", () => {
    expect(
      resolveMindMapTextRange("node-a", blockRange, {
        nodeId: "node-b",
        from: 2,
        to: 6,
      }),
    ).toEqual(blockRange);
  });

  it("keeps both halves of the bridge in lockstep for a rich node", () => {
    // A user selects 体字 (visible chars 1..3) inside the rich node 粗体字.
    const root = document.createElement("div");
    const first = document.createElement("span");
    first.textContent = "粗";
    const bold = document.createElement("b");
    bold.textContent = "体";
    const tail = document.createTextNode("字");
    root.append(first, bold, tail);

    // Half 1 turns the native DOM selection into visible-char offsets.
    const from = textOffset(root, bold.firstChild!, 0); // start of 体 -> 1
    const to = textOffset(root, tail, 1); // end of 字 -> 3
    expect({ from, to }).toEqual({ from: 1, to: 3 });

    // Half 2 lands those offsets on the matching BlockNote positions (content
    // starts at position 5, so 体字 occupies 6..8).
    expect(
      resolveMindMapTextRange("node-a", { from: 5, to: 8 }, { nodeId: "node-a", from, to }),
    ).toEqual({ from: 6, to: 8 });
  });
});
