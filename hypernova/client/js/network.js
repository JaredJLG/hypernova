// hypernova/client/js/network.js
import { gameState } from "./game_state.js";
import { UIManager } from "./ui_manager.js";
// Renderer might not be directly needed here, but can be if you need to trigger redraws from network events
// import { Renderer } from './renderer.js';

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
            gameState.updateShipData(id, updatedShipDataMap[id]);
        }
        if (
            gameState.myShip &&
            gameState.myShip.dockedAtPlanetIdentifier === null && // Ship itself says it's not at a planet
            gameState.docked // Global state says it IS docked
        ) {
            // This implies a server-driven undock or state mismatch.
            console.log(
                "network.js/state: Server state indicates ship is not docked, but client gameState.docked was true. Cleaning up UI.",
            );
            UIManager.undockCleanup(); // This sets gameState.docked = false
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
            // Should always exist if we are docking
            gameState.myShip.dockedAtPlanetIdentifier = {
                // Store simple identifier on ship object
                systemIndex: data.systemIndex,
                planetIndex: data.planetIndex,
            };
        }
        gameState.dockedAtDetails = { ...data }; // Store full details in global state
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
        saveProgress(); // <<< SAVE ON DOCK
    });

    socket.on("undockConfirmed", () => {
        console.log(
            "network.js/undockConfirmed: Received from server. Current gameState.docked BEFORE UIManager.undockCleanup:",
            gameState.docked,
        );
        UIManager.undockCleanup(); // This should set gameState.docked = false and clear dockedAtDetails
        console.log(
            "network.js/undockConfirmed: AFTER UIManager.undockCleanup. gameState.docked:",
            gameState.docked,
        );
        // Note: saveProgress() is called by the client's undock() action, not here.
        // If it were here, it would save the *actually* undocked state.
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
        console.log("network.js/tradeSuccess: data:", JSON.stringify(data));
        if (gameState.myShip) {
            gameState.myShip.credits = data.credits;
            gameState.myShip.cargo = data.cargo;
        }
        if (
            gameState.dockedAtDetails &&
            data.updatedPlanetData &&
            gameState.dockedAtDetails.systemIndex ===
                data.updatedPlanetData.systemIndex &&
            gameState.dockedAtDetails.planetIndex ===
                data.updatedPlanetData.planetIndex
        ) {
            gameState.dockedAtDetails.buyPrices =
                data.updatedPlanetData.buyPrices;
            gameState.dockedAtDetails.sellPrices =
                data.updatedPlanetData.sellPrices;
            gameState.dockedAtDetails.stock = data.updatedPlanetData.stock;

            if (
                gameState.clientPlanetEconomies[
                    data.updatedPlanetData.systemIndex
                ]
            ) {
                gameState.clientPlanetEconomies[
                    data.updatedPlanetData.systemIndex
                ].planets[data.updatedPlanetData.planetIndex] = {
                    buyPrices: data.updatedPlanetData.buyPrices,
                    sellPrices: data.updatedPlanetData.sellPrices,
                    stock: data.updatedPlanetData.stock,
                };
            }
        }
        if (gameState.activeSubMenu === "trade") UIManager.renderTradeMenu();
    });

    socket.on("updatePlanetEconomies", (updatedSystemsEconomies) => {
        // console.log("network.js/updatePlanetEconomies received");
        gameState.clientPlanetEconomies = updatedSystemsEconomies;
        if (
            gameState.docked &&
            gameState.activeSubMenu === "trade" &&
            gameState.dockedAtDetails
        ) {
            const currentPlanetEcoFromServer =
                updatedSystemsEconomies[gameState.dockedAtDetails.systemIndex]
                    ?.planets[gameState.dockedAtDetails.planetIndex];
            if (currentPlanetEcoFromServer) {
                gameState.dockedAtDetails.buyPrices =
                    currentPlanetEcoFromServer.buyPrices;
                gameState.dockedAtDetails.sellPrices =
                    currentPlanetEcoFromServer.sellPrices;
                gameState.dockedAtDetails.stock =
                    currentPlanetEcoFromServer.stock;
                UIManager.renderTradeMenu();
            }
        }
    });

    socket.on("planetEconomyUpdate", (data) => {
        // console.log("network.js/planetEconomyUpdate received for system", data.systemIndex, "planet", data.planetIndex);
        const { systemIndex, planetIndex, buyPrices, sellPrices, stock } = data;
        if (
            gameState.clientPlanetEconomies[systemIndex] &&
            gameState.clientPlanetEconomies[systemIndex].planets[planetIndex]
        ) {
            gameState.clientPlanetEconomies[systemIndex].planets[planetIndex] =
                { stock, buyPrices, sellPrices };
        }
        if (
            gameState.docked &&
            gameState.activeSubMenu === "trade" &&
            gameState.dockedAtDetails &&
            gameState.dockedAtDetails.systemIndex === systemIndex &&
            gameState.dockedAtDetails.planetIndex === planetIndex
        ) {
            gameState.dockedAtDetails.buyPrices = buyPrices;
            gameState.dockedAtDetails.sellPrices = sellPrices;
            gameState.dockedAtDetails.stock = stock;
            UIManager.renderTradeMenu();
        }
    });

    socket.on("availableMissionsList", (data) => {
        // console.log("network.js/availableMissionsList for system", data.systemIndex, "planet", data.planetIndex);
        if (
            gameState.docked &&
            gameState.dockedAtDetails &&
            gameState.dockedAtDetails.systemIndex === data.systemIndex &&
            gameState.dockedAtDetails.planetIndex === data.planetIndex
        ) {
            gameState.availableMissionsForCurrentPlanet = data.missions;
            gameState.selectedMissionIndex = 0;
            if (gameState.activeSubMenu === "missions") {
                UIManager.renderMissionsMenu();
            }
        }
    });

    socket.on("missionAccepted", (data) => {
        console.log(`network.js/missionAccepted: "${data.mission.title}"`);
        alert(`Mission "${data.mission.title}" accepted!`);
        if (
            gameState.activeSubMenu === "missions" &&
            gameState.dockedAtDetails
        ) {
            requestMissions(
                gameState.dockedAtDetails.systemIndex,
                gameState.dockedAtDetails.planetIndex,
            );
        }
    });

    socket.on("missionUpdate", (data) => {
        // ... (existing missionUpdate logic with its console logs) ...
        if (gameState.myShip && gameState.myShip.activeMissions) {
            const missionIndex = gameState.myShip.activeMissions.findIndex(
                (m) => m.id === data.missionId,
            );
            if (missionIndex !== -1) {
                if (data.status)
                    gameState.myShip.activeMissions[missionIndex].status =
                        data.status;
                if (
                    data.progress &&
                    gameState.myShip.activeMissions[missionIndex].type ===
                        gameState.clientGameData.MISSION_TYPES.BOUNTY
                ) {
                    gameState.myShip.activeMissions[
                        missionIndex
                    ].targetsDestroyed = parseInt(data.progress.split("/")[0]);
                }
                // ...
            }
        }
        // ...
        console.log("network.js/missionUpdate received:", JSON.stringify(data));
        // ... (alerting logic) ...
    });
}

export function sendControls() {
    if (
        !gameState.socket ||
        !gameState.myShip ||
        (gameState.myShip && gameState.myShip.destroyed)
    ) {
        // console.warn("sendControls: Pre-condition failed", {socket: !!gameState.socket, myShip: !!gameState.myShip, destroyed: gameState.myShip ? gameState.myShip.destroyed : 'N/A'});
        return;
    }
    // console.log("sendControls: Emitting 'control'");
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
    console.log(
        `fireWeapon called. Socket: ${!!gameState.socket}, MyShip: ${!!gameState.myShip}, Destroyed: ${gameState.myShip ? gameState.myShip.destroyed : "N/A"}, ActiveWeapon: ${gameState.myShip ? gameState.myShip.activeWeapon : "N/A"}, Docked: ${gameState.docked}`,
    );
    if (
        !gameState.socket ||
        !gameState.myShip ||
        gameState.myShip.destroyed ||
        !gameState.myShip.activeWeapon ||
        gameState.docked
    ) {
        console.warn("fireWeapon: Pre-condition failed.");
        return;
    }
    console.log("fireWeapon: Emitting 'fire'.");
    gameState.socket.emit("fire");
}

export function equipWeapon(weaponName) {
    console.log(
        `equipWeapon called with: ${weaponName}. Socket: ${!!gameState.socket}`,
    );
    if (!gameState.socket) return;
    gameState.socket.emit("equipWeapon", { weapon: weaponName });
}

export function requestDock(systemIndex, planetIndex) {
    console.log(
        `requestDock called for system ${systemIndex}, planet ${planetIndex}. Socket: ${!!gameState.socket}`,
    );
    if (!gameState.socket) return;
    gameState.socket.emit("dock", { systemIndex, planetIndex });
}

export function undock() {
    console.log(
        `undock() called. Current gameState.docked: ${gameState.docked}, gameState.dockedAtDetails: ${JSON.stringify(gameState.dockedAtDetails)}`,
    );
    if (!gameState.socket || !gameState.docked) {
        console.warn(
            `undock: Pre-condition failed. Socket: ${!!gameState.socket}, gameState.docked: ${gameState.docked}. Cannot send undock emit or save.`,
        );
        // The "Action Failed: Not docked" alert might be coming from a server response if the emit still goes through,
        // or if the client directly shows this based on this check.
        // If the alert is from the client, it means this check is what's stopping it.
        return;
    }
    console.log("undock: Emitting 'undock' to server.");
    gameState.socket.emit("undock");

    console.log(
        "undock: Calling saveProgress(). gameState.docked BEFORE UIManager.undockCleanup (which happens on undockConfirmed) and server confirm:",
        gameState.docked,
    );
    // At this exact moment, gameState.docked is TRUE because the check above passed.
    // saveProgress will therefore save the current (still docked) state details.
    saveProgress(); // <<< SAVE ON UNDOCK REQUEST (as per instructions)
}

export function buyGood(goodIndex) {
    console.log(
        `buyGood called for index ${goodIndex}. Docked: ${gameState.docked}`,
    );
    if (
        !gameState.socket ||
        !gameState.docked ||
        !gameState.dockedAtDetails ||
        !gameState.clientGameData.tradeGoods[goodIndex]
    ) {
        console.warn("buyGood: Pre-condition failed.");
        return;
    }
    const good = gameState.clientGameData.tradeGoods[goodIndex];
    console.log("buyGood: Emitting 'buyGood' for", good.name);
    gameState.socket.emit("buyGood", {
        goodName: good.name,
        quantity: 1,
        systemIndex: gameState.dockedAtDetails.systemIndex,
        planetIndex: gameState.dockedAtDetails.planetIndex,
    });
}

export function sellGood(goodIndex) {
    console.log(
        `sellGood called for index ${goodIndex}. Docked: ${gameState.docked}`,
    );
    if (
        !gameState.socket ||
        !gameState.docked ||
        !gameState.dockedAtDetails ||
        !gameState.clientGameData.tradeGoods[goodIndex]
    ) {
        console.warn("sellGood: Pre-condition failed.");
        return;
    }
    const good = gameState.clientGameData.tradeGoods[goodIndex];
    console.log("sellGood: Emitting 'sellGood' for", good.name);
    gameState.socket.emit("sellGood", {
        goodName: good.name,
        quantity: 1,
        systemIndex: gameState.dockedAtDetails.systemIndex,
        planetIndex: gameState.dockedAtDetails.planetIndex,
    });
}

export function buyShip(shipTypeIndex) {
    console.log(
        `buyShip called for type index ${shipTypeIndex}. MyShip exists: ${!!gameState.myShip}`,
    );
    if (!gameState.socket || !gameState.myShip) return;
    const sTypeDef = gameState.clientGameData.shipTypes[shipTypeIndex];
    if (!sTypeDef) {
        alert("Invalid ship type selected.");
        return;
    }
    if (gameState.myShip.credits < sTypeDef.price) {
        alert("Not enough credits to buy this ship.");
        return;
    }
    console.log("buyShip: Emitting 'buyShip' for type index", shipTypeIndex);
    gameState.socket.emit("buyShip", { shipTypeIndex: shipTypeIndex });
}

export function requestMissions(systemIndex, planetIndex) {
    console.log(
        `requestMissions called for system ${systemIndex}, planet ${planetIndex}. Socket: ${!!gameState.socket}`,
    );
    if (!gameState.socket) return;
    gameState.socket.emit("requestMissions", { systemIndex, planetIndex });
}

export function acceptMission(missionId, systemIndex, planetIndex) {
    console.log(
        `acceptMission called for ID ${missionId}. Socket: ${!!gameState.socket}`,
    );
    if (!gameState.socket) return;
    gameState.socket.emit("acceptMission", {
        missionId,
        systemIndex,
        planetIndex,
    });
}
