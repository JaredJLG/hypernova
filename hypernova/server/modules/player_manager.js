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
            `Player ${socket.id} connected. Initial ship: ${defaultShipType.name}`,
        );

        socket.emit("init", {
            id: socket.id,
            // Send ALL players to new client, and player's own ship is among them.
            // Client will use data.ships[data.id] for its own ship if needed.
            ships: this.players,
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

        // Register general handlers
        this.registerSocketHandlers(socket);

        // === START: NEW EVENT LISTENER FOR DOCKED STATE SYNC ===
        socket.on("clientLoadedDockedState", (dockedAtDetails) => {
            console.log(
                `PlayerManager: Received 'clientLoadedDockedState' from ${socket.id} with details:`,
                JSON.stringify(dockedAtDetails),
            );
            const player = this.players[socket.id];

            if (
                player &&
                dockedAtDetails &&
                dockedAtDetails.systemIndex !== undefined &&
                dockedAtDetails.planetIndex !== undefined
            ) {
                player.dockedAtPlanetIdentifier = {
                    systemIndex: dockedAtDetails.systemIndex,
                    planetIndex: dockedAtDetails.planetIndex,
                };
                player.system = dockedAtDetails.systemIndex;

                // Get planet's actual coordinates from WorldManager to ensure player is positioned correctly
                if (
                    this.worldManager &&
                    typeof this.worldManager.getPlanet === "function"
                ) {
                    const planet = this.worldManager.getPlanet(
                        dockedAtDetails.systemIndex,
                        dockedAtDetails.planetIndex,
                    );
                    if (planet) {
                        player.x = planet.x;
                        player.y = planet.y;
                    } else {
                        console.warn(
                            `PlayerManager: 'clientLoadedDockedState' - Planet not found in WorldManager for system ${dockedAtDetails.systemIndex}, planet ${dockedAtDetails.planetIndex}. Player position not synced to planet.`,
                        );
                    }
                } else {
                    console.warn(
                        `PlayerManager: 'clientLoadedDockedState' - WorldManager or getPlanet method not available. Player position not synced to planet.`,
                    );
                }

                player.vx = 0;
                player.vy = 0;

                if (
                    this.worldManager &&
                    typeof this.worldManager.playerDockedAtPlanet === "function"
                ) {
                    this.worldManager.playerDockedAtPlanet(
                        player,
                        dockedAtDetails.systemIndex,
                        dockedAtDetails.planetIndex,
                    );
                    console.log(
                        `PlayerManager: Synced server state for ${socket.id} to be DOCKED at system ${dockedAtDetails.systemIndex}, planet ${dockedAtDetails.planetIndex}.`,
                    );
                } else {
                    console.error(
                        `PlayerManager: worldManager or worldManager.playerDockedAtPlanet method not found! Cannot update planet dock state on server.`,
                    );
                }

                // Send updated state (especially position and docked status) back to the client
                // to ensure client and server are perfectly aligned after this server-side sync.
                this.updatePlayerState(socket.id, {
                    x: player.x,
                    y: player.y,
                    vx: player.vx,
                    vy: player.vy,
                    system: player.system,
                    dockedAtPlanetIdentifier: player.dockedAtPlanetIdentifier,
                });
            } else {
                console.warn(
                    `PlayerManager: Invalid data for 'clientLoadedDockedState' from ${socket.id} or player not found. Details:`,
                    JSON.stringify(dockedAtDetails),
                );
            }
        });
        // === END: NEW EVENT LISTENER ===
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
            // Emit to all, including the player who made the change, to ensure sync
            this.io.emit("state", { [playerId]: this.players[playerId] }); // Send full player state for simplicity or specific updates
            // console.log(`PlayerManager: Emitted state update for ${playerId}:`, JSON.stringify({ [playerId]: this.players[playerId] }));
        }
    }

    // broadcastPlayerState not strictly needed if updatePlayerState emits to all.
    // Kept for now if you have specific use cases for it.
    broadcastPlayerState(playerId, specificUpdates) {
        if (this.players[playerId]) {
            const updateToSend = specificUpdates || this.players[playerId];
            this.io.emit("state", { [playerId]: updateToSend });
        }
    }

    registerSocketHandlers(socket) {
        socket.on("control", (data) => {
            const player = this.getPlayer(socket.id);
            if (!player || player.dockedAtPlanetIdentifier) return; // Ignore controls if docked server-side

            player.x = data.x;
            player.y = data.y;
            player.vx = data.vx;
            player.vy = data.vy;
            player.angle = data.angle;

            let systemChanged = false;
            if (data.system !== undefined && player.system !== data.system) {
                player.system = data.system;
                systemChanged = true; // If player changed system, they are no longer docked (should be handled by client already)
            }

            const minimalUpdate = {
                x: player.x,
                y: player.y,
                vx: player.vx,
                vy: player.vy,
                angle: player.angle,
                system: player.system,
            };
            // If system changed, client should already have cleared its docked state.
            // Server side player.dockedAtPlanetIdentifier is cleared by "undock" or "clientLoadedDockedState" (if it comes with null)

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
            player.type = shipTypeIndex;
            player.maxCargo = newShipType.maxCargo;
            player.cargo = new Array(this.tradeGoods.length).fill(0);
            player.maxHealth = newShipType.maxHealth || 100;
            player.health = player.maxHealth;

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
