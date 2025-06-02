// client/js/ui_manager.js
import { gameState } from "./game_state.js";
import * as Network from "./network.js";
import { Renderer } from "./renderer.js"; // Import Renderer

let uiContainer = null;
let dockMenuElement = null; // This is the container for the main station UI and sub-menus
let rightHudPanel = null;
let shipStatsContentDiv = null;
let activeMissionsListUl = null;

export const UIManager = {
    init(containerElement) {
        uiContainer = containerElement;
        rightHudPanel = document.getElementById("right-hud-panel");
        shipStatsContentDiv = document.getElementById("ship-stats-content");
        activeMissionsListUl = document.getElementById("active-missions-list");
        // Minimap canvas will be initialized and drawn by Renderer
    },

    isMenuOpen() {
        return gameState.isMenuOpen;
    },

    openDockMenu() {
        // This is for the main station interaction UI
        if (dockMenuElement && dockMenuElement.parentNode === uiContainer) {
            uiContainer.removeChild(dockMenuElement);
        }

        gameState.isMenuOpen = true;
        gameState.activeSubMenu = null;
        document.body.classList.add("no-scroll");

        dockMenuElement = document.createElement("div");
        uiContainer.appendChild(dockMenuElement);

        this.renderDockedStationInterface();
        this.showRightHudPanel(); // Show and update the side panel
    },

    closeDockMenu() {
        // Closes the main station interaction UI
        if (dockMenuElement && dockMenuElement.parentNode === uiContainer) {
            dockMenuElement.innerHTML = "";
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
        // Hiding the right HUD panel is handled by undockCleanup
    },

    undockCleanup() {
        gameState.docked = false;
        gameState.dockedAtDetails = null;
        this.closeDockMenu();
        this.hideRightHudPanel(); // Hide the side panel when undocking
    },

    showRightHudPanel() {
        if (rightHudPanel) {
            rightHudPanel.classList.remove("hidden");
            this.updateShipStatsPanel();
            this.updateActiveMissionsPanel();
            Renderer.drawMinimap(); // Tell the renderer to draw the minimap
        }
    },

    hideRightHudPanel() {
        if (rightHudPanel) {
            rightHudPanel.classList.add("hidden");
        }
    },

    updateShipStatsPanel() {
        if (!shipStatsContentDiv || !gameState.myShip || !gameState.currentUser)
            return;

        const myShip = gameState.myShip;
        const shipType = gameState.clientGameData.shipTypes[myShip.type || 0];
        const shipTypeName = shipType ? shipType.name : "Unknown";
        const cargoCount = myShip.cargo
            ? myShip.cargo.reduce((s, v) => s + v, 0)
            : 0;
        const maxCargo = shipType ? shipType.maxCargo : myShip.maxCargo || 0;

        shipStatsContentDiv.innerHTML = `
            <div><span>Pilot:</span> ${gameState.currentUser.username}</div>
            <div><span>Ship:</span> ${shipTypeName}</div>
            <div><span>Credits:</span> $${myShip.credits.toLocaleString()}</div>
            <div><span>Health:</span> ${myShip.health || 0} / ${myShip.maxHealth || 0}</div>
            <div><span>Cargo:</span> ${cargoCount} / ${maxCargo}</div>
        `;
    },

    updateActiveMissionsPanel() {
        if (!activeMissionsListUl || !gameState.myShip) return;

        activeMissionsListUl.innerHTML = "";

        if (
            gameState.myShip.activeMissions &&
            gameState.myShip.activeMissions.length > 0
        ) {
            gameState.myShip.activeMissions.slice(0, 5).forEach((mission) => {
                const li = document.createElement("li");
                let missionText = `<strong>${mission.title}</strong>`;
                if (
                    mission.type ===
                    gameState.clientGameData.MISSION_TYPES.BOUNTY
                ) {
                    missionText += ` (${mission.targetsDestroyed || 0}/${mission.targetsRequired})`;
                }
                const timeRemainingMin = Math.max(
                    0,
                    Math.round((mission.timeLimit - Date.now()) / 60000),
                );
                missionText += ` (${timeRemainingMin}m left)`;
                li.innerHTML = missionText;
                activeMissionsListUl.appendChild(li);
            });
        } else {
            activeMissionsListUl.innerHTML = "<li>No active missions.</li>";
        }
    },

    _prepareSubMenuHost() {
        if (!dockMenuElement) {
            console.error(
                "Dock menu element does not exist. Cannot prepare sub-menu host.",
            );
            this.openDockMenu();
            if (!dockMenuElement) return null;
        }
        let stationUI = dockMenuElement.querySelector("#docked-station-ui");
        if (!stationUI) {
            this.renderDockedStationInterface();
            stationUI = dockMenuElement.querySelector("#docked-station-ui");
            if (!stationUI) {
                console.error(
                    "Failed to create #docked-station-ui for sub-menu.",
                );
                return null;
            }
        }

        stationUI.classList.add("submenu-active");
        const contentHost = stationUI.querySelector(".station-content-area");
        if (!contentHost) {
            console.error(
                ".station-content-area not found within #docked-station-ui",
            );
            return null;
        }
        contentHost.innerHTML = "";
        return contentHost;
    },

    renderDockedStationInterface() {
        if (!dockMenuElement) {
            if (uiContainer) {
                dockMenuElement = document.createElement("div");
                uiContainer.appendChild(dockMenuElement);
            } else {
                console.error(
                    "UIManager: uiContainer not initialized, cannot create dockMenuElement.",
                );
                return;
            }
        }
        if (!gameState.dockedAtDetails || !gameState.myShip) {
            return;
        }

        gameState.activeSubMenu = null;
        dockMenuElement.innerHTML = "";

        const planetName = gameState.dockedAtDetails.planetName;
        const systemName = gameState.dockedAtDetails.systemName;
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

        const html = `
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
                        <p>Credits: $${gameState.myShip.credits.toLocaleString()}</p>
                    </div>
                    <div class="station-button-column">
                        <button id="station-shipyard-btn" class="station-action-button">Shipyard</button>
                        <button id="station-outfitter-btn" class="station-action-button">Outfitter</button>
                        <button id="station-recharge-btn" class="station-action-button">Recharge</button>
                        <button id="station-leave-btn" class="station-action-button">Leave</button>
                    </div>
                </div>
                <div class="station-footer-text main-footer">HyperNova Secure Terminal v2.7.4</div>
            </div>
        `;
        dockMenuElement.innerHTML = html;

        document
            .getElementById("station-dialogue-okay")
            ?.addEventListener("click", () => {
                const dialogueBox = dockMenuElement.querySelector(
                    ".station-dialogue-area",
                );
                if (dialogueBox) dialogueBox.style.display = "none";
            });
        document
            .getElementById("station-bar-btn")
            ?.addEventListener("click", () => alert("Bar: Not implemented."));
        document
            .getElementById("station-recharge-btn")
            ?.addEventListener("click", () =>
                alert("Recharge: Not implemented."),
            );
        document
            .getElementById("station-leave-btn")
            ?.addEventListener("click", () => Network.undock());

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
            .getElementById("station-missions-btn")
            ?.addEventListener("click", () => {
                gameState.activeSubMenu = "missions";
                gameState.selectedMissionIndex = 0;
                gameState.availableMissionsForCurrentPlanet = [];
                this.renderMissionsMenu();
                if (gameState.dockedAtDetails) {
                    Network.requestMissions(
                        gameState.dockedAtDetails.systemIndex,
                        gameState.dockedAtDetails.planetIndex,
                    );
                }
            });
    },

    renderTradeMenu() {
        const host = this._prepareSubMenuHost();
        if (!host || !gameState.dockedAtDetails || !gameState.myShip) return;

        const myShip = gameState.myShip;
        const currentShipDef =
            gameState.clientGameData.shipTypes[myShip.type || 0];
        if (!currentShipDef) return;
        const cargoCount = myShip.cargo
            ? myShip.cargo.reduce((s, v) => s + v, 0)
            : 0;
        const planetEco = gameState.dockedAtDetails;

        let itemsHtml = `<div class="station-submenu-header">
                            <span class="station-submenu-col col-name">Good</span>
                            <span class="station-submenu-col col-qty">Qty</span>
                            <span class="station-submenu-col col-price">Buy</span>
                            <span class="station-submenu-col col-price">Sell</span>
                            <span class="station-submenu-col col-stock">Stock</span>
                         </div>`;

        if (
            !planetEco ||
            !planetEco.buyPrices ||
            !planetEco.sellPrices ||
            !planetEco.stock
        ) {
            itemsHtml +=
                "<div class='station-submenu-item'>Loading prices...</div>";
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
                    i === gameState.selectedTradeIndex ? "selected" : "";
                itemsHtml += `
                    <div class="station-submenu-item ${selectedClass}" data-index="${i}">
                        <span class="station-submenu-col col-name">${g.name}</span>
                        <span class="station-submenu-col col-qty">${myShip.cargo[i]}</span>
                        <span class="station-submenu-col col-price">$${buyP}</span>
                        <span class="station-submenu-col col-price">$${sellP}</span>
                        <span class="station-submenu-col col-stock">${stockVal}</span>
                    </div>`;
            });
        }

        host.innerHTML = `
            <div class="station-submenu-content">
                <h3>Trade Center - ${planetEco.planetName}</h3>
                <div>Credits: $${myShip.credits.toLocaleString()} | Cargo: ${cargoCount}/${currentShipDef.maxCargo}</div>
                <div class="station-submenu-item-list">${itemsHtml}</div>
                <div class="station-submenu-actions">
                    <button id="submenu-buy-btn" class="station-action-button">Buy (B)</button>
                    <button id="submenu-sell-btn" class="station-action-button">Sell (S)</button>
                    <button id="submenu-back-btn" class="station-action-button">Back (Esc)</button>
                </div>
            </div>`;

        document
            .getElementById("submenu-buy-btn")
            ?.addEventListener("click", () =>
                Network.buyGood(gameState.selectedTradeIndex),
            );
        document
            .getElementById("submenu-sell-btn")
            ?.addEventListener("click", () =>
                Network.sellGood(gameState.selectedTradeIndex),
            );
        document
            .getElementById("submenu-back-btn")
            ?.addEventListener("click", () =>
                this.renderDockedStationInterface(),
            );
    },

    renderOutfitterMenu() {
        const host = this._prepareSubMenuHost();
        if (!host || !gameState.myShip || !gameState.clientGameData.weapons)
            return;

        const myShip = gameState.myShip;
        let itemsHtml = `<div class="station-submenu-header">
                            <span class="station-submenu-col col-name">Weapon</span>
                            <span class="station-submenu-col col-price">Price</span>
                            <span class="station-submenu-col col-qty">Dmg</span>
                            <span class="station-submenu-col col-owned">Owned</span>
                         </div>`;

        const weaponKeys = Object.keys(gameState.clientGameData.weapons);
        if (weaponKeys.length === 0) {
            itemsHtml +=
                "<div class='station-submenu-item'>(No weapons available)</div>";
        } else {
            if (
                !gameState.selectedWeaponKey ||
                !weaponKeys.includes(gameState.selectedWeaponKey)
            ) {
                gameState.selectedWeaponKey = weaponKeys[0] || null;
            }
            weaponKeys.forEach((wKey) => {
                const wDef = gameState.clientGameData.weapons[wKey];
                const owned =
                    myShip.weapons && myShip.weapons.includes(wKey)
                        ? "Yes"
                        : "No";
                const selectedClass =
                    wKey === gameState.selectedWeaponKey ? "selected" : "";
                itemsHtml += `
                    <div class="station-submenu-item ${selectedClass}" data-key="${wKey}">
                        <span class="station-submenu-col col-name">${wDef.name}</span>
                        <span class="station-submenu-col col-price">$${wDef.price.toLocaleString()}</span>
                        <span class="station-submenu-col col-qty">${wDef.damage}</span>
                        <span class="station-submenu-col col-owned">${owned}</span>
                    </div>`;
            });
        }

        host.innerHTML = `
            <div class="station-submenu-content">
                <h3>Outfitter</h3>
                <div>Credits: $${myShip.credits.toLocaleString()}</div>
                <div class="station-submenu-item-list">${itemsHtml}</div>
                <div class="station-submenu-actions">
                    <button id="submenu-buyequip-btn" class="station-action-button">Buy/Equip (B)</button>
                    <button id="submenu-back-btn" class="station-action-button">Back (Esc)</button>
                </div>
            </div>`;

        document
            .getElementById("submenu-buyequip-btn")
            ?.addEventListener("click", () => {
                if (gameState.selectedWeaponKey)
                    Network.equipWeapon(gameState.selectedWeaponKey);
            });
        document
            .getElementById("submenu-back-btn")
            ?.addEventListener("click", () =>
                this.renderDockedStationInterface(),
            );
    },

    renderShipyardMenu() {
        const host = this._prepareSubMenuHost();
        if (!host || !gameState.myShip) return;

        const myShip = gameState.myShip;
        let itemsHtml = `<div class="station-submenu-header">
                            <span class="station-submenu-col col-name">Ship</span>
                            <span class="station-submenu-col col-price">Price</span>
                            <span class="station-submenu-col col-cargo">Cargo</span>
                            <span class="station-submenu-col col-current">Current</span>
                         </div>`;

        if (gameState.clientGameData.shipTypes.length === 0) {
            itemsHtml +=
                "<div class='station-submenu-item'>(No ships available)</div>";
        } else {
            gameState.clientGameData.shipTypes.forEach((s, i) => {
                const cur = myShip.type === i ? "Yes" : "No";
                const selectedClass =
                    i === gameState.selectedShipIndex ? "selected" : "";
                itemsHtml += `
                    <div class="station-submenu-item ${selectedClass}" data-index="${i}">
                        <span class="station-submenu-col col-name">${s.name}</span>
                        <span class="station-submenu-col col-price">$${s.price.toLocaleString()}</span>
                        <span class="station-submenu-col col-cargo">${s.maxCargo}</span>
                        <span class="station-submenu-col col-current">${cur}</span>
                    </div>`;
            });
        }

        host.innerHTML = `
            <div class="station-submenu-content">
                <h3>Shipyard</h3>
                <div>Credits: $${myShip.credits.toLocaleString()}</div>
                <div class="station-submenu-item-list">${itemsHtml}</div>
                <div class="station-submenu-actions">
                    <button id="submenu-buy-btn" class="station-action-button">Buy Ship (B)</button>
                    <button id="submenu-back-btn" class="station-action-button">Back (Esc)</button>
                </div>
            </div>`;
        document
            .getElementById("submenu-buy-btn")
            ?.addEventListener("click", () =>
                Network.buyShip(gameState.selectedShipIndex),
            );
        document
            .getElementById("submenu-back-btn")
            ?.addEventListener("click", () =>
                this.renderDockedStationInterface(),
            );
    },

    renderMissionsMenu() {
        const host = this._prepareSubMenuHost();
        if (!host || !gameState.dockedAtDetails || !gameState.myShip) return;

        let itemsHtml = `<div class="station-submenu-header">
                            <span class="station-submenu-col col-name" style="flex-basis: 70%;">Title</span>
                            <span class="station-submenu-col col-reward">Reward</span>
                         </div>`;

        if (gameState.availableMissionsForCurrentPlanet.length === 0) {
            itemsHtml +=
                "<div class='station-submenu-item'>(No missions currently available)</div>";
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
                    i === gameState.selectedMissionIndex ? "selected" : "";
                let titleDisplay =
                    m.title.length > 60
                        ? m.title.substring(0, 57) + "..."
                        : m.title;
                itemsHtml += `
                    <div class="station-submenu-item ${selectedClass}" data-index="${i}">
                        <span class="station-submenu-col col-name" style="flex-basis: 70%;">${titleDisplay}</span>
                        <span class="station-submenu-col col-reward">$${m.rewardCredits.toLocaleString()}</span>
                    </div>`;
                if (i === gameState.selectedMissionIndex) {
                    const timeLeftMs = m.timeLimit - Date.now();
                    const timeLeftMin = Math.max(
                        0,
                        Math.round(timeLeftMs / 60000),
                    );
                    itemsHtml += `<div class="mission-details-section">
                                    <p><strong>Description:</strong> ${m.description}</p>
                                    <p><strong>Time Limit:</strong> ${timeLeftMin} min | <strong>Penalty:</strong> $${m.penaltyCredits.toLocaleString()}</p>`;
                    if (
                        m.type ===
                        gameState.clientGameData.MISSION_TYPES.CARGO_DELIVERY
                    ) {
                        itemsHtml += `<p><strong>Deliver:</strong> ${m.cargoQuantity} ${m.cargoGoodName}</p>`;
                    } else if (
                        m.type === gameState.clientGameData.MISSION_TYPES.BOUNTY
                    ) {
                        const targetSysName =
                            gameState.clientGameData.systems[
                                m.targetSystemIndex
                            ]?.name || "Unknown System";
                        itemsHtml += `<p><strong>Target:</strong> ${m.targetsRequired} ${m.targetShipName}(s) in ${targetSysName}</p>`;
                    }
                    itemsHtml += `</div>`;
                }
            });
        }

        host.innerHTML = `
            <div class="station-submenu-content">
                <h3>Mission BBS - ${gameState.dockedAtDetails.planetName}</h3>
                <div>Credits: $${gameState.myShip.credits.toLocaleString()}</div>
                <div class="station-submenu-item-list">${itemsHtml}</div>
                <div class="station-submenu-actions">
                    <button id="submenu-accept-btn" class="station-action-button">Accept (A)</button>
                    <button id="submenu-back-btn" class="station-action-button">Back (Esc)</button>
                </div>
            </div>`;

        document
            .getElementById("submenu-accept-btn")
            ?.addEventListener("click", () => {
                if (
                    gameState.availableMissionsForCurrentPlanet.length > 0 &&
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
            });
        document
            .getElementById("submenu-back-btn")
            ?.addEventListener("click", () =>
                this.renderDockedStationInterface(),
            );
    },
};
