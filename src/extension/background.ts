chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId === undefined) return;
  chrome.sidePanel.open({ windowId: tab.windowId });
});
