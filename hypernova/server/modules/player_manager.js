// hypernova/server/modules/player_manager.js
const { MISSION_TYPES } = require("../config/game_config"); // For mission checks if needed here

class PlayerManager {
    constructor(io, shipTypes, tradeGoods, gameConfig) {
        this.io = io;
        this.shipTypes = shipTypes;
        this.tradeGoods = tradeGoods;
        this.gameConfig = gameConfig;
        this.players = {}; // Was 'ships' in original server.js
    }

    handleConnection(socket, initialWorldData = {}) {
        // <<<< MODIFIED HERE
        const defaultShipType =
            this.shipTypes[this.gameConfig.DEFAULT_PLAYER_SHIP_TYPE_INDEX] ||
            this.shipTypes[0];
        this.players[socket.id] = {
            id: socket.id,
            x: 400,
            y: 300,
            angle: 0,
            vx: 0,
            vy: 0,
            type: this.gameConfig.DEFAULT_PLAYER_SHIP_TYPE_INDEX,
            credits: this.gameConfig.DEFAULT_PLAYER_CREDITS,
            cargo: new Array(this.tradeGoods.length).fill(0),
            maxCargo: defaultShipType.maxCargo,
            health: defaultShipType.maxHealth || 100,
            maxHealth: defaultShipType.maxHealth || 100,
            weapons: [], // Initially no weapons
            activeMissions: [],
            activeWeapon: null, // No default weapon initially
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

        // Send initial state to the new player
        socket.emit("init", {
            id: socket.id,
            ships: this.players, // Send all current players
            gameData: {
                ...initialWorldData, // <<<< MODIFIED HERE: Spread the general game data
                tradeGoods: this.tradeGoods,
                weapons: this.gameConfig.staticWeaponsData, // Will be loaded by DataLoader
                shipTypes: this.shipTypes,
                MISSION_TYPES: this.gameConfig.MISSION_TYPES,
                // Economies and full systems are now part of initialWorldData
            },
        });

        // Notify other players
        socket.broadcast.emit("playerJoined", {
            id: socket.id,
            ship: this.players[socket.id],
        });

        this.registerSocketHandlers(socket);
    }

    handleDisconnect(socket) {
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
            this.io.emit("state", { [playerId]: updates }); // Send specific updates
        }
    }

    broadcastPlayerState(playerId, specificUpdates) {
        if (this.players[playerId]) {
            const updateToSend = specificUpdates || this.players[playerId];
            this.io.emit("state", { [playerId]: updateToSend });
        }
    }

    registerSocketHandlers(socket) {
        socket.on("control", (data) => {
            const player = this.getPlayer(socket.id);
            if (!player) return;

            player.x = data.x;
            player.y = data.y;
            player.vx = data.vx;
            player.vy = data.vy;
            player.angle = data.angle;
            if (data.system !== undefined && player.system !== data.system) {
                player.system = data.system;
                // If player changed system, they are no longer docked
                if (player.dockedAtPlanetIdentifier) {
                    player.dockedAtPlanetIdentifier = null;
                }
            }

            // Minimal update for others
            const minimalUpdate = {
                x: player.x,
                y: player.y,
                vx: player.vx,
                vy: player.vy,
                angle: player.angle,
                system: player.system,
            };
            if (data.system !== undefined && player.system !== data.system) {
                // This condition might be redundant with the one above for player.system update
                minimalUpdate.dockedAtPlanetIdentifier = null; // Explicitly undock on system change
            }

            // Only broadcast to OTHERS, the player's client already predicted this.
            socket.broadcast.emit("state", { [socket.id]: minimalUpdate });
        });

        socket.on("equipWeapon", ({ weapon: weaponName }) => {
            const player = this.getPlayer(socket.id);
            const weaponData = this.gameConfig.staticWeaponsData[weaponName]; // Loaded via DataLoader
            if (!player || !weaponData) {
                return socket.emit("actionFailed", {
                    message: "Invalid weapon or player.",
                });
            }

            if (!player.weapons.includes(weaponName)) {
                // Buying a new weapon
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
                // Equipping an owned weapon
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
            player.cargo = new Array(this.tradeGoods.length).fill(0); // Empty cargo on new ship
            player.maxHealth = newShipType.maxHealth || 100;
            player.health = player.maxHealth;
            // Optional: Reset weapons or transfer compatible ones. For now, keeping them.

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

    // Called periodically by server.js
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
                    // Update player state after mission manager modifies it
                    this.updatePlayerState(player.id, {
                        credits: player.credits,
                        activeMissions: player.activeMissions, // Pruned list from missionManager
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
