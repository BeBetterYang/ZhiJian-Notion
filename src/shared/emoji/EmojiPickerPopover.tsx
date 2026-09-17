import { lazy, Suspense, useEffect, useRef } from "react";

const loadEmojiPicker = async () => {
  const [{ Picker }, { default: data }] = await Promise.all([
    import("emoji-mart"),
    import("@emoji-mart/data"),
  ]);
  return function LoadedEmojiPicker({ onEmojiSelect }: { onEmojiSelect: (emoji: { native?: string }) => void }) {
    const pickerRootRef = useRef<HTMLDivElement>(null);
    const onEmojiSelectRef = useRef(onEmojiSelect);
    onEmojiSelectRef.current = onEmojiSelect;

    useEffect(() => {
      if (!pickerRootRef.current) return;
      const picker = new Picker({
        data,
        onEmojiSelect: (emoji: { native?: string }) => onEmojiSelectRef.current(emoji),
        theme: "light",
        previewPosition: "none",
        navPosition: "bottom",
      });
      const pickerElement = picker as unknown as HTMLElement;
      pickerRootRef.current.appendChild(pickerElement);
      return () => pickerElement.remove();
    }, []);

    return <div ref={pickerRootRef} />;
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
        />
      </Suspense>
    </div>
  );
}
