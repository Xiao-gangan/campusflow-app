import { subscribeToBrowserDemo } from "../browser-demo/mode";
import { useEffect, useState } from "react";
import type { DesignTarget } from "@/shared/contracts/design";
import type { DesignLibrary } from "./local-library";

export function useTemplateList(library: DesignLibrary, target?: DesignTarget, active = true) {
  const [templates, setTemplates] = useState(() => library.listTemplates(target));
  useEffect(() => {
    const update = () => setTemplates(library.listTemplates(target));
    const refresh = () => { void library.refreshTemplates(); };
    const unsubscribe = library.subscribeTemplates(update);
    update();
    if (active) {
      refresh();
      window.addEventListener("focus", refresh);
    }
    const unsubscribeStorage = active ? subscribeToBrowserDemo(refresh) : () => {};
    return () => {
      unsubscribe();
      unsubscribeStorage();
      window.removeEventListener("focus", refresh);
    };
  }, [library, target, active]);
  return templates;
}
