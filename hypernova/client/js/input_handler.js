// client/js/input_handler.js
import { gameState } from "./game_state.js";
import * as Network from "./network.js";
import { UIManager } from "./ui_manager.js";
import { UniverseMapManager } from "./universe_map_renderer.js"; // Corrected import name
import {
    // BASE_THRUST, // Not used here
    // BASE_ROTATION_SPEED, // Not used here
    DAMPING,
    DOCKING_DISTANCE_SQUARED,
    // MIN_HYPERJUMP_DISTANCE_FROM_PLANET_SQUARED, // Used in Network.js
    // HYPERJUMP_DENIED_MESSAGE_DURATION_MS, // Used in Network.js
} from "./client_config.js";

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
            "arrowup",
            "arrowdown",
            "arrowleft",
            "arrowright",
            " ",
            "d",
            "h",
            "q",
            "e",
            "t",
            "y",
            "o",
            "m",
            "u",
            "b",
            "s",
            "a",
            "escape",
            "j", // Added 'j'
        ];

        if (gameState.isMapOpen) {
            if (keyLower === "m" || keyLower === "escape") {
                UniverseMapManager.closeMap();
                e.preventDefault();
            }
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
            // Check against h and j
            clearTimeout(gameState.hyperjumpDeniedMessageTimeoutId);
            gameState.hyperjumpDeniedMessage = null;
            gameState.hyperjumpDeniedMessageTimeoutId = null;
        }

        if (!gameState.myShip || gameState.myShip.destroyed) {
            return;
        }

        if (!gameState.docked) {
            // In-space controls
            if (e.code === "Space" && !gameState.isChargingHyperjump) {
                if (!gameState.isMapOpen) Network.fireWeapon();
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
                case "j": // New: Initiate hyperjump for planned route
                    if (
                        !gameState.isMapOpen && // Not in map
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
                            // Ensure not trying to jump to current system
                            Network.requestHyperjump(targetSystemIndex);
                        } else {
                            // This case should ideally be prevented by route planning logic
                            // or handled in hyperjumpComplete by advancing leg.
                            // For now, just inform if trying to jump to current system via 'J'.
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
                                // UIManager.showToast("Route completed."); // Optional feedback
                            }
                        }
                    } else if (
                        !gameState.docked &&
                        !gameState.isChargingHyperjump
                    ) {
                        // Clear route if 'j' is pressed with no valid route leg or route finished
                        if (gameState.plannedRoute.length > 0) {
                            gameState.plannedRoute = [];
                            gameState.currentRouteLegIndex = -1;
                            // UIManager.showToast("Route cleared or finished."); // Optional
                        }
                    }
                    break;
                case "q":
                    if (!gameState.isChargingHyperjump && !gameState.isMapOpen)
                        cycleWeaponAction(-1);
                    break;
                case "e":
                    if (!gameState.isChargingHyperjump && !gameState.isMapOpen)
                        cycleWeaponAction(1);
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
    // ... (existing code, no changes needed here for routing)
    if (
        !gameState.myShip ||
        !gameState.clientGameData.systems[gameState.myShip.system]
    )
        return;
    const planetsInCurrentSystem =
        gameState.clientGameData.systems[gameState.myShip.system].planets;
    let nearestDistSq = Infinity,
        nearestPlanetIndex = -1;

    planetsInCurrentSystem.forEach((p, index) => {
        const planetScale = p.planetImageScale || 1.0;
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
        const effectiveDockingDistanceSq =
            DOCKING_DISTANCE_SQUARED *
            Math.pow(planetForDocking?.planetImageScale || 1.0, 2) *
            2.5;

        if (nearestDistSq < effectiveDockingDistanceSq) {
            Network.requestDock(gameState.myShip.system, nearestPlanetIndex);
        }
    }
}

function cycleWeaponAction(direction) {
    // ... (existing code, no changes needed here for routing)
    if (
        !gameState.myShip ||
        !gameState.myShip.weapons ||
        gameState.myShip.weapons.length === 0
    )
        return;
    gameState.weaponCycleIdx =
        (gameState.weaponCycleIdx +
            direction +
            gameState.myShip.weapons.length) %
        gameState.myShip.weapons.length;
    const weaponName = gameState.myShip.weapons[gameState.weaponCycleIdx];
    Network.equipWeapon(weaponName);
}

function handleMenuKeyDown(keyLower) {
    // ... (existing code, no changes needed here for routing)
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
            case "o":
                gameState.activeSubMenu = "outfitter";
                const weaponKeysList = Object.keys(
                    gameState.clientGameData.weapons,
                );
                if (
                    !gameState.selectedWeaponKey ||
                    !weaponKeysList.includes(gameState.selectedWeaponKey)
                ) {
                    gameState.selectedWeaponKey = weaponKeysList[0] || null;
                }
                UIManager.renderOutfitterMenu();
                break;
            case "m": // This 'm' is for DOCKED missions
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
                        gameState.selectedWeaponKey,
                    );
                    if (currentWKeyIndex === -1 && weaponKeys.length > 0)
                        currentWKeyIndex = 0;
                    if (keyLower === "arrowup")
                        currentWKeyIndex = Math.max(0, currentWKeyIndex - 1);
                    else if (keyLower === "arrowdown")
                        currentWKeyIndex = Math.min(
                            weaponKeys.length - 1,
                            currentWKeyIndex + 1,
                        );
                    gameState.selectedWeaponKey = weaponKeys[currentWKeyIndex];
                }
                if (keyLower === "b" && gameState.selectedWeaponKey)
                    Network.equipWeapon(gameState.selectedWeaponKey);
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
    // ... (existing code, some minor adjustments for damping if map is open)
    if (gameState.isMapOpen) {
        // If map is open, apply damping and send controls, but no player input processing
        if (
            gameState.myShip &&
            !gameState.myShip.destroyed &&
            !gameState.docked // Only apply physics if not docked
        ) {
            const myShip = gameState.myShip;
            myShip.vx *= DAMPING;
            myShip.vy *= DAMPING;
            myShip.x += myShip.vx;
            myShip.y += myShip.vy;
            Network.sendControls(); // Still send position updates
        }
        // Reset controls flags if map is open
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
            gameState.isChargingHyperjump && // Only apply physics if charging hyperjump
            !gameState.docked
        ) {
            const myShip = gameState.myShip;
            myShip.vx *= DAMPING;
            myShip.vy *= DAMPING;
            myShip.x += myShip.vx;
            myShip.y += myShip.vy;
            Network.sendControls();
        }
        // Reset controls flags if destroyed or docked (and not charging hyperjump)
        gameState.controls.accelerating = false;
        gameState.controls.decelerating = false;
        gameState.controls.rotatingLeft = false;
        gameState.controls.rotatingRight = false;
        return;
    }
    // ... (rest of existing processInputs code for ship movement)
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

    const thrust = (shipDef.speedMult || 1.0) * 0.1; // Assuming BASE_THRUST was 0.1
    const rotSpd = (shipDef.rotMult || 1.0) * 0.07; // Assuming BASE_ROTATION_SPEED was 0.07
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

