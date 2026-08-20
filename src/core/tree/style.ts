export interface NodeVisualStyle {
  fontSize?: string;
  fontWeight?: string;
  fontStyle?: string;
  textDecoration?: string;
  textDecorationLine?: string;
  color?: string;
  backgroundColor?: string;
  linkUrl?: string;
  imageUrl?: string;
}

export function getNodeStyle(style?: object): NodeVisualStyle {
  return (style ?? {}) as NodeVisualStyle;
}
