/**
 * chat-integrado-boot.js — boot do Chat Integrado
 * Extraído do <script type="module"> inline do HTML para permitir CSP
 * restritiva (script-src 'self', sem unsafe-inline).
 */

import { initChatIntegrado } from "/chat-integrado/chat-integrado.js";

// Wire up extra buttons
document.getElementById("btnNewChatTop").addEventListener("click", () => {
  document.getElementById("btnNewChat").click();
});

document.getElementById("itemTools").addEventListener("click", () => {
  document.getElementById("plusMenu").classList.remove("show");
  document.getElementById("btnConnectors").click();
});

document.getElementById("itemSkills").addEventListener("click", () => {
  document.getElementById("plusMenu").classList.remove("show");
  document.getElementById("btnSkills").click();
});

document.getElementById("itemMemories").addEventListener("click", () => {
  document.getElementById("plusMenu").classList.remove("show");
  document.getElementById("btnMemories").click();
});

document.getElementById("itemClear").addEventListener("click", () => {
  document.getElementById("plusMenu").classList.remove("show");
  document.getElementById("btnClearNav").click();
});

// Check launcher status
async function checkStatus() {
  try {
    const resp = await fetch("/ping", { headers: { "X-Mestre-Client": "v10-web" } });
    if (resp.ok) {
      const data = await resp.json();
      const badge = document.getElementById("statusBadge");
      badge.classList.remove("offline");
      const modelo = document.body.dataset.modelo || "";
      badge.replaceChildren();
      const dot = document.createElement("span");
      dot.textContent = "🟢";
      const label = document.createElement("span");
      label.textContent = (data.admin ? "Admin" : "Online") + (modelo ? " · " + modelo : "");
      badge.append(dot, label);
    }
  } catch {
    const badge = document.getElementById("statusBadge");
    badge.classList.add("offline");
    badge.innerHTML = `<span>🔴</span><span>Offline</span>`;
  }
}

checkStatus();
setInterval(checkStatus, 30000);

initChatIntegrado().catch(err => console.error("[chat-integrado] Erro na inicialização:", err));