import {
      loadFighterConfig,
} from "../config/fighter-loader";


import {
      loadRuntimeConfig,
      validateFighterSoundCues,
} from "../config/runtime-config";
import { GameApp } from "../app/game-app";
import { CommandLineController } from "../ui/command-console";
import { TransportControls } from "../ui/transport-controls";
import { RecordingController } from "../ui/recording-controller";



window.addEventListener("DOMContentLoaded", async () => {

      try {
            const [fighterConfig, runtimeConfig] = await Promise.all([
                  loadFighterConfig("config/fighters"),
                  loadRuntimeConfig(),
            ]);
            validateFighterSoundCues(
                  fighterConfig.roster,
                  runtimeConfig.sounds,
            );
            const game = new GameApp(fighterConfig.roster, runtimeConfig);
            const commandLine = new CommandLineController(game);
            new TransportControls(game);
            new RecordingController(game);
            window.game = game;
            window.commandLine = commandLine;


      } catch (error) {
            console.error("Failed to start Duels2D:", error);
            const status = document.getElementById("hud-status");
            if (status) status.textContent = "CONFIG ERROR";
      }
});
