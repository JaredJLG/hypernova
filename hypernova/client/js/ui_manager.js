// client/js/ui_manager.js
import { gameState } from "./game_state.js";
import * as Network from "./network.js"; // To send actions like buy/sell/undock

let uiContainer = null;
let dockMenuElement = null; // This will now be the general container for docked UI

export const UIManager = {
    init(containerElement) {
        uiContainer = containerElement;
    },

    isMenuOpen() {
        return gameState.isMenuOpen;
    },

    openDockMenu() {
        if (dockMenuElement && dockMenuElement.parentNode === uiContainer) {
            // If already open, potentially refresh it or ensure it's the main view
            uiContainer.removeChild(dockMenuElement);
        }

        gameState.isMenuOpen = true;
        gameState.activeSubMenu = null; // Start at main dock screen
        document.body.classList.add("no-scroll");

        // Create a new dockMenuElement each time to ensure clean state
        dockMenuElement = document.createElement("div");
        // dockMenuElement does not need a class here if #docked-station-ui is the styled root
        uiContainer.appendChild(dockMenuElement);

        this.renderDockedStationInterface();
    },

    closeDockMenu() {
        if (dockMenuElement && dockMenuElement.parentNode === uiContainer) {
            dockMenuElement.innerHTML = ""; // Clear its content
            uiContainer.removeChild(dockMenuElement);
        }
        dockMenuElement = null;
        gameState.isMenuOpen = false;
        gameState.activeSubMenu = null;
        gameState.selectedTradeIndex = 0;
        gameState.selectedWeaponKey = null;
        gameState.selectedShipIndex = 0;
        gameState.selectedMissionIndex = 0;
        document.body.classList.remove("no-scroll");
    },

    // Called by network.js when server confirms undock or player jumps
    undockCleanup() {
        gameState.docked = false;
        gameState.dockedAtDetails = null;
        this.closeDockMenu();
        // myShip.dockedAtPlanetIdentifier is set by server state update
    },

    renderDockedStationInterface() {
        if (
            !dockMenuElement ||
            !gameState.dockedAtDetails ||
            !gameState.myShip
        ) {
            console.warn(
                "Cannot render docked station UI: Missing data. Element:",
                dockMenuElement,
                "Details:",
                gameState.dockedAtDetails,
                "Ship:",
                gameState.myShip,
            );
            // If dockMenuElement is missing but we are trying to render, it's an issue.
            // Potentially call closeDockMenu to reset if in a bad state.
            if (!dockMenuElement && uiContainer) {
                // Attempt to re-create if somehow lost
                dockMenuElement = document.createElement("div");
                uiContainer.appendChild(dockMenuElement);
            } else if (!dockMenuElement) {
                return; // Cannot proceed
            }
            // If data is missing but element exists, show a loading/error state?
            // For now, just return if critical data is missing after ensuring element exists.
            if (!gameState.dockedAtDetails || !gameState.myShip) return;
        }
        gameState.activeSubMenu = null; // Ensure we are at the main docked screen

        const planetName = gameState.dockedAtDetails.planetName;
        const systemName = gameState.dockedAtDetails.systemName;

        // Simulate planet description - can be expanded later
        const planetDescriptions = {
            Alpha: "A bustling trade hub in the Greek system, known for its agricultural surplus.",
            Delta: "Rich in mineral wealth, Delta is a key mining outpost.",
            Sol: "The cradle of humanity in the Roman system, a political and cultural center.",
            Mars: "A rugged, terraformed world, primarily exporting raw ores.",
            Beta: "A temperate planet in Nordic space, balancing agriculture and mining.",
            Nile: "An arid world in the Egyptian system with surprisingly fertile river valleys.",
            Giza: "Known for its ancient alien ruins and valuable ore deposits.",
            Tara: "A verdant, spiritual center in the Celtic system, specializing in advanced medicines.",
            Avalon: "A technologically advanced world, famous for its electronics manufacturing.",
        };
        const description =
            planetDescriptions[planetName] ||
            "No detailed information available for this planet.";

        dockMenuElement.innerHTML = `
            <div id="docked-station-ui">
                <div class="station-viewscreen">
                    Docked at ${planetName} Station Control<br/>
                    System: ${systemName}
                </div>
                <div class="station-dialogue-area">
                    <p>Welcome to ${planetName}, Captain ${gameState.currentUser.username}. All systems nominal. Please select an option from the terminal.</p>
                    <button id="station-dialogue-okay">Okay</button>
                </div>
                <div class="station-content-area">
                    <div class="station-button-column">
                        <button id="station-bar-btn" class="station-action-button">Bar</button>
                        <button id="station-missions-btn" class="station-action-button">Mission BBS</button>
                        <button id="station-trade-btn" class="station-action-button">Trade Center</button>
                    </div>
                    <div class="station-planet-info">
                        <h3>${planetName} - ${systemName}</h3>
                        <p>${description}</p>
                        <p>Credits: $${gameState.myShip.credits}</p>
                        <!-- More planet-specific info can go here -->
                    </div>
                    <div class="station-button-column">
                        <button id="station-shipyard-btn" class="station-action-button">Shipyard</button>
                        <button id="station-outfitter-btn" class="station-action-button">Outfitter</button>
                        <button id="station-recharge-btn" class="station-action-button">Recharge</button>
                        <button id="station-leave-btn" class="station-action-button">Leave</button>
                    </div>
                </div>
                <div class="station-footer-text">HyperNova Secure Terminal v2.7.4</div>
            </div>
        `;

        // Add event listeners
        document
            .getElementById("station-dialogue-okay")
            ?.addEventListener("click", () => {
                const dialogueBox = dockMenuElement.querySelector(
                    ".station-dialogue-area",
                );
                if (dialogueBox) dialogueBox.style.display = "none"; // Simple hide
            });

        document
            .getElementById("station-bar-btn")
            ?.addEventListener("click", () =>
                alert(
                    "Bar: Feature not yet implemented. Grab a virtual space-beer!",
                ),
            );
        document
            .getElementById("station-recharge-btn")
            ?.addEventListener("click", () =>
                alert(
                    "Recharge: Ship systems nominal. No recharge needed or feature not implemented.",
                ),
            );

        document
            .getElementById("station-missions-btn")
            ?.addEventListener("click", () => {
                gameState.activeSubMenu = "missions";
                gameState.selectedMissionIndex = 0;
                gameState.availableMissionsForCurrentPlanet = [];
                this.renderMissionsMenu(); // This will replace the new UI with the old panel style
                if (gameState.dockedAtDetails) {
                    Network.requestMissions(
                        gameState.dockedAtDetails.systemIndex,
                        gameState.dockedAtDetails.planetIndex,
                    );
                }
            });

        document
            .getElementById("station-trade-btn")
            ?.addEventListener("click", () => {
                gameState.activeSubMenu = "trade";
                gameState.selectedTradeIndex = 0;
                this.renderTradeMenu();
            });

        document
            .getElementById("station-shipyard-btn")
            ?.addEventListener("click", () => {
                gameState.activeSubMenu = "shipyard";
                gameState.selectedShipIndex = 0;
                this.renderShipyardMenu();
            });

        document
            .getElementById("station-outfitter-btn")
            ?.addEventListener("click", () => {
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
                this.renderOutfitterMenu();
            });

        document
            .getElementById("station-leave-btn")
            ?.addEventListener("click", () => {
                Network.undock();
            });
    },

    renderTradeMenu() {
        if (!dockMenuElement || !gameState.dockedAtDetails || !gameState.myShip)
            return;
        const myShip = gameState.myShip;
        const currentShipDef =
            gameState.clientGameData.shipTypes[myShip.type || 0];
        if (!currentShipDef) return;

        const cargoCount = myShip.cargo.reduce((s, v) => s + v, 0);

        // Clear previous content (like the new station UI) and set up for panel style
        dockMenuElement.innerHTML = "";
        dockMenuElement.className = "panel"; // Apply old panel style for sub-menus
        dockMenuElement.style.top = "50%"; // Re-apply positioning if needed
        dockMenuElement.style.left = "50%";
        dockMenuElement.style.transform = "translate(-50%,-50%)";

        let html = `<div class="menu-item"><b>Trade at ${gameState.dockedAtDetails.planetName}</b></div>`;
        html += `<div class="menu-item">Credits: $${myShip.credits} Cargo: ${cargoCount}/${currentShipDef.maxCargo}</div>`;
        html += `<div class="menu-item" style="border-bottom:1px solid #0f0;"><u>Good        Qty   Buy    Sell   Stock</u></div>`;

        const planetEco = gameState.dockedAtDetails;

        if (
            !planetEco ||
            !planetEco.buyPrices ||
            !planetEco.sellPrices ||
            !planetEco.stock
        ) {
            html += "<div>Loading prices...</div>";
        } else {
            gameState.clientGameData.tradeGoods.forEach((g, i) => {
                const buyP =
                    planetEco.buyPrices[g.name] !== undefined
                        ? planetEco.buyPrices[g.name]
                        : "N/A";
                const sellP =
                    planetEco.sellPrices[g.name] !== undefined
                        ? planetEco.sellPrices[g.name]
                        : "N/A";
                const stockVal =
                    planetEco.stock[g.name] !== undefined
                        ? planetEco.stock[g.name]
                        : 0;
                const selectedClass =
                    i === gameState.selectedTradeIndex
                        ? "trade-item-selected"
                        : "";

                html +=
                    `<div class="menu-item ${selectedClass}">${g.name.padEnd(12, " ")} ${myShip.cargo[i].toString().padStart(3, " ")} ` +
                    `$${buyP.toString().padStart(4, " ")} $${sellP.toString().padStart(4, " ")} ${stockVal.toString().padStart(5, " ")}</div>`;
            });
        }
        html +=
            "<div class='menu-item' style='border-top:1px solid #0f0; margin-top:5px;'>ArrowUp/Down: Select. B: Buy. S: Sell. Esc: Back</div>";
        dockMenuElement.innerHTML = html;
    },

    renderOutfitterMenu() {
        if (
            !dockMenuElement ||
            !gameState.myShip ||
            !gameState.clientGameData.weapons
        )
            return;
        const myShip = gameState.myShip;

        dockMenuElement.innerHTML = "";
        dockMenuElement.className = "panel";
        dockMenuElement.style.top = "50%";
        dockMenuElement.style.left = "50%";
        dockMenuElement.style.transform = "translate(-50%,-50%)";

        let html = `<div class="menu-item"><b>Outfitter</b></div>`;
        html += `<div class="menu-item">Credits: $${myShip.credits}</div>`;
        html += `<div class="menu-item" style="border-bottom:1px solid #0f0;"><u>Weapon       Price   Dmg  Owned</u></div>`;

        if (Object.keys(gameState.clientGameData.weapons).length === 0) {
            html +=
                "<div class='menu-item'>(No weapons available for purchase)</div>";
        } else {
            const weaponKeys = Object.keys(gameState.clientGameData.weapons);
            if (
                !gameState.selectedWeaponKey ||
                !weaponKeys.includes(gameState.selectedWeaponKey)
            ) {
                gameState.selectedWeaponKey = weaponKeys[0] || null;
            }

            Object.entries(gameState.clientGameData.weapons).forEach(
                ([wKey, wDef]) => {
                    const owned =
                        myShip.weapons && myShip.weapons.includes(wKey)
                            ? "*"
                            : " ";
                    const selectedClass =
                        wKey === gameState.selectedWeaponKey
                            ? "trade-item-selected"
                            : "";
                    html += `<div class="menu-item ${selectedClass}">${wKey.padEnd(12, " ")} $${wDef.price.toString().padEnd(5, " ")} ${wDef.damage.toString().padEnd(3, " ")} ${owned}</div>`;
                },
            );
        }
        html +=
            "<div class='menu-item' style='border-top:1px solid #0f0; margin-top:5px;'>ArrowUp/Down: Select. B: Buy/Equip. Esc: Back</div>";
        dockMenuElement.innerHTML = html;
    },

    renderShipyardMenu() {
        if (!dockMenuElement || !gameState.myShip) return;
        const myShip = gameState.myShip;

        dockMenuElement.innerHTML = "";
        dockMenuElement.className = "panel";
        dockMenuElement.style.top = "50%";
        dockMenuElement.style.left = "50%";
        dockMenuElement.style.transform = "translate(-50%,-50%)";

        let html = `<div class="menu-item"><b>Shipyard</b></div>`;
        html += `<div class="menu-item">Credits: $${myShip.credits}</div>`;
        html += `<div class="menu-item" style="border-bottom:1px solid #0f0;"><u>Ship         Price   Cargo  Current</u></div>`;

        if (gameState.clientGameData.shipTypes.length === 0) {
            html += "<div class='menu-item'>(No ships available)</div>";
        } else {
            gameState.clientGameData.shipTypes.forEach((s, i) => {
                const cur = myShip.type === i ? "*" : " ";
                const selectedClass =
                    i === gameState.selectedShipIndex
                        ? "trade-item-selected"
                        : "";
                html +=
                    `<div class="menu-item ${selectedClass}">${s.name.padEnd(12, " ")} $${s.price.toString().padEnd(5, " ")} ` +
                    `${s.maxCargo.toString().padEnd(3, " ")} ${cur}</div>`;
            });
        }
        html +=
            "<div class='menu-item' style='border-top:1px solid #0f0; margin-top:5px;'>ArrowUp/Down: Select. B: Buy. Esc: Back</div>";
        dockMenuElement.innerHTML = html;
    },

    renderMissionsMenu() {
        if (!dockMenuElement || !gameState.dockedAtDetails || !gameState.myShip)
            return;

        dockMenuElement.innerHTML = "";
        dockMenuElement.className = "panel";
        dockMenuElement.style.top = "50%";
        dockMenuElement.style.left = "50%";
        dockMenuElement.style.transform = "translate(-50%,-50%)";

        let html = `<div class="menu-item"><b>Missions at ${gameState.dockedAtDetails.planetName}</b></div>`;
        html += `<div class="menu-item">Credits: $${gameState.myShip.credits}</div>`;
        html += `<div class="menu-item" style="border-bottom:1px solid #0f0;"><u>Title                                     Reward</u></div>`;

        if (gameState.availableMissionsForCurrentPlanet.length === 0) {
            html +=
                "<div class='menu-item'>(No missions currently available)</div>";
        } else {
            if (
                gameState.selectedMissionIndex >=
                gameState.availableMissionsForCurrentPlanet.length
            ) {
                gameState.selectedMissionIndex = Math.max(
                    0,
                    gameState.availableMissionsForCurrentPlanet.length - 1,
                );
            }

            gameState.availableMissionsForCurrentPlanet.forEach((m, i) => {
                const selectedClass =
                    i === gameState.selectedMissionIndex
                        ? "trade-item-selected"
                        : "";
                let titleDisplay =
                    m.title.length > 45
                        ? m.title.substring(0, 42) + "..."
                        : m.title;
                html += `<div class="menu-item ${selectedClass}">${titleDisplay.padEnd(45, " ")} $${m.rewardCredits.toString().padStart(6, " ")}</div>`;

                if (i === gameState.selectedMissionIndex) {
                    html += `<div class="menu-item" style="font-size:0.9em; color: #0c0; padding-left:10px;">  > ${m.description}</div>`;
                    const timeLeftMs = m.timeLimit - Date.now();
                    const timeLeftMin = Math.max(
                        0,
                        Math.round(timeLeftMs / 60000),
                    );
                    html += `<div class="menu-item" style="font-size:0.9em; color: #0c0; padding-left:10px;">  > Time Limit: ${timeLeftMin} min. Penalty: $${m.penaltyCredits}</div>`;
                    if (
                        m.type ===
                        gameState.clientGameData.MISSION_TYPES.CARGO_DELIVERY
                    ) {
                        html += `<div class="menu-item" style="font-size:0.9em; color: #0c0; padding-left:10px;">  > Deliver: ${m.cargoQuantity} ${m.cargoGoodName}</div>`;
                    } else if (
                        m.type === gameState.clientGameData.MISSION_TYPES.BOUNTY
                    ) {
                        const targetSysName =
                            gameState.clientGameData.systems[
                                m.targetSystemIndex
                            ]?.name || "Unknown System";
                        html += `<div class="menu-item" style="font-size:0.9em; color: #0c0; padding-left:10px;">  > Target: ${m.targetsRequired} ${m.targetShipName}(s) in ${targetSysName}</div>`;
                    }
                }
            });
        }
        html +=
            "<div class='menu-item' style='border-top:1px solid #0f0; margin-top:5px;'>ArrowUp/Down: Select. A: Accept. Esc: Back</div>";
        dockMenuElement.innerHTML = html;
    },
};
