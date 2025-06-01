// hypernova/client/js/network.js
import { gameState } from "./game_state.js";
import { UIManager } from "./ui_manager.js";
import { HYPERJUMP_DENIED_MESSAGE_DURATION_MS } from "./client_config.js";

// NEW: Function to save progress to the server
export async function saveProgress() {
    // Make it async
    if (!gameState.socket || !gameState.myShip || !gameState.currentUser) {
        console.warn(
            "saveProgress: Cannot save - No socket, ship, or user data.",
        );
        console.warn(
            `saveProgress details: socket: ${!!gameState.socket}, myShip: ${!!gameState.myShip}, currentUser: ${!!gameState.currentUser}`,
        );
        return;
    }

    // Add a specific log here
    console.log(
        `saveProgress: Preparing data. Current gameState.docked: ${gameState.docked}, dockedAtDetails being saved: ${JSON.stringify(gameState.docked ? gameState.dockedAtDetails : null)}`,
    );

    // Prepare the data to be saved
    const progressData = {
        username: gameState.currentUser.username,
        shipData: {
            x: gameState.myShip.x,
            y: gameState.myShip.y,
            angle: gameState.myShip.angle,
            vx: gameState.myShip.vx,
            vy: gameState.myShip.vy,
            type: gameState.myShip.type, // This is likely an index
            credits: gameState.myShip.credits,
            cargo: gameState.myShip.cargo, // Array of numbers
            maxCargo: gameState.myShip.maxCargo,
            health: gameState.myShip.health,
            maxHealth: gameState.myShip.maxHealth,
            weapons: gameState.myShip.weapons, // Array of weapon names/IDs
            activeWeapon: gameState.myShip.activeWeapon, // Name/ID of active weapon
            system: gameState.myShip.system, // Current system index
            activeMissions: gameState.myShip.activeMissions, // Array of mission objects/IDs
            // dockedAtPlanetIdentifier is handled by saving `dockedAtDetails` if docked
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
        console.log(
            "network.js/init: Received init data:",
            JSON.stringify(data),
        ); // Log full init data
        if (!data || !data.id || !data.gameData) {
            console.error(
                "network.js/init: Incomplete init data received from server.",
            );
            return;
        }
        gameState.myId = data.id;
        console.log("network.js/init: Set gameState.myId to:", gameState.myId);

        // Populate clientGameData from server (user's existing logic)
        gameState.clientGameData.systems = data.gameData.systems || [];
        gameState.clientGameData.tradeGoods = data.gameData.tradeGoods || [];
        gameState.clientGameData.weapons = data.gameData.weapons || {};
        gameState.clientGameData.shipTypes = data.gameData.shipTypes || [];
        gameState.clientGameData.MISSION_TYPES =
            data.gameData.MISSION_TYPES || {};
        gameState.clientPlanetEconomies = data.gameData.economies || [];

        // Collect image paths to load (user's existing logic)
        const uniqueImageFiles = new Set();
        if (gameState.clientGameData.systems) {
            gameState.clientGameData.systems.forEach((system) => {
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
        // console.log("network.js/init: Image paths to load:", gameState.imagePathsToLoad);

        if (data.ships) {
            for (const shipId in data.ships) {
                console.log(
                    "network.js/init: Processing ship from server init data for shipId:",
                    shipId,
                );
                gameState.updateShipData(shipId, data.ships[shipId]); // updateShipData calls defaultShipProps
            }
        }
        console.log(
            "network.js/init: After processing server ships. Current myShip:",
            JSON.stringify(gameState.myShip),
            "Current gameState.docked:",
            gameState.docked,
        );

        if (gameState.pendingProgressToApply && gameState.myId) {
            console.log(
                "network.js/init: Applying pendingProgressToApply. Current gameState.docked BEFORE apply:",
                gameState.docked,
                "Pending progress:",
                JSON.stringify(gameState.pendingProgressToApply),
            );
            const pendingProgress = gameState.pendingProgressToApply;

            gameState.updateShipData(
                // This will call defaultShipProps
                gameState.myId,
                pendingProgress.shipData,
            );
            console.log(
                "network.js/init (pending): After updateShipData. myShip:",
                JSON.stringify(gameState.myShip),
            );

            if (
                gameState.myShip && // Ensure myShip exists after updateShipData
                pendingProgress.shipData.system !== undefined
            ) {
                gameState.myShip.system = pendingProgress.shipData.system;
                console.log(
                    "network.js/init (pending): Set gameState.myShip.system to",
                    gameState.myShip.system,
                );
            }

            if (pendingProgress.dockedAtDetails) {
                gameState.docked = true;
                gameState.dockedAtDetails = pendingProgress.dockedAtDetails;
                console.log(
                    "network.js/init (pending): SETTING gameState.docked = true, details:",
                    JSON.stringify(gameState.dockedAtDetails),
                );
            } else {
                gameState.docked = false;
                gameState.dockedAtDetails = null;
                console.log(
                    "network.js/init (pending): SETTING gameState.docked = false (no dockedAtDetails in pending progress)",
                );
            }
            console.log(
                "network.js/init: Applied pendingProgressToApply. gameState.docked is now:",
                gameState.docked,
                "myShip:",
                JSON.stringify(gameState.myShip),
            );
            delete gameState.pendingProgressToApply;
        } else if (gameState.myShip) {
            // This branch means: myId is set, myShip exists (likely from server's data.ships), and there was NO pendingProgressToApply.
            // defaultShipProps would have been called via updateShipData when data.ships was processed.
            console.log(
                "network.js/init: (No pending progress, myShip exists). gameState.docked:",
                gameState.docked,
                "myShip:",
                JSON.stringify(gameState.myShip),
            );
        } else if (gameState.myId) {
            // This branch means: myId is set, but myShip was NOT in data.ships and NO pendingProgressToApply.
            // This implies a new ship situation or a ship not yet created on the server but client knows its ID.
            console.log(
                "network.js/init: (No pending progress, myShip DID NOT exist). Creating and applying defaults for myId:",
                gameState.myId,
                "Current gameState.docked:",
                gameState.docked,
            );
            gameState.allShips[gameState.myId] = {}; // Create the ship object.
            gameState.defaultShipProps(gameState.myShip); // Apply default properties.
            console.log(
                "network.js/init: (New ship scenario) Created and applied defaults. gameState.docked:",
                gameState.docked,
                "myShip:",
                JSON.stringify(gameState.myShip),
            );
        }

        console.log(
            "network.js/init: Client initialization sequence in 'init' handler complete. Final My ship:",
            JSON.stringify(gameState.myShip),
            "Final gameState.docked:",
            gameState.docked,
        );
        if (onReadyCallback) {
            console.log("network.js/init: Calling onReadyCallback.");
            onReadyCallback();
        }
    });

    socket.on("state", (updatedShipDataMap) => {
        // console.log("network.js/state: Received state update:", updatedShipDataMap);
        for (const id in updatedShipDataMap) {
            const update = updatedShipDataMap[id];
            // If this state update includes hyperjump state changes from server, reflect them
            if (id === gameState.myId) {
                if (
                    update.hyperjumpState === "idle" &&
                    gameState.isChargingHyperjump
                ) {
                    // Server says we are idle, but client thought it was charging (e.g. cancellation)
                    gameState.isChargingHyperjump = false;
                    gameState.hyperjumpChargeStartTime = null;
                }
                // Potentially other hyperjump state fields if server sends them in general state updates
            }
            gameState.updateShipData(id, update);
        }
        if (
            gameState.myShip &&
            gameState.myShip.dockedAtPlanetIdentifier === null &&
            gameState.docked
        ) {
            console.log(
                "network.js/state: Server state indicates ship is not docked, but client gameState.docked was true. Cleaning up UI.",
            );
            UIManager.undockCleanup();
        }
    });

    socket.on("playerJoined", (data) => {
        console.log("network.js/playerJoined:", data.id);
        gameState.updateShipData(data.id, data.ship);
    });

    socket.on("playerLeft", (id) => {
        console.log("network.js/playerLeft:", id);
        delete gameState.allShips[id];
    });

    socket.on("projectile", (data) => {
        data.time = Date.now();
        gameState.projectiles.push(data);
    });

    socket.on("dockConfirmed", (data) => {
        console.log(
            "network.js/dockConfirmed: Received data:",
            JSON.stringify(data),
        );
        gameState.docked = true;
        if (gameState.myShip) {
            gameState.myShip.dockedAtPlanetIdentifier = {
                systemIndex: data.systemIndex,
                planetIndex: data.planetIndex,
            };
            // Server is authoritative for position upon docking
            gameState.myShip.x = data.playerX;
            gameState.myShip.y = data.playerY;
            gameState.myShip.vx = 0;
            gameState.myShip.vy = 0;
        }
        gameState.dockedAtDetails = { ...data };
        console.log(
            "network.js/dockConfirmed: Set gameState.docked = true. dockedAtDetails:",
            JSON.stringify(gameState.dockedAtDetails),
            "myShip.dockedAtPlanetIdentifier:",
            gameState.myShip
                ? JSON.stringify(gameState.myShip.dockedAtPlanetIdentifier)
                : "N/A",
        );
        UIManager.openDockMenu();
        console.log("network.js/dockConfirmed: Calling saveProgress().");
        saveProgress();
    });

    socket.on("undockConfirmed", () => {
        console.log(
            "network.js/undockConfirmed: Received from server. Current gameState.docked BEFORE UIManager.undockCleanup:",
            gameState.docked,
        );
        UIManager.undockCleanup();
        console.log(
            "network.js/undockConfirmed: AFTER UIManager.undockCleanup. gameState.docked:",
            gameState.docked,
        );
    });

    socket.on("tradeError", ({ message }) => {
        console.error("network.js/tradeError:", message);
        alert(`Trade Error: ${message}`);
    });
    socket.on("actionFailed", ({ message }) => {
        console.warn("network.js/actionFailed:", message);
        alert(`Action Failed: ${message}`);
    });
    socket.on("actionSuccess", ({ message }) => {
        console.log("network.js/actionSuccess:", message);
    });

    socket.on("tradeSuccess", (data) => {
        // ... (existing tradeSuccess logic) ...
    });
    socket.on("updatePlanetEconomies", (updatedSystemsEconomies) => {
        // ... (existing updatePlanetEconomies logic) ...
    });
    socket.on("planetEconomyUpdate", (data) => {
        // ... (existing planetEconomyUpdate logic) ...
    });
    socket.on("availableMissionsList", (data) => {
        // ... (existing availableMissionsList logic) ...
    });
    socket.on("missionAccepted", (data) => {
        // ... (existing missionAccepted logic) ...
    });
    socket.on("missionUpdate", (data) => {
        // ... (existing missionUpdate logic) ...
    });

    // Hyperjump related handlers
    socket.on("hyperjumpChargeStarted", ({ chargeTime }) => {
        console.log("Network: Hyperjump charge started by server.");
        gameState.isChargingHyperjump = true;
        gameState.hyperjumpChargeStartTime = Date.now();
        // Client will use its own HYPERJUMP_CHARGE_TIME_MS for progress bar,
        // but server's chargeTime could be used if they differ.
    });

    socket.on("hyperjumpDenied", ({ message }) => {
        console.warn("Network: Hyperjump denied by server:", message);
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
        console.log("Network: Hyperjump cancelled by server:", message);
        gameState.isChargingHyperjump = false;
        gameState.hyperjumpChargeStartTime = null;
        if (message) {
            gameState.hyperjumpDeniedMessage = message; // Re-use denied message display
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
        console.log("Network: Hyperjump complete. New state:", data);
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
        UIManager.undockCleanup();
        // Client is now in the new system, position set by server.
        // The regular 'state' update from server will also reflect this for other players.
    });
}

export function sendControls() {
    if (
        !gameState.socket ||
        !gameState.myShip ||
        (gameState.myShip && gameState.myShip.destroyed)
    ) {
        return;
    }
    // Data sent in 'control' reflects current client state, including drift during hyperjump charge.
    // Server will decide how to use this data if player is charging.
    gameState.socket.emit("control", {
        x: gameState.myShip.x,
        y: gameState.myShip.y,
        angle: gameState.myShip.angle,
        vx: gameState.myShip.vx,
        vy: gameState.myShip.vy,
        system: gameState.myShip.system, // Keep sending current system; server manages actual jump
    });
}

export function fireWeapon() {
    if (
        !gameState.socket ||
        !gameState.myShip ||
        gameState.myShip.destroyed ||
        !gameState.myShip.activeWeapon ||
        gameState.docked ||
        gameState.isChargingHyperjump // Prevent firing if charging
    ) {
        console.warn(
            "fireWeapon: Pre-condition failed (e.g., charging hyperjump).",
        );
        return;
    }
    console.log("fireWeapon: Emitting 'fire'.");
    gameState.socket.emit("fire");
}

export function equipWeapon(weaponName) {
    if (!gameState.socket || gameState.isChargingHyperjump) {
        // Prevent equipping if charging
        if (gameState.isChargingHyperjump)
            console.warn("equipWeapon: Cannot equip while charging hyperjump.");
        return;
    }
    console.log(`equipWeapon called with: ${weaponName}.`);
    gameState.socket.emit("equipWeapon", { weapon: weaponName });
}

export function requestDock(systemIndex, planetIndex) {
    if (!gameState.socket || gameState.isChargingHyperjump) {
        // Prevent docking if charging
        if (gameState.isChargingHyperjump)
            console.warn("requestDock: Cannot dock while charging hyperjump.");
        return;
    }
    console.log(
        `requestDock called for system ${systemIndex}, planet ${planetIndex}.`,
    );
    gameState.socket.emit("dock", { systemIndex, planetIndex });
}

export function undock() {
    // Undocking while charging hyperjump should not be possible as player should not be docked.
    // If somehow state is inconsistent, this is a regular undock request.
    if (!gameState.socket || !gameState.docked) {
        console.warn(
            `undock: Pre-condition failed. Socket: ${!!gameState.socket}, gameState.docked: ${gameState.docked}.`,
        );
        return;
    }
    console.log("undock: Emitting 'undock' to server.");
    gameState.socket.emit("undock");
    saveProgress();
}

export function buyGood(goodIndex) {
    // ... (existing buyGood, no direct hyperjump interaction needed as it requires docking) ...
}
export function sellGood(goodIndex) {
    // ... (existing sellGood) ...
}
export function buyShip(shipTypeIndex) {
    if (
        !gameState.socket ||
        !gameState.myShip ||
        gameState.isChargingHyperjump
    ) {
        // Prevent buying ship if charging
        if (gameState.isChargingHyperjump)
            console.warn("buyShip: Cannot buy ship while charging hyperjump.");
        return;
    }
    // ... rest of buyShip logic ...
}

export function requestMissions(systemIndex, planetIndex) {
    // ... (existing requestMissions) ...
}
export function acceptMission(missionId, systemIndex, planetIndex) {
    // ... (existing acceptMission) ...
}

// New function for hyperjump request
export function requestHyperjump() {
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
        return;
    }
    console.log("network.js: Emitting 'requestHyperjump'.");
    gameState.socket.emit("requestHyperjump");
}

// Optional: if client-side cancellation is desired
export function cancelHyperjumpRequest() {
    if (!gameState.socket || !gameState.isChargingHyperjump) return;
    console.log("network.js: Emitting 'cancelHyperjump'.");
    gameState.socket.emit("cancelHyperjump");
    // Client optimistically stops visual charging, server confirms actual cancellation.
    // gameState.isChargingHyperjump = false; // Let server message handle this state change fully
    // gameState.hyperjumpChargeStartTime = null;
}
