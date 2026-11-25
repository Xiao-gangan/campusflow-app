export const LOCAL_DEMO = import.meta.env?.DEV === true && import.meta.env?.MODE === "rsvp-demo";
export const BROWSER_DEMO = typeof window !== "undefined" && !LOCAL_DEMO;
export const BROWSER_DEMO_STORAGE = "campusflow.browser-demo.sqlite.v1";

export function subscribeToBrowserDemo(listener: () => void) {
  if (!BROWSER_DEMO) return () => {};
  const update = (event: StorageEvent) => {
    if (event.key === BROWSER_DEMO_STORAGE || event.key === null) listener();
  };
  window.addEventListener("storage", update);
  return () => window.removeEventListener("storage", update);
}
