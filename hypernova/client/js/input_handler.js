// client/js/input_handler.js
import { gameState } from "./game_state.js";
import * as Network from "./network.js";
import { UIManager } from "./ui_manager.js";
import { UniverseMapManager } from "./universe_map_renderer.js"; // Corrected import name
import { DAMPING, DOCKING_DISTANCE_SQUARED } from "./client_config.js";

function wrap(value, max) {
    return ((value % max) + max) % max;
}

export function initInputListeners(canvas) {
    window.addEventListener("keydown", (e) => {
        const targetElement = e.target;
        const isInputFocused =
            targetElement &&
            (targetElement.tagName.toUpperCase() === "INPUT" ||
                targetElement.tagName.toUpperCase() === "TEXTAREA" ||
                targetElement.isContentEditable);

        if (isInputFocused) {
            return;
        }

        const keyLower = e.key.toLowerCase();
        const gameSpecificKeys = [
            "arrowup", "arrowdown", "arrowleft", "arrowright",
            " ", // Space for primary fire
            "shift", // Shift for secondary fire
            "w", // For secondary weapon cycle
            "d", "h", "q", "e", "t", "y", "o", "m", "u", "b", "s", "a", "escape", "j",
        ];

        if (gameState.isMapOpen) {
            if (keyLower === "m" || keyLower === "escape") {
                UniverseMapManager.closeMap();
                e.preventDefault();
            }
            // Potentially handle Alt+W for map functions if any, or general map nav keys
            return;
        }

        if (gameSpecificKeys.includes(keyLower)) {
            e.preventDefault();
        }

        if (
            gameState.hyperjumpDeniedMessage &&
            keyLower !== "h" &&
            keyLower !== "j"
        ) {
            clearTimeout(gameState.hyperjumpDeniedMessageTimeoutId);
            gameState.hyperjumpDeniedMessage = null;
            gameState.hyperjumpDeniedMessageTimeoutId = null;
        }

        if (!gameState.myShip || gameState.myShip.destroyed) {
            return;
        }

        if (!gameState.docked) {
            // In-space controls
            if (e.code === "Space" && !gameState.isChargingHyperjump && !gameState.isMapOpen) {
                Network.firePrimaryWeapon();
            } else if (e.key === "Shift" && !gameState.isChargingHyperjump && !gameState.isMapOpen) {
                Network.fireSecondaryWeapon();
            }


            switch (keyLower) {
                case "arrowup":
                    if (!gameState.isChargingHyperjump && !gameState.isMapOpen)
                        gameState.controls.accelerating = true;
                    break;
                case "arrowdown":
                    if (!gameState.isChargingHyperjump && !gameState.isMapOpen)
                        gameState.controls.decelerating = true;
                    break;
                case "arrowleft":
                    if (!gameState.isChargingHyperjump && !gameState.isMapOpen)
                        gameState.controls.rotatingLeft = true;
                    break;
                case "arrowright":
                    if (!gameState.isChargingHyperjump && !gameState.isMapOpen)
                        gameState.controls.rotatingRight = true;
                    break;
                case "d":
                    if (!gameState.isChargingHyperjump && !gameState.isMapOpen)
                        tryDockAction();
                    break;
                case "h":
                    // 'H' currently does nothing specific here.
                    break;
                case "j":
                    if (
                        !gameState.isMapOpen &&
                        !gameState.docked &&
                        !gameState.isChargingHyperjump &&
                        gameState.plannedRoute.length > 0 &&
                        gameState.currentRouteLegIndex !== -1 &&
                        gameState.currentRouteLegIndex <
                            gameState.plannedRoute.length
                    ) {
                        const targetSystemIndex =
                            gameState.plannedRoute[
                                gameState.currentRouteLegIndex
                            ];
                        if (targetSystemIndex !== gameState.myShip.system) {
                            Network.requestHyperjump(targetSystemIndex);
                        } else {
                            console.warn(
                                "Attempted to 'J' jump to current system. Advancing route leg.",
                            );
                            gameState.currentRouteLegIndex++;
                            if (
                                gameState.currentRouteLegIndex >=
                                gameState.plannedRoute.length
                            ) {
                                gameState.plannedRoute = [];
                                gameState.currentRouteLegIndex = -1;
                            }
                        }
                    } else if (
                        !gameState.docked &&
                        !gameState.isChargingHyperjump
                    ) {
                        if (gameState.plannedRoute.length > 0) {
                            gameState.plannedRoute = [];
                            gameState.currentRouteLegIndex = -1;
                        }
                    }
                    break;
                case "q": // Cycle primary weapon backward
                    if (!gameState.isChargingHyperjump && !gameState.isMapOpen)
                        cyclePrimaryWeaponAction(-1);
                    break;
                case "e": // Cycle primary weapon forward
                    if (!gameState.isChargingHyperjump && !gameState.isMapOpen)
                        cyclePrimaryWeaponAction(1);
                    break;
                case "w": // Cycle secondary weapon
                    if (!gameState.isChargingHyperjump && !gameState.isMapOpen) {
                        cycleSecondaryWeaponAction(e.altKey ? -1 : 1);
                    }
                    break;
                case "m":
                    if (!gameState.docked) {
                        UniverseMapManager.toggleMap();
                    } else {
                        handleMenuKeyDown(keyLower); // For docked missions menu
                    }
                    break;
            }
        } else {
            // Docked controls
            handleMenuKeyDown(keyLower);
        }
    });

    window.addEventListener("keyup", (e) => {
        const targetElement = e.target;
        const isInputFocused =
            targetElement &&
            (targetElement.tagName.toUpperCase() === "INPUT" ||
                targetElement.tagName.toUpperCase() === "TEXTAREA" ||
                targetElement.isContentEditable);

        if (isInputFocused) {
            return;
        }
        if (gameState.isMapOpen) return;

        if (
            !gameState.myShip ||
            gameState.myShip.destroyed ||
            gameState.docked
        ) {
            gameState.controls.accelerating = false;
            gameState.controls.decelerating = false;
            gameState.controls.rotatingLeft = false;
            gameState.controls.rotatingRight = false;
            return;
        }
        const keyLower = e.key.toLowerCase();
        switch (keyLower) {
            case "arrowup":
                gameState.controls.accelerating = false;
                break;
            case "arrowdown":
                gameState.controls.decelerating = false;
                break;
            case "arrowleft":
                gameState.controls.rotatingLeft = false;
                break;
            case "arrowright":
                gameState.controls.rotatingRight = false;
                break;
        }
    });
}

function tryDockAction() {
    console.log("[Client Dock Attempt] tryDockAction called."); // New log

    if (!gameState.myShip) {
        console.log("[Client Dock Attempt] Failed: No myShip."); // New log
        return;
    }
    console.log(`[Client Dock Attempt] My ship system: ${gameState.myShip.system}`); // New log

    if (!gameState.clientGameData.systems[gameState.myShip.system]) {
        console.log(`[Client Dock Attempt] Failed: No system data for index ${gameState.myShip.system}. clientGameData.systems length: ${gameState.clientGameData.systems.length}`); // New log
        // console.log(JSON.stringify(gameState.clientGameData.systems)); // Optional: Log the whole array if small
        return;
    }
    console.log("[Client Dock Attempt] System data found. Proceeding..."); // New log


    const planetsInCurrentSystem =
        gameState.clientGameData.systems[gameState.myShip.system].planets;
    let nearestDistSq = Infinity,
        nearestPlanetIndex = -1;

    if (!planetsInCurrentSystem || planetsInCurrentSystem.length === 0) {
        console.log("[Client Dock Attempt] Failed: No planets in current system array."); // New log
        return;
    }

    planetsInCurrentSystem.forEach((p, index) => {
        if (!p) { // Check if planet object itself is valid
            console.warn(`[Client Dock Attempt] Planet at index ${index} is undefined or null.`);
            return; // Skip this iteration
        }
        const planetScale = p.planetImageScale || 1.0;
        // DOCKING_DISTANCE_SQUARED is from client_config
        const effectiveDockingDistanceSq =
            DOCKING_DISTANCE_SQUARED * Math.pow(planetScale, 2) * 2.5;

        const d2 =
            (gameState.myShip.x - p.x) ** 2 + (gameState.myShip.y - p.y) ** 2;
        if (d2 < nearestDistSq) {
            nearestDistSq = d2;
            nearestPlanetIndex = index;
        }
    });

    if (nearestPlanetIndex !== -1) {
        const planetForDocking = planetsInCurrentSystem[nearestPlanetIndex];
         if (!planetForDocking) {
            console.error(`[Client Dock Attempt] planetForDocking at index ${nearestPlanetIndex} is undefined!`);
            return;
        }
        const effectiveDockingDistanceSq =
            DOCKING_DISTANCE_SQUARED *
            Math.pow(planetForDocking?.planetImageScale || 1.0, 2) *
            2.5;

        console.log(`[Client Dock Attempt] Nearest planet: ${planetForDocking.name}, distSq: ${nearestDistSq.toFixed(2)}, requiredDistSq: ${effectiveDockingDistanceSq.toFixed(2)}`); // New log

        if (nearestDistSq < effectiveDockingDistanceSq) {
            console.log(`[Client Dock Attempt] Conditions met. Sending Network.requestDock for system ${gameState.myShip.system}, planet ${nearestPlanetIndex}`); // New log
            Network.requestDock(gameState.myShip.system, nearestPlanetIndex);
        } else {
            console.log("[Client Dock Attempt] Not close enough to nearest planet."); // New log
        }
    } else {
        console.log("[Client Dock Attempt] No nearest planet found (or no planets in system)."); // New log
    }
}


function cyclePrimaryWeaponAction(direction) {
    if (
        !gameState.myShip ||
        !gameState.myShip.weapons || // Primary weapons stored in .weapons
        gameState.myShip.weapons.length === 0
    )
        return;

    gameState.primaryWeaponCycleIdx =
        (gameState.primaryWeaponCycleIdx +
            direction +
            gameState.myShip.weapons.length) %
        gameState.myShip.weapons.length;

    const weaponName = gameState.myShip.weapons[gameState.primaryWeaponCycleIdx];
    Network.equipPrimaryWeapon(weaponName); // Changed from equipWeapon
}

function cycleSecondaryWeaponAction(direction) {
    const myShip = gameState.myShip;
    if (!myShip || !myShip.secondaryWeapons || myShip.secondaryWeapons.length === 0) {
        gameState.activeSecondaryWeaponSlot = -1; // No secondaries, ensure none selected
        UIManager.updateShipStatsPanel(); // Update HUD to show no secondary selected
        return;
    }

    if (gameState.activeSecondaryWeaponSlot === -1 && myShip.secondaryWeapons.length > 0) {
        // If no secondary was selected, select the first one
        gameState.activeSecondaryWeaponSlot = 0;
    } else {
        gameState.activeSecondaryWeaponSlot =
            (gameState.activeSecondaryWeaponSlot + direction + myShip.secondaryWeapons.length) % myShip.secondaryWeapons.length;
    }
    // No network call needed, selection is client-side state.
    // HUD should update to show the newly selected secondary weapon and its ammo.
    console.log("Selected secondary weapon:", myShip.secondaryWeapons[gameState.activeSecondaryWeaponSlot]);
    UIManager.updateShipStatsPanel(); // Update HUD
}


function handleMenuKeyDown(keyLower) {
    if (!gameState.docked || !gameState.myShip) {
        return;
    }
    if (!gameState.activeSubMenu) {
        switch (keyLower) {
            case "t":
                gameState.activeSubMenu = "trade";
                gameState.selectedTradeIndex = 0;
                UIManager.renderTradeMenu();
                break;
            case "y":
                gameState.activeSubMenu = "shipyard";
                gameState.selectedShipIndex = 0;
                UIManager.renderShipyardMenu();
                break;
            case "o": // Outfitter
                gameState.activeSubMenu = "outfitter";
                const weaponKeysList = Object.keys(
                    gameState.clientGameData.weapons,
                );
                 // Initialize selectedOutfitterWeaponKey if it's null or not in the list
                if (
                    !gameState.selectedOutfitterWeaponKey ||
                    !weaponKeysList.includes(gameState.selectedOutfitterWeaponKey)
                ) {
                    gameState.selectedOutfitterWeaponKey = weaponKeysList.length > 0 ? weaponKeysList[0] : null;
                }
                UIManager.renderOutfitterMenu();
                break;
            case "m":
                gameState.activeSubMenu = "missions";
                gameState.selectedMissionIndex = 0;
                gameState.availableMissionsForCurrentPlanet = [];
                UIManager.renderMissionsMenu();
                if (gameState.dockedAtDetails) {
                    Network.requestMissions(
                        gameState.dockedAtDetails.systemIndex,
                        gameState.dockedAtDetails.planetIndex,
                    );
                }
                break;
            case "u":
                Network.undock();
                break;
        }
    } else {
        // We are in a sub-menu
        if (keyLower === "escape") {
            gameState.activeSubMenu = null;
            UIManager.renderDockedStationInterface();
            return;
        }
        switch (gameState.activeSubMenu) {
            case "trade":
                const numTradeGoods =
                    gameState.clientGameData.tradeGoods.length;
                if (keyLower === "arrowup")
                    gameState.selectedTradeIndex = Math.max(
                        0,
                        gameState.selectedTradeIndex - 1,
                    );
                else if (keyLower === "arrowdown")
                    gameState.selectedTradeIndex = Math.min(
                        numTradeGoods - 1,
                        gameState.selectedTradeIndex + 1,
                    );
                else if (keyLower === "b" && numTradeGoods > 0)
                    Network.buyGood(gameState.selectedTradeIndex);
                else if (keyLower === "s" && numTradeGoods > 0)
                    Network.sellGood(gameState.selectedTradeIndex);
                UIManager.renderTradeMenu();
                break;
            case "outfitter":
                const weaponKeys = Object.keys(
                    gameState.clientGameData.weapons,
                );
                if (weaponKeys.length > 0) {
                    let currentWKeyIndex = weaponKeys.indexOf(
                        gameState.selectedOutfitterWeaponKey,
                    );
                    if (currentWKeyIndex === -1 && weaponKeys.length > 0) { // Ensure valid index
                        currentWKeyIndex = 0;
                        gameState.selectedOutfitterWeaponKey = weaponKeys[0];
                    }

                    if (keyLower === "arrowup")
                        currentWKeyIndex = Math.max(0, currentWKeyIndex - 1);
                    else if (keyLower === "arrowdown")
                        currentWKeyIndex = Math.min(
                            weaponKeys.length - 1,
                            currentWKeyIndex + 1,
                        );
                    gameState.selectedOutfitterWeaponKey = weaponKeys[currentWKeyIndex];
                }
                if (keyLower === "b" && gameState.selectedOutfitterWeaponKey) {
                    // Buy/Equip logic now needs to differentiate based on weapon type
                    const weaponToBuy = gameState.clientGameData.weapons[gameState.selectedOutfitterWeaponKey];
                    if (weaponToBuy) {
                        if (weaponToBuy.type === "primary") {
                            Network.equipPrimaryWeapon(gameState.selectedOutfitterWeaponKey);
                        } else if (weaponToBuy.type === "secondary") {
                            Network.addSecondaryWeapon(gameState.selectedOutfitterWeaponKey);
                        }
                    }
                }
                UIManager.renderOutfitterMenu();
                break;
            case "shipyard":
                const numShipTypes = gameState.clientGameData.shipTypes.length;
                if (keyLower === "arrowup")
                    gameState.selectedShipIndex = Math.max(
                        0,
                        gameState.selectedShipIndex - 1,
                    );
                else if (keyLower === "arrowdown")
                    gameState.selectedShipIndex = Math.min(
                        numShipTypes - 1,
                        gameState.selectedShipIndex + 1,
                    );
                else if (keyLower === "b" && numShipTypes > 0)
                    Network.buyShip(gameState.selectedShipIndex);
                UIManager.renderShipyardMenu();
                break;
            case "missions":
                const numMissions =
                    gameState.availableMissionsForCurrentPlanet.length;
                if (keyLower === "arrowup")
                    gameState.selectedMissionIndex = Math.max(
                        0,
                        gameState.selectedMissionIndex - 1,
                    );
                else if (keyLower === "arrowdown")
                    gameState.selectedMissionIndex = Math.min(
                        numMissions - 1,
                        gameState.selectedMissionIndex + 1,
                    );
                else if (
                    keyLower === "a" &&
                    numMissions > 0 &&
                    gameState.availableMissionsForCurrentPlanet[
                        gameState.selectedMissionIndex
                    ]
                ) {
                    const missionToAccept =
                        gameState.availableMissionsForCurrentPlanet[
                            gameState.selectedMissionIndex
                        ];
                    Network.acceptMission(
                        missionToAccept.id,
                        gameState.dockedAtDetails.systemIndex,
                        gameState.dockedAtDetails.planetIndex,
                    );
                }
                UIManager.renderMissionsMenu();
                break;
        }
    }
}

export function processInputs() {
    if (gameState.isMapOpen) {
        if (
            gameState.myShip &&
            !gameState.myShip.destroyed &&
            !gameState.docked
        ) {
            const myShip = gameState.myShip;
            myShip.vx *= DAMPING;
            myShip.vy *= DAMPING;
            myShip.x += myShip.vx;
            myShip.y += myShip.vy;
            Network.sendControls();
        }
        gameState.controls.accelerating = false;
        gameState.controls.decelerating = false;
        gameState.controls.rotatingLeft = false;
        gameState.controls.rotatingRight = false;
        return;
    }

    if (!gameState.myShip || gameState.myShip.destroyed || gameState.docked) {
        if (
            gameState.myShip &&
            !gameState.myShip.destroyed &&
            gameState.isChargingHyperjump &&
            !gameState.docked
        ) {
            const myShip = gameState.myShip;
            myShip.vx *= DAMPING;
            myShip.vy *= DAMPING;
            myShip.x += myShip.vx;
            myShip.y += myShip.vy;
            Network.sendControls();
        }
        gameState.controls.accelerating = false;
        gameState.controls.decelerating = false;
        gameState.controls.rotatingLeft = false;
        gameState.controls.rotatingRight = false;
        return;
    }
    const myShip = gameState.myShip;
    if (
        !myShip ||
        myShip.type === undefined ||
        myShip.type === null ||
        !gameState.clientGameData.shipTypes ||
        myShip.type >= gameState.clientGameData.shipTypes.length ||
        !gameState.clientGameData.shipTypes[myShip.type]
    ) {
        return;
    }
    const shipDef = gameState.clientGameData.shipTypes[myShip.type];

    const thrust = (shipDef.speedMult || 1.0) * 0.1;
    const rotSpd = (shipDef.rotMult || 1.0) * 0.07;
    const revThrust = thrust * (shipDef.revMult || 1.0);

    if (gameState.controls.rotatingLeft) myShip.angle -= rotSpd;
    if (gameState.controls.rotatingRight) myShip.angle += rotSpd;
    myShip.angle = wrap(myShip.angle, 2 * Math.PI);

    if (gameState.controls.accelerating) {
        myShip.vx += thrust * Math.cos(myShip.angle);
        myShip.vy += thrust * Math.sin(myShip.angle);
    }
    if (gameState.controls.decelerating) {
        myShip.vx -= revThrust * Math.cos(myShip.angle);
        myShip.vy -= revThrust * Math.sin(myShip.angle);
    }

    myShip.vx *= DAMPING;
    myShip.vy *= DAMPING;

    myShip.x += myShip.vx;
    myShip.y += myShip.vy;

    Network.sendControls();
}

