/**
 * Content script for Mestre do PC browser extension.
 * Provides a lightweight bridge between page context and extension background.
 */

// Requisita do background informações sobre o status do app local.
// Pode ser expandido para injetar botões flutuantes em páginas específicas.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getSelection") {
    sendResponse({
      selection: window.getSelection().toString().trim(),
      title: document.title,
      url: location.href,
    });
    return true;
  }
});
