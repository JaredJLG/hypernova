/* ===== START: hypernova/server/modules/player_manager.js ===== */
// hypernova/server/modules/player_manager.js
const { MISSION_TYPES } = require("../config/game_config");

class PlayerManager {
    constructor(io, shipTypes, tradeGoods, gameConfig, worldManagerInstance) {
        // Ensure worldManagerInstance is passed from server.js
        this.io = io;
        this.shipTypes = shipTypes;
        this.tradeGoods = tradeGoods;
        this.gameConfig = gameConfig;
        this.players = {};
        this.worldManager = worldManagerInstance; // Store worldManager
    }

    handleConnection(socket, initialWorldData = {}) {
        const defaultShipType =
            this.shipTypes[this.gameConfig.DEFAULT_PLAYER_SHIP_TYPE_INDEX] ||
            this.shipTypes[0];
        this.players[socket.id] = {
            id: socket.id,
            x: this.gameConfig.PLAYER_SPAWN_X || 400,
            y: this.gameConfig.PLAYER_SPAWN_Y || 300,
            angle: 0,
            vx: 0,
            vy: 0,
            type: this.gameConfig.DEFAULT_PLAYER_SHIP_TYPE_INDEX,
            credits: this.gameConfig.DEFAULT_PLAYER_CREDITS,
            cargo: new Array(this.tradeGoods.length).fill(0),
            maxCargo: defaultShipType.maxCargo,
            health: defaultShipType.maxHealth || 100,
            maxHealth: defaultShipType.maxHealth || 100,
            weapons: [],
            activeMissions: [],
            activeWeapon: null,
            lastShot: 0,
            system: 0,
            dockedAtPlanetIdentifier: null,
            destroyed: false,
            color:
                "#" +
                Math.floor(Math.random() * 0xffffff)
                    .toString(16)
                    .padStart(6, "0"),
        };

        console.log(
            `Player ${socket.id} connected. Initial ship: ${defaultShipType.name}. Initial credits: ${this.players[socket.id].credits}`,
        );

        socket.emit("init", {
            id: socket.id,
            ships: this.players, // Server sends its current view of players (new player is default)
            gameData: {
                ...initialWorldData,
                tradeGoods: this.tradeGoods,
                weapons: this.gameConfig.staticWeaponsData,
                shipTypes: this.shipTypes,
                MISSION_TYPES: this.gameConfig.MISSION_TYPES,
            },
        });

        socket.broadcast.emit("playerJoined", {
            id: socket.id,
            ship: this.players[socket.id],
        });

        this.registerSocketHandlers(socket);

        socket.on("clientLoadedDockedState", (receivedSyncData) => {
            console.log(
                `PlayerManager: Received 'clientLoadedDockedState' from ${socket.id} with data:`,
                JSON.stringify(receivedSyncData),
            );
            const player = this.players[socket.id];

            if (player && receivedSyncData) {
                // --- CRITICAL: Update server's player object with client's loaded data ---
                if (receivedSyncData.credits !== undefined)
                    player.credits = receivedSyncData.credits;
                if (receivedSyncData.cargo !== undefined)
                    player.cargo = receivedSyncData.cargo;
                if (receivedSyncData.weapons !== undefined)
                    player.weapons = receivedSyncData.weapons;
                if (receivedSyncData.activeWeapon !== undefined)
                    player.activeWeapon = receivedSyncData.activeWeapon;
                if (receivedSyncData.health !== undefined)
                    player.health = receivedSyncData.health;
                if (receivedSyncData.activeMissions !== undefined)
                    player.activeMissions = receivedSyncData.activeMissions;

                if (receivedSyncData.type !== undefined) {
                    player.type = receivedSyncData.type;
                    const shipTypeDef = this.shipTypes[player.type];
                    if (shipTypeDef) {
                        player.maxCargo = shipTypeDef.maxCargo;
                        player.maxHealth = shipTypeDef.maxHealth;
                        if (player.health > player.maxHealth) {
                            player.health = player.maxHealth;
                        }
                    } else {
                        console.warn(
                            `PlayerManager: Unknown ship type ${receivedSyncData.type} received for player ${socket.id}. MaxCargo/MaxHealth may be incorrect.`,
                        );
                    }
                }
                // --- End critical update section ---

                // Update positional and docking state based on receivedSyncData
                if (
                    receivedSyncData.dockedAtDetails &&
                    receivedSyncData.dockedAtDetails.systemIndex !==
                        undefined &&
                    receivedSyncData.dockedAtDetails.planetIndex !== undefined
                ) {
                    player.dockedAtPlanetIdentifier = {
                        systemIndex:
                            receivedSyncData.dockedAtDetails.systemIndex,
                        planetIndex:
                            receivedSyncData.dockedAtDetails.planetIndex,
                    };
                    player.system =
                        receivedSyncData.dockedAtDetails.systemIndex;

                    if (
                        this.worldManager &&
                        typeof this.worldManager.getPlanet === "function"
                    ) {
                        const planet = this.worldManager.getPlanet(
                            player.dockedAtPlanetIdentifier.systemIndex,
                            player.dockedAtPlanetIdentifier.planetIndex,
                        );
                        if (planet) {
                            player.x = planet.x;
                            player.y = planet.y;
                        } else {
                            console.warn(
                                `PlayerManager ('clientLoadedDockedState'): Planet not found in WorldManager for system ${player.dockedAtPlanetIdentifier.systemIndex}, planet ${player.dockedAtPlanetIdentifier.planetIndex}. Player position not synced to planet.`,
                            );
                        }
                    } else {
                        console.warn(
                            `PlayerManager ('clientLoadedDockedState'): WorldManager or getPlanet method not available. Player position not synced to planet.`,
                        );
                    }
                    player.vx = 0;
                    player.vy = 0;

                    if (
                        this.worldManager &&
                        typeof this.worldManager.playerDockedAtPlanet ===
                            "function"
                    ) {
                        this.worldManager.playerDockedAtPlanet(
                            player, // Pass the now-updated player object
                            player.dockedAtPlanetIdentifier.systemIndex,
                            player.dockedAtPlanetIdentifier.planetIndex,
                        );
                    } else {
                        console.error(
                            `PlayerManager ('clientLoadedDockedState'): worldManager or worldManager.playerDockedAtPlanet method not found! Cannot update planet dock state on server.`,
                        );
                    }
                    console.log(
                        `PlayerManager: Synced server state for ${socket.id} to be DOCKED at system ${player.system}, planet ${player.dockedAtPlanetIdentifier.planetIndex}. Credits: ${player.credits}`,
                    );
                } else {
                    // Player is NOT DOCKED according to their loaded save
                    player.dockedAtPlanetIdentifier = null;
                    // If a player was previously thought to be docked by the server (e.g. abrupt disconnect), ensure worldManager reflects this
                    // This is complex, for now, player.dockedAtPlanetIdentifier = null is the main thing.
                    // WorldManager's playerUndockedFromPlanet might be called if player.dockedAtPlanetIdentifier *was* set on the fresh player obj, but it's null.

                    if (receivedSyncData.x !== undefined)
                        player.x = receivedSyncData.x;
                    if (receivedSyncData.y !== undefined)
                        player.y = receivedSyncData.y;
                    if (receivedSyncData.angle !== undefined)
                        player.angle = receivedSyncData.angle;
                    if (receivedSyncData.vx !== undefined)
                        player.vx = receivedSyncData.vx;
                    if (receivedSyncData.vy !== undefined)
                        player.vy = receivedSyncData.vy;
                    if (receivedSyncData.system !== undefined)
                        player.system = receivedSyncData.system;
                    console.log(
                        `PlayerManager: Synced server state for ${socket.id} to be UNDOCKED in system ${player.system}. Credits: ${player.credits}`,
                    );
                }

                // Send the fully updated server state back to the client (and others) for confirmation and sync.
                const comprehensiveUpdate = {
                    x: player.x,
                    y: player.y,
                    vx: player.vx,
                    vy: player.vy,
                    angle: player.angle,
                    system: player.system,
                    dockedAtPlanetIdentifier: player.dockedAtPlanetIdentifier,
                    credits: player.credits,
                    cargo: player.cargo,
                    weapons: player.weapons,
                    activeWeapon: player.activeWeapon,
                    health: player.health,
                    maxHealth: player.maxHealth,
                    type: player.type,
                    maxCargo: player.maxCargo,
                    activeMissions: player.activeMissions,
                    // destroyed: player.destroyed // if relevant
                };
                this.updatePlayerState(socket.id, comprehensiveUpdate);
                console.log(
                    `PlayerManager: Server state for ${socket.id} fully updated and broadcasted after client load. Player credits on server: ${player.credits}`,
                );
            } else {
                console.warn(
                    `PlayerManager: Invalid data for 'clientLoadedDockedState' from ${socket.id} or player not found. Player: ${!!player}, Data: ${JSON.stringify(receivedSyncData)}`,
                );
            }
        });
    }

    handleDisconnect(socket) {
        const player = this.getPlayer(socket.id);
        if (
            player &&
            player.dockedAtPlanetIdentifier &&
            this.worldManager &&
            typeof this.worldManager.playerUndockedFromPlanet === "function"
        ) {
            console.log(
                `PlayerManager: Player ${socket.id} disconnecting, attempting to clear dock status on server.`,
            );
            this.worldManager.playerUndockedFromPlanet(
                player,
                player.dockedAtPlanetIdentifier.systemIndex,
                player.dockedAtPlanetIdentifier.planetIndex,
            );
        }
        console.log(`Player ${socket.id} disconnected.`);
        delete this.players[socket.id];
        this.io.emit("playerLeft", socket.id);
    }

    getPlayer(playerId) {
        return this.players[playerId];
    }

    updatePlayerState(playerId, updates) {
        if (this.players[playerId]) {
            Object.assign(this.players[playerId], updates);
            this.io.emit("state", { [playerId]: this.players[playerId] });
        }
    }

    broadcastPlayerState(playerId, specificUpdates) {
        // Can be removed if updatePlayerState is always used
        if (this.players[playerId]) {
            const updateToSend = specificUpdates || this.players[playerId];
            this.io.emit("state", { [playerId]: updateToSend });
        }
    }

    registerSocketHandlers(socket) {
        socket.on("control", (data) => {
            const player = this.getPlayer(socket.id);
            if (!player || player.dockedAtPlanetIdentifier) return;

            player.x = data.x;
            player.y = data.y;
            player.vx = data.vx;
            player.vy = data.vy;
            player.angle = data.angle;

            if (data.system !== undefined && player.system !== data.system) {
                player.system = data.system;
            }

            const minimalUpdate = {
                x: player.x,
                y: player.y,
                vx: player.vx,
                vy: player.vy,
                angle: player.angle,
                system: player.system,
            };
            socket.broadcast.emit("state", { [socket.id]: minimalUpdate });
        });

        socket.on("equipWeapon", ({ weapon: weaponName }) => {
            const player = this.getPlayer(socket.id);
            const weaponData = this.gameConfig.staticWeaponsData[weaponName];
            if (!player || !weaponData) {
                return socket.emit("actionFailed", {
                    message: "Invalid weapon or player.",
                });
            }

            if (!player.weapons.includes(weaponName)) {
                if (player.credits >= weaponData.price) {
                    player.credits -= weaponData.price;
                    player.weapons.push(weaponName);
                    player.activeWeapon = weaponName;
                    this.updatePlayerState(socket.id, {
                        credits: player.credits,
                        weapons: player.weapons,
                        activeWeapon: player.activeWeapon,
                    });
                    socket.emit("actionSuccess", {
                        message: `Purchased and equipped ${weaponName}.`,
                    });
                } else {
                    return socket.emit("actionFailed", {
                        message: "Not enough credits.",
                    });
                }
            } else {
                player.activeWeapon = weaponName;
                this.updatePlayerState(socket.id, {
                    activeWeapon: player.activeWeapon,
                });
                socket.emit("actionSuccess", {
                    message: `Equipped ${weaponName}.`,
                });
            }
        });

        socket.on("buyShip", ({ shipTypeIndex }) => {
            const player = this.getPlayer(socket.id);
            if (
                !player ||
                shipTypeIndex < 0 ||
                shipTypeIndex >= this.shipTypes.length
            ) {
                return socket.emit("actionFailed", {
                    message: "Invalid ship type.",
                });
            }

            const newShipType = this.shipTypes[shipTypeIndex];
            if (player.credits < newShipType.price) {
                return socket.emit("actionFailed", {
                    message: "Not enough credits.",
                });
            }

            player.credits -= newShipType.price;
            player.type = shipTypeIndex; // Update type
            player.maxCargo = newShipType.maxCargo;
            player.cargo = new Array(this.tradeGoods.length).fill(0); // Reset cargo
            player.maxHealth = newShipType.maxHealth || 100;
            player.health = player.maxHealth; // Full health on new ship

            this.updatePlayerState(socket.id, {
                credits: player.credits,
                type: player.type,
                maxCargo: player.maxCargo,
                cargo: player.cargo,
                maxHealth: player.maxHealth,
                health: player.health,
            });
            socket.emit("actionSuccess", {
                message: `Successfully purchased ${newShipType.name}.`,
            });
        });
    }

    checkAllPlayerMissionTimeouts(missionManager) {
        Object.values(this.players).forEach((player) => {
            if (
                player &&
                !player.destroyed &&
                player.activeMissions.length > 0
            ) {
                const { changed, completedOrFailed } =
                    missionManager.checkPlayerMissionTimeouts(player);
                if (changed) {
                    completedOrFailed.forEach((update) =>
                        this.io.to(player.id).emit("missionUpdate", update),
                    );
                    this.updatePlayerState(player.id, {
                        credits: player.credits,
                        activeMissions: player.activeMissions,
                    });
                }
            }
        });
    }

    getAllPlayers() {
        return this.players;
    }
}

module.exports = PlayerManager;
/* ===== END: hypernova/server/modules/player_manager.js ===== */
