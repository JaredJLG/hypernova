// hypernova/client/js/network.js
import { gameState } from "./game_state.js";
import { UIManager } from "./ui_manager.js";
// Renderer might not be directly needed here, but can be if you need to trigger redraws from network events
// import { Renderer } from './renderer.js';

export function initNetwork(onReadyCallback) {
    const socket = io();
    gameState.socket = socket;

    socket.on("init", (data) => {
        console.log("Received init data:", data);
        if (!data || !data.id || !data.gameData) {
            console.error("Incomplete init data received from server.");
            // Handle this error appropriately, maybe show a message to the user
            return;
        }
        gameState.myId = data.id;

        // Populate clientGameData
        gameState.clientGameData.systems = data.gameData.systems || [];
        gameState.clientGameData.tradeGoods = data.gameData.tradeGoods || [];
        gameState.clientGameData.weapons = data.gameData.weapons || {};
        gameState.clientGameData.shipTypes = data.gameData.shipTypes || [];
        gameState.clientGameData.MISSION_TYPES =
            data.gameData.MISSION_TYPES || {};
        gameState.clientPlanetEconomies = data.gameData.economies || [];

        // Collect image paths to load
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
        console.log("Image paths to load:", gameState.imagePathsToLoad);

        // Process all ships from init
        if (data.ships) {
            for (const shipId in data.ships) {
                gameState.updateShipData(shipId, data.ships[shipId]);
            }
        }

        if (gameState.myShip) {
            gameState.defaultShipProps(gameState.myShip);
        } else {
            console.error("My ship data not found in init!");
            gameState.allShips[gameState.myId] = {}; // Create a placeholder
            gameState.defaultShipProps(gameState.myShip);
        }

        console.log("Client initialized. My ship:", gameState.myShip);
        if (onReadyCallback) onReadyCallback();
    });

    socket.on("state", (updatedShipDataMap) => {
        for (const id in updatedShipDataMap) {
            gameState.updateShipData(id, updatedShipDataMap[id]);
        }
        if (
            gameState.myShip &&
            gameState.myShip.dockedAtPlanetIdentifier === null &&
            gameState.docked
        ) {
            UIManager.undockCleanup();
        }
    });

    socket.on("playerJoined", (data) => {
        console.log("Player joined:", data.id);
        gameState.updateShipData(data.id, data.ship);
    });

    socket.on("playerLeft", (id) => {
        console.log("Player left:", id);
        delete gameState.allShips[id];
    });

    socket.on("projectile", (data) => {
        data.time = Date.now();
        gameState.projectiles.push(data);
    });

    socket.on("dockConfirmed", (data) => {
        gameState.docked = true;
        if (gameState.myShip)
            gameState.myShip.dockedAtPlanetIdentifier = {
                systemIndex: data.systemIndex,
                planetIndex: data.planetIndex,
            };
        gameState.dockedAtDetails = { ...data };
        UIManager.openDockMenu();
    });

    socket.on("undockConfirmed", () => {
        UIManager.undockCleanup();
    });

    socket.on("tradeError", ({ message }) => alert(`Trade Error: ${message}`));
    socket.on("actionFailed", ({ message }) =>
        alert(`Action Failed: ${message}`),
    );
    socket.on("actionSuccess", ({ message }) => console.log(message));

    socket.on("tradeSuccess", (data) => {
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
        if (gameState.myShip && gameState.myShip.activeMissions) {
            const mission = gameState.myShip.activeMissions.find(
                (m) => m.id === data.missionId,
            );
            if (mission) {
                if (data.status) mission.status = data.status;
                if (
                    data.progress &&
                    mission.type ===
                        gameState.clientGameData.MISSION_TYPES.BOUNTY
                ) {
                    mission.targetsDestroyed = parseInt(
                        data.progress.split("/")[0],
                    );
                }
            }
        }

        let message = `Mission Update ("${data.missionId.substring(0, 12)}..."): Status ${data.status}.`;
        if (data.reason) message += ` Reason: ${data.reason}.`;
        if (data.reward) message += ` Reward: $${data.reward}.`;
        if (data.penalty) message += ` Penalty: $${data.penalty}.`;
        if (data.message) message += ` ${data.message}`;

        console.log("Mission Update received:", data);
        if (
            data.status !== "INFO" ||
            (data.message &&
                (data.message.includes("Need") ||
                    data.message.includes("failed")))
        ) {
            alert(message);
        }
        if (
            gameState.activeSubMenu === "missions" &&
            (data.status === "COMPLETED" || data.status === "FAILED_TIME")
        ) {
            if (gameState.dockedAtDetails) {
                requestMissions(
                    gameState.dockedAtDetails.systemIndex,
                    gameState.dockedAtDetails.planetIndex,
                );
            }
        }
    });
}

export function sendControls() {
    if (!gameState.socket || !gameState.myShip || gameState.myShip.destroyed)
        return;
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
    if (
        !gameState.socket ||
        !gameState.myShip ||
        gameState.myShip.destroyed ||
        !gameState.myShip.activeWeapon ||
        gameState.docked
    )
        return;
    gameState.socket.emit("fire");
}

export function equipWeapon(weaponName) {
    if (!gameState.socket) return;
    gameState.socket.emit("equipWeapon", { weapon: weaponName });
}

export function requestDock(systemIndex, planetIndex) {
    if (!gameState.socket) return;
    gameState.socket.emit("dock", { systemIndex, planetIndex });
}

export function undock() {
    if (!gameState.socket || !gameState.docked) return;
    gameState.socket.emit("undock");
}

export function buyGood(goodIndex) {
    if (
        !gameState.socket ||
        !gameState.docked ||
        !gameState.dockedAtDetails ||
        !gameState.clientGameData.tradeGoods[goodIndex]
    )
        return;
    const good = gameState.clientGameData.tradeGoods[goodIndex];
    gameState.socket.emit("buyGood", {
        goodName: good.name,
        quantity: 1,
        systemIndex: gameState.dockedAtDetails.systemIndex,
        planetIndex: gameState.dockedAtDetails.planetIndex,
    });
}

export function sellGood(goodIndex) {
    if (
        !gameState.socket ||
        !gameState.docked ||
        !gameState.dockedAtDetails ||
        !gameState.clientGameData.tradeGoods[goodIndex]
    )
        return;
    const good = gameState.clientGameData.tradeGoods[goodIndex];
    gameState.socket.emit("sellGood", {
        goodName: good.name,
        quantity: 1,
        systemIndex: gameState.dockedAtDetails.systemIndex,
        planetIndex: gameState.dockedAtDetails.planetIndex,
    });
}

export function buyShip(shipTypeIndex) {
    if (!gameState.socket || !gameState.myShip) return;
    const sTypeDef = gameState.clientGameData.shipTypes[shipTypeIndex];
    if (!sTypeDef || gameState.myShip.credits < sTypeDef.price) {
        alert("Not enough credits or invalid ship.");
        return;
    }
    gameState.socket.emit("buyShip", { shipTypeIndex: shipTypeIndex });
}

export function requestMissions(systemIndex, planetIndex) {
    if (!gameState.socket) return;
    gameState.socket.emit("requestMissions", { systemIndex, planetIndex });
}

export function acceptMission(missionId, systemIndex, planetIndex) {
    if (!gameState.socket) return;
    gameState.socket.emit("acceptMission", {
        missionId,
        systemIndex,
        planetIndex,
    });
}
