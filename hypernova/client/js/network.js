// hypernova/client/js/network.js
import { gameState } from "./game_state.js";
import { UIManager } from "./ui_manager.js";
import {
    HYPERJUMP_DENIED_MESSAGE_DURATION_MS,
    MIN_HYPERJUMP_DISTANCE_FROM_PLANET_SQUARED,
} from "./client_config.js";

export async function saveProgress() {
    // ... (existing code)
    if (!gameState.socket || !gameState.myShip || !gameState.currentUser) {
        console.warn(
            "saveProgress: Cannot save - No socket, ship, or user data.",
        );
        return;
    }
    console.log(
        `saveProgress: Preparing data. Current gameState.docked: ${gameState.docked}, dockedAtDetails being saved: ${JSON.stringify(gameState.docked ? gameState.dockedAtDetails : null)}`,
    );
    const progressData = {
        username: gameState.currentUser.username,
        shipData: {
            x: gameState.myShip.x,
            y: gameState.myShip.y,
            angle: gameState.myShip.angle,
            vx: gameState.myShip.vx,
            vy: gameState.myShip.vy,
            type: gameState.myShip.type,
            credits: gameState.myShip.credits,
            cargo: gameState.myShip.cargo,
            maxCargo: gameState.myShip.maxCargo,
            health: gameState.myShip.health,
            maxHealth: gameState.myShip.maxHealth,
            weapons: gameState.myShip.weapons,
            activeWeapon: gameState.myShip.activeWeapon,
            system: gameState.myShip.system,
            activeMissions: gameState.myShip.activeMissions,
        },
        dockedAtDetails: gameState.docked ? gameState.dockedAtDetails : null,
    };

    try {
        const response = await fetch("/save-progress", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(progressData),
        });
        const result = await response.json();
        if (response.ok && result.success) {
            console.log("saveProgress: Progress saved successfully to server.");
        } else {
            console.error(
                "saveProgress: Failed to save progress to server:",
                result.message || "Server error",
            );
        }
    } catch (error) {
        console.error(
            "saveProgress: Error during fetch to save progress:",
            error,
        );
    }
}

export function initNetwork(onReadyCallback) {
    const socket = io();
    gameState.socket = socket;

    socket.on("init", (data) => {
        // ... (existing code - no changes here)
        console.log(
            "network.js/init: Received init data (first 200 chars):",
            JSON.stringify(data).substring(0, 200),
        );
        if (!data || !data.id || !data.gameData) {
            console.error(
                "network.js/init: Incomplete init data received from server.",
            );
            return;
        }
        gameState.myId = data.id;
        console.log("network.js/init: Set gameState.myId to:", gameState.myId);

        gameState.clientGameData.systems = data.gameData.systems || [];
        gameState.clientGameData.tradeGoods = data.gameData.tradeGoods || [];
        gameState.clientGameData.weapons = data.gameData.weapons || {};
        gameState.clientGameData.shipTypes = data.gameData.shipTypes || [];
        gameState.clientGameData.MISSION_TYPES =
            data.gameData.MISSION_TYPES || {};
        gameState.clientPlanetEconomies = data.gameData.economies || [];

        const uniqueImageFiles = new Set();
        if (gameState.clientGameData.systems) {
            gameState.clientGameData.systems.forEach((system) => {
                if (system.backgroundFile) {
                    uniqueImageFiles.add(
                        `assets/images/backgrounds/${system.backgroundFile}`,
                    );
                }
                if (system.planets) {
                    system.planets.forEach((planet) => {
                        if (planet.imageFile) {
                            uniqueImageFiles.add(
                                `assets/images/${planet.imageFile}`,
                            );
                        }
                    });
                }
            });
        }
        if (gameState.clientGameData.shipTypes) {
            gameState.clientGameData.shipTypes.forEach((shipType) => {
                if (shipType.imageFile) {
                    uniqueImageFiles.add(`assets/images/${shipType.imageFile}`);
                }
            });
        }
        gameState.imagePathsToLoad = Array.from(uniqueImageFiles);

        if (data.ships) {
            for (const shipId in data.ships) {
                gameState.updateShipData(shipId, data.ships[shipId]);
            }
        }

        if (gameState.pendingProgressToApply && gameState.myId) {
            const pendingProgress = gameState.pendingProgressToApply;
            gameState.updateShipData(gameState.myId, pendingProgress.shipData);
            if (
                gameState.myShip &&
                pendingProgress.shipData.system !== undefined
            ) {
                gameState.myShip.system = pendingProgress.shipData.system;
            }
            if (pendingProgress.dockedAtDetails) {
                gameState.docked = true;
                gameState.dockedAtDetails = pendingProgress.dockedAtDetails;
            } else {
                gameState.docked = false;
                gameState.dockedAtDetails = null;
            }
            delete gameState.pendingProgressToApply;
        } else if (gameState.myId && !gameState.myShip) {
            // Ensure myShip object exists even if no prior data
            gameState.allShips[gameState.myId] = {};
            gameState.defaultShipProps(gameState.myShip);
        }

        console.log(
            "network.js/init: Client initialization sequence complete. Final My ship type:",
            gameState.myShip ? gameState.myShip.type : "N/A",
            "Final gameState.docked:",
            gameState.docked,
        );
        if (onReadyCallback) {
            console.log("network.js/init: Calling onReadyCallback.");
            onReadyCallback();
        }
    });

    socket.on("state", (updatedShipDataMap) => {
        for (const id in updatedShipDataMap) {
            const update = updatedShipDataMap[id];
            if (id === gameState.myId) {
                if (
                    update.hyperjumpState === "idle" &&
                    gameState.isChargingHyperjump
                ) {
                    gameState.isChargingHyperjump = false;
                    gameState.hyperjumpChargeStartTime = null;
                }
            }
            gameState.updateShipData(id, update);
            if (id === gameState.myId) {
                // If my ship's data was updated
                UIManager.updateShipStatsPanel();
                UIManager.updateActiveMissionsPanel(); // Missions might depend on ship state (e.g. cargo for delivery)
            }
        }
        if (
            gameState.myShip &&
            gameState.myShip.dockedAtPlanetIdentifier === null &&
            gameState.docked
        ) {
            // This case handles server-side undock (e.g. ship destroyed while docked)
            UIManager.undockCleanup();
        }
    });

    socket.on("playerJoined", (data) => {
        gameState.updateShipData(data.id, data.ship);
    });

    socket.on("playerLeft", (id) => {
        delete gameState.allShips[id];
    });

    socket.on("projectile", (data) => {
        data.time = Date.now();
        gameState.projectiles.push(data);
    });

    socket.on("dockConfirmed", (data) => {
        gameState.docked = true;
        if (gameState.myShip) {
            gameState.myShip.dockedAtPlanetIdentifier = {
                systemIndex: data.systemIndex,
                planetIndex: data.planetIndex,
            };
            gameState.myShip.x = data.playerX;
            gameState.myShip.y = data.playerY;
            gameState.myShip.vx = 0;
            gameState.myShip.vy = 0;
        }
        gameState.dockedAtDetails = { ...data };
        UIManager.openDockMenu(); // This will also update HUD panels
        saveProgress();
    });

    socket.on("undockConfirmed", () => {
        UIManager.undockCleanup(); // This will also update HUD panels
    });

    socket.on("tradeError", ({ message }) => {
        alert(`Trade Error: ${message}`);
    });
    socket.on("actionFailed", ({ message }) => {
        alert(`Action Failed: ${message}`);
    });
    socket.on("actionSuccess", ({ message }) => {
        console.log("Action Success:", message);
    });

    socket.on("tradeSuccess", (data) => {
        if (gameState.myShip) {
            gameState.myShip.credits = data.credits;
            gameState.myShip.cargo = data.cargo;
        }
        if (
            gameState.docked &&
            gameState.dockedAtDetails &&
            data.updatedPlanetData
        ) {
            Object.assign(gameState.dockedAtDetails, data.updatedPlanetData);
        }
        if (gameState.activeSubMenu === "trade") UIManager.renderTradeMenu();
        UIManager.updateShipStatsPanel(); // Update HUD
    });

    socket.on("updatePlanetEconomies", (updatedSystemsEconomies) => {
        /* Not directly used client-side yet */
    });

    socket.on("planetEconomyUpdate", (data) => {
        if (
            gameState.docked &&
            gameState.dockedAtDetails &&
            gameState.dockedAtDetails.systemIndex === data.systemIndex &&
            gameState.dockedAtDetails.planetIndex === data.planetIndex
        ) {
            Object.assign(gameState.dockedAtDetails, data);
            if (gameState.activeSubMenu === "trade")
                UIManager.renderTradeMenu();
        }
    });

    socket.on("availableMissionsList", (data) => {
        gameState.availableMissionsForCurrentPlanet = data.missions;
        if (gameState.activeSubMenu === "missions")
            UIManager.renderMissionsMenu();
    });

    socket.on("missionAccepted", (data) => {
        if (gameState.myShip)
            gameState.myShip.activeMissions.push(data.mission);
        if (
            gameState.activeSubMenu === "missions" &&
            gameState.dockedAtDetails
        ) {
            const missionIdx =
                gameState.availableMissionsForCurrentPlanet.findIndex(
                    (m) => m.id === data.mission.id,
                );
            if (missionIdx > -1)
                gameState.availableMissionsForCurrentPlanet.splice(
                    missionIdx,
                    1,
                );
            UIManager.renderMissionsMenu();
        }
        UIManager.updateActiveMissionsPanel(); // Update HUD
    });

    socket.on("missionUpdate", (data) => {
        if (gameState.myShip && gameState.myShip.activeMissions) {
            const missionIdx = gameState.myShip.activeMissions.findIndex(
                (m) => m.id === data.missionId,
            );
            if (missionIdx !== -1) {
                if (
                    data.status === "COMPLETED" ||
                    data.status === "FAILED_TIME"
                ) {
                    gameState.myShip.activeMissions.splice(missionIdx, 1);
                    if (data.creditsAwarded)
                        gameState.myShip.credits += data.creditsAwarded; // If server sends credit update
                    if (data.creditsPenalized)
                        gameState.myShip.credits -= data.creditsPenalized;
                } else if (data.progress) {
                    gameState.myShip.activeMissions[
                        missionIdx
                    ].targetsDestroyed = parseInt(data.progress.split("/")[0]);
                }
            }
        }
        UIManager.updateActiveMissionsPanel(); // Update HUD
        UIManager.updateShipStatsPanel(); // Credits might have changed
        if (data.message) alert(data.message);
    });

    socket.on("hyperjumpChargeStarted", ({ chargeTime }) => {
        gameState.isChargingHyperjump = true;
        gameState.hyperjumpChargeStartTime = Date.now();
    });

    socket.on("hyperjumpDenied", ({ message }) => {
        gameState.isChargingHyperjump = false;
        gameState.hyperjumpChargeStartTime = null;
        gameState.hyperjumpDeniedMessage = message;
        if (gameState.hyperjumpDeniedMessageTimeoutId) {
            clearTimeout(gameState.hyperjumpDeniedMessageTimeoutId);
        }
        gameState.hyperjumpDeniedMessageTimeoutId = setTimeout(() => {
            gameState.hyperjumpDeniedMessage = null;
            gameState.hyperjumpDeniedMessageTimeoutId = null;
        }, HYPERJUMP_DENIED_MESSAGE_DURATION_MS);
    });

    socket.on("hyperjumpCancelled", ({ message }) => {
        gameState.isChargingHyperjump = false;
        gameState.hyperjumpChargeStartTime = null;
        if (message) {
            gameState.hyperjumpDeniedMessage = message;
            if (gameState.hyperjumpDeniedMessageTimeoutId) {
                clearTimeout(gameState.hyperjumpDeniedMessageTimeoutId);
            }
            gameState.hyperjumpDeniedMessageTimeoutId = setTimeout(() => {
                gameState.hyperjumpDeniedMessage = null;
                gameState.hyperjumpDeniedMessageTimeoutId = null;
            }, HYPERJUMP_DENIED_MESSAGE_DURATION_MS);
        }
    });

    socket.on("hyperjumpComplete", (data) => {
        // ... (route progression logic remains the same)
        const previousSystem = gameState.myShip ? gameState.myShip.system : -1;
        gameState.isChargingHyperjump = false;
        gameState.hyperjumpChargeStartTime = null;

        if (gameState.myShip) {
            gameState.myShip.system = data.newSystem;
            gameState.myShip.x = data.newX;
            gameState.myShip.y = data.newY;
            gameState.myShip.vx = 0;
            gameState.myShip.vy = 0;
            gameState.myShip.angle =
                data.newAngle !== undefined ? data.newAngle : 0;
            gameState.myShip.dockedAtPlanetIdentifier = null;
        }
        gameState.docked = false;
        UIManager.undockCleanup(); // This will update HUD panels

        if (
            gameState.plannedRoute.length > 0 &&
            gameState.currentRouteLegIndex !== -1
        ) {
            const expectedSystem =
                gameState.plannedRoute[gameState.currentRouteLegIndex];
            if (data.newSystem === expectedSystem) {
                gameState.currentRouteLegIndex++;
                if (
                    gameState.currentRouteLegIndex >=
                    gameState.plannedRoute.length
                ) {
                    console.log("Route completed.");
                    gameState.plannedRoute = [];
                    gameState.currentRouteLegIndex = -1;
                } else {
                    const nextSystemName =
                        gameState.clientGameData.systems[
                            gameState.plannedRoute[
                                gameState.currentRouteLegIndex
                            ]
                        ]?.name || "Unknown System";
                    console.log(
                        `Route advanced. Next jump: ${nextSystemName}. Press J.`,
                    );
                }
            } else {
                console.log("Jumped to an unexpected system. Clearing route.");
                gameState.plannedRoute = [];
                gameState.currentRouteLegIndex = -1;
            }
        }
    });
}

export function sendControls() {
    // ... (existing code)
    if (
        !gameState.socket ||
        !gameState.myShip ||
        (gameState.myShip && gameState.myShip.destroyed)
    ) {
        return;
    }
    gameState.socket.emit("control", {
        x: gameState.myShip.x,
        y: gameState.myShip.y,
        angle: gameState.myShip.angle,
        vx: gameState.myShip.vx,
        vy: gameState.myShip.vy,
        system: gameState.myShip.system,
    });
}

export function fireWeapon() {
    // ... (existing code)
    if (
        !gameState.socket ||
        !gameState.myShip ||
        gameState.myShip.destroyed ||
        !gameState.myShip.activeWeapon ||
        gameState.docked ||
        gameState.isChargingHyperjump ||
        gameState.isMapOpen
    ) {
        if (gameState.isMapOpen)
            console.warn("fireWeapon: Cannot fire, map is open.");
        return;
    }
    gameState.socket.emit("fire");
}

export function equipWeapon(weaponName) {
    // ... (existing code - already calls UIManager.updateShipStatsPanel after server confirmation via 'state' event)
    if (!gameState.socket || gameState.isChargingHyperjump) {
        if (gameState.isChargingHyperjump)
            console.warn("equipWeapon: Cannot equip while charging hyperjump.");
        return;
    }
    gameState.socket.emit("equipWeapon", { weapon: weaponName });
}

export function requestDock(systemIndex, planetIndex) {
    // ... (existing code)
    if (!gameState.socket || gameState.isChargingHyperjump) {
        if (gameState.isChargingHyperjump)
            console.warn("requestDock: Cannot dock while charging hyperjump.");
        return;
    }
    gameState.socket.emit("dock", { systemIndex, planetIndex });
}

export function undock() {
    // ... (existing code)
    if (!gameState.socket || !gameState.docked) {
        console.warn(
            `undock: Pre-condition failed. Socket: ${!!gameState.socket}, gameState.docked: ${gameState.docked}.`,
        );
        return;
    }
    gameState.socket.emit("undock");
    saveProgress();
}

export function buyGood(goodIndex) {
    // ... (existing code - UIManager.updateShipStatsPanel called by tradeSuccess)
    const good = gameState.clientGameData.tradeGoods[goodIndex];
    if (!good || !gameState.dockedAtDetails || !gameState.socket) return;
    gameState.socket.emit("buyGood", {
        goodName: good.name,
        quantity: 1,
        systemIndex: gameState.dockedAtDetails.systemIndex,
        planetIndex: gameState.dockedAtDetails.planetIndex,
    });
}
export function sellGood(goodIndex) {
    // ... (existing code - UIManager.updateShipStatsPanel called by tradeSuccess)
    const good = gameState.clientGameData.tradeGoods[goodIndex];
    if (!good || !gameState.dockedAtDetails || !gameState.socket) return;
    gameState.socket.emit("sellGood", {
        goodName: good.name,
        quantity: 1,
        systemIndex: gameState.dockedAtDetails.systemIndex,
        planetIndex: gameState.dockedAtDetails.planetIndex,
    });
}
export function buyShip(shipTypeIndex) {
    // ... (existing code - UIManager.updateShipStatsPanel called after server confirmation via 'state' event)
    if (
        !gameState.socket ||
        !gameState.myShip ||
        gameState.isChargingHyperjump
    ) {
        if (gameState.isChargingHyperjump)
            console.warn("buyShip: Cannot buy ship while charging hyperjump.");
        return;
    }
    gameState.socket.emit("buyShip", { shipTypeIndex });
}

export function requestMissions(systemIndex, planetIndex) {
    // ... (existing code)
    if (!gameState.socket) return;
    gameState.socket.emit("requestMissions", { systemIndex, planetIndex });
}
export function acceptMission(missionId, systemIndex, planetIndex) {
    // ... (existing code - UIManager.updateActiveMissionsPanel called by missionAccepted)
    if (!gameState.socket) return;
    gameState.socket.emit("acceptMission", {
        missionId,
        systemIndex,
        planetIndex,
    });
}

export function requestHyperjump(targetSystemIndex = null) {
    // ... (existing code - no direct HUD calls needed here, hyperjumpDeniedMessage is handled by HUD render)
    if (
        !gameState.socket ||
        !gameState.myShip ||
        gameState.myShip.destroyed ||
        gameState.docked ||
        gameState.isChargingHyperjump
    ) {
        let reason = "Pre-condition failed";
        if (gameState.docked) reason = "docked";
        if (gameState.isChargingHyperjump) reason = "already charging";
        if (gameState.myShip?.destroyed) reason = "ship destroyed";
        console.warn(`requestHyperjump: Cannot request. Reason: ${reason}`);

        const alertMessage = `Hyperjump denied: ${reason === "docked" ? "Cannot engage hyperdrive while docked." : reason === "already charging" ? "Hyperdrive already engaged." : reason === "ship destroyed" ? "Ship systems critical." : "Cannot engage hyperdrive."}`;
        // Set up denied message to be shown in HUD
        gameState.hyperjumpDeniedMessage = alertMessage;
        if (gameState.hyperjumpDeniedMessageTimeoutId)
            clearTimeout(gameState.hyperjumpDeniedMessageTimeoutId);
        gameState.hyperjumpDeniedMessageTimeoutId = setTimeout(() => {
            gameState.hyperjumpDeniedMessage = null;
            gameState.hyperjumpDeniedMessageTimeoutId = null;
        }, HYPERJUMP_DENIED_MESSAGE_DURATION_MS);
        return;
    }

    const currentSystemData =
        gameState.clientGameData.systems[gameState.myShip.system];
    if (currentSystemData && currentSystemData.planets) {
        for (const planet of currentSystemData.planets) {
            if (!planet) continue;
            const distSq =
                (gameState.myShip.x - planet.x) ** 2 +
                (gameState.myShip.y - planet.y) ** 2;
            const planetScale = planet.planetImageScale || 1.0;
            const baseMinJumpDistSq =
                MIN_HYPERJUMP_DISTANCE_FROM_PLANET_SQUARED || 22500;
            const minJumpDistSq =
                baseMinJumpDistSq * Math.pow(planetScale, 2) * 1.5;

            if (distSq < minJumpDistSq) {
                gameState.hyperjumpDeniedMessage =
                    "Too close to a celestial body to engage hyperdrive.";
                if (gameState.hyperjumpDeniedMessageTimeoutId)
                    clearTimeout(gameState.hyperjumpDeniedMessageTimeoutId);
                gameState.hyperjumpDeniedMessageTimeoutId = setTimeout(() => {
                    gameState.hyperjumpDeniedMessage = null;
                    gameState.hyperjumpDeniedMessageTimeoutId = null;
                }, HYPERJUMP_DENIED_MESSAGE_DURATION_MS);
                return;
            }
        }
    }
    if (targetSystemIndex === null) {
        gameState.hyperjumpDeniedMessage =
            "Error: No target system selected for hyperjump.";
        if (gameState.hyperjumpDeniedMessageTimeoutId)
            clearTimeout(gameState.hyperjumpDeniedMessageTimeoutId);
        gameState.hyperjumpDeniedMessageTimeoutId = setTimeout(() => {
            gameState.hyperjumpDeniedMessage = null;
            gameState.hyperjumpDeniedMessageTimeoutId = null;
        }, HYPERJUMP_DENIED_MESSAGE_DURATION_MS);
        return;
    }
    if (targetSystemIndex === gameState.myShip.system) {
        gameState.hyperjumpDeniedMessage = "Cannot jump to the current system.";
        if (gameState.hyperjumpDeniedMessageTimeoutId)
            clearTimeout(gameState.hyperjumpDeniedMessageTimeoutId);
        gameState.hyperjumpDeniedMessageTimeoutId = setTimeout(() => {
            gameState.hyperjumpDeniedMessage = null;
            gameState.hyperjumpDeniedMessageTimeoutId = null;
        }, HYPERJUMP_DENIED_MESSAGE_DURATION_MS);
        return;
    }

    console.log(
        `network.js: Emitting 'requestHyperjump' for system ${targetSystemIndex}.`,
    );
    gameState.socket.emit("requestHyperjump", { targetSystemIndex });
}

export function cancelHyperjumpRequest() {
    // ... (existing code)
    if (!gameState.socket || !gameState.isChargingHyperjump) return;
    console.log("network.js: Emitting 'cancelHyperjump'.");
    gameState.socket.emit("cancelHyperjump");
}

