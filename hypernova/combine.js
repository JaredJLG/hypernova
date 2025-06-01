const fs = require("fs");
const path = require("path");

const outputFile = "combined_selected_output.txt";
const output = fs.createWriteStream(outputFile);

const filesToInclude = [
 "hypernova/client/index.html",
  "hypernova/client/css/style.css",
  "hypernova/client/js/client_config.js",
  "hypernova/client/js/game_state.js",
 "hypernova/client/js/input_handler.js",
  "hypernova/client/js/main.js",
  "hypernova/client/js/network.js",
 "hypernova/client/js/renderer.js",
  "hypernova/client/js/ui_manager.js",

  "hypernova/server/server.js",
  "hypernova/server/config/game_config.js",

  "hypernova/server/data/ship_types.json",
   "hypernova/server/data/systems_init.json",
   "hypernova/server/data/trade_goods.json",
   "hypernova/server/data/weapons.json",

   "hypernova/server/modules/combat_manager.js",
    "hypernova/server/modules/economy_manager.js",
   "hypernova/server/modules/mission_manager.js",
   "hypernova/server/modules/player_manager.js",
   "hypernova/server/modules/world_manager.js",

   "hypernova/server/utils/data_loader.js",
   "hypernova/server/utils/helpers.js",
];

for (const file of filesToInclude) {
  if (fs.existsSync(file)) {
    output.write(`\n\n/* ===== START: ${file} ===== */\n`);
    output.write(fs.readFileSync(file, "utf-8"));
    output.write(`\n/* ===== END: ${file} ===== */\n`);
  } else {
    console.warn(`File not found: ${file}`);
  }
}

output.end(() => console.log(`Selected files combined into ${outputFile}`));
