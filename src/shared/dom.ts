import { t } from './i18n.ts';

export const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
  children: Node[] = [],
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = t(text);
  if (children.length > 0) node.append(...children);
  return node;
};

/** A text button: no fill, it only changes colour. */
export const textButton = (label: string, onClick: () => void, className = ''): HTMLButtonElement => {
  const button = el('button', `tb ${className}`.trim(), t(label));
  button.type = 'button';
  button.addEventListener('click', (event) => {
    // Inside a clickable row, the click is the button's alone.
    event.stopPropagation();
    onClick();
  });
  return button;
};

/**
 * Keeps one child per key, in order: existing children are updated in place,
 * so focus, open menus and hover survive the two-second refresh.
 */
export const reconcile = <T, V extends { element: HTMLElement }>(
  parent: HTMLElement,
  views: Map<string, V>,
  items: T[],
  key: (item: T) => string,
  create: (item: T) => V,
  update: (view: V, item: T) => void,
  dispose?: (view: V) => void,
): void => {
  const seen = new Set<string>();
  let cursor: ChildNode | null = parent.firstChild;
  for (const item of items) {
    const id = key(item);
    seen.add(id);
    let view = views.get(id);
    if (!view) {
      view = create(item);
      views.set(id, view);
    }
    update(view, item);
    if (view.element !== cursor) parent.insertBefore(view.element, cursor);
    else cursor = cursor.nextSibling;
  }
  for (const [id, view] of views) {
    if (seen.has(id)) continue;
    dispose?.(view);
    view.element.remove();
    views.delete(id);
  }
};

/** Translates labels that were created before the host locale arrived. */
export const localizeTree = (root: HTMLElement): void => {
  const skipped = new Set(['PRE', 'CODE', 'TEXTAREA', 'INPUT']);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const parent = node.parentElement;
    if (!parent || skipped.has(parent.tagName) || parent.closest('.output, .logs, pre, code')) continue;
    nodes.push(node);
  }
  for (const node of nodes) {
    const next = t(node.nodeValue ?? '');
    if (next !== node.nodeValue) node.nodeValue = next;
  }
  for (const element of root.querySelectorAll<HTMLElement>('[title], [aria-label], [placeholder]')) {
    for (const attribute of ['title', 'aria-label', 'placeholder']) {
      const value = element.getAttribute(attribute);
      if (value) element.setAttribute(attribute, t(value));
    }
  }
};

/** Sets text only when it changed, so selection inside it survives a refresh. */
export const setText = (node: HTMLElement, value: string): void => {
  const next = t(value);
  if (node.textContent !== next) node.textContent = next;
};
