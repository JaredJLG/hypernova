// client/js/input_handler.js
import { gameState } from "./game_state.js";
import * as Network from "./network.js";
import { UIManager } from "./ui_manager.js";
import {
    BASE_THRUST,
    BASE_ROTATION_SPEED,
    DAMPING,
    DOCKING_DISTANCE_SQUARED,
    MIN_HYPERJUMP_DISTANCE_FROM_PLANET_SQUARED,
    HYPERJUMP_DENIED_MESSAGE_DURATION_MS,
} from "./client_config.js";

// `wrap` function is primarily for angles now.
// World position wrapping needs to be handled by server or based on world boundaries.
function wrap(value, max) {
    return ((value % max) + max) % max;
}

export function initInputListeners(canvas) {
    // canvas is gameCanvas
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
        ];

        if (gameSpecificKeys.includes(keyLower)) {
            e.preventDefault();
        }

        if (gameState.hyperjumpDeniedMessage && keyLower !== "h") {
            clearTimeout(gameState.hyperjumpDeniedMessageTimeoutId);
            gameState.hyperjumpDeniedMessage = null;
            gameState.hyperjumpDeniedMessageTimeoutId = null;
        }

        if (!gameState.myShip || gameState.myShip.destroyed) {
            return;
        }

        if (!gameState.docked) {
            if (e.code === "Space" && !gameState.isChargingHyperjump)
                Network.fireWeapon();
            switch (keyLower) {
                case "arrowup":
                    if (!gameState.isChargingHyperjump)
                        gameState.controls.accelerating = true;
                    break;
                case "arrowdown":
                    if (!gameState.isChargingHyperjump)
                        gameState.controls.decelerating = true;
                    break;
                case "arrowleft":
                    if (!gameState.isChargingHyperjump)
                        gameState.controls.rotatingLeft = true;
                    break;
                case "arrowright":
                    if (!gameState.isChargingHyperjump)
                        gameState.controls.rotatingRight = true;
                    break;
                case "d":
                    if (!gameState.isChargingHyperjump) tryDockAction();
                    break;
                case "h":
                    hyperJumpAction();
                    break;
                case "q":
                    if (!gameState.isChargingHyperjump) cycleWeaponAction(-1);
                    break;
                case "e":
                    if (!gameState.isChargingHyperjump) cycleWeaponAction(1);
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
        // Adjust docking distance based on planet scale, make it more generous
        const effectiveDockingDistanceSq =
            DOCKING_DISTANCE_SQUARED * Math.pow(planetScale, 2) * 2.5;

        const d2 =
            (gameState.myShip.x - p.x) ** 2 + (gameState.myShip.y - p.y) ** 2;
        if (d2 < nearestDistSq) {
            nearestDistSq = d2;
            nearestPlanetIndex = index;
        }
    });
    const planetForDocking = planetsInCurrentSystem[nearestPlanetIndex];
    const effectiveDockingDistanceSq =
        DOCKING_DISTANCE_SQUARED *
        Math.pow(planetForDocking?.planetImageScale || 1.0, 2) *
        2.5;

    if (
        nearestPlanetIndex !== -1 &&
        nearestDistSq < effectiveDockingDistanceSq
    ) {
        Network.requestDock(gameState.myShip.system, nearestPlanetIndex);
    }
}

function hyperJumpAction() {
    if (
        !gameState.myShip ||
        gameState.myShip.destroyed ||
        gameState.clientGameData.systems.length === 0 ||
        gameState.docked
    ) {
        return;
    }
    if (gameState.isChargingHyperjump) {
        console.log("Hyperjump already charging.");
        return;
    }
    if (gameState.hyperjumpDeniedMessage) {
        clearTimeout(gameState.hyperjumpDeniedMessageTimeoutId);
        gameState.hyperjumpDeniedMessage = null;
        gameState.hyperjumpDeniedMessageTimeoutId = null;
    }
    const currentSystemData =
        gameState.clientGameData.systems[gameState.myShip.system];
    if (currentSystemData && currentSystemData.planets) {
        for (const planet of currentSystemData.planets) {
            const distSq =
                (gameState.myShip.x - planet.x) ** 2 +
                (gameState.myShip.y - planet.y) ** 2;
            const minJumpDistSq =
                MIN_HYPERJUMP_DISTANCE_FROM_PLANET_SQUARED *
                Math.pow(planet.planetImageScale || 1.0, 2) *
                1.5;
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
    console.log("Attempting to request hyperjump from server.");
    Network.requestHyperjump();
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
        return;
    }
    if (!gameState.activeSubMenu) {
        // We are on the main docked station screen
        switch (keyLower) {
            case "t": // Trade Center
                gameState.activeSubMenu = "trade";
                gameState.selectedTradeIndex = 0;
                UIManager.renderTradeMenu();
                break;
            case "y": // Shipyard
                gameState.activeSubMenu = "shipyard";
                gameState.selectedShipIndex = 0;
                UIManager.renderShipyardMenu();
                break;
            case "o": // Outfitter
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
            case "m": // Mission BBS
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
            case "u": // Undock / Leave
                Network.undock();
                break;
        }
    } else {
        // We are in a sub-menu
        if (keyLower === "escape") {
            gameState.activeSubMenu = null;
            UIManager.renderDockedStationInterface(); // Go back to new main docked UI
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
                UIManager.renderTradeMenu(); // Re-render to show selection/update
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

    const thrust = BASE_THRUST * shipDef.speedMult;
    const rotSpd = BASE_ROTATION_SPEED * shipDef.rotMult;
    const revThrust = thrust * shipDef.revMult;

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
