// hypernova/client/js/universe_map_renderer.js
import { gameState } from "./game_state.js";
import * as Network from "./network.js";

let mapCanvas = null;
let mapCtx = null;
let initialized = false;

// Map display constants
const SYSTEM_RADIUS_ON_SCREEN = 8;
const SYSTEM_NAME_FONT = "12px Courier New"; // Base size, scaled later
const SYSTEM_NAME_COLOR = "#99FFFF";
const CONNECTION_LINE_COLOR = "rgba(100, 100, 200, 0.4)";
const CONNECTION_LINE_WIDTH = 1.5; // Base width, scaled later
const PLAYER_SYSTEM_COLOR = "#00FF00";
const SELECTED_SYSTEM_COLOR = "#FFFF00"; // For manual jump target
const ROUTE_SYSTEM_COLOR = "#FFA500"; // Orange for systems in route
const ROUTE_LINE_COLOR = "rgba(255, 165, 0, 0.8)";
const ROUTE_LINE_WIDTH = 2.5; // Base width, scaled later
const INVALID_JUMP_TARGET_COLOR = "#FF6666"; // For manual jump if invalid

// Button properties (drawn on canvas)
const BUTTON_WIDTH = 170; // Adjusted for longer text
const BUTTON_HEIGHT = 35;
const BUTTON_MARGIN = 20;
const BUTTON_BG_COLOR = "rgba(0, 80, 120, 0.9)";
const BUTTON_BORDER_COLOR = "rgba(0, 150, 200, 1)";
const BUTTON_TEXT_COLOR = "#CCFFFF";
const BUTTON_FONT = "bold 14px Courier New";

let mapButtons = []; // To store button rects and actions

export const UniverseMapRenderer = {
    init(canvasElement) {
        mapCanvas = canvasElement;
        if (!mapCanvas) {
            console.error(
                "UniverseMapCanvas element not found for renderer init.",
            );
            return;
        }
        mapCtx = mapCanvas.getContext("2d");
        this.resizeMap(); // Set initial size
        initialized = true;
        console.log("UniverseMapRenderer initialized.");

        mapCanvas.addEventListener("click", (e) => this.handleMapClick(e));
    },

    resizeMap() {
        if (!mapCanvas) return;
        mapCanvas.width = window.innerWidth;
        mapCanvas.height = window.innerHeight;
        this.prepareButtons();
        if (gameState.isMapOpen) this.draw();
    },

    prepareButtons() {
        mapButtons = [];
        const topY = BUTTON_MARGIN;
        const secondY = topY + BUTTON_HEIGHT + BUTTON_MARGIN / 2;
        const thirdY = secondY + BUTTON_HEIGHT + BUTTON_MARGIN / 2;

        mapButtons.push({
            id: "closeButton",
            text: "Close Map (M/Esc)",
            x: mapCanvas.width - BUTTON_WIDTH - BUTTON_MARGIN,
            y: topY,
            width: BUTTON_WIDTH,
            height: BUTTON_HEIGHT,
            action: () => UniverseMapManager.closeMap(),
        });

        mapButtons.push({
            id: "jumpButton", // This is for manual single jump
            text: "Manual Hyperjump",
            x: mapCanvas.width - BUTTON_WIDTH - BUTTON_MARGIN,
            y: secondY,
            width: BUTTON_WIDTH,
            height: BUTTON_HEIGHT,
            action: () => {
                if (
                    gameState.mapSelectedSystemIndex !== null &&
                    gameState.myShip &&
                    !gameState.isChargingHyperjump // Check if already charging
                ) {
                    const currentSystemData =
                        gameState.clientGameData.systems[
                            gameState.myShip.system
                        ];
                    const targetSystemData =
                        gameState.clientGameData.systems[
                            gameState.mapSelectedSystemIndex
                        ];
                    if (
                        currentSystemData &&
                        targetSystemData &&
                        currentSystemData.connections &&
                        currentSystemData.connections.includes(
                            gameState.mapSelectedSystemIndex,
                        ) &&
                        gameState.mapSelectedSystemIndex !==
                            gameState.myShip.system
                    ) {
                        Network.requestHyperjump(
                            gameState.mapSelectedSystemIndex,
                        );
                        // If a route was active, clear it because this is a manual override
                        if (gameState.plannedRoute.length > 0) {
                            gameState.plannedRoute = [];
                            gameState.currentRouteLegIndex = -1;
                            console.log("Route cleared due to manual jump.");
                        }
                        UniverseMapManager.closeMap();
                    } else {
                        alert(
                            "Cannot jump: Target system is not directly connected or is current system.",
                        );
                    }
                } else if (gameState.isChargingHyperjump) {
                    alert("Hyperdrive is already charging!");
                }
            },
        });

        mapButtons.push({
            id: "clearRouteButton",
            text: "Clear Route",
            x: mapCanvas.width - BUTTON_WIDTH - BUTTON_MARGIN,
            y: thirdY,
            width: BUTTON_WIDTH,
            height: BUTTON_HEIGHT,
            action: () => {
                gameState.plannedRoute = [];
                gameState.currentRouteLegIndex = -1;
                UniverseMapRenderer.draw(); // Redraw to reflect cleared route
            },
        });
    },

    draw() {
        if (!mapCtx || !initialized || !gameState.isMapOpen) return;

        mapCtx.fillStyle = "rgba(0, 5, 10, 0.97)";
        mapCtx.fillRect(0, 0, mapCanvas.width, mapCanvas.height);

        const systems = gameState.clientGameData.systems;
        if (!systems || systems.length === 0) {
            mapCtx.fillStyle = SYSTEM_NAME_COLOR;
            mapCtx.font = "16px Courier New";
            mapCtx.textAlign = "center";
            mapCtx.fillText(
                "No system data available.",
                mapCanvas.width / 2,
                mapCanvas.height / 2,
            );
            this.drawButtons();
            return;
        }

        let minX = Infinity,
            maxX = -Infinity,
            minY = Infinity,
            maxY = -Infinity;
        systems.forEach((sys) => {
            if (sys.universeX === undefined) return;
            if (sys.universeX < minX) minX = sys.universeX;
            if (sys.universeX > maxX) maxX = sys.universeX;
            if (sys.universeY < minY) minY = sys.universeY;
            if (sys.universeY > maxY) maxY = sys.universeY;
        });

        if (minX === Infinity) {
            // No systems with coordinates
            mapCtx.fillStyle = SYSTEM_NAME_COLOR;
            mapCtx.font = "16px Courier New";
            mapCtx.textAlign = "center";
            mapCtx.fillText(
                "System coordinate data missing.",
                mapCanvas.width / 2,
                mapCanvas.height / 2,
            );
            this.drawButtons();
            return;
        }

        const dataWidth = Math.max(1, maxX - minX);
        const dataHeight = Math.max(1, maxY - minY);
        const dataCenterX = minX + dataWidth / 2;
        const dataCenterY = minY + dataHeight / 2;

        const padding = 60;
        const availableWidth = mapCanvas.width - 2 * padding;
        const availableHeight = mapCanvas.height - 2 * padding;

        let scale = 1;
        if (dataWidth > 0 && dataHeight > 0) {
            scale = Math.min(
                availableWidth / dataWidth,
                availableHeight / dataHeight,
            );
        } else if (dataWidth > 0) {
            scale = availableWidth / dataWidth;
        } else if (dataHeight > 0) {
            scale = availableHeight / dataHeight;
        }
        scale = Math.min(scale, 2.5);
        scale = Math.max(scale, 0.2);

        const viewCenterX = mapCanvas.width / 2;
        const viewCenterY = mapCanvas.height / 2;
        const offsetX = viewCenterX - dataCenterX * scale;
        const offsetY = viewCenterY - dataCenterY * scale;

        mapCtx.save();
        mapCtx.translate(offsetX, offsetY);
        mapCtx.scale(scale, scale);

        // Draw connections
        mapCtx.strokeStyle = CONNECTION_LINE_COLOR;
        mapCtx.lineWidth = CONNECTION_LINE_WIDTH / scale;
        systems.forEach((sys, i) => {
            if (sys.universeX === undefined || !sys.connections) return;
            sys.connections.forEach((targetIndex) => {
                if (
                    targetIndex < systems.length &&
                    systems[targetIndex].universeX !== undefined
                ) {
                    const targetSys = systems[targetIndex];
                    mapCtx.beginPath();
                    mapCtx.moveTo(sys.universeX, sys.universeY);
                    mapCtx.lineTo(targetSys.universeX, targetSys.universeY);
                    mapCtx.stroke();
                }
            });
        });

        // Draw planned route lines
        if (gameState.plannedRoute.length > 1) {
            mapCtx.strokeStyle = ROUTE_LINE_COLOR;
            mapCtx.lineWidth = ROUTE_LINE_WIDTH / scale;
            mapCtx.beginPath();
            const firstSystemInRoute = systems[gameState.plannedRoute[0]];
            if (
                firstSystemInRoute &&
                firstSystemInRoute.universeX !== undefined
            ) {
                mapCtx.moveTo(
                    firstSystemInRoute.universeX,
                    firstSystemInRoute.universeY,
                );
                for (let i = 1; i < gameState.plannedRoute.length; i++) {
                    const nextSystemInRoute =
                        systems[gameState.plannedRoute[i]];
                    if (
                        nextSystemInRoute &&
                        nextSystemInRoute.universeX !== undefined
                    ) {
                        mapCtx.lineTo(
                            nextSystemInRoute.universeX,
                            nextSystemInRoute.universeY,
                        );
                    }
                }
                mapCtx.stroke();
            }
        }

        // Draw systems
        systems.forEach((sys, i) => {
            if (sys.universeX === undefined) return;
            const screenRadius = SYSTEM_RADIUS_ON_SCREEN / scale;
            mapCtx.beginPath();
            mapCtx.arc(
                sys.universeX,
                sys.universeY,
                screenRadius,
                0,
                Math.PI * 2,
            );

            let systemFillColor = SYSTEM_NAME_COLOR; // Default
            if (gameState.plannedRoute.includes(i)) {
                systemFillColor = ROUTE_SYSTEM_COLOR;
                if (
                    gameState.currentRouteLegIndex !== -1 &&
                    gameState.plannedRoute[gameState.currentRouteLegIndex] === i
                ) {
                    systemFillColor = PLAYER_SYSTEM_COLOR; // Highlight next target in route
                }
            } else if (gameState.myShip && gameState.myShip.system === i) {
                systemFillColor = PLAYER_SYSTEM_COLOR;
            } else if (gameState.mapSelectedSystemIndex === i) {
                // For manual jump
                const currentSystemData =
                    gameState.clientGameData.systems[gameState.myShip.system];
                if (
                    currentSystemData &&
                    currentSystemData.connections &&
                    currentSystemData.connections.includes(i)
                ) {
                    systemFillColor = SELECTED_SYSTEM_COLOR;
                } else {
                    systemFillColor = INVALID_JUMP_TARGET_COLOR;
                }
            }
            mapCtx.fillStyle = systemFillColor;
            mapCtx.fill();
            mapCtx.strokeStyle = systemFillColor;
            mapCtx.lineWidth = CONNECTION_LINE_WIDTH / 2 / scale;
            mapCtx.stroke();

            mapCtx.fillStyle = SYSTEM_NAME_COLOR;
            mapCtx.font = `${SYSTEM_NAME_FONT.split(" ")[0].replace("px", "")}px ${SYSTEM_NAME_FONT.split(" ").slice(1).join(" ")}`; // Apply scale to font size
            mapCtx.textAlign = "center";
            mapCtx.textBaseline = "bottom";
            mapCtx.fillText(
                sys.name,
                sys.universeX,
                sys.universeY - (screenRadius + 5 / scale),
            );
        });
        mapCtx.restore();

        this.drawButtons();
    },

    drawButtons() {
        mapButtons.forEach((button) => {
            let currentButtonBgColor = BUTTON_BG_COLOR;
            let currentButtonTextColor = BUTTON_TEXT_COLOR;
            let buttonIsEnabled = true;

            if (button.id === "jumpButton") {
                // Manual jump button
                buttonIsEnabled =
                    !gameState.isChargingHyperjump &&
                    gameState.mapSelectedSystemIndex !== null &&
                    gameState.myShip &&
                    gameState.mapSelectedSystemIndex !==
                        gameState.myShip.system;
                if (buttonIsEnabled) {
                    // Further check for connection
                    const currentSystemData =
                        gameState.clientGameData.systems[
                            gameState.myShip.system
                        ];
                    const targetSystemData =
                        gameState.clientGameData.systems[
                            gameState.mapSelectedSystemIndex
                        ];
                    buttonIsEnabled =
                        currentSystemData &&
                        targetSystemData &&
                        currentSystemData.connections &&
                        currentSystemData.connections.includes(
                            gameState.mapSelectedSystemIndex,
                        );
                }
            } else if (button.id === "clearRouteButton") {
                buttonIsEnabled = gameState.plannedRoute.length > 0;
            }

            mapCtx.globalAlpha = buttonIsEnabled ? 1.0 : 0.5;
            currentButtonBgColor = buttonIsEnabled
                ? BUTTON_BG_COLOR
                : "rgba(80, 80, 80, 0.8)";

            mapCtx.fillStyle = currentButtonBgColor;
            mapCtx.strokeStyle = BUTTON_BORDER_COLOR;
            mapCtx.lineWidth = 1;
            mapCtx.fillRect(button.x, button.y, button.width, button.height);
            mapCtx.strokeRect(button.x, button.y, button.width, button.height);

            mapCtx.fillStyle = buttonIsEnabled
                ? BUTTON_TEXT_COLOR
                : "rgba(150,150,150,1)";
            mapCtx.font = BUTTON_FONT;
            mapCtx.textAlign = "center";
            mapCtx.textBaseline = "middle";
            mapCtx.fillText(
                button.text,
                button.x + button.width / 2,
                button.y + button.height / 2,
            );

            mapCtx.globalAlpha = 1.0;
        });
        mapCtx.textAlign = "left";
        mapCtx.textBaseline = "alphabetic";
    },

    handleMapClick(event) {
        if (!mapCanvas || !initialized || !gameState.isMapOpen) return;

        const rect = mapCanvas.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;

        let buttonClicked = false;
        for (const button of mapButtons) {
            if (
                clickX >= button.x &&
                clickX <= button.x + button.width &&
                clickY >= button.y &&
                clickY <= button.y + button.height
            ) {
                let canExecuteButton = true;
                if (button.id === "jumpButton") {
                    canExecuteButton =
                        !gameState.isChargingHyperjump &&
                        gameState.mapSelectedSystemIndex !== null &&
                        gameState.myShip &&
                        gameState.mapSelectedSystemIndex !==
                            gameState.myShip.system;
                    if (canExecuteButton) {
                        const currentSystemData =
                            gameState.clientGameData.systems[
                                gameState.myShip.system
                            ];
                        const targetSystemData =
                            gameState.clientGameData.systems[
                                gameState.mapSelectedSystemIndex
                            ];
                        canExecuteButton =
                            currentSystemData &&
                            targetSystemData &&
                            currentSystemData.connections &&
                            currentSystemData.connections.includes(
                                gameState.mapSelectedSystemIndex,
                            );
                    }
                } else if (button.id === "clearRouteButton") {
                    canExecuteButton = gameState.plannedRoute.length > 0;
                }

                if (canExecuteButton) {
                    button.action();
                }
                buttonClicked = true;
                break;
            }
        }
        if (buttonClicked) {
            if (gameState.isMapOpen) this.draw();
            return;
        }

        const systems = gameState.clientGameData.systems;
        if (!systems || systems.length === 0) return;

        let minX = Infinity,
            maxX = -Infinity,
            minY = Infinity,
            maxY = -Infinity;
        systems.forEach((sys) => {
            if (sys.universeX === undefined) return;
            if (sys.universeX < minX) minX = sys.universeX;
            if (sys.universeX > maxX) maxX = sys.universeX;
            if (sys.universeY < minY) minY = sys.universeY;
            if (sys.universeY > maxY) maxY = sys.universeY;
        });
        if (minX === Infinity) return;

        const dataWidth = Math.max(1, maxX - minX);
        const dataHeight = Math.max(1, maxY - minY);
        const dataCenterX = minX + dataWidth / 2;
        const dataCenterY = minY + dataHeight / 2;
        const padding = 60;
        const availableWidth = mapCanvas.width - 2 * padding;
        const availableHeight = mapCanvas.height - 2 * padding;
        let scale = 1;
        if (dataWidth > 0 && dataHeight > 0) {
            scale = Math.min(
                availableWidth / dataWidth,
                availableHeight / dataHeight,
            );
        } else if (dataWidth > 0) {
            scale = availableWidth / dataWidth;
        } else if (dataHeight > 0) {
            scale = availableHeight / dataHeight;
        }
        scale = Math.min(scale, 2.5);
        scale = Math.max(scale, 0.2);

        const viewCenterX = mapCanvas.width / 2;
        const viewCenterY = mapCanvas.height / 2;
        const offsetX = viewCenterX - dataCenterX * scale;
        const offsetY = viewCenterY - dataCenterY * scale;

        const mapClickX = (clickX - offsetX) / scale;
        const mapClickY = (clickY - offsetY) / scale;

        let clickedSystemIndex = -1;
        let closestDistSq = ((SYSTEM_RADIUS_ON_SCREEN / scale) * 1.5) ** 2;

        for (let i = 0; i < systems.length; i++) {
            const sys = systems[i];
            if (sys.universeX === undefined) continue;
            const distSq =
                (mapClickX - sys.universeX) ** 2 +
                (mapClickY - sys.universeY) ** 2;
            if (distSq < closestDistSq) {
                closestDistSq = distSq;
                clickedSystemIndex = i;
            }
        }

        if (clickedSystemIndex !== -1) {
            if (event.shiftKey) {
                // Route planning
                if (
                    gameState.myShip &&
                    clickedSystemIndex === gameState.myShip.system &&
                    gameState.plannedRoute.length === 0
                ) {
                    // Prevent starting route in current system if route is empty
                    alert("Cannot start route in your current system.");
                } else if (gameState.plannedRoute.length === 0) {
                    gameState.plannedRoute.push(clickedSystemIndex);
                    gameState.currentRouteLegIndex = 0;
                } else {
                    const lastSystemInRouteIndex =
                        gameState.plannedRoute[
                            gameState.plannedRoute.length - 1
                        ];
                    if (clickedSystemIndex === lastSystemInRouteIndex) {
                        // Clicked last system again: remove it (undo)
                        gameState.plannedRoute.pop();
                        if (gameState.plannedRoute.length === 0) {
                            gameState.currentRouteLegIndex = -1;
                        }
                        // currentRouteLegIndex remains same or becomes -1
                    } else if (
                        !gameState.plannedRoute.includes(clickedSystemIndex)
                    ) {
                        // Not already in route (except for extending)
                        const lastSystemData = systems[lastSystemInRouteIndex];
                        if (
                            lastSystemData &&
                            lastSystemData.connections &&
                            lastSystemData.connections.includes(
                                clickedSystemIndex,
                            )
                        ) {
                            gameState.plannedRoute.push(clickedSystemIndex);
                            // currentRouteLegIndex doesn't change until a jump is made
                        } else {
                            alert(
                                "Cannot add system to route: Not connected to the previous system.",
                            );
                        }
                    } else {
                        alert("System already in route or invalid selection.");
                    }
                }
            } else {
                // Normal click: select for manual jump
                gameState.mapSelectedSystemIndex = clickedSystemIndex;
            }
        }
        this.draw();
    },
};

export const UniverseMapManager = {
    mapContainer: null,

    init() {
        this.mapContainer = document.getElementById("universe-map-container");
        const canvasEl = document.getElementById("universeMapCanvas");
        if (this.mapContainer && canvasEl) {
            UniverseMapRenderer.init(canvasEl);
            window.addEventListener("resize", () =>
                UniverseMapRenderer.resizeMap(),
            );
        } else {
            console.error(
                "Universe map container or canvas not found for UniverseMapManager init.",
            );
        }
    },
    openMap() {
        if (!gameState.myShip) return;
        if (gameState.docked) {
            alert("Cannot open map while docked.");
            return;
        }
        if (gameState.isChargingHyperjump) {
            alert("Cannot open map while hyperdrive is charging.");
            return;
        }
        gameState.isMapOpen = true;
        if (this.mapContainer) this.mapContainer.classList.remove("hidden");
        // Reset manual selection when opening map, but keep route
        gameState.mapSelectedSystemIndex = null;
        UniverseMapRenderer.resizeMap(); // This calls draw
    },
    closeMap() {
        gameState.isMapOpen = false;
        if (this.mapContainer) this.mapContainer.classList.add("hidden");
        // gameState.mapSelectedSystemIndex = null; // Keep selection for now, route persists
    },
    toggleMap() {
        if (gameState.isMapOpen) {
            this.closeMap();
        } else {
            this.openMap();
        }
    },
};
