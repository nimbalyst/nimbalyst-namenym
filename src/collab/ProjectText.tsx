import React, {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
} from "react";
import * as Y from "yjs";
import { applyTextDiff } from "@nimbalyst/extension-sdk/collab";
import type { NamenymBinding } from "./binding";
import { projectText } from "./layout";

export const ProjectEditingContext = createContext<{
  binding: NamenymBinding | null;
  readOnly: boolean;
}>({ binding: null, readOnly: false });
type Props = Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange"
> & {
  field: string;
  value: string;
  onChange: (value: string) => void;
};

/** The DOM and shared text are kept in step inside the Yjs observer, before
 * React's next render. Relative selections survive peer edits and IME input. */
export function ProjectText({ field, value, onChange, ...props }: Props) {
  const { binding, readOnly } = useContext(ProjectEditingContext);
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!binding || !element) return;
    const text = binding.text(field);
    let baseline = text.toString();
    element.value = baseline;
    let composing = false;
    let compositionBase = baseline;
    let compositionDoc: Y.Doc | null = null;
    let compositionVector: Uint8Array | null = null;
    let start: Y.RelativePosition | null = null,
      end: Y.RelativePosition | null = null;
    const before = () => {
      if (document.activeElement !== element || composing) return;
      start = Y.createRelativePositionFromTypeIndex(
        text,
        element.selectionStart
      );
      end = Y.createRelativePositionFromTypeIndex(text, element.selectionEnd);
    };
    const paint = () => {
      if (composing) return;
      const next = text.toString();
      if (element.value !== next) element.value = next;
      baseline = next;
      if (document.activeElement === element && start && end) {
        const a = Y.createAbsolutePositionFromRelativePosition(
          start,
          binding.doc
        );
        const b = Y.createAbsolutePositionFromRelativePosition(
          end,
          binding.doc
        );
        if (a && b) element.setSelectionRange(a.index, b.index);
      }
    };
    const input = () => {
      if (composing) return;
      const next = element.value;
      const selection = [element.selectionStart, element.selectionEnd];
      try {
        applyTextDiff(baseline, next, (a, b, insert) =>
          binding.editText(field, a, b, insert)
        );
      } catch {
        element.value = text.toString();
      }
      baseline = text.toString();
      element.setSelectionRange(
        Math.min(selection[0], baseline.length),
        Math.min(selection[1], baseline.length)
      );
    };
    const compositionBegin = () => {
      composing = true;
      compositionBase = baseline;
      compositionDoc = new Y.Doc();
      Y.applyUpdate(compositionDoc, Y.encodeStateAsUpdate(binding.doc));
      compositionVector = Y.encodeStateVector(compositionDoc);
    };
    const compositionEnd = () => {
      const branch = compositionDoc;
      composing = false;
      compositionDoc = null;
      if (!branch || !compositionVector) return;
      // Compose against the exact original structs. Merging this branch deletes
      // only original characters, never a peer insertion inside the IME range.
      const branchText = projectText(branch, field);
      const caret = element.selectionEnd;
      applyTextDiff(compositionBase, element.value, (a, b, inserted) => {
        if (b > a) branchText.delete(a, b - a);
        if (inserted) branchText.insert(a, inserted);
      });
      const position = Y.createRelativePositionFromTypeIndex(branchText, caret);
      try {
        binding.applyTextUpdate(
          Y.encodeStateAsUpdate(branch, compositionVector),
          field
        );
      } catch {
        /* A permission change cancels the local composition. */
      } finally {
        branch.destroy();
        compositionVector = null;
      }
      baseline = text.toString();
      element.value = baseline;
      const absolute = Y.createAbsolutePositionFromRelativePosition(
        position,
        binding.doc
      );
      if (absolute) element.setSelectionRange(absolute.index, absolute.index);
    };
    binding.doc.on("beforeTransaction", before);
    text.observe(paint);
    element.addEventListener("input", input);
    element.addEventListener("compositionstart", compositionBegin);
    element.addEventListener("compositionend", compositionEnd);
    return () => {
      compositionDoc?.destroy();
      binding.doc.off("beforeTransaction", before);
      text.unobserve(paint);
      element.removeEventListener("input", input);
      element.removeEventListener("compositionstart", compositionBegin);
      element.removeEventListener("compositionend", compositionEnd);
    };
  }, [binding, field]);
  return binding ? (
    <textarea {...props} ref={ref} readOnly={readOnly} defaultValue={value} />
  ) : (
    <textarea
      {...props}
      readOnly={readOnly}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
