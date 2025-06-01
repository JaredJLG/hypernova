/* ===== START: hypernova/client/js/input_handler.js ===== */
// client/js/input_handler.js
import { gameState } from "./game_state.js";
import * as Network from "./network.js";
import { UIManager } from "./ui_manager.js";
import {
    BASE_THRUST, // Needed for processInputs
    BASE_ROTATION_SPEED, // Needed for processInputs
    DAMPING, // Needed for processInputs
    DOCKING_DISTANCE_SQUARED,
} from "./client_config.js";
// Removed: import { processInputs as gameProcessInputs } from "./process_inputs.js"; // This was incorrect

function wrap(value, max) {
    return ((value % max) + max) % max; // Ensure positive result for negative inputs
}

export function initInputListeners(canvas) {
    // Pass canvas for wrap bounds
    window.addEventListener("keydown", (e) => {
        const targetElement = e.target;
        const isInputFocused =
            targetElement &&
            (targetElement.tagName.toUpperCase() === "INPUT" ||
                targetElement.tagName.toUpperCase() === "TEXTAREA" ||
                targetElement.isContentEditable);

        // If an input field is focused, allow default typing behavior.
        // The game's input handling should not interfere.
        if (isInputFocused) {
            // If 'Enter' is pressed in an input field, let the default browser behavior
            // (which usually triggers form submission) occur. The form's own submit
            // listener in main.js will handle it.
            // For other keys, this allows normal typing.
            return;
        }

        // If NOT in an input field, proceed with game input handling.
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
        ];

        // Prevent default for game-specific keys to avoid page scroll, etc.,
        // ONLY when an input field is NOT focused.
        if (gameSpecificKeys.includes(keyLower)) {
            e.preventDefault();
        }

        if (!gameState.myShip || gameState.myShip.destroyed) {
            // Limited actions if no ship or destroyed (e.g., escape from a potential global menu)
            // Currently, most actions are tied to ship state or docking.
            return;
        }

        if (!gameState.docked) {
            // Flight controls
            if (e.code === "Space") Network.fireWeapon(); // Use e.code for Space to be specific
            switch (keyLower) {
                case "arrowup":
                    gameState.controls.accelerating = true;
                    break;
                case "arrowdown":
                    gameState.controls.decelerating = true;
                    break;
                case "arrowleft":
                    gameState.controls.rotatingLeft = true;
                    break;
                case "arrowright":
                    gameState.controls.rotatingRight = true;
                    break;
                case "d":
                    tryDockAction(canvas);
                    break;
                case "h":
                    hyperJumpAction(canvas);
                    break;
                case "q":
                    cycleWeaponAction(-1);
                    break;
                case "e":
                    cycleWeaponAction(1);
                    break;
            }
        } else {
            // Docked menu controls
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
            return; // Don't process game keyup logic if an input is focused
        }

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

function tryDockAction(canvas) {
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
        const d2 =
            (gameState.myShip.x - p.x) ** 2 + (gameState.myShip.y - p.y) ** 2;
        if (d2 < nearestDistSq) {
            nearestDistSq = d2;
            nearestPlanetIndex = index;
        }
    });

    if (nearestPlanetIndex !== -1 && nearestDistSq < DOCKING_DISTANCE_SQUARED) {
        Network.requestDock(gameState.myShip.system, nearestPlanetIndex);
    }
}

function hyperJumpAction(canvas) {
    if (!gameState.myShip || gameState.clientGameData.systems.length === 0)
        return;

    if (gameState.docked) {
        Network.undock();
        UIManager.undockCleanup();
    }

    // const oldSystem = gameState.myShip.system; // Not used
    gameState.myShip.system =
        (gameState.myShip.system + 1) % gameState.clientGameData.systems.length;

    const targetSystemData =
        gameState.clientGameData.systems[gameState.myShip.system];
    if (targetSystemData && targetSystemData.planets.length > 0) {
        const p = targetSystemData.planets[0];
        gameState.myShip.x = p.x;
        gameState.myShip.y = p.y;
    } else {
        gameState.myShip.x = canvas.width / 2;
        gameState.myShip.y = canvas.height / 2;
    }
    gameState.myShip.vx = 0;
    gameState.myShip.vy = 0;
    gameState.myShip.dockedAtPlanetIdentifier = null;

    Network.sendControls();
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
        gameState.activeSubMenu = null;
        // UIManager.closeDockMenu(); // This might be too aggressive if called by mistake
        return;
    }

    if (!gameState.activeSubMenu) {
        // Main dock menu
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
        // In a sub-menu
        if (keyLower === "escape") {
            gameState.activeSubMenu = null;
            UIManager.renderMainMenu();
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

// This function is called in the main game loop (from main.js)
export function processInputs(canvas) {
    // Ensure this function is EXPORTED
    if (!gameState.myShip || gameState.myShip.destroyed || gameState.docked)
        return;

    const myShip = gameState.myShip;

    // Safety check for ship type and definition
    if (
        myShip.type === undefined ||
        myShip.type === null ||
        !gameState.clientGameData.shipTypes ||
        myShip.type >= gameState.clientGameData.shipTypes.length ||
        !gameState.clientGameData.shipTypes[myShip.type]
    ) {
        // console.warn(`processInputs: Invalid or missing ship type definition for type index: ${myShip.type}. Controls not processed.`);
        return;
    }
    const shipDef = gameState.clientGameData.shipTypes[myShip.type];

    const thrust = BASE_THRUST * shipDef.speedMult;
    const rotSpd = BASE_ROTATION_SPEED * shipDef.rotMult;
    const revThrust = thrust * shipDef.revMult;

    if (gameState.controls.rotatingLeft) myShip.angle -= rotSpd;
    if (gameState.controls.rotatingRight) myShip.angle += rotSpd;

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

    myShip.x = wrap(myShip.x, canvas.width);
    myShip.y = wrap(myShip.y, canvas.height);

    Network.sendControls();
}
/* ===== END: hypernova/client/js/input_handler.js ===== */
