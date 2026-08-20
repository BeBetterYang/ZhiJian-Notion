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
