// server/modules/player_manager.js
const { MISSION_TYPES } = require("../config/game_config");

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
            hyperjumpState: "idle", // idle, charging, jumping, cooldown
            hyperjumpChargeTimeoutId: null,
        };

        console.log(
            `Player ${socket.id} connected. Initial ship: ${defaultShipType.name}. Initial credits: ${this.players[socket.id].credits}`,
        );

        socket.emit("init", {
            id: socket.id,
            ships: this.players, // Send all current players
            gameData: {
                ...initialWorldData, // Will include systems with universeX,Y,connections
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
                `PlayerManager: Received 'clientLoadedDockedState' from ${socket.id}.`, 
            );
            const player = this.players[socket.id];

            if (player && receivedSyncData) {
                if (receivedSyncData.credits !== undefined) player.credits = receivedSyncData.credits;
                if (receivedSyncData.cargo !== undefined) player.cargo = receivedSyncData.cargo;
                if (receivedSyncData.weapons !== undefined) player.weapons = receivedSyncData.weapons;
                if (receivedSyncData.activeWeapon !== undefined) player.activeWeapon = receivedSyncData.activeWeapon;
                if (receivedSyncData.health !== undefined) player.health = receivedSyncData.health;
                if (receivedSyncData.activeMissions !== undefined) player.activeMissions = receivedSyncData.activeMissions;

                if (receivedSyncData.type !== undefined) {
                    player.type = receivedSyncData.type;
                    const shipTypeDef = this.shipTypes[player.type];
                    if (shipTypeDef) {
                        player.maxCargo = shipTypeDef.maxCargo;
                        player.maxHealth = shipTypeDef.maxHealth;
                        if (player.health > player.maxHealth) player.health = player.maxHealth;
                    }
                }

                player.hyperjumpState = "idle";
                if (player.hyperjumpChargeTimeoutId) {
                    clearTimeout(player.hyperjumpChargeTimeoutId);
                    player.hyperjumpChargeTimeoutId = null;
                }

                if (receivedSyncData.dockedAtDetails && receivedSyncData.dockedAtDetails.systemIndex !== undefined) {
                    player.dockedAtPlanetIdentifier = {
                        systemIndex: receivedSyncData.dockedAtDetails.systemIndex,
                        planetIndex: receivedSyncData.dockedAtDetails.planetIndex,
                    };
                    player.system = receivedSyncData.dockedAtDetails.systemIndex;
                    const planet = this.worldManager.getPlanet(player.system, player.dockedAtPlanetIdentifier.planetIndex);
                    if (planet) { player.x = planet.x; player.y = planet.y; }
                    player.vx = 0; player.vy = 0;
                    this.worldManager.playerDockedAtPlanet(player, player.system, player.dockedAtPlanetIdentifier.planetIndex);
                    console.log(`PlayerManager: ${socket.id} DOCKED at system ${player.system}, planet ${player.dockedAtPlanetIdentifier.planetIndex}.`);
                } else {
                    player.dockedAtPlanetIdentifier = null;
                    if (receivedSyncData.x !== undefined) player.x = receivedSyncData.x;
                    if (receivedSyncData.y !== undefined) player.y = receivedSyncData.y;
                    if (receivedSyncData.angle !== undefined) player.angle = receivedSyncData.angle;
                    if (receivedSyncData.vx !== undefined) player.vx = receivedSyncData.vx;
                    if (receivedSyncData.vy !== undefined) player.vy = receivedSyncData.vy;
                    if (receivedSyncData.system !== undefined) player.system = receivedSyncData.system;
                    console.log(`PlayerManager: ${socket.id} UNDOCKED in system ${player.system}.`);
                }
                this.broadcastPlayerState(socket.id, this.players[socket.id]); 
            }
        });
    }

    handleDisconnect(socket) {
        const player = this.getPlayer(socket.id);
        if (player) {
            if (player.dockedAtPlanetIdentifier) {
                this.worldManager.playerUndockedFromPlanet(
                    player,
                    player.dockedAtPlanetIdentifier.systemIndex,
                    player.dockedAtPlanetIdentifier.planetIndex,
                );
            }
            if (player.hyperjumpChargeTimeoutId) {
                clearTimeout(player.hyperjumpChargeTimeoutId);
                player.hyperjumpChargeTimeoutId = null;
            }
        }
        console.log(`Player ${socket.id} disconnected.`);
        delete this.players[socket.id];
        this.io.emit("playerLeft", socket.id);
    }

    getPlayer(playerId) {
        return this.players[playerId];
    }

    getAllPlayers() {
        return this.players;
    }

    updatePlayerState(playerId, updates) {
        if (this.players[playerId]) {
            Object.assign(this.players[playerId], updates);
            this.io.emit("state", { [playerId]: updates }); 
        }
    }

    broadcastPlayerState(playerId, fullPlayerData) { 
        if (this.players[playerId]) {
            this.io.emit("state", { [playerId]: fullPlayerData });
        }
    }


    registerSocketHandlers(socket) {
        socket.on("control", (data) => {
            const player = this.getPlayer(socket.id);
            if (!player || player.dockedAtPlanetIdentifier || player.hyperjumpState === "charging") return;

            player.x = data.x;
            player.y = data.y;
            player.vx = data.vx;
            player.vy = data.vy;
            player.angle = data.angle;

            const minimalUpdate = { x: player.x, y: player.y, vx: player.vx, vy: player.vy, angle: player.angle };
            socket.broadcast.emit("state", { [socket.id]: minimalUpdate });
        });

        socket.on("requestHyperjump", (data) => { // data = { targetSystemIndex: number | null }
            const player = this.getPlayer(socket.id);
            if (!player || player.destroyed) return;

            const targetSystemIndex = data ? data.targetSystemIndex : null;

            if (player.dockedAtPlanetIdentifier) {
                return socket.emit("hyperjumpDenied", { message: "Cannot engage hyperdrive while docked." });
            }
            if (player.hyperjumpState !== "idle") {
                return socket.emit("hyperjumpDenied", { message: "Hyperdrive already engaged or cooling down." });
            }

            const currentSystemDataForProxCheck = this.worldManager.getSystem(player.system);
            if (currentSystemDataForProxCheck && currentSystemDataForProxCheck.planets) {
                for (const planet of currentSystemDataForProxCheck.planets) {
                    if(!planet) continue;
                    const distSq = (player.x - planet.x)**2 + (player.y - planet.y)**2;
                    const planetScale = planet.planetImageScale || 1.0; // Use actual scale from planet data
                    const minSafeDistSq = (this.gameConfig.MIN_HYPERJUMP_DISTANCE_FROM_PLANET_SQUARED || 22500) * Math.pow(planetScale, 2) * 1.5;
                    if (distSq < minSafeDistSq) {
                        return socket.emit("hyperjumpDenied", { message: "Too close to a celestial body." });
                    }
                }
            }

            if (targetSystemIndex === null || targetSystemIndex === undefined) {
                return socket.emit("hyperjumpDenied", { message: "Target system not specified." });
            }
            if (targetSystemIndex < 0 || targetSystemIndex >= this.worldManager.systems.length) {
                return socket.emit("hyperjumpDenied", { message: "Invalid target system index." });
            }
            const currentSystemData = this.worldManager.getSystem(player.system); // Renamed to avoid conflict
            if (!currentSystemData || !currentSystemData.connections || !currentSystemData.connections.includes(targetSystemIndex)) {
                return socket.emit("hyperjumpDenied", { message: "No direct hyperlane to the target system." });
            }
            if (targetSystemIndex === player.system) {
                 return socket.emit("hyperjumpDenied", { message: "Already in the target system." });
            }


            player.hyperjumpState = "charging";
            this.updatePlayerState(socket.id, { hyperjumpState: "charging" }); 
            socket.emit("hyperjumpChargeStarted", { chargeTime: this.gameConfig.HYPERJUMP_CHARGE_TIME_MS });
            console.log(`Player ${socket.id} starting hyperjump charge to system ${targetSystemIndex}.`);

            player.hyperjumpChargeTimeoutId = setTimeout(() => {
                if (player.hyperjumpState !== "charging" || player.destroyed) {
                    player.hyperjumpChargeTimeoutId = null;
                    if (player.hyperjumpState === "charging" && !player.destroyed) { 
                        player.hyperjumpState = "idle";
                        this.updatePlayerState(socket.id, { hyperjumpState: "idle" });
                    }
                    return;
                }

                player.hyperjumpState = "idle"; 
                player.hyperjumpChargeTimeoutId = null;

                const oldSystem = player.system;
                player.system = targetSystemIndex;

                let newX, newY, newAngle = 0;
                const arrivalSystemData = this.worldManager.getSystem(player.system);
                const originSystemData = this.worldManager.getSystem(oldSystem);

                newX = (this.gameConfig.PLAYER_SPAWN_X || 400) + (Math.random() * 200 - 100);
                newY = (this.gameConfig.PLAYER_SPAWN_Y || 300) + (Math.random() * 200 - 100);

                if (arrivalSystemData) {
                    if (originSystemData && originSystemData.universeX !== undefined && arrivalSystemData.universeX !== undefined &&
                        originSystemData.universeY !== undefined && arrivalSystemData.universeY !== undefined) {
                        const dx = arrivalSystemData.universeX - originSystemData.universeX;
                        const dy = arrivalSystemData.universeY - originSystemData.universeY;
                        const dist = Math.hypot(dx, dy);
                        const arrivalOffsetFromCenter = 350 + Math.random()*100; 

                        if (dist > 0) {
                            const firstPlanetInArrival = arrivalSystemData.planets[0];
                            const systemCenterX = firstPlanetInArrival ? firstPlanetInArrival.x - (Math.random()*100-50) : (this.gameConfig.PLAYER_SPAWN_X || 400); // A rough center
                            const systemCenterY = firstPlanetInArrival ? firstPlanetInArrival.y - (Math.random()*100-50) : (this.gameConfig.PLAYER_SPAWN_Y || 300);

                            newX = systemCenterX - (dx / dist) * arrivalOffsetFromCenter;
                            newY = systemCenterY - (dy / dist) * arrivalOffsetFromCenter;
                            newAngle = Math.atan2(dy, dx) + Math.PI; 
                        } else { 
                           const firstPlanet = arrivalSystemData.planets[0];
                           newX = (firstPlanet ? firstPlanet.x : (this.gameConfig.PLAYER_SPAWN_X || 400)) - (200 + Math.random()*100) ;
                           newY = (firstPlanet ? firstPlanet.y : (this.gameConfig.PLAYER_SPAWN_Y || 300)) + (Math.random()*100-50);
                           newAngle = 0; 
                        }
                    } else { 
                        const firstPlanet = arrivalSystemData.planets[0];
                        newX = (firstPlanet ? firstPlanet.x : (this.gameConfig.PLAYER_SPAWN_X || 400)) - 250;
                        newY = (firstPlanet ? firstPlanet.y : (this.gameConfig.PLAYER_SPAWN_Y || 300));
                        newAngle = 0;
                    }
                }

                player.x = newX;
                player.y = newY;
                player.vx = 0;
                player.vy = 0;
                player.angle = newAngle;
                player.dockedAtPlanetIdentifier = null; 

                console.log(
                    `Player ${socket.id} hyperjump complete. Old system: ${oldSystem}, New system: ${player.system}. Arrived at ${player.x.toFixed(0)},${player.y.toFixed(0)}.`
                );

                socket.emit("hyperjumpComplete", {
                    newSystem: player.system,
                    newX: player.x,
                    newY: player.y,
                    newAngle: player.angle,
                });

                this.broadcastPlayerState(socket.id, player);

            }, this.gameConfig.HYPERJUMP_CHARGE_TIME_MS);
        });

        socket.on("cancelHyperjump", () => {
            const player = this.getPlayer(socket.id);
            if (player && player.hyperjumpState === "charging" && player.hyperjumpChargeTimeoutId) {
                clearTimeout(player.hyperjumpChargeTimeoutId);
                player.hyperjumpChargeTimeoutId = null;
                player.hyperjumpState = "idle";
                this.updatePlayerState(socket.id, { hyperjumpState: "idle" });
                socket.emit("hyperjumpCancelled", { message: "Hyperjump cancelled by player." });
                console.log(`Player ${socket.id} cancelled hyperjump charge.`);
            }
        });

        socket.on("equipWeapon", ({ weapon: weaponName }) => {
            const player = this.getPlayer(socket.id);
            if (!player || player.hyperjumpState === "charging") {
                return socket.emit("actionFailed", { message: "Cannot modify equipment while hyperdrive is active." });
            }
            const weaponData = this.gameConfig.staticWeaponsData[weaponName];
            if (!weaponData) return socket.emit("actionFailed", { message: "Invalid weapon." });

            if (!player.weapons.includes(weaponName)) {
                if (player.credits >= weaponData.price) {
                    player.credits -= weaponData.price;
                    player.weapons.push(weaponName);
                    player.activeWeapon = weaponName; 
                    this.updatePlayerState(socket.id, { credits: player.credits, weapons: player.weapons, activeWeapon: player.activeWeapon });
                    socket.emit("actionSuccess", { message: `Purchased and equipped ${weaponName}.` });
                } else {
                    return socket.emit("actionFailed", { message: "Not enough credits." });
                }
            } else { 
                player.activeWeapon = weaponName;
                this.updatePlayerState(socket.id, { activeWeapon: player.activeWeapon });
                socket.emit("actionSuccess", { message: `Equipped ${weaponName}.` });
            }
        });

        socket.on("buyShip", ({ shipTypeIndex }) => {
            const player = this.getPlayer(socket.id);
            if (!player || player.hyperjumpState === "charging") {
                return socket.emit("actionFailed", { message: "Cannot buy ship while hyperdrive is active." });
            }
            if (shipTypeIndex < 0 || shipTypeIndex >= this.shipTypes.length) {
                return socket.emit("actionFailed", { message: "Invalid ship type." });
            }
            const newShipType = this.shipTypes[shipTypeIndex];
            if (player.credits < newShipType.price) {
                return socket.emit("actionFailed", { message: "Not enough credits." });
            }
            player.credits -= newShipType.price;
            player.type = shipTypeIndex;
            player.maxCargo = newShipType.maxCargo;
            player.cargo = new Array(this.tradeGoods.length).fill(0); 
            player.maxHealth = newShipType.maxHealth || 100;
            player.health = player.maxHealth; 
            player.weapons = []; 
            player.activeWeapon = null;

            this.updatePlayerState(socket.id, {
                credits: player.credits, type: player.type,
                maxCargo: player.maxCargo, cargo: player.cargo,
                maxHealth: player.maxHealth, health: player.health,
                weapons: player.weapons, activeWeapon: player.activeWeapon
            });
            socket.emit("actionSuccess", { message: `Successfully purchased ${newShipType.name}.` });
        });
    }

    checkAllPlayerMissionTimeouts(missionManager) {
        Object.values(this.players).forEach((player) => {
            if (player && !player.destroyed && player.activeMissions.length > 0) {
                const { changed, completedOrFailed } = missionManager.checkPlayerMissionTimeouts(player);
                if (changed) {
                    completedOrFailed.forEach((update) => this.io.to(player.id).emit("missionUpdate", update));
                    this.updatePlayerState(player.id, {
                        credits: player.credits,
                        activeMissions: player.activeMissions,
                    });
                }
            }
        });
    }

    handlePlayerHitDuringHyperjumpCharge(playerId) {
        const player = this.getPlayer(playerId);
        if (player && player.hyperjumpState === "charging" && player.hyperjumpChargeTimeoutId) {
            clearTimeout(player.hyperjumpChargeTimeoutId);
            player.hyperjumpChargeTimeoutId = null;
            player.hyperjumpState = "idle";
            this.updatePlayerState(playerId, { hyperjumpState: "idle" });
            this.io.to(playerId).emit("hyperjumpCancelled", { message: "Hyperjump disrupted by enemy fire!" });
            console.log(`Player ${playerId} hyperjump charge disrupted by damage.`);
        }
    }
}

module.exports = PlayerManager;