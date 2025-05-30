// hypernova/client/js/game_state.js
export const gameState = {
    currentUser: null, // NEW: Will store { username: "string" } after login
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
        systems: [],
        tradeGoods: [],
        weapons: {},
        shipTypes: [],
        MISSION_TYPES: {},
    },
    clientPlanetEconomies: [],

    // UI related state
    docked: false,
    dockedAtDetails: null,
    isMenuOpen: false,
    activeSubMenu: null,

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

    updateShipData(id, data) {
        // console.log(`game_state.js/updateShipData called for ID: ${id}, with data:`, JSON.stringify(data));
        if (!this.allShips[id]) {
            // console.log(`game_state.js/updateShipData: Ship ${id} not found, creating.`);
            this.allShips[id] = {};
        }
        Object.assign(this.allShips[id], data);
        // console.log(`game_state.js/updateShipData: Ship ${id} after assign:`, JSON.stringify(this.allShips[id]));

        if (this.allShips[id]) {
            // Ensure ship exists before calling defaultShipProps
            // console.log(`game_state.js/updateShipData: Calling defaultShipProps for ship ${id}. Current gameState.docked: ${this.docked}`);
            this.defaultShipProps(this.allShips[id]);
        }
    },

    defaultShipProps(ship) {
        if (!ship) {
            // console.warn("game_state.js/defaultShipProps: Called with null/undefined ship.");
            return;
        }
        // console.log(`game_state.js/defaultShipProps called for ship (type: ${ship.type}). Current ship state: ${JSON.stringify(ship)}. Current gameState.docked: ${this.docked}`);

        const currentShipTypeData =
            this.clientGameData.shipTypes &&
            ship.type !== undefined &&
            ship.type !== null
                ? this.clientGameData.shipTypes[ship.type]
                : null;
        // console.log("game_state.js/defaultShipProps: currentShipTypeData:", JSON.stringify(currentShipTypeData));

        if (ship.system === undefined) ship.system = 0;
        // dockedAtPlanetIdentifier is specific to the ship object, not the global gameState.docked
        if (ship.dockedAtPlanetIdentifier === undefined)
            ship.dockedAtPlanetIdentifier = null;

        if (currentShipTypeData) {
            if (ship.maxHealth === undefined)
                ship.maxHealth = currentShipTypeData.maxHealth || 100;
            if (ship.health === undefined || ship.health > ship.maxHealth)
                ship.health = ship.maxHealth;
            if (ship.maxCargo === undefined)
                ship.maxCargo = currentShipTypeData.maxCargo || 10;
        } else {
            // console.warn("game_state.js/defaultShipProps: No currentShipTypeData found for ship type:", ship.type, "Using generic defaults.");
            if (ship.maxHealth === undefined) ship.maxHealth = 100;
            if (ship.health === undefined) ship.health = 100;
            if (ship.maxCargo === undefined) ship.maxCargo = 10;
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
                // console.log("game_state.js/defaultShipProps: Initializing/resizing ship.cargo array.");
                ship.cargo = new Array(
                    this.clientGameData.tradeGoods.length,
                ).fill(0);
            }
        } else if (!ship.cargo) {
            // console.log("game_state.js/defaultShipProps: No trade goods data, initializing ship.cargo to empty array.");
            ship.cargo = [];
        }

        if (!ship.weapons) ship.weapons = [];
        if (!ship.activeWeapon && ship.weapons.length > 0)
            ship.activeWeapon = ship.weapons[0];
        if (!ship.activeMissions) ship.activeMissions = [];

        // console.log(`game_state.js/defaultShipProps finished for ship. Ship dockedAtPlanetIdentifier: ${ship.dockedAtPlanetIdentifier}. gameState.docked REMAINS: ${this.docked}`);
    },
};
