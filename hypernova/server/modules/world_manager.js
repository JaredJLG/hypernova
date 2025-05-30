// server/modules/world_manager.js
class WorldManager {
    constructor(io, systemsBase, tradeGoods, gameConfig) {
        this.io = io;
        this.systemsBase = systemsBase;
        this.tradeGoods = tradeGoods;
        this.gameConfig = gameConfig;
        this.systems = [];
        this.economyManager = null;
        this.missionManager = null;
    }

    initialize(economyManager, missionManager) {
        this.economyManager = economyManager;
        this.missionManager = missionManager;
        this.systems = JSON.parse(JSON.stringify(this.systemsBase));

        this.systems.forEach((system) => {
            system.planets.forEach((planet) => {
                planet.stock = {};
                planet.buyPrices = {};
                planet.sellPrices = {};
                planet.availableMissions = [];
                planet.dockedShipId = null; // Add this to track who is docked
            });
        });

        this.economyManager.initializeAllPlanetEconomies(this.systems);
        this.missionManager.populateAllPlanetMissions(this.systems);

        console.log("WorldManager initialized, systems processed.");
    }

    getSystem(systemIndex) {
        return this.systems[systemIndex];
    }

    getPlanet(systemIndex, planetIndex) {
        const system = this.getSystem(systemIndex);
        return system ? system.planets[planetIndex] : null;
    }

    // Helper for PlayerManager to get planet coords for docking sync
    getPlanetDetailsForDocking(systemIndex, planetIndex) {
        const planet = this.getPlanet(systemIndex, planetIndex);
        if (planet) {
            return { x: planet.x, y: planet.y, name: planet.name };
        }
        return null;
    }

    // ***** NEW METHOD *****
    playerDockedAtPlanet(player, systemIndex, planetIndex) {
        if (!player) {
            console.error(
                "WorldManager.playerDockedAtPlanet: Player object is null/undefined.",
            );
            return false;
        }
        const planet = this.getPlanet(systemIndex, planetIndex);
        if (!planet) {
            console.error(
                `WorldManager.playerDockedAtPlanet: Planet ${planetIndex} in system ${systemIndex} not found.`,
            );
            return false;
        }

        // Check if another player is already docked (simple single-dock model)
        if (planet.dockedShipId && planet.dockedShipId !== player.id) {
            console.warn(
                `WorldManager.playerDockedAtPlanet: Planet ${planet.name} is already occupied by ${planet.dockedShipId}. Player ${player.id} cannot dock.`,
            );
            return false; // Docking failed, planet occupied
        }

        // If a player was previously docked elsewhere, undock them first
        if (player.dockedAtPlanetIdentifier) {
            if (
                player.dockedAtPlanetIdentifier.systemIndex !== systemIndex ||
                player.dockedAtPlanetIdentifier.planetIndex !== planetIndex
            ) {
                this.playerUndockedFromPlanet(
                    player,
                    player.dockedAtPlanetIdentifier.systemIndex,
                    player.dockedAtPlanetIdentifier.planetIndex,
                );
            }
        }

        planet.dockedShipId = player.id;
        console.log(
            `WorldManager: Player ${player.id} server-side DOCKED at ${planet.name} (System: ${this.systems[systemIndex].name}).`,
        );
        return true; // Successfully docked
    }

    // ***** NEW METHOD *****
    playerUndockedFromPlanet(player, systemIndex, planetIndex) {
        if (!player) {
            // console.warn("WorldManager.playerUndockedFromPlanet: Player object is null/undefined.");
            return false;
        }
        const planet = this.getPlanet(systemIndex, planetIndex);
        if (!planet) {
            // console.warn(`WorldManager.playerUndockedFromPlanet: Planet ${planetIndex} in system ${systemIndex} not found.`);
            return false;
        }

        if (planet.dockedShipId === player.id) {
            planet.dockedShipId = null;
            console.log(
                `WorldManager: Player ${player.id} server-side UNDOCKED from ${planet.name}.`,
            );
            return true;
        } else if (planet.dockedShipId) {
            // console.warn(`WorldManager.playerUndockedFromPlanet: Player ${player.id} tried to undock from ${planet.name}, but planet is docked by ${planet.dockedShipId}.`);
        } else {
            // console.log(`WorldManager.playerUndockedFromPlanet: Player ${player.id} tried to undock from ${planet.name}, planet was already free.`);
        }
        return false; // Player wasn't the one docked, or planet was free
    }

    getSystemsForClient() {
        return this.systems.map((s) => ({
            name: s.name,
            planets: s.planets.map((p) => ({
                name: p.name,
                x: p.x,
                y: p.y,
                // Optionally send dockedShipId if client needs to know for visuals
                // dockedBy: p.dockedShipId
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
            if (!player)
                return socket.emit("actionFailed", {
                    message: "Player not found.",
                });

            if (player.system !== systemIndex) {
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

            // Use the new centralized docking logic
            if (this.playerDockedAtPlanet(player, systemIndex, planetIndex)) {
                // Successfully docked on server
                player.dockedAtPlanetIdentifier = { systemIndex, planetIndex };
                player.vx = 0;
                player.vy = 0;
                player.x = planet.x; // Ensure player position is at planet
                player.y = planet.y;

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
                    // Send player's actual coordinates after docking
                    playerX: player.x,
                    playerY: player.y,
                });

                const updatesForPlayer = {
                    dockedAtPlanetIdentifier: player.dockedAtPlanetIdentifier,
                    vx: 0,
                    vy: 0,
                    x: player.x,
                    y: player.y,
                };
                if (missionCompletionResult.creditsChanged)
                    updatesForPlayer.credits = player.credits;
                if (missionCompletionResult.cargoChanged)
                    updatesForPlayer.cargo = player.cargo;
                if (missionCompletionResult.missionsChanged)
                    updatesForPlayer.activeMissions = player.activeMissions;

                playerManager.updatePlayerState(socket.id, updatesForPlayer);
            } else {
                // Docking failed (e.g., planet occupied or other server-side reason)
                socket.emit("actionFailed", {
                    message: "Docking failed. Planet may be occupied.",
                });
            }
        });

        socket.on("undock", () => {
            const player = playerManager.getPlayer(socket.id);
            if (!player)
                return socket.emit("actionFailed", {
                    message: "Player not found.",
                });

            if (!player.dockedAtPlanetIdentifier) {
                // Check server-side docked state
                return socket.emit("actionFailed", {
                    message: "Not docked (according to server).",
                });
            }

            const { systemIndex, planetIndex } =
                player.dockedAtPlanetIdentifier;

            // Use the new centralized undocking logic
            if (
                this.playerUndockedFromPlanet(player, systemIndex, planetIndex)
            ) {
                player.dockedAtPlanetIdentifier = null;
                socket.emit("undockConfirmed");
                playerManager.updatePlayerState(socket.id, {
                    dockedAtPlanetIdentifier: null,
                });
            } else {
                // This case should be rare if player.dockedAtPlanetIdentifier was set
                socket.emit("actionFailed", {
                    message: "Server undocking failed.",
                });
            }
        });
    }
}

module.exports = WorldManager;
