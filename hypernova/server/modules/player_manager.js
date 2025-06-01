// hypernova/server/modules/player_manager.js
const { MISSION_TYPES } = require("../config/game_config");
// const gameConfig = require("../config/game_config"); // No, gameConfig is passed in constructor

class PlayerManager {
    constructor(
        io,
        shipTypes,
        tradeGoods,
        gameConfigInstance,
        worldManagerInstance,
    ) {
        this.io = io;
        this.shipTypes = shipTypes;
        this.tradeGoods = tradeGoods;
        this.gameConfig = gameConfigInstance;
        this.players = {};
        this.worldManager = worldManagerInstance;
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
            hyperjumpState: "idle",
            hyperjumpChargeTimeoutId: null,
        };

        console.log(
            `Player ${socket.id} connected. Initial ship: ${defaultShipType.name}. Initial credits: ${this.players[socket.id].credits}`,
        );

        socket.emit("init", {
            id: socket.id,
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

        this.registerSocketHandlers(socket);

        socket.on("clientLoadedDockedState", (receivedSyncData) => {
            console.log(
                `PlayerManager: Received 'clientLoadedDockedState' from ${socket.id} with data:`,
                JSON.stringify(receivedSyncData),
            );
            const player = this.players[socket.id];

            if (player && receivedSyncData) {
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
                            `PlayerManager: Unknown ship type ${receivedSyncData.type} for player ${socket.id}.`,
                        );
                    }
                }

                player.hyperjumpState = "idle"; // Ensure idle on load
                if (player.hyperjumpChargeTimeoutId) {
                    clearTimeout(player.hyperjumpChargeTimeoutId);
                    player.hyperjumpChargeTimeoutId = null;
                }

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
                        }
                    }
                    player.vx = 0;
                    player.vy = 0;

                    if (
                        this.worldManager &&
                        typeof this.worldManager.playerDockedAtPlanet ===
                            "function"
                    ) {
                        this.worldManager.playerDockedAtPlanet(
                            player,
                            player.dockedAtPlanetIdentifier.systemIndex,
                            player.dockedAtPlanetIdentifier.planetIndex,
                        );
                    }
                    console.log(
                        `PlayerManager: Synced server state for ${socket.id} to be DOCKED at system ${player.system}, planet ${player.dockedAtPlanetIdentifier.planetIndex}.`,
                    );
                } else {
                    player.dockedAtPlanetIdentifier = null;
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
                        `PlayerManager: Synced server state for ${socket.id} to be UNDOCKED in system ${player.system}.`,
                    );
                }

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
                    hyperjumpState: player.hyperjumpState, // ensure client knows it's idle
                };
                this.updatePlayerState(socket.id, comprehensiveUpdate);
                console.log(
                    `PlayerManager: Server state for ${socket.id} fully updated and broadcasted after client load.`,
                );
            } else {
                console.warn(
                    `PlayerManager: Invalid data for 'clientLoadedDockedState' from ${socket.id}.`,
                );
            }
        });
    }

    handleDisconnect(socket) {
        const player = this.getPlayer(socket.id);
        if (player) {
            if (
                player.dockedAtPlanetIdentifier &&
                this.worldManager &&
                typeof this.worldManager.playerUndockedFromPlanet === "function"
            ) {
                this.worldManager.playerUndockedFromPlanet(
                    player,
                    player.dockedAtPlanetIdentifier.systemIndex,
                    player.dockedAtPlanetIdentifier.planetIndex,
                );
            }
            if (player.hyperjumpChargeTimeoutId) {
                clearTimeout(player.hyperjumpChargeTimeoutId);
                player.hyperjumpChargeTimeoutId = null;
                player.hyperjumpState = "idle";
                console.log(
                    `Player ${socket.id} disconnected, hyperjump charge cancelled.`,
                );
            }
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
        if (this.players[playerId]) {
            const updateToSend = {};
            // Only copy known properties from specificUpdates to prevent unintended large objects
            const allowedKeys = [
                "x",
                "y",
                "vx",
                "vy",
                "angle",
                "system",
                "dockedAtPlanetIdentifier",
                "credits",
                "cargo",
                "health",
                "maxHealth",
                "type",
                "maxCargo",
                "weapons",
                "activeWeapon",
                "activeMissions",
                "destroyed",
                "hyperjumpState",
            ];
            for (const key of allowedKeys) {
                if (specificUpdates.hasOwnProperty(key)) {
                    updateToSend[key] = specificUpdates[key];
                }
            }
            if (Object.keys(updateToSend).length > 0) {
                this.io.emit("state", { [playerId]: updateToSend });
            } else if (!specificUpdates) {
                // if specificUpdates is null/undefined, send whole player object
                this.io.emit("state", { [playerId]: this.players[playerId] });
            }
        }
    }

    registerSocketHandlers(socket) {
        socket.on("control", (data) => {
            const player = this.getPlayer(socket.id);
            if (!player || player.dockedAtPlanetIdentifier) return;

            // Client-side logic prevents new thrust/rotation if charging.
            // Server updates position based on client's drift.
            player.x = data.x;
            player.y = data.y;
            player.vx = data.vx;
            player.vy = data.vy;
            if (player.hyperjumpState !== "charging") {
                // Only update angle if not charging
                player.angle = data.angle;
            }
            // System changes are handled by hyperjump logic only
            // if (data.system !== undefined && player.system !== data.system) { player.system = data.system; }

            const minimalUpdate = {
                x: player.x,
                y: player.y,
                vx: player.vx,
                vy: player.vy,
                angle: player.angle,
                // system: player.system, // System is not sent in minimal update unless changed by hyperjump
            };
            socket.broadcast.emit("state", { [socket.id]: minimalUpdate });
        });

        socket.on("requestHyperjump", () => {
            const player = this.getPlayer(socket.id);
            if (!player || player.destroyed) return;

            if (player.dockedAtPlanetIdentifier) {
                return socket.emit("hyperjumpDenied", {
                    message: "Cannot engage hyperdrive while docked.",
                });
            }
            if (player.hyperjumpState !== "idle") {
                return socket.emit("hyperjumpDenied", {
                    message: "Hyperdrive already engaged or cooling down.",
                });
            }

            const currentSystemData = this.worldManager.getSystem(
                player.system,
            );
            if (currentSystemData && currentSystemData.planets) {
                for (const planet of currentSystemData.planets) {
                    const distSq =
                        (player.x - planet.x) ** 2 + (player.y - planet.y) ** 2;
                    if (
                        distSq <
                        this.gameConfig
                            .MIN_HYPERJUMP_DISTANCE_FROM_PLANET_SQUARED
                    ) {
                        return socket.emit("hyperjumpDenied", {
                            message: "Too close to a celestial body.",
                        });
                    }
                }
            }

            player.hyperjumpState = "charging";
            // Also update player state for other clients to know this player is charging
            this.updatePlayerState(socket.id, { hyperjumpState: "charging" });
            socket.emit("hyperjumpChargeStarted", {
                chargeTime: this.gameConfig.HYPERJUMP_CHARGE_TIME_MS,
            });
            console.log(`Player ${socket.id} starting hyperjump charge.`);

            player.hyperjumpChargeTimeoutId = setTimeout(() => {
                if (player.hyperjumpState !== "charging" || player.destroyed) {
                    // Check destroyed status too
                    player.hyperjumpChargeTimeoutId = null;
                    if (
                        player.hyperjumpState === "charging" &&
                        !player.destroyed
                    )
                        player.hyperjumpState = "idle"; // Reset if not destroyed but cancelled
                    this.updatePlayerState(socket.id, {
                        hyperjumpState: player.hyperjumpState,
                    });
                    return;
                }

                player.hyperjumpState = "idle";
                player.hyperjumpChargeTimeoutId = null;

                const oldSystem = player.system;
                player.system =
                    (player.system + 1) % this.worldManager.systems.length;

                let newX,
                    newY,
                    newAngle = 0;
                const targetSystemData = this.worldManager.getSystem(
                    player.system,
                );
                if (targetSystemData && targetSystemData.planets.length > 0) {
                    const arrivalPlanet = targetSystemData.planets[0];
                    newX = arrivalPlanet.x - 250;
                    newY = arrivalPlanet.y;
                    newAngle = 0;
                } else {
                    newX = 100;
                    newY = this.gameConfig.PLAYER_SPAWN_Y || 300;
                    newAngle = 0;
                }

                player.x = newX;
                player.y = newY;
                player.vx = 0;
                player.vy = 0;
                player.angle = newAngle;
                player.dockedAtPlanetIdentifier = null;

                console.log(
                    `Player ${socket.id} hyperjump complete. Old system: ${oldSystem}, New system: ${player.system}.`,
                );

                socket.emit("hyperjumpComplete", {
                    newSystem: player.system,
                    newX: player.x,
                    newY: player.y,
                    newAngle: player.angle,
                });

                this.updatePlayerState(socket.id, {
                    system: player.system,
                    x: player.x,
                    y: player.y,
                    vx: player.vx,
                    vy: player.vy,
                    angle: player.angle,
                    dockedAtPlanetIdentifier: null,
                    hyperjumpState: "idle",
                });
            }, this.gameConfig.HYPERJUMP_CHARGE_TIME_MS);
        });

        socket.on("cancelHyperjump", () => {
            const player = this.getPlayer(socket.id);
            if (
                player &&
                player.hyperjumpState === "charging" &&
                player.hyperjumpChargeTimeoutId
            ) {
                clearTimeout(player.hyperjumpChargeTimeoutId);
                player.hyperjumpChargeTimeoutId = null;
                player.hyperjumpState = "idle";
                this.updatePlayerState(socket.id, { hyperjumpState: "idle" });
                socket.emit("hyperjumpCancelled", {
                    message: "Hyperjump cancelled by player.",
                });
                console.log(`Player ${socket.id} cancelled hyperjump charge.`);
            }
        });

        socket.on("equipWeapon", ({ weapon: weaponName }) => {
            const player = this.getPlayer(socket.id);
            if (!player || player.hyperjumpState === "charging") {
                return socket.emit("actionFailed", {
                    message:
                        "Cannot modify equipment while hyperdrive is active.",
                });
            }
            const weaponData = this.gameConfig.staticWeaponsData[weaponName];
            if (!weaponData)
                return socket.emit("actionFailed", {
                    message: "Invalid weapon.",
                });

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
            if (!player || player.hyperjumpState === "charging") {
                return socket.emit("actionFailed", {
                    message: "Cannot buy ship while hyperdrive is active.",
                });
            }
            if (shipTypeIndex < 0 || shipTypeIndex >= this.shipTypes.length) {
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

    handlePlayerHitDuringHyperjumpCharge(playerId) {
        const player = this.getPlayer(playerId);
        if (
            player &&
            player.hyperjumpState === "charging" &&
            player.hyperjumpChargeTimeoutId
        ) {
            clearTimeout(player.hyperjumpChargeTimeoutId);
            player.hyperjumpChargeTimeoutId = null;
            player.hyperjumpState = "idle";
            this.updatePlayerState(playerId, { hyperjumpState: "idle" }); // Inform all clients
            this.io
                .to(playerId)
                .emit("hyperjumpCancelled", {
                    message: "Hyperjump disrupted by enemy fire!",
                });
            console.log(
                `Player ${playerId} hyperjump charge disrupted by damage.`,
            );
        }
    }
}

module.exports = PlayerManager;
