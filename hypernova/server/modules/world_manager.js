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
                planet.dockedShipId = null; // Ensure this is initialized
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

    getPlanetDetailsForDocking(systemIndex, planetIndex) {
        const planet = this.getPlanet(systemIndex, planetIndex);
        if (planet) {
            return { x: planet.x, y: planet.y, name: planet.name };
        }
        return null;
    }

    playerDockedAtPlanet(player, systemIndex, planetIndex) {
        console.log(`[WM] Attempting playerDockedAtPlanet for player ${player ? player.id : 'UNKNOWN'} at S:${systemIndex} P:${planetIndex}`);
        if (!player) {
            console.error(
                "[WM] playerDockedAtPlanet: Player object is null/undefined.",
            );
            return false;
        }
        const planet = this.getPlanet(systemIndex, planetIndex);
        if (!planet) {
            console.error(
                `[WM] playerDockedAtPlanet: Planet ${planetIndex} in system ${systemIndex} not found for player ${player.id}.`,
            );
            return false;
        }

        console.log(`[WM] Planet ${planet.name} current dockedShipId: ${planet.dockedShipId}`);
        if (planet.dockedShipId && planet.dockedShipId !== player.id) {
            console.warn(
                `[WM] playerDockedAtPlanet: Planet ${planet.name} is already occupied by ${planet.dockedShipId}. Player ${player.id} cannot dock.`,
            );
            return false; 
        }

        // If player was previously docked elsewhere server-side, clear that old docking spot.
        // This is important if the client somehow got desynced or if a player logs back in.
        if (player.dockedAtPlanetIdentifier && 
            (player.dockedAtPlanetIdentifier.systemIndex !== systemIndex ||
             player.dockedAtPlanetIdentifier.planetIndex !== planetIndex)) {
            console.log(`[WM] Player ${player.id} was previously docked at S:${player.dockedAtPlanetIdentifier.systemIndex} P:${player.dockedAtPlanetIdentifier.planetIndex}. Undocking them server-side.`);
            this.playerUndockedFromPlanet(
                player, // Pass the player object itself
                player.dockedAtPlanetIdentifier.systemIndex,
                player.dockedAtPlanetIdentifier.planetIndex,
            );
        }
        
        planet.dockedShipId = player.id; 
        console.log(
            `[WM] Player ${player.id} server-side DOCKED at ${planet.name} (System: ${this.systems[systemIndex].name}). Planet dockedShipId set to ${player.id}.`,
        );
        return true;
    }

    playerUndockedFromPlanet(player, systemIndex, planetIndex) { // Changed to accept player object
        console.log(`[WM] Attempting playerUndockedFromPlanet for player ${player ? player.id : 'UNKNOWN'} from S:${systemIndex} P:${planetIndex}`);
        if (!player) { // Check if player object is valid
             console.error("[WM] playerUndockedFromPlanet: Player object is null/undefined.");
            return false;
        }
        const planet = this.getPlanet(systemIndex, planetIndex);
        if (!planet) {
            console.error(`[WM] playerUndockedFromPlanet: Planet ${planetIndex} in system ${systemIndex} not found for player ${player.id}.`);
            return false;
        }

        if (planet.dockedShipId === player.id) {
            planet.dockedShipId = null;
            console.log(
                `[WM] Player ${player.id} server-side UNDOCKED from ${planet.name}. Planet dockedShipId set to null.`,
            );
            return true;
        } else if (planet.dockedShipId) {
             console.warn(`[WM] playerUndockedFromPlanet: Player ${player.id} tried to undock from ${planet.name}, but it's occupied by ${planet.dockedShipId}.`);
        } else {
            console.warn(`[WM] playerUndockedFromPlanet: Player ${player.id} tried to undock from ${planet.name}, but it was already unoccupied.`);
        }
        return false;
    }

    getSystemsForClient() {
        return this.systems.map((s) => ({
            name: s.name,
            universeX: s.universeX,
            universeY: s.universeY,
            connections: s.connections,
            planets: s.planets.map((p) => ({
                name: p.name,
                x: p.x,
                y: p.y,
                imageFile: p.imageFile,
                planetImageScale: p.planetImageScale,
            })),
            backgroundFile: s.backgroundFile, 
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
            console.log(`[WM] Received 'dock' request from ${socket.id} for S:${systemIndex} P:${planetIndex}`);
            const player = playerManager.getPlayer(socket.id); 
            if (!player) { 
                console.error(`[WM] Dock attempt by unknown player ID ${socket.id}`);
                return socket.emit("actionFailed", {
                    message: "Player not found for docking. Please relog.", 
                });
            }
            console.log(`[WM] Player ${player.id} (Username: ${player.username}) attempting dock. Current system: ${player.system}, Hyperjump: ${player.hyperjumpState}`);


            if (player.hyperjumpState === "charging") { 
                 console.warn(`[WM] Dock denied for ${player.id}: hyperdrive charging.`);
                return socket.emit("actionFailed", {
                    message: "Cannot dock while hyperdrive is charging.",
                });
            }

            if (player.system !== systemIndex) { 
                console.warn(`[WM] Dock denied for ${player.id}: wrong system. Player in ${player.system}, target ${systemIndex}`);
                return socket.emit("actionFailed", {
                    message: "Cannot dock: Wrong system.",
                });
            }
            const planet = this.getPlanet(systemIndex, planetIndex); 
            if (!planet) {
                console.error(`[WM] Dock denied for ${player.id}: planet ${planetIndex} in system ${systemIndex} not found.`);
                return socket.emit("actionFailed", {
                    message: "Cannot dock: Planet not found.",
                });
            }
            console.log(`[WM] Planet ${planet.name} found. Current occupant: ${planet.dockedShipId}`);


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

                console.log(`[WM] Emitting 'dockConfirmed' to ${player.id} for ${planet.name}.`);
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
                    system: player.system 
                };
                if (missionCompletionResult.creditsChanged)
                    updatesForPlayer.credits = player.credits;
                if (missionCompletionResult.cargoChanged)
                    updatesForPlayer.cargo = player.cargo;
                if (missionCompletionResult.missionsChanged)
                    updatesForPlayer.activeMissions = player.activeMissions;
                
                playerManager.updatePlayerState(socket.id, updatesForPlayer); 
                console.log(`[WM] Player ${player.id} successfully docked at ${planet.name}. State updated and broadcasted.`);

            } else { 
                console.warn(`[WM] this.playerDockedAtPlanet returned false for ${player.id} at ${planet.name}.`);
                socket.emit("actionFailed", {
                    message: "Docking failed. Planet may be occupied or an error occurred.",
                });
            }
        });

        socket.on("undock", () => {
            console.log(`[WM] Received 'undock' request from ${socket.id}`);
            const player = playerManager.getPlayer(socket.id);
            if (!player) {
                console.error(`[WM] Undock attempt by unknown player ID ${socket.id}`);
                return socket.emit("actionFailed", {
                    message: "Player not found for undocking.",
                });
            }
             console.log(`[WM] Player ${player.id} (Username: ${player.username}) attempting undock. Docked at: ${JSON.stringify(player.dockedAtPlanetIdentifier)}`);

            if (!player.dockedAtPlanetIdentifier) {
                console.warn(`[WM] Undock denied for ${player.id}: server state says not docked.`);
                return socket.emit("actionFailed", {
                    message: "Not docked (according to server).",
                });
            }
            const { systemIndex, planetIndex } =
                player.dockedAtPlanetIdentifier;
            
            if (this.playerUndockedFromPlanet(player, systemIndex, planetIndex)) {
                const oldDockedIdentifier = player.dockedAtPlanetIdentifier; // Store for logging
                player.dockedAtPlanetIdentifier = null;
                console.log(`[WM] Emitting 'undockConfirmed' to ${player.id}.`);
                socket.emit("undockConfirmed");
                playerManager.updatePlayerState(socket.id, {
                    dockedAtPlanetIdentifier: null,
                });
                console.log(`[WM] Player ${player.id} successfully undocked from S:${oldDockedIdentifier.systemIndex} P:${oldDockedIdentifier.planetIndex}. State updated.`);
            } else {
                console.warn(`[WM] this.playerUndockedFromPlanet returned false for ${player.id}.`);
                socket.emit("actionFailed", {
                    message: "Server undocking failed. This shouldn't happen if you were docked.",
                });
            }
        });
    }
}

module.exports = WorldManager;
