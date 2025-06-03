// client/js/input_handler.js
import { gameState } from "./game_state.js";
import * as Network from "./network.js";
import { UIManager } from "./ui_manager.js";
import { UniverseMapManager } from "./universe_map_renderer.js"; 
import {
    DAMPING,
    DOCKING_DISTANCE_SQUARED,
    BASE_ROTATION_SPEED, // Will be used as max speed factor
    ANGULAR_ACCELERATION,
    ANGULAR_DAMPING
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
            // "arrowdown", // Removed from direct game control
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
            "j",
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
            clearTimeout(gameState.hyperjumpDeniedMessageTimeoutId);
            gameState.hyperjumpDeniedMessage = null;
            gameState.hyperjumpDeniedMessageTimeoutId = null;
        }

        if (!gameState.myShip || gameState.myShip.destroyed) {
            return;
        }

        if (!gameState.docked) {
            // In-space controls
            switch (keyLower) {
                case " ": 
                    if (!gameState.isChargingHyperjump && !gameState.isMapOpen) {
                        gameState.controls.firing = true;
                    }
                    break;
                case "arrowup":
                    if (!gameState.isChargingHyperjump && !gameState.isMapOpen)
                        gameState.controls.accelerating = true;
                    break;
                // case "arrowdown": // Decelerating control removed
                //     if (!gameState.isChargingHyperjump && !gameState.isMapOpen)
                //         gameState.controls.decelerating = true; 
                //     break;
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
                        handleMenuKeyDown(keyLower); 
                    }
                    break;
            }
        } else {
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


        const keyLower = e.key.toLowerCase();
        if (gameState.myShip && !gameState.myShip.destroyed && !gameState.docked) {
            switch (keyLower) {
                case "arrowup":
                    gameState.controls.accelerating = false;
                    break;
                // case "arrowdown": // Decelerating control removed
                //     gameState.controls.decelerating = false;
                //     break;
                case "arrowleft":
                    gameState.controls.rotatingLeft = false;
                    break;
                case "arrowright":
                    gameState.controls.rotatingRight = false;
                    break;
                case " ": 
                    gameState.controls.firing = false;
                    break;
            }
        } else { 
            gameState.controls.accelerating = false;
            // gameState.controls.decelerating = false; // Removed
            gameState.controls.rotatingLeft = false;
            gameState.controls.rotatingRight = false;
            gameState.controls.firing = false;
        }
    });
}

function tryDockAction() {
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
            // Apply angular damping even if map is open to stop spin
            myShip.angularVelocity *= ANGULAR_DAMPING;
            if (Math.abs(myShip.angularVelocity) < 0.0001) myShip.angularVelocity = 0;
            myShip.angle += myShip.angularVelocity;
            myShip.angle = wrap(myShip.angle, 2 * Math.PI);

            Network.sendControls();
        }
        gameState.controls.accelerating = false;
        // gameState.controls.decelerating = false; // Removed
        gameState.controls.rotatingLeft = false;
        gameState.controls.rotatingRight = false;
        gameState.controls.firing = false; 
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
            // Apply angular damping if charging hyperjump
            myShip.angularVelocity *= ANGULAR_DAMPING;
             if (Math.abs(myShip.angularVelocity) < 0.0001) myShip.angularVelocity = 0;
            myShip.angle += myShip.angularVelocity;
            myShip.angle = wrap(myShip.angle, 2 * Math.PI);
            Network.sendControls();
        }
        gameState.controls.accelerating = false;
        // gameState.controls.decelerating = false; // Removed
        gameState.controls.rotatingLeft = false;
        gameState.controls.rotatingRight = false;
        gameState.controls.firing = false; 
        return;
    }
    
    if (gameState.controls.firing && !gameState.isChargingHyperjump) {
        Network.fireWeapon(); 
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
    // const revThrust = thrust * (shipDef.revMult || 1.0); // revThrust no longer used by player

    // Rotational physics
    const maxAngVel = (shipDef.rotMult || 1.0) * BASE_ROTATION_SPEED;
    const angAccel = ANGULAR_ACCELERATION; // Use the new constant

    if (gameState.controls.rotatingLeft) {
        myShip.angularVelocity -= angAccel;
    }
    if (gameState.controls.rotatingRight) {
        myShip.angularVelocity += angAccel;
    }

    // Apply angular damping if no rotation input, or simply always apply some damping
    if (!gameState.controls.rotatingLeft && !gameState.controls.rotatingRight) {
        myShip.angularVelocity *= ANGULAR_DAMPING;
    } else {
         myShip.angularVelocity *= (ANGULAR_DAMPING + ((1-ANGULAR_DAMPING)*0.5) ); // Slightly less damping when accelerating turn
    }
    // More aggressive stop if very slow and no input
    if (Math.abs(myShip.angularVelocity) < 0.001 && !gameState.controls.rotatingLeft && !gameState.controls.rotatingRight) {
        myShip.angularVelocity = 0;
    }


    myShip.angularVelocity = Math.max(-maxAngVel, Math.min(maxAngVel, myShip.angularVelocity));
    myShip.angle += myShip.angularVelocity;
    myShip.angle = wrap(myShip.angle, 2 * Math.PI);


    // Linear physics
    if (gameState.controls.accelerating) {
        myShip.vx += thrust * Math.cos(myShip.angle);
        myShip.vy += thrust * Math.sin(myShip.angle);
    }
    // Decelerating logic block removed
    // if (gameState.controls.decelerating) {
    //     myShip.vx -= revThrust * Math.cos(myShip.angle);
    //     myShip.vy -= revThrust * Math.sin(myShip.angle);
    // }

    myShip.vx *= DAMPING;
    myShip.vy *= DAMPING;

    myShip.x += myShip.vx;
    myShip.y += myShip.vy;

    Network.sendControls();
}
