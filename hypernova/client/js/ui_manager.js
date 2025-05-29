// client/js/ui_manager.js
import { gameState } from "./game_state.js";
import * as Network from "./network.js"; // To send actions like buy/sell/undock

let uiContainer = null;
let dockMenuElement = null;

export const UIManager = {
    init(containerElement) {
        uiContainer = containerElement;
    },

    isMenuOpen() {
        return gameState.isMenuOpen;
    },

    openDockMenu() {
        if (dockMenuElement) this.closeDockMenu(); // Should not happen, but safeguard

        gameState.isMenuOpen = true;
        gameState.activeSubMenu = null; // Start at main dock menu
        document.body.classList.add("no-scroll");

        dockMenuElement = document.createElement("div");
        dockMenuElement.className = "panel";
        dockMenuElement.style.top = "50%";
        dockMenuElement.style.left = "50%";
        dockMenuElement.style.transform = "translate(-50%,-50%)";

        this.renderMainMenu();
        uiContainer.appendChild(dockMenuElement);
    },

    closeDockMenu() {
        if (dockMenuElement && dockMenuElement.parentNode === uiContainer) {
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

    renderMainMenu() {
        if (!dockMenuElement || !gameState.dockedAtDetails || !gameState.myShip)
            return;

        const myShip = gameState.myShip;
        const currentShipDef =
            gameState.clientGameData.shipTypes[myShip.type || 0];
        if (!currentShipDef) return; // Ship def not loaded

        const cargoCount = myShip.cargo.reduce((s, v) => s + v, 0);

        dockMenuElement.innerHTML = `
          <div class="menu-item"><b>Docked at ${gameState.dockedAtDetails.planetName} (${gameState.dockedAtDetails.systemName})</b></div>
          <div class="menu-item">Credits: $${myShip.credits}</div>
          <div class="menu-item">Cargo: ${cargoCount}/${currentShipDef.maxCargo}</div>
          <div class="menu-item">---</div>
          <div class="menu-item">T - Trade</div>
          <div class="menu-item">Y - Shipyard</div>
          <div class="menu-item">O - Outfitter</div>
          <div class="menu-item">M - Missions</div>
          <div class="menu-item">U - Undock</div>
          <div class="menu-item" style="margin-top: 10px; font-size: 0.9em;">(Use Arrow Keys, Enter/Specific Keys, Esc)</div>
        `;
    },

    renderTradeMenu() {
        if (!dockMenuElement || !gameState.dockedAtDetails || !gameState.myShip)
            return;
        const myShip = gameState.myShip;
        const currentShipDef =
            gameState.clientGameData.shipTypes[myShip.type || 0];
        if (!currentShipDef) return;

        const cargoCount = myShip.cargo.reduce((s, v) => s + v, 0);
        let html = `<div class="menu-item"><b>Trade at ${gameState.dockedAtDetails.planetName}</b></div>`;
        html += `<div class="menu-item">Credits: $${myShip.credits} Cargo: ${cargoCount}/${currentShipDef.maxCargo}</div>`;
        html += `<div class="menu-item" style="border-bottom:1px solid #0f0;"><u>Good&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Qty&nbsp;&nbsp;&nbsp;Buy&nbsp;&nbsp;&nbsp;&nbsp;Sell&nbsp;&nbsp;&nbsp;Stock</u></div>`;

        // Use dockedAtDetails for prices/stock, as it's updated on tradeSuccess directly
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
        let html = `<div class="menu-item"><b>Outfitter</b></div>`;
        html += `<div class="menu-item">Credits: $${myShip.credits}</div>`;
        html += `<div class="menu-item" style="border-bottom:1px solid #0f0;"><u>Weapon&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Price&nbsp;&nbsp;&nbsp;Dmg&nbsp;&nbsp;Owned</u></div>`;

        if (Object.keys(gameState.clientGameData.weapons).length === 0) {
            html +=
                "<div class='menu-item'>(No weapons available for purchase)</div>";
        } else {
            // Ensure selectedWeaponKey is valid
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
        let html = `<div class="menu-item"><b>Shipyard</b></div>`;
        html += `<div class="menu-item">Credits: $${myShip.credits}</div>`;
        html += `<div class="menu-item" style="border-bottom:1px solid #0f0;"><u>Ship&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Price&nbsp;&nbsp;&nbsp;Cargo&nbsp;&nbsp;Current</u></div>`;

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
        let html = `<div class="menu-item"><b>Missions at ${gameState.dockedAtDetails.planetName}</b></div>`;
        html += `<div class="menu-item">Credits: $${gameState.myShip.credits}</div>`;
        html += `<div class="menu-item" style="border-bottom:1px solid #0f0;"><u>Title&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Reward</u></div>`;

        if (gameState.availableMissionsForCurrentPlanet.length === 0) {
            html +=
                "<div class='menu-item'>(No missions currently available)</div>";
        } else {
            // Ensure selectedMissionIndex is valid
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
                    // Display details for selected mission
                    html += `<div class="menu-item" style="font-size:0.9em; color: #0c0; padding-left:10px;">&nbsp;&nbsp;&gt; ${m.description}</div>`;
                    const timeLeftMs = m.timeLimit - Date.now();
                    const timeLeftMin = Math.max(
                        0,
                        Math.round(timeLeftMs / 60000),
                    );
                    html += `<div class="menu-item" style="font-size:0.9em; color: #0c0; padding-left:10px;">&nbsp;&nbsp;&gt; Time Limit: ${timeLeftMin} min. Penalty: $${m.penaltyCredits}</div>`;
                    if (
                        m.type ===
                        gameState.clientGameData.MISSION_TYPES.CARGO_DELIVERY
                    ) {
                        html += `<div class="menu-item" style="font-size:0.9em; color: #0c0; padding-left:10px;">&nbsp;&nbsp;&gt; Deliver: ${m.cargoQuantity} ${m.cargoGoodName}</div>`;
                    } else if (
                        m.type === gameState.clientGameData.MISSION_TYPES.BOUNTY
                    ) {
                        const targetSysName =
                            gameState.clientGameData.systems[
                                m.targetSystemIndex
                            ]?.name || "Unknown System";
                        html += `<div class="menu-item" style="font-size:0.9em; color: #0c0; padding-left:10px;">&nbsp;&nbsp;&gt; Target: ${m.targetsRequired} ${m.targetShipName}(s) in ${targetSysName}</div>`;
                    }
                }
            });
        }
        html +=
            "<div class='menu-item' style='border-top:1px solid #0f0; margin-top:5px;'>ArrowUp/Down: Select. A: Accept. Esc: Back</div>";
        dockMenuElement.innerHTML = html;
    },
};
