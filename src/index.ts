import type { ExtensionContext } from "@nimbalyst/extension-sdk";
import { NimbalystNamenymEditor } from "./NimbalystNamenymEditor";
import { aiTools } from "./aiTools";
import { setExtensionContext } from "./extensionContext";
import { namenymCodec } from "./collab/codec";
import "./styles.css";

export const components = {
  NimbalystNamenymEditor,
};

export { aiTools };
export { namenymCodec };

export function activate(context: ExtensionContext) {
  // console.log('Nimbalyst Namenym extension activated');
  setExtensionContext(context);
  context.services.collab?.registerContentAdapter(namenymCodec);
}

export function deactivate() {
  // console.log('Nimbalyst Namenym extension deactivated');
}
