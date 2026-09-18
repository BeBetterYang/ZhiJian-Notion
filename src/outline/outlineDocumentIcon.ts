export function shouldRenderOutlinePageIcon({
  hasDocumentIcon,
  showDocumentIcon,
  readOnly,
  zoomedNodeId,
}: {
  hasDocumentIcon: boolean;
  showDocumentIcon: boolean;
  readOnly: boolean;
  zoomedNodeId: string | null;
}) {
  if (zoomedNodeId !== null) return false;
  return hasDocumentIcon || (!readOnly && showDocumentIcon);
}
