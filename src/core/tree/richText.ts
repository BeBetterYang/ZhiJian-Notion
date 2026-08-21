export interface RichTextMarks {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  textColor?: string;
  backgroundColor?: string;
  linkUrl?: string;
}

export interface RichTextSpan {
  text: string;
  marks?: RichTextMarks;
}

export interface RichTextContent {
  text: string;
  marks?: RichTextMarks;
  spans?: RichTextSpan[];
}

export function plainTextContent(text: string): RichTextContent {
  return { text };
}

export function normalizeRichText(content: string | RichTextContent): RichTextContent {
  if (typeof content === "string") {
    return plainTextContent(content);
  }
  const spans = content.spans?.filter((span) => span.text.length > 0);
  return {
    text: spans?.length ? spans.map((span) => span.text).join("") : content.text,
    marks: content.marks,
    spans,
  };
}

export function richTextToPlainText(content: string | RichTextContent): string {
  return normalizeRichText(content).text;
}

export function firstMarks(content: string | RichTextContent): RichTextMarks | undefined {
  const richText = normalizeRichText(content);
  return richText.spans?.[0]?.marks ?? richText.marks;
}

export function replaceRichTextPlainText(
  content: string | RichTextContent,
  nextText: string,
): RichTextContent {
  const current = normalizeRichText(content);
  if (current.text === nextText) {
    return current;
  }
  if (!current.spans?.length) {
    return current.marks ? { text: nextText, marks: current.marks } : { text: nextText };
  }

  const previousCharacters = Array.from(current.text);
  const nextCharacters = Array.from(nextText);
  const previousMarks = current.spans.flatMap((span) =>
    Array.from(span.text, () => span.marks),
  );
  let prefixLength = 0;
  while (
    prefixLength < previousCharacters.length &&
    prefixLength < nextCharacters.length &&
    previousCharacters[prefixLength] === nextCharacters[prefixLength]
  ) {
    prefixLength += 1;
  }
  let suffixLength = 0;
  while (
    suffixLength < previousCharacters.length - prefixLength &&
    suffixLength < nextCharacters.length - prefixLength &&
    previousCharacters[previousCharacters.length - suffixLength - 1] ===
      nextCharacters[nextCharacters.length - suffixLength - 1]
  ) {
    suffixLength += 1;
  }

  const insertedLength = nextCharacters.length - prefixLength - suffixLength;
  const insertionMarks =
    previousMarks[prefixLength - 1] ?? previousMarks[prefixLength] ?? current.marks;
  const nextMarks = [
    ...previousMarks.slice(0, prefixLength),
    ...Array.from({ length: insertedLength }, () => insertionMarks),
    ...previousMarks.slice(previousCharacters.length - suffixLength),
  ];
  const spans = nextCharacters.reduce<RichTextSpan[]>((result, character, index) => {
    const marks = nextMarks[index];
    const previous = result.at(-1);
    if (previous && sameMarks(previous.marks, marks)) {
      previous.text += character;
    } else {
      result.push({ text: character, marks });
    }
    return result;
  }, []);

  return {
    text: nextText,
    spans: spans.some((span) => span.marks) ? spans : undefined,
  };
}

function sameMarks(left: RichTextMarks | undefined, right: RichTextMarks | undefined) {
  return JSON.stringify(left ?? {}) === JSON.stringify(right ?? {});
}
