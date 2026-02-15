const api = typeof browser !== "undefined" ? browser : chrome;
const menuApi = api.menus || api.contextMenus;

const CHECK_MENU_ID = "reading-checkpoint-toggle-check";
const ATTENTION_MENU_ID = "reading-checkpoint-toggle-attention";
const CLEAR_SELECTION_MENU_ID = "reading-checkpoint-clear-selection";
const CLEAR_ALL_MENU_ID = "reading-checkpoint-clear-all";
const UNDO_MENU_ID = "reading-checkpoint-undo";
const REDO_MENU_ID = "reading-checkpoint-redo";

api.runtime.onInstalled.addListener(() => {
  menuApi.create({
    id: CHECK_MENU_ID,
    title: "Toggle read checkmark (selected text)",
    contexts: ["selection"]
  });

  menuApi.create({
    id: ATTENTION_MENU_ID,
    title: "Toggle attention mark ! (selected text)",
    contexts: ["selection"]
  });

  menuApi.create({
    id: CLEAR_SELECTION_MENU_ID,
    title: "Clear marker from selected text/block",
    contexts: ["selection"]
  });

  menuApi.create({
    id: CLEAR_ALL_MENU_ID,
    title: "Clear all markers on this page",
    contexts: ["page", "selection"]
  });

  menuApi.create({
    id: UNDO_MENU_ID,
    title: "Undo marker action",
    contexts: ["page", "selection"]
  });

  menuApi.create({
    id: REDO_MENU_ID,
    title: "Redo marker action",
    contexts: ["page", "selection"]
  });
});

menuApi.onClicked.addListener((info, tab) => {
  if (!tab?.id) {
    return;
  }

  if (info.menuItemId === CHECK_MENU_ID || info.menuItemId === ATTENTION_MENU_ID) {
    const kind = info.menuItemId === ATTENTION_MENU_ID ? "attention" : "check";
    api.tabs.sendMessage(tab.id, { type: "TOGGLE_MARK", kind }).catch(() => {
      // Ignore pages where content script cannot run.
    });
    return;
  }

  const actionByMenuId = {
    [CLEAR_SELECTION_MENU_ID]: "CLEAR_SELECTION_MARKS",
    [CLEAR_ALL_MENU_ID]: "CLEAR_ALL_MARKS",
    [UNDO_MENU_ID]: "UNDO_MARK_ACTION",
    [REDO_MENU_ID]: "REDO_MARK_ACTION"
  };

  const type = actionByMenuId[info.menuItemId];
  if (!type) {
    return;
  }

  api.tabs.sendMessage(tab.id, { type }).catch(() => {
    // Ignore pages where content script cannot run.
  });
});
