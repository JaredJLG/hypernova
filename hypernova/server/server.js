// hypernova/server/server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const gameConfig = require("./config/game_config");
const DataLoader = require("./utils/data_loader");

const PlayerManager = require("./modules/player_manager");
const WorldManager = require("./modules/world_manager");
const EconomyManager = require("./modules/economy_manager");
const MissionManager = require("./modules/mission_manager");
const CombatManager = require("./modules/combat_manager");

const app = express();
const serverHttp = http.createServer(app);
const io = new Server(serverHttp);

// Serve client files
// If your client folder is at /home/runner/workspace/hypernova/client/
// and this file (server.js) is at /home/runner/workspace/hypernova/server/server.js
// then path.join(__dirname, '../client') correctly points to hypernova/client/
app.use(express.static(path.join(__dirname, "../client")));

// Ensure socket.io client lib is served
// If package.json is at the project root (/home/runner/workspace/package.json),
// then node_modules is at /home/runner/workspace/node_modules/
// From /home/runner/workspace/hypernova/server/, the path is '../../node_modules'
app.get("/socket.io/socket.io.js", (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            "../../node_modules/socket.io/client-dist/socket.io.js",
        ),
    );
});

async function startServer() {
    const staticData = await DataLoader.loadAllData(); // { weapons, tradeGoods, systemsBase, shipTypes }
    gameConfig.staticWeaponsData = staticData.weapons; // Make weapons data accessible in gameConfig for PlayerManager

    // Instantiate managers
    const playerManager = new PlayerManager(
        io,
        staticData.shipTypes,
        staticData.tradeGoods,
        gameConfig,
    );
    const worldManager = new WorldManager(
        io,
        staticData.systemsBase,
        staticData.tradeGoods,
        gameConfig,
    );
    // Pass playerManager to other managers that need to access player data
    const economyManager = new EconomyManager(
        io,
        worldManager,
        playerManager,
        staticData.tradeGoods,
        gameConfig,
    );
    const missionManager = new MissionManager(
        io,
        worldManager,
        playerManager,
        staticData.tradeGoods,
        gameConfig,
    );
    const combatManager = new CombatManager(
        io,
        playerManager,
        missionManager,
        staticData.weapons,
        gameConfig,
    );

    // Initialize world, which internally initializes economy and missions for its systems
    worldManager.initialize(economyManager, missionManager);

    // Setup periodic game logic updates
    setInterval(
        () => economyManager.updateAllPlanetEconomies(),
        gameConfig.ECONOMY_UPDATE_INTERVAL_MS,
    );
    setInterval(
        () => missionManager.populateAllPlanetMissions(),
        gameConfig.MISSION_GENERATION_INTERVAL_MS,
    );
    setInterval(
        () => playerManager.checkAllPlayerMissionTimeouts(missionManager),
        gameConfig.PLAYER_MISSION_CHECK_INTERVAL_MS,
    );

    io.on("connection", (socket) => {
        // Send full initial game data required by client that's not player-specific yet
        // This 'gameData' is merged with player-specific 'init' data in PlayerManager
        const initialWorldData = {
            systems: worldManager.getSystemsForClient(), // Static parts of systems
            economies: worldManager.getEconomiesForClient(), // Initial dynamic economies
        };
        // PlayerManager will emit 'init' with its own payload + this common game data.
        // The actual modification for PlayerManager.handleConnection is in player_manager.js.

        playerManager.handleConnection(socket, initialWorldData); // Pass initialWorldData

        // Register event handlers from each manager
        // PlayerManager registers its own handlers in handleConnection
        economyManager.registerSocketHandlers(socket);
        missionManager.registerSocketHandlers(socket);
        combatManager.registerSocketHandlers(socket);
        worldManager.registerSocketHandlers(socket, playerManager);

        socket.on("disconnect", () => {
            playerManager.handleDisconnect(socket);
        });
    });

    // Informational comment block about the change made in player_manager.js
    // In PlayerManager.handleConnection (in player_manager.js):
    // socket.emit("init", {
    //     id: socket.id,
    //     ships: this.players,
    //     gameData: {
    //         ...initialWorldData, // from argument
    //         tradeGoods: this.tradeGoods,
    //         weapons: this.gameConfig.staticWeaponsData,
    //         shipTypes: this.shipTypes,
    //         MISSION_TYPES: this.gameConfig.MISSION_TYPES,
    //     },
    // });

    serverHttp.listen(
        gameConfig.PORT,
        () =>
            console.log(
                `Server structured and listening on port ${gameConfig.PORT}`,
            ), // Clearer log
    );
}

startServer().catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
});

// Ensure no other text or code follows this line in this file.
