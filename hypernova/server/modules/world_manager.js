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
            // Ensure new fields exist if not in base JSON (though we added them)
            if (system.universeX === undefined)
                system.universeX = Math.random() * 1000;
            if (system.universeY === undefined)
                system.universeY = Math.random() * 1000;
            if (!system.connections) system.connections = [];

            system.planets.forEach((planet) => {
                planet.stock = {};
                planet.buyPrices = {};
                planet.sellPrices = {};
                planet.availableMissions = [];
                planet.dockedShipId = null;
            });
        });

        this.economyManager.initializeAllPlanetEconomies(this.systems);
        this.missionManager.populateAllPlanetMissions(this.systems); // Pass systems here if needed by populate

        console.log("WorldManager initialized, systems processed.");
    }

    getSystem(systemIndex) {
        return this.systems[systemIndex];
    }

    getPlanet(systemIndex, planetIndex) {
        const system = this.getSystem(systemIndex);
        return system ? system.planets[planetIndex] : null;
    }

    getPlanetDetailsForDocking(systemIndex, planetIndex) {
        const planet = this.getPlanet(systemIndex, planetIndex);
        if (planet) {
            return { x: planet.x, y: planet.y, name: planet.name };
        }
        return null;
    }

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

        if (planet.dockedShipId && planet.dockedShipId !== player.id) {
            console.warn(
                `WorldManager.playerDockedAtPlanet: Planet ${planet.name} is already occupied by ${planet.dockedShipId}. Player ${player.id} cannot dock.`,
            );
            return false;
        }

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
        return true;
    }

    playerUndockedFromPlanet(player, systemIndex, planetIndex) {
        if (!player) {
            return false;
        }
        const planet = this.getPlanet(systemIndex, planetIndex);
        if (!planet) {
            return false;
        }

        if (planet.dockedShipId === player.id) {
            planet.dockedShipId = null;
            console.log(
                `WorldManager: Player ${player.id} server-side UNDOCKED from ${planet.name}.`,
            );
            return true;
        }
        return false;
    }

    getSystemsForClient() {
        return this.systems.map((s) => ({
            name: s.name,
            // Pass new universe map data
            universeX: s.universeX,
            universeY: s.universeY,
            connections: s.connections,
            // Existing planet data for in-system view
            planets: s.planets.map((p) => ({
                name: p.name,
                x: p.x,
                y: p.y,
                imageFile: p.imageFile,
                planetImageScale: p.planetImageScale,
            })),
            backgroundFile: s.backgroundFile, // Make sure backgroundFile is also passed
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

            if (player.hyperjumpState === "charging") {
                return socket.emit("actionFailed", {
                    message: "Cannot dock while hyperdrive is charging.",
                });
            }

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

            if (this.playerDockedAtPlanet(player, systemIndex, planetIndex)) {
                player.dockedAtPlanetIdentifier = { systemIndex, planetIndex };
                player.vx = 0;
                player.vy = 0;
                player.x = planet.x;
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
                return socket.emit("actionFailed", {
                    message: "Not docked (according to server).",
                });
            }
            const { systemIndex, planetIndex } =
                player.dockedAtPlanetIdentifier;
            if (
                this.playerUndockedFromPlanet(player, systemIndex, planetIndex)
            ) {
                player.dockedAtPlanetIdentifier = null;
                socket.emit("undockConfirmed");
                playerManager.updatePlayerState(socket.id, {
                    dockedAtPlanetIdentifier: null,
                });
            } else {
                socket.emit("actionFailed", {
                    message: "Server undocking failed.",
                });
            }
        });
    }
}

module.exports = WorldManager;
