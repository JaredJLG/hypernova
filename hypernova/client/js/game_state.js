// hypernova/client/js/game_state.js
export const gameState = {
    currentUser: null,
    socket: null,
    myId: null,
    allShips: {},
    get myShip() {
        return this.allShips[this.myId];
    },
    projectiles: [],
    loadedImages: {},
    imagePathsToLoad: [],

    // Camera/Viewport for full-screen rendering
    camera: {
        x: 0,
        y: 0,
        width: 800, // Will be updated to screen size
        height: 600, // Will be updated to screen size
        zoom: 1.0, // Future use for zooming
    },

    clientGameData: {
        systems: [], // Will be populated with data that includes universeX, universeY, connections, backgroundFile
        tradeGoods: [],
        weapons: {},
        shipTypes: [],
        MISSION_TYPES: {},
    },
    clientPlanetEconomies: [],

    docked: false,
    dockedAtDetails: null,
    isMenuOpen: false, // For docked station sub-menus
    activeSubMenu: null, // For docked station sub-menus

    selectedTradeIndex: 0,
    selectedWeaponKey: null,
    selectedShipIndex: 0,
    selectedMissionIndex: 0,
    availableMissionsForCurrentPlanet: [],

    weaponCycleIdx: 0,
    controls: {
        rotatingLeft: false,
        rotatingRight: false,
        accelerating: false,
        decelerating: false,
    },

    isChargingHyperjump: false,
    hyperjumpChargeStartTime: null,
    hyperjumpDeniedMessage: null,
    hyperjumpDeniedMessageTimeoutId: null,

    // Universe Map State
    isMapOpen: false,
    mapSelectedSystemIndex: null, // Index of the system selected on the map for single manual jump

    // ===== NEW ROUTE PLANNING STATE =====
    plannedRoute: [], // Array of system indices for the route
    currentRouteLegIndex: -1, // Index of the next system to jump to in plannedRoute
    // ===== END OF NEW ROUTE PLANNING STATE =====

    updateShipData(id, data) {
        if (!this.allShips[id]) {
            this.allShips[id] = {};
        }
        Object.assign(this.allShips[id], data);
        if (this.allShips[id]) {
            this.defaultShipProps(this.allShips[id]);
        }
    },

    defaultShipProps(ship) {
        if (!ship) return;

        const currentShipTypeData =
            this.clientGameData.shipTypes &&
            ship.type !== undefined &&
            ship.type !== null
                ? this.clientGameData.shipTypes[ship.type]
                : null;

        if (ship.system === undefined) ship.system = 0;
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
