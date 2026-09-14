import {
      installFighterConfigGlobals,
      loadFighterConfig,
} from "../config/fighter-loader";


import { loadRuntimeConfig } from "../config/runtime-config";
import { GameManager } from "../engine/game-manager";
import { CommandLineController } from "../ui/command-console";



window.addEventListener("DOMContentLoaded", async () => {

      try {
            const [fighterConfig, runtimeConfig] = await Promise.all([
                  loadFighterConfig("config/fighters"),
                  loadRuntimeConfig(),
            ]);
            installFighterConfigGlobals(fighterConfig);
            const game = new GameManager(fighterConfig.roster, runtimeConfig);
            const commandLine = new CommandLineController(game);
            window.game = game;
            window.commandLine = commandLine;


      } catch (error) {
            console.error("Failed to start Duels2D:", error);
            const status = document.getElementById("hud-status");
            if (status) status.textContent = "CONFIG ERROR";
      }
});
