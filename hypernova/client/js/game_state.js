// hypernova/client/js/game_state.js
export const gameState = {
    socket: null, // Will be set by network.js
    myId: null,
    allShips: {}, // Store all ship objects, including myShip
    get myShip() {
        // Getter for convenience
        return this.allShips[this.myId];
    },
    projectiles: [],
    loadedImages: {}, // To store Image objects: { 'filename.png': ImageElement }
    imagePathsToLoad: [], // To collect all image paths

    // Game data received from server
    clientGameData: {
        systems: [], // { name, planets: [{ name, x, y, imageFile }, ...] }
        tradeGoods: [], // { name, basePrice, mass }
        weapons: {}, // { name: { price, damage, ... } }
        shipTypes: [], // { name, price, speedMult, ..., maxCargo, imageFile, imgWidth, imgHeight }
        MISSION_TYPES: {}, // { CARGO_DELIVERY: "CARGO_DELIVERY", ... }
    },
    clientPlanetEconomies: [], // Array of system economies [{ planets: [{ stock, buyPrices, sellPrices }] }]

    // UI related state
    docked: false,
    dockedAtDetails: null, // { systemIndex, planetIndex, planetName, systemName, buyPrices, sellPrices, stock }
    isMenuOpen: false, // General flag for UIManager
    activeSubMenu: null, // 'trade', 'shipyard', etc.

    // Selection indices for menus
    selectedTradeIndex: 0,
    selectedWeaponKey: null,
    selectedShipIndex: 0,
    selectedMissionIndex: 0,
    availableMissionsForCurrentPlanet: [],

    // Input state
    weaponCycleIdx: 0,
    controls: {
        rotatingLeft: false,
        rotatingRight: false,
        accelerating: false,
        decelerating: false,
    },

    // Helper to update a specific ship's data
    updateShipData(id, data) {
        if (!this.allShips[id]) {
            this.allShips[id] = {}; // Initialize if new
        }
        Object.assign(this.allShips[id], data);

        // Ensure critical properties exist after update, especially for new ships
        if (this.allShips[id]) {
            this.defaultShipProps(this.allShips[id]);
        }
    },

    // Helper to set default properties on a ship object
    defaultShipProps(ship) {
        if (!ship) return;
        const currentShipType = this.clientGameData.shipTypes[ship.type || 0];

        if (ship.system === undefined) ship.system = 0;
        if (ship.dockedAtPlanetIdentifier === undefined)
            ship.dockedAtPlanetIdentifier = null;

        if (currentShipType) {
            if (!ship.maxHealth)
                ship.maxHealth = currentShipType.maxHealth || 100;
            if (!ship.health || ship.health > ship.maxHealth)
                ship.health = ship.maxHealth;
            if (!ship.maxCargo) ship.maxCargo = currentShipType.maxCargo || 10;
        } else {
            if (!ship.maxHealth) ship.maxHealth = 100;
            if (!ship.health) ship.health = 100;
            if (!ship.maxCargo) ship.maxCargo = 10;
        }

        if (ship.credits === undefined) ship.credits = 0;

        if (
            this.clientGameData.tradeGoods &&
            this.clientGameData.tradeGoods.length > 0
        ) {
            if (
                !ship.cargo ||
                ship.cargo.length !== this.clientGameData.tradeGoods.length
            ) {
                ship.cargo = new Array(
                    this.clientGameData.tradeGoods.length,
                ).fill(0);
            }
        } else if (!ship.cargo) {
            ship.cargo = [];
        }

        if (!ship.weapons) ship.weapons = [];
        if (!ship.activeWeapon && ship.weapons.length > 0)
            ship.activeWeapon = ship.weapons[0];
        if (!ship.activeMissions) ship.activeMissions = [];
    },
};
