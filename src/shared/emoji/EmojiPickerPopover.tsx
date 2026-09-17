import { lazy, Suspense } from "react";

const loadEmojiPicker = async () => {
  const [{ default: Picker }, { default: data }] = await Promise.all([
    import("@emoji-mart/react"),
    import("@emoji-mart/data"),
  ]);
  return function LoadedEmojiPicker(props: Record<string, unknown>) {
    return <Picker {...props} data={data} />;
  };
};

const LazyEmojiPicker = lazy(async () => ({ default: await loadEmojiPicker() }));

export function EmojiPickerPopover({ onEmojiSelect }: { onEmojiSelect: (emoji: string) => void }) {
  return (
    <div className="emoji-picker-popover" role="dialog" aria-label="选择表情">
      <Suspense fallback={<div className="emoji-picker-loading">正在加载表情…</div>}>
        <LazyEmojiPicker
          onEmojiSelect={(emoji: { native?: string }) => {
            if (emoji.native) onEmojiSelect(emoji.native);
          }}
          theme="light"
          previewPosition="none"
          navPosition="bottom"
        />
      </Suspense>
    </div>
  );
}
