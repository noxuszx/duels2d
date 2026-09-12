'use strict';

window.addEventListener('DOMContentLoaded', async () => {
  try {
    await window.loadFighterConfig("config/fighters");
    window.game = new GameManager();
  } catch (error) {
    console.error("Failed to start Duels2D:", error);
    const status = document.getElementById("hud-status");
    if (status) status.textContent = "CONFIG ERROR";
  }
});
