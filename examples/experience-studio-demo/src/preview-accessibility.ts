const decorativePreviewSelector = ".template-preview, .dialog-selected-preview";

function markDecorativePreview(element: Element): void {
  if (!(element instanceof HTMLElement)) return;
  element.setAttribute("inert", "");
  element.setAttribute("aria-hidden", "true");
}

function scan(root: ParentNode): void {
  if (root instanceof Element && root.matches(decorativePreviewSelector)) markDecorativePreview(root);
  for (const preview of root.querySelectorAll(decorativePreviewSelector)) markDecorativePreview(preview);
}

scan(document);

const root = document.getElementById("root");
if (root) {
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof Element) scan(node);
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true });
}
