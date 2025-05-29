// server/modules/world_manager.js
class WorldManager {
    constructor(io, systemsBase, tradeGoods, gameConfig) {
        this.io = io;
        this.systemsBase = systemsBase; // Static definition
        this.tradeGoods = tradeGoods;
        this.gameConfig = gameConfig;
        this.systems = []; // Live systems data
        this.economyManager = null; // To be injected
        this.missionManager = null; // To be injected
    }

    // Call this after all managers are created
    initialize(economyManager, missionManager) {
        this.economyManager = economyManager;
        this.missionManager = missionManager;

        // Initialize live systems data from base
        this.systems = JSON.parse(JSON.stringify(this.systemsBase)); // Deep copy

        this.systems.forEach((system) => {
            system.planets.forEach((planet) => {
                planet.stock = {};
                planet.buyPrices = {};
                planet.sellPrices = {};
                planet.availableMissions = []; // Managed by MissionManager
            });
        });

        this.economyManager.initializeAllPlanetEconomies(this.systems);
        this.missionManager.populateAllPlanetMissions(this.systems); // Initial population

        console.log("WorldManager initialized, systems processed.");
    }

    getSystem(systemIndex) {
        return this.systems[systemIndex];
    }

    getPlanet(systemIndex, planetIndex) {
        const system = this.getSystem(systemIndex);
        return system ? system.planets[planetIndex] : null;
    }

    getSystemsForClient() {
        // Return a simplified version for client init (positions, names)
        return this.systems.map((s) => ({
            name: s.name,
            planets: s.planets.map((p) => ({
                name: p.name,
                x: p.x,
                y: p.y,
            })),
        }));
    }

    getEconomiesForClient() {
        return this.systems.map((s) => ({
            name: s.name,
            planets: s.planets.map((p) => ({
                name: p.name,
                stock: p.stock,
                buyPrices: p.buyPrices,
                sellPrices: p.sellPrices,
            })),
        }));
    }

    registerSocketHandlers(socket, playerManager) {
        socket.on("dock", ({ systemIndex, planetIndex }) => {
            const player = playerManager.getPlayer(socket.id);
            if (!player || player.system !== systemIndex) {
                return socket.emit("actionFailed", {
                    message: "Cannot dock: Wrong system.",
                });
            }
            const planet = this.getPlanet(systemIndex, planetIndex);
            if (!planet) {
                return socket.emit("actionFailed", {
                    message: "Cannot dock: Planet not found.",
                });
            }

            player.dockedAtPlanetIdentifier = { systemIndex, planetIndex };
            player.vx = 0;
            player.vy = 0;

            // Handle mission completions (Cargo Delivery)
            const missionCompletionResult =
                this.missionManager.checkCargoMissionCompletionOnDock(
                    player,
                    systemIndex,
                    planetIndex,
                );

            socket.emit("dockConfirmed", {
                systemIndex,
                planetIndex,
                planetName: planet.name,
                systemName: this.systems[systemIndex].name,
                buyPrices: planet.buyPrices,
                sellPrices: planet.sellPrices,
                stock: planet.stock,
            });

            const updatesForPlayer = {
                dockedAtPlanetIdentifier: player.dockedAtPlanetIdentifier,
                vx: 0,
                vy: 0,
            };
            if (missionCompletionResult.creditsChanged) {
                updatesForPlayer.credits = player.credits;
            }
            if (missionCompletionResult.cargoChanged) {
                updatesForPlayer.cargo = player.cargo;
            }
            if (missionCompletionResult.missionsChanged) {
                updatesForPlayer.activeMissions = player.activeMissions;
            }
            playerManager.updatePlayerState(socket.id, updatesForPlayer);
        });

        socket.on("undock", () => {
            const player = playerManager.getPlayer(socket.id);
            if (!player || !player.dockedAtPlanetIdentifier) {
                return socket.emit("actionFailed", { message: "Not docked." });
            }
            player.dockedAtPlanetIdentifier = null;
            socket.emit("undockConfirmed");
            playerManager.updatePlayerState(socket.id, {
                dockedAtPlanetIdentifier: null,
            });
        });
    }
}

module.exports = WorldManager;
