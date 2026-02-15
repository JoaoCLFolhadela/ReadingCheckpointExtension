(() => {
  const api = typeof browser !== "undefined" ? browser : chrome;
  const MARKABLE_SELECTOR = "p, ul, ol, h1, h2, h3, h4, h5, h6, blockquote, pre, td, th";
  const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";

  const BLOCK_CLASS = "rcp-block";
  const SECTION_MARKED_CLASS = "rcp-section-marked";
  const CONTROLS_CLASS = "rcp-controls";
  const BUTTON_CLASS = "rcp-toggle";
  const INDICATOR_CLASS = "rcp-indicator";
  const INLINE_CLASS = "rcp-inline";
  const QUICK_MENU_CLASS = "rcp-quick-menu";

  const CHECK_STATE = "check";
  const ATTENTION_STATE = "attention";
  const MIN_TEXT_LENGTH = 12;
  const HISTORY_LIMIT = 80;

  let blockStates = new Map();
  let inlineMarks = [];
  let quickMenu = null;
  let undoStack = [];
  let redoStack = [];

  function pageKey() {
    return `rcp::${location.origin}${location.pathname}${location.search}`;
  }

  function getStorageValue(key) {
    return api.storage.local.get(key).then((result) => result[key]);
  }

  function setStorageValue(key, value) {
    return api.storage.local.set({ [key]: value });
  }

  function serializeState() {
    const blocks = {};
    blockStates.forEach((value, id) => {
      blocks[id] = value;
    });

    return {
      blocks,
      inline: inlineMarks
    };
  }

  function hydrateState(raw) {
    blockStates = new Map();
    inlineMarks = [];

    if (!raw) {
      return;
    }

    if (Array.isArray(raw)) {
      // Migration path from old storage format (array of checked ids).
      raw.forEach((id) => {
        if (typeof id === "string") {
          blockStates.set(id, CHECK_STATE);
        }
      });
      return;
    }

    if (raw.blocks && typeof raw.blocks === "object") {
      Object.entries(raw.blocks).forEach(([id, state]) => {
        if (state === CHECK_STATE || state === ATTENTION_STATE) {
          blockStates.set(id, state);
        }
      });
    }

    if (Array.isArray(raw.inline)) {
      inlineMarks = raw.inline.filter((entry) => {
        return (
          entry &&
          typeof entry.containerId === "string" &&
          typeof entry.start === "number" &&
          typeof entry.end === "number" &&
          entry.start < entry.end &&
          (entry.state === CHECK_STATE || entry.state === ATTENTION_STATE)
        );
      });
    }
  }

  function persistState() {
    return setStorageValue(pageKey(), serializeState());
  }

  function cloneInlineMarks(entries) {
    return entries.map((entry) => ({
      containerId: entry.containerId,
      start: entry.start,
      end: entry.end,
      state: entry.state
    }));
  }

  function snapshotState() {
    return {
      blocks: serializeState().blocks,
      inline: cloneInlineMarks(inlineMarks)
    };
  }

  function pushUndoSnapshot() {
    undoStack.push(snapshotState());
    if (undoStack.length > HISTORY_LIMIT) {
      undoStack.shift();
    }
    redoStack = [];
  }

  function applySnapshot(snapshot) {
    if (!snapshot) {
      return;
    }
    hydrateState(snapshot);
    renderAllFromState();
  }

  function shouldIgnore(el) {
    if (!el || el.closest("[contenteditable='true'], textarea, input")) {
      return true;
    }

    const tag = el.tagName.toLowerCase();
    if (tag !== "ul" && tag !== "ol" && el.closest("ul, ol")) {
      return true;
    }

    if (tag.match(/^h[1-6]$/)) {
      const headingText = (el.textContent || "").replace(/\s+/g, " ").trim();
      return headingText.length === 0;
    }

    if (tag === "td" || tag === "th") {
      return false;
    }

    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    return text.length < MIN_TEXT_LENGTH;
  }

  function elementPath(el) {
    const parts = [];
    let node = el;

    while (node && node !== document.body) {
      const tag = node.tagName.toLowerCase();
      let index = 1;
      let sibling = node.previousElementSibling;

      while (sibling) {
        if (sibling.tagName.toLowerCase() === tag) {
          index += 1;
        }
        sibling = sibling.previousElementSibling;
      }

      parts.push(`${tag}:nth-of-type(${index})`);
      node = node.parentElement;
    }

    parts.push("body");
    return parts.reverse().join(">");
  }

  function ensureStyles() {
    if (document.getElementById("rcp-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "rcp-style";
    style.textContent = `
      .${BLOCK_CLASS} {
        position: relative;
      }

      .${CONTROLS_CLASS} {
        position: absolute;
        left: 0;
        top: 0.05em;
        transform: translateX(calc(-100% - 6px));
        display: flex;
        flex-direction: row;
        gap: 6px;
        opacity: 0;
        visibility: hidden;
        pointer-events: auto;
        transition: opacity 120ms ease, transform 120ms ease;
        z-index: 2147483647;
      }

      .${CONTROLS_CLASS}::after {
        content: "";
        position: absolute;
        top: 0;
        right: -8px;
        width: 8px;
        height: 100%;
      }

      .${BUTTON_CLASS} {
        width: 24px;
        height: 24px;
        border: 1px solid #94a3b8;
        border-radius: 50%;
        background: #ffffff;
        color: #111827;
        font-size: 14px;
        font-weight: 700;
        line-height: 22px;
        text-align: center;
        cursor: pointer;
        opacity: 1;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.15);
        transition: transform 120ms ease;
      }

      .${BUTTON_CLASS}::before {
        content: attr(data-symbol);
      }

      .${BUTTON_CLASS}[data-kind="attention"] {
        color: #9a6700;
      }

      .${INDICATOR_CLASS} {
        position: absolute;
        left: 0;
        top: 0.05em;
        transform: translateX(calc(-100% - 6px));
        width: 24px;
        height: 24px;
        border: 1px solid #94a3b8;
        border-radius: 50%;
        background: #ffffff;
        color: #111827;
        font-size: 14px;
        font-weight: 700;
        line-height: 22px;
        text-align: center;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.15);
        opacity: 0;
        visibility: hidden;
        pointer-events: auto;
        z-index: 2147483646;
      }

      .${BLOCK_CLASS}:hover > .${CONTROLS_CLASS},
      .${BLOCK_CLASS} > .${CONTROLS_CLASS}:hover,
      .${BLOCK_CLASS} > .${INDICATOR_CLASS}:hover ~ .${CONTROLS_CLASS} {
        opacity: 1;
        visibility: visible;
      }

      .${BLOCK_CLASS}:hover > .${INDICATOR_CLASS},
      .${BLOCK_CLASS} > .${CONTROLS_CLASS}:hover ~ .${INDICATOR_CLASS} {
        opacity: 0;
        visibility: hidden;
      }

      .${BLOCK_CLASS}.rcp-marked-check > .${CONTROLS_CLASS} > .${BUTTON_CLASS}[data-kind="check"] {
        background: #16a34a;
        border-color: #15803d;
        color: #111827;
      }

      .${BLOCK_CLASS}.rcp-marked-attention > .${CONTROLS_CLASS} > .${BUTTON_CLASS}[data-kind="check"] {
        background: #facc15;
        border-color: #ca8a04;
        color: #111827;
      }

      .${BLOCK_CLASS}.rcp-marked-attention > .${CONTROLS_CLASS} > .${BUTTON_CLASS}[data-kind="attention"] {
        opacity: 0;
      }

      .${BLOCK_CLASS}.rcp-marked-check > .${INDICATOR_CLASS},
      .${BLOCK_CLASS}.rcp-marked-attention > .${INDICATOR_CLASS} {
        opacity: 1;
        visibility: visible;
      }

      .${BLOCK_CLASS}.rcp-marked-check > .${INDICATOR_CLASS} {
        background: #16a34a;
        border-color: #15803d;
      }

      .${BLOCK_CLASS}.rcp-marked-attention > .${INDICATOR_CLASS} {
        background: #facc15;
        border-color: #ca8a04;
      }

      .${BLOCK_CLASS}.rcp-marked-check,
      .${BLOCK_CLASS}.rcp-section-check {
        background: rgba(22, 163, 74, 0.14);
        border-radius: 4px;
      }

      .${BLOCK_CLASS}.rcp-marked-attention,
      .${BLOCK_CLASS}.rcp-section-attention {
        background: rgba(250, 204, 21, 0.24);
        border-radius: 4px;
      }

      .${INLINE_CLASS}.rcp-inline-check {
        background: rgba(22, 163, 74, 0.24);
        border-radius: 3px;
      }

      .${INLINE_CLASS}.rcp-inline-attention {
        background: rgba(250, 204, 21, 0.42);
        border-radius: 3px;
      }

      @media (max-width: 700px) {
        .${CONTROLS_CLASS} {
          transform: translateX(calc(-100% - 4px));
          gap: 5px;
        }

        .${BUTTON_CLASS} {
          width: 21px;
          height: 21px;
          font-size: 13px;
          line-height: 19px;
        }

        .${INDICATOR_CLASS} {
          width: 21px;
          height: 21px;
          font-size: 13px;
          line-height: 19px;
          transform: translateX(calc(-100% - 4px));
        }
      }

      .${QUICK_MENU_CLASS} {
        position: fixed;
        display: none;
        align-items: center;
        gap: 6px;
        padding: 6px;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        background: #ffffff;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.2);
        z-index: 2147483647;
      }

      .${QUICK_MENU_CLASS} > .${BUTTON_CLASS} {
        opacity: 1;
      }
    `;

    document.documentElement.appendChild(style);
  }

  function getState(id) {
    return id ? blockStates.get(id) || null : null;
  }

  function setState(id, state) {
    if (!id) {
      return;
    }

    if (state === CHECK_STATE || state === ATTENTION_STATE) {
      blockStates.set(id, state);
    } else {
      blockStates.delete(id);
    }
  }

  function clearVisualClasses(el) {
    el.classList.remove("rcp-marked-check", "rcp-marked-attention", "rcp-section-check", "rcp-section-attention", SECTION_MARKED_CLASS);
  }

  function applyBlockState(el, state) {
    clearVisualClasses(el);
    if (state === CHECK_STATE) {
      el.classList.add("rcp-marked-check");
    } else if (state === ATTENTION_STATE) {
      el.classList.add("rcp-marked-attention");
    }

    const checkBtn = el.querySelector(`:scope > .${CONTROLS_CLASS} > .${BUTTON_CLASS}[data-kind="check"]`);
    const attentionBtn = el.querySelector(`:scope > .${CONTROLS_CLASS} > .${BUTTON_CLASS}[data-kind="attention"]`);
    const indicator = el.querySelector(`:scope > .${INDICATOR_CLASS}`);
    if (checkBtn) {
      checkBtn.dataset.symbol = state === ATTENTION_STATE ? "!" : "✓";
      checkBtn.setAttribute("aria-pressed", state === CHECK_STATE ? "true" : "false");
      checkBtn.title =
        state === CHECK_STATE
          ? "Remove check mark"
          : state === ATTENTION_STATE
            ? "Remove attention mark"
            : "Mark as read";
    }
    if (attentionBtn) {
      attentionBtn.setAttribute("aria-pressed", state === ATTENTION_STATE ? "true" : "false");
      attentionBtn.title = state === ATTENTION_STATE ? "Remove attention mark" : "Mark for attention";
    }
    if (indicator) {
      indicator.textContent = state === ATTENTION_STATE ? "!" : state === CHECK_STATE ? "✓" : "";
    }
  }

  function isHeading(el) {
    return !!el?.matches?.(HEADING_SELECTOR);
  }

  function collectMarkables(node) {
    const targets = [];
    if (!(node instanceof Element)) {
      return targets;
    }

    if (node.matches(MARKABLE_SELECTOR)) {
      targets.push(node);
    }
    targets.push(...node.querySelectorAll(MARKABLE_SELECTOR));
    return targets;
  }

  function sectionTargetsFromHeading(heading) {
    const targets = [heading];
    let cursor = heading.nextElementSibling;

    while (cursor) {
      if (cursor.matches?.(HEADING_SELECTOR)) {
        break;
      }
      targets.push(...collectMarkables(cursor));
      cursor = cursor.nextElementSibling;
    }

    return targets;
  }

  function findOwnerHeading(el) {
    const headings = document.querySelectorAll(HEADING_SELECTOR);
    let owner = null;
    for (const heading of headings) {
      if (!(heading instanceof HTMLElement)) {
        continue;
      }
      if (heading === el) {
        return heading;
      }
      const pos = heading.compareDocumentPosition(el);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) {
        owner = heading;
      } else if (pos & Node.DOCUMENT_POSITION_PRECEDING) {
        break;
      }
    }
    return owner;
  }

  function applySectionVisualState(heading) {
    if (!(heading instanceof HTMLElement)) {
      return;
    }

    const headingId = heading.dataset.rcpId;
    if (!headingId) {
      return;
    }

    const sectionState = getState(headingId);
    applyBlockState(heading, sectionState);

    sectionTargetsFromHeading(heading).slice(1).forEach((target) => {
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const targetId = target.dataset.rcpId;
      const targetState = targetId ? getState(targetId) : null;
      const effectiveState = targetState || sectionState;
      applyBlockState(target, effectiveState);

      // Only apply inherited section class when target has no explicit override.
      if (!targetState && sectionState === CHECK_STATE) {
        target.classList.add(SECTION_MARKED_CLASS, "rcp-section-check");
      } else if (!targetState && sectionState === ATTENTION_STATE) {
        target.classList.add(SECTION_MARKED_CLASS, "rcp-section-attention");
      }
    });
  }

  function collapseSectionIfUniform(heading) {
    if (!(heading instanceof HTMLElement)) {
      return;
    }

    const headingId = heading.dataset.rcpId;
    if (!headingId) {
      return;
    }

    const headingState = getState(headingId);
    const bodyTargets = sectionTargetsFromHeading(heading)
      .slice(1)
      .filter((target) => target.dataset.rcpId);

    if (headingState) {
      // Keep only overrides that differ from heading state.
      bodyTargets.forEach((target) => {
        const targetState = getState(target.dataset.rcpId);
        if (targetState === headingState) {
          setState(target.dataset.rcpId, null);
        }
      });
      return;
    }

    if (bodyTargets.length === 0) {
      return;
    }

    const firstState = getState(bodyTargets[0].dataset.rcpId);
    if (!firstState) {
      return;
    }

    const sameState = bodyTargets.every((target) => getState(target.dataset.rcpId) === firstState);
    if (!sameState) {
      return;
    }

    setState(headingId, firstState);
    bodyTargets.forEach((target) => setState(target.dataset.rcpId, null));
  }

  function decorateElement(el) {
    if (!(el instanceof HTMLElement) || el.dataset.rcpDecorated === "1") {
      return;
    }

    if (shouldIgnore(el)) {
      el.dataset.rcpDecorated = "1";
      return;
    }

    const id = elementPath(el);
    el.dataset.rcpId = id;
    el.dataset.rcpDecorated = "1";
    el.classList.add(BLOCK_CLASS);

    const controls = document.createElement("span");
    controls.className = CONTROLS_CLASS;

    const attentionBtn = document.createElement("button");
    attentionBtn.type = "button";
    attentionBtn.className = BUTTON_CLASS;
    attentionBtn.dataset.kind = ATTENTION_STATE;
    attentionBtn.dataset.symbol = "!";
    attentionBtn.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleElement(el, ATTENTION_STATE);
    });

    const checkBtn = document.createElement("button");
    checkBtn.type = "button";
    checkBtn.className = BUTTON_CLASS;
    checkBtn.dataset.kind = CHECK_STATE;
    checkBtn.dataset.symbol = "✓";
    checkBtn.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const currentState = getState(el.dataset.rcpId);
      if (currentState === ATTENTION_STATE && checkBtn.dataset.symbol === "!") {
        toggleElement(el, ATTENTION_STATE);
      } else {
        toggleElement(el, CHECK_STATE);
      }
    });

    controls.appendChild(attentionBtn);
    controls.appendChild(checkBtn);

    const indicator = document.createElement("span");
    indicator.className = INDICATOR_CLASS;
    indicator.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const elementId = el.dataset.rcpId;
      if (!elementId) {
        return;
      }

      pushUndoSnapshot();

      const explicitState = getState(elementId);
      if (explicitState) {
        setState(elementId, null);
      } else {
        // If state is inherited from heading, create a local clear override.
        const ownerHeading = findOwnerHeading(el);
        if (ownerHeading?.dataset.rcpId) {
          const sectionState = getState(ownerHeading.dataset.rcpId);
          if (sectionState) {
            setState(elementId, null);
          }
        }
      }

      renderAllFromState();
      persistState();
    });

    el.insertBefore(indicator, el.firstChild);
    el.insertBefore(controls, indicator.nextSibling);

    applyBlockState(el, getState(id));
  }

  function scan(root = document) {
    root.querySelectorAll(MARKABLE_SELECTOR).forEach(decorateElement);
  }

  function selectedMarkableElement() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    let node = selection.anchorNode;
    if (!node) {
      return null;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      node = node.parentElement;
    }

    return node instanceof Element ? node.closest(MARKABLE_SELECTOR) : null;
  }

  function resolveSelectionContainer(boundaryNode) {
    if (!boundaryNode) {
      return null;
    }

    let el = boundaryNode instanceof Element ? boundaryNode : boundaryNode.parentElement;
    if (!(el instanceof Element)) {
      return null;
    }

    const inUi = el.closest(`.${CONTROLS_CLASS}, .${INDICATOR_CLASS}, .${QUICK_MENU_CLASS}`);
    if (inUi) {
      return inUi.closest(`.${BLOCK_CLASS}`);
    }

    return el.closest(MARKABLE_SELECTOR);
  }

  function toggleElement(el, stateKind, options = {}) {
    const { trackHistory = true } = options;
    if (trackHistory) {
      pushUndoSnapshot();
    }

    if (isHeading(el)) {
      const headingId = el.dataset.rcpId;
      if (!headingId) {
        return;
      }

      const nextState = getState(headingId) === stateKind ? null : stateKind;
      setState(headingId, nextState);
      collapseSectionIfUniform(el);
      renderAllFromState();
      persistState();
      return;
    }

    const elementId = el.dataset.rcpId;
    if (!elementId) {
      return;
    }

    const ownerHeading = findOwnerHeading(el);
    let ownerSectionState = null;
    if (ownerHeading?.dataset.rcpId) {
      ownerSectionState = getState(ownerHeading.dataset.rcpId);
    }

    const currentState = getState(elementId) || ownerSectionState;
    const nextState = currentState === stateKind ? null : stateKind;

    if (ownerSectionState) {
      // Keep heading state; store only per-paragraph overrides.
      if (!nextState || nextState === ownerSectionState) {
        setState(elementId, null);
      } else {
        setState(elementId, nextState);
      }
    } else {
      setState(elementId, nextState);
    }

    if (ownerHeading) {
      collapseSectionIfUniform(ownerHeading);
    }

    renderAllFromState();
    persistState();
  }

  function getTextNodes(container) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || node.nodeValue.length === 0) {
          return NodeFilter.FILTER_REJECT;
        }
        if (
          node.parentElement?.closest(`.${CONTROLS_CLASS}`) ||
          node.parentElement?.closest(`.${INDICATOR_CLASS}`) ||
          node.parentElement?.closest(`.${QUICK_MENU_CLASS}`)
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const nodes = [];
    let current = walker.nextNode();
    while (current) {
      nodes.push(current);
      current = walker.nextNode();
    }
    return nodes;
  }

  function offsetFromBoundary(container, boundaryNode, boundaryOffset) {
    const range = document.createRange();
    range.selectNodeContents(container);
    range.setEnd(boundaryNode, boundaryOffset);
    return range.toString().length;
  }

  function rangeFromOffsets(container, start, end) {
    const nodes = getTextNodes(container);
    let startNode = null;
    let startOffset = 0;
    let endNode = null;
    let endOffset = 0;
    let total = 0;

    for (const node of nodes) {
      const length = node.nodeValue.length;
      const nodeStart = total;
      const nodeEnd = total + length;

      if (!startNode && start >= nodeStart && start <= nodeEnd) {
        startNode = node;
        startOffset = start - nodeStart;
      }

      if (!endNode && end >= nodeStart && end <= nodeEnd) {
        endNode = node;
        endOffset = end - nodeStart;
      }

      total = nodeEnd;
      if (startNode && endNode) {
        break;
      }
    }

    if (!startNode || !endNode) {
      return null;
    }

    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    return range;
  }

  function selectedRangeInfo() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    const range = selection.getRangeAt(0);
    if (range.collapsed) {
      return null;
    }

    const startElement = resolveSelectionContainer(range.startContainer);
    const endElement = resolveSelectionContainer(range.endContainer);
    if (!startElement || !endElement || startElement !== endElement) {
      return null;
    }

    decorateElement(startElement);

    const start = offsetFromBoundary(startElement, range.startContainer, range.startOffset);
    const end = offsetFromBoundary(startElement, range.endContainer, range.endOffset);
    if (start === null || end === null || start === end) {
      return null;
    }

    const normalizedStart = Math.min(start, end);
    const normalizedEnd = Math.max(start, end);

    return {
      container: startElement,
      containerId: startElement.dataset.rcpId,
      start: normalizedStart,
      end: normalizedEnd
    };
  }

  function unwrapInlineMarks(container) {
    container.querySelectorAll(`.${INLINE_CLASS}`).forEach((span) => {
      const parent = span.parentNode;
      if (!parent) {
        return;
      }

      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span);
      }
      parent.removeChild(span);
    });
  }

  function applyInlineMark(entry) {
    const container = document.querySelector(`[data-rcp-id="${CSS.escape(entry.containerId)}"]`);
    if (!(container instanceof HTMLElement)) {
      return;
    }

    const range = rangeFromOffsets(container, entry.start, entry.end);
    if (!range || range.collapsed) {
      return;
    }

    const span = document.createElement("span");
    span.className = `${INLINE_CLASS} ${entry.state === ATTENTION_STATE ? "rcp-inline-attention" : "rcp-inline-check"}`;

    const fragment = range.extractContents();
    span.appendChild(fragment);
    range.insertNode(span);
  }

  function renderInlineForContainer(containerId) {
    const container = document.querySelector(`[data-rcp-id="${CSS.escape(containerId)}"]`);
    if (!(container instanceof HTMLElement)) {
      return;
    }

    unwrapInlineMarks(container);
    const entries = inlineMarks
      .filter((entry) => entry.containerId === containerId)
      .sort((a, b) => b.start - a.start);

    entries.forEach(applyInlineMark);
  }

  function toggleSelectedInline(stateKind, options = {}) {
    const { trackHistory = true } = options;
    const info = selectedRangeInfo();
    if (!info || !info.containerId) {
      return false;
    }

    if (trackHistory) {
      pushUndoSnapshot();
    }

    const sameIndex = inlineMarks.findIndex((entry) => {
      return (
        entry.containerId === info.containerId &&
        entry.start === info.start &&
        entry.end === info.end &&
        entry.state === stateKind
      );
    });

    if (sameIndex >= 0) {
      inlineMarks.splice(sameIndex, 1);
      renderInlineForContainer(info.containerId);
      persistState();
      return true;
    }

    inlineMarks = inlineMarks.filter((entry) => {
      if (entry.containerId !== info.containerId) {
        return true;
      }
      return entry.end <= info.start || entry.start >= info.end;
    });

    inlineMarks.push({
      containerId: info.containerId,
      start: info.start,
      end: info.end,
      state: stateKind
    });

    renderInlineForContainer(info.containerId);
    persistState();
    return true;
  }

  function clearSelectionMarks() {
    const info = selectedRangeInfo();
    const selectedBlock = selectedMarkableElement();
    let changed = false;
    let historyPushed = false;

    function ensureHistory() {
      if (!historyPushed) {
        pushUndoSnapshot();
        historyPushed = true;
      }
    }

    if (info?.containerId) {
      const previousLength = inlineMarks.length;
      const nextInline = inlineMarks.filter((entry) => {
        if (entry.containerId !== info.containerId) {
          return true;
        }
        return entry.end <= info.start || entry.start >= info.end;
      });

      if (nextInline.length !== previousLength) {
        ensureHistory();
        inlineMarks = nextInline;
        renderInlineForContainer(info.containerId);
        changed = true;
      }
    }

    if (selectedBlock?.dataset.rcpId) {
      const selectedId = selectedBlock.dataset.rcpId;
      if (getState(selectedId)) {
        ensureHistory();
        setState(selectedId, null);
        applyBlockState(selectedBlock, null);
        changed = true;
      }

      const ownerHeading = findOwnerHeading(selectedBlock);
      if (ownerHeading?.dataset.rcpId && getState(ownerHeading.dataset.rcpId)) {
        ensureHistory();
        setState(ownerHeading.dataset.rcpId, null);
        collapseSectionIfUniform(ownerHeading);
        applySectionVisualState(ownerHeading);
        changed = true;
      }
    }

    if (!changed) {
      return false;
    }

    persistState();
    return true;
  }

  function clearAllMarks() {
    const hasAny = blockStates.size > 0 || inlineMarks.length > 0;
    if (!hasAny) {
      return false;
    }

    pushUndoSnapshot();
    blockStates.clear();
    inlineMarks = [];
    renderAllFromState();
    hideQuickMenu();
    persistState();
    return true;
  }

  function undoLastAction() {
    if (undoStack.length === 0) {
      return false;
    }

    redoStack.push(snapshotState());
    const previous = undoStack.pop();
    applySnapshot(previous);
    hideQuickMenu();
    persistState();
    return true;
  }

  function redoLastAction() {
    if (redoStack.length === 0) {
      return false;
    }

    undoStack.push(snapshotState());
    const next = redoStack.pop();
    applySnapshot(next);
    hideQuickMenu();
    persistState();
    return true;
  }

  function ensureQuickMenu() {
    if (quickMenu) {
      return quickMenu;
    }

    const menu = document.createElement("div");
    menu.className = QUICK_MENU_CLASS;

    const attentionBtn = document.createElement("button");
    attentionBtn.type = "button";
    attentionBtn.className = BUTTON_CLASS;
    attentionBtn.dataset.kind = ATTENTION_STATE;
    attentionBtn.dataset.symbol = "!";
    attentionBtn.title = "Mark highlighted text for attention";
    attentionBtn.addEventListener("mousedown", (event) => event.preventDefault());
    attentionBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (toggleSelectedInline(ATTENTION_STATE)) {
        hideQuickMenu();
      }
    });

    const checkBtn = document.createElement("button");
    checkBtn.type = "button";
    checkBtn.className = BUTTON_CLASS;
    checkBtn.dataset.kind = CHECK_STATE;
    checkBtn.dataset.symbol = "✓";
    checkBtn.title = "Mark highlighted text as read";
    checkBtn.addEventListener("mousedown", (event) => event.preventDefault());
    checkBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (toggleSelectedInline(CHECK_STATE)) {
        hideQuickMenu();
      }
    });

    menu.appendChild(attentionBtn);
    menu.appendChild(checkBtn);
    document.documentElement.appendChild(menu);
    quickMenu = menu;
    return menu;
  }

  function hideQuickMenu() {
    if (!quickMenu) {
      return;
    }
    quickMenu.style.display = "none";
  }

  function showQuickMenuForRange(range) {
    const menu = ensureQuickMenu();
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      hideQuickMenu();
      return;
    }

    menu.style.display = "flex";
    const x = Math.min(window.innerWidth - 120, Math.max(8, rect.left + rect.width / 2 - 44));
    const y = Math.max(8, rect.top - 48);
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
  }

  function updateQuickMenuFromSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      hideQuickMenu();
      return;
    }

    const range = selection.getRangeAt(0);
    const info = range.collapsed ? null : selectedRangeInfo();
    if (!info) {
      hideQuickMenu();
      return;
    }

    showQuickMenuForRange(range);
  }

  function normalizeSectionsAndRender() {
    document.querySelectorAll(HEADING_SELECTOR).forEach((heading) => {
      if (!(heading instanceof HTMLElement) || shouldIgnore(heading)) {
        return;
      }

      decorateElement(heading);
      collapseSectionIfUniform(heading);
      applySectionVisualState(heading);
    });

    document.querySelectorAll(`.${BLOCK_CLASS}`).forEach((el) => {
      if (!(el instanceof HTMLElement) || isHeading(el) || el.classList.contains(SECTION_MARKED_CLASS)) {
        return;
      }
      applyBlockState(el, getState(el.dataset.rcpId));
    });
  }

  function restoreInlineMarks() {
    const containerIds = new Set(inlineMarks.map((entry) => entry.containerId));
    containerIds.forEach((containerId) => renderInlineForContainer(containerId));
  }

  function clearRenderedInlineMarks() {
    document.querySelectorAll(`.${INLINE_CLASS}`).forEach((span) => {
      const parent = span.parentNode;
      if (!parent) {
        return;
      }
      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span);
      }
      parent.removeChild(span);
    });
  }

  function renderAllFromState() {
    scan();
    normalizeSectionsAndRender();
    clearRenderedInlineMarks();
    restoreInlineMarks();
  }

  function observeChanges() {
    const observer = new MutationObserver((mutations) => {
      const headingsToRefresh = new Set();
      const containersToRerenderInline = new Set();

      for (const mutation of mutations) {
        if (mutation.type !== "childList") {
          continue;
        }

        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) {
            return;
          }

          if (node.matches?.(MARKABLE_SELECTOR)) {
            decorateElement(node);
            if (isHeading(node)) {
              headingsToRefresh.add(node);
            } else {
              const owner = findOwnerHeading(node);
              if (owner) {
                headingsToRefresh.add(owner);
              }
            }

            if (node.dataset.rcpId) {
              containersToRerenderInline.add(node.dataset.rcpId);
            }
          }

          scan(node);

          node.querySelectorAll?.(HEADING_SELECTOR).forEach((heading) => headingsToRefresh.add(heading));
          node.querySelectorAll?.(`[data-rcp-id]`).forEach((el) => {
            if (el.dataset.rcpId) {
              containersToRerenderInline.add(el.dataset.rcpId);
            }
          });
        });
      }

      headingsToRefresh.forEach((heading) => {
        collapseSectionIfUniform(heading);
        applySectionVisualState(heading);
      });

      containersToRerenderInline.forEach((containerId) => {
        if (inlineMarks.some((entry) => entry.containerId === containerId)) {
          renderInlineForContainer(containerId);
        }
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  function installMessageHandler() {
    api.runtime.onMessage.addListener((message) => {
      if (!message?.type) {
        return;
      }

      if (message.type === "CLEAR_ALL_MARKS") {
        clearAllMarks();
        return;
      }

      if (message.type === "UNDO_MARK_ACTION") {
        undoLastAction();
        return;
      }

      if (message.type === "REDO_MARK_ACTION") {
        redoLastAction();
        return;
      }

      if (message.type === "CLEAR_SELECTION_MARKS") {
        clearSelectionMarks();
        return;
      }

      if (message.type === "TOGGLE_MARK") {
        const kind = message.kind === ATTENTION_STATE ? ATTENTION_STATE : CHECK_STATE;
        const handledInline = toggleSelectedInline(kind);
        if (handledInline) {
          return;
        }

        const el = selectedMarkableElement();
        if (el) {
          decorateElement(el);
          toggleElement(el, kind);
        }
      }
    });
  }

  function installQuickMenuHandlers() {
    ensureQuickMenu();
    document.addEventListener("mouseup", () => {
      setTimeout(updateQuickMenuFromSelection, 0);
    });
    document.addEventListener("keyup", () => {
      setTimeout(updateQuickMenuFromSelection, 0);
    });
    document.addEventListener("scroll", hideQuickMenu, true);
    document.addEventListener("mousedown", (event) => {
      if (quickMenu && event.target instanceof Node && quickMenu.contains(event.target)) {
        return;
      }
      hideQuickMenu();
    });
  }

  async function init() {
    ensureStyles();
    hydrateState(await getStorageValue(pageKey()));
    undoStack = [];
    redoStack = [];
    renderAllFromState();
    observeChanges();
    installMessageHandler();
    installQuickMenuHandlers();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
