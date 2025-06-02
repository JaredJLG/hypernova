// hypernova/client/js/renderer.js
import { gameState } from "./game_state.js";
import {
    PROJECTILE_LIFESPAN_MS,
    DOCKING_DISTANCE_SQUARED,
    HYPERJUMP_CHARGE_TIME_MS,
} from "./client_config.js";

let ctx = null;
let canvas = null;
let minimapCanvas = null; // For the new minimap
let minimapCtx = null;
let initialized = false;

// Parallax background properties
const PARALLAX_LAYERS = [
    {
        speed: 0.05,
        stars: [],
        starDensity: 0.000015,
        minStarSize: 0.2,
        maxStarSize: 0.7,
        opacity: 0.4,
    }, // Deepest, slowest
    {
        speed: 0.15,
        stars: [],
        starDensity: 0.00003,
        minStarSize: 0.4,
        maxStarSize: 1.0,
        opacity: 0.6,
    },
    {
        speed: 0.35,
        stars: [],
        starDensity: 0.00005,
        minStarSize: 0.6,
        maxStarSize: 1.5,
        opacity: 0.8,
    },
];
// let lastCameraX = 0; // Not currently used, but kept if needed later
// let lastCameraY = 0;

function getRandom(min, max) {
    return Math.random() * (max - min) + min;
}

function generateParallaxStars() {
    if (!canvas) return;
    PARALLAX_LAYERS.forEach((layer) => {
        layer.stars = [];
        const numStars = Math.floor(
            canvas.width * canvas.height * layer.starDensity,
        );
        for (let i = 0; i < numStars; i++) {
            layer.stars.push({
                x: Math.random() * canvas.width * 3 - canvas.width,
                y: Math.random() * canvas.height * 3 - canvas.height,
                radius: getRandom(layer.minStarSize, layer.maxStarSize),
                opacity: getRandom(layer.opacity * 0.5, layer.opacity),
            });
        }
    });
}

export const Renderer = {
    init(mainCanvasElement) {
        canvas = mainCanvasElement;
        ctx = canvas.getContext("2d");

        minimapCanvas = document.getElementById("minimapCanvas");
        if (minimapCanvas) {
            minimapCtx = minimapCanvas.getContext("2d");
            // Set minimap canvas fixed size or make it responsive based on its container
            // For now, CSS sets its height, width is 100% of container.
            // If its container size changes, this might need adjustment or call from resize.
            minimapCanvas.width = minimapCanvas.clientWidth;
            minimapCanvas.height = minimapCanvas.clientHeight;
        } else {
            console.warn("Minimap canvas not found!");
        }

        gameState.camera.width = canvas.width;
        gameState.camera.height = canvas.height;
        generateParallaxStars();
        // lastCameraX = gameState.camera.x; // Not currently used
        // lastCameraY = gameState.camera.y; // Not currently used
        initialized = true;
        console.log(
            "Renderer initialized with canvas:",
            canvas.width,
            "x",
            canvas.height,
        );
    },

    isInitialized() {
        return initialized;
    },

    updateViewPort(width, height) {
        // canvas.width and height are already set by main.js's resizeCanvas
        // gameState.camera.width and height are also set by main.js's resizeCanvas
        generateParallaxStars(); // Regenerate parallax stars for new viewport size

        // Update minimap canvas size if it's tied to viewport changes (optional)
        if (minimapCanvas) {
            minimapCanvas.width = minimapCanvas.clientWidth;
            minimapCanvas.height = minimapCanvas.clientHeight;
        }
        console.log("Renderer viewport updated:", width, "x", height);
    },

    drawSystemBackground() {
        if (!gameState.myShip || gameState.myShip.system === undefined) {
            ctx.fillStyle = "#000003";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            return;
        }
        const systemData =
            gameState.clientGameData.systems[gameState.myShip.system];
        if (systemData && systemData.backgroundFile) {
            const bgImg = gameState.loadedImages[systemData.backgroundFile];
            if (bgImg) {
                const camX = gameState.camera.x;
                const camY = gameState.camera.y;
                const parallaxFactor = 0.1;

                const imgWidth = bgImg.width;
                const imgHeight = bgImg.height;

                const startX =
                    Math.floor((camX * parallaxFactor) / imgWidth) * imgWidth;
                const startY =
                    Math.floor((camY * parallaxFactor) / imgHeight) * imgHeight;

                ctx.save();
                ctx.translate(
                    -(camX * parallaxFactor),
                    -(camY * parallaxFactor),
                );
                for (
                    let x = startX - imgWidth;
                    x <
                    startX + canvas.width / (1 - parallaxFactor) + imgWidth * 2;
                    x += imgWidth
                ) {
                    for (
                        let y = startY - imgHeight;
                        y <
                        startY +
                            canvas.height / (1 - parallaxFactor) +
                            imgHeight * 2;
                        y += imgHeight
                    ) {
                        ctx.drawImage(bgImg, x, y, imgWidth, imgHeight);
                    }
                }
                ctx.restore();
            } else {
                ctx.fillStyle = systemData.fallbackColor || "#010205";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
        } else {
            ctx.fillStyle = "#000003";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        this.drawParallaxStars();
    },

    drawParallaxStars() {
        const camX = gameState.camera.x;
        const camY = gameState.camera.y;

        PARALLAX_LAYERS.forEach((layer) => {
            ctx.beginPath();
            layer.stars.forEach((star) => {
                const screenX = (star.x - camX * layer.speed) % canvas.width;
                const screenY = (star.y - camY * layer.speed) % canvas.height;
                const finalX = screenX < 0 ? screenX + canvas.width : screenX;
                const finalY = screenY < 0 ? screenY + canvas.height : screenY;
                ctx.moveTo(finalX + star.radius, finalY);
                ctx.arc(finalX, finalY, star.radius, 0, Math.PI * 2);
            });
            ctx.fillStyle = `rgba(255, 255, 240, ${layer.opacity})`; // Use layer's base opacity here, not string literal 'layer.opacity'
            ctx.fill();
        });
    },

    draw() {
        if (!ctx || !initialized) return;
        if (!gameState.myShip) {
            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            return;
        }

        this.drawSystemBackground();

        ctx.save();
        ctx.translate(-gameState.camera.x, -gameState.camera.y);

        if (gameState.myShip.system !== undefined) {
            const currentSystemData =
                gameState.clientGameData.systems[gameState.myShip.system];
            if (currentSystemData && currentSystemData.planets) {
                currentSystemData.planets.forEach((p) => this.drawPlanet(p));
            }

            const now = Date.now();
            gameState.projectiles = gameState.projectiles.filter(
                (p) => now - (p.time || 0) < PROJECTILE_LIFESPAN_MS,
            );
            gameState.projectiles.forEach((p) => this.drawProjectile(p));

            for (const id in gameState.allShips) {
                const ship = gameState.allShips[id];
                if (!ship || ship.system !== gameState.myShip.system) continue;
                this.drawShip(ship);

                if (
                    id !== gameState.myId &&
                    !ship.destroyed &&
                    ship.type !== undefined
                ) {
                    const shipDef =
                        gameState.clientGameData.shipTypes[ship.type];
                    const shipRenderScale = shipDef.scale || 1.0;
                    const labelOffset =
                        shipDef && shipDef.imgHeight
                            ? (shipDef.imgHeight / 2) * shipRenderScale + 10
                            : 25;
                    ctx.fillStyle = ship.color || "#0f0";
                    ctx.font = "12px monospace";
                    ctx.textAlign = "center";
                    const displayName = ship.username || id.substring(0, 6);
                    ctx.fillText(displayName, ship.x, ship.y - labelOffset);
                    ctx.textAlign = "left";
                }
            }
        }
        ctx.restore();
        this.drawHUD();
        // Minimap is drawn on demand when panel is shown/updated by UIManager
    },

    drawPlanet(planet) {
        const img = gameState.loadedImages[planet.imageFile];
        const BASE_PLANET_RENDER_SIZE = 128;
        const scale = planet.planetImageScale || 1.0;
        const renderSize = BASE_PLANET_RENDER_SIZE * scale;

        if (img) {
            ctx.save();
            ctx.drawImage(
                img,
                planet.x - renderSize / 2,
                planet.y - renderSize / 2,
                renderSize,
                renderSize,
            );
            ctx.globalCompositeOperation = "lighter";
            const glowRadius = renderSize * 0.65;
            const gradient = ctx.createRadialGradient(
                planet.x,
                planet.y,
                renderSize * 0.48,
                planet.x,
                planet.y,
                glowRadius,
            );
            gradient.addColorStop(0, `rgba(120, 170, 255, 0.25)`);
            gradient.addColorStop(0.7, `rgba(120, 170, 255, 0.1)`);
            gradient.addColorStop(1, `rgba(120, 170, 255, 0)`);
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(planet.x, planet.y, glowRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = "source-over";
            ctx.restore();
        } else {
            ctx.fillStyle = planet.fallbackColor || "#335577";
            ctx.beginPath();
            ctx.arc(planet.x, planet.y, renderSize / 2, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = "#E0E8FF";
        ctx.font = `${Math.max(10, 12 * scale)}px monospace`;
        ctx.textAlign = "center";
        ctx.shadowColor = "black";
        ctx.shadowBlur = 2;
        ctx.fillText(
            planet.name,
            planet.x,
            planet.y + renderSize / 2 + Math.max(12, 15 * scale),
        );
        ctx.shadowBlur = 0;
        ctx.textAlign = "left";
    },

    drawShip(ship) {
        if (ship.destroyed || ship.type === undefined) return;
        const shipTypeDefinition =
            gameState.clientGameData.shipTypes[ship.type];
        if (!shipTypeDefinition) return;

        const img = gameState.loadedImages[shipTypeDefinition.imageFile];
        const shipScale = shipTypeDefinition.scale || 1.0;

        ctx.save();
        ctx.translate(ship.x, ship.y);
        ctx.rotate(ship.angle);
        if (img) {
            const w = (shipTypeDefinition.imgWidth || img.width) * shipScale;
            const h = (shipTypeDefinition.imgHeight || img.height) * shipScale;
            ctx.drawImage(img, -w / 2, -h / 2, w, h);
        } else {
            ctx.fillStyle = ship.color || "#0f0";
            ctx.beginPath();
            ctx.moveTo(15 * shipScale, 0);
            ctx.lineTo(-10 * shipScale, 8 * shipScale);
            ctx.lineTo(-10 * shipScale, -8 * shipScale);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    },

    drawProjectile(p) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(p.range / 4, 0);
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 5;
        ctx.stroke();
        ctx.restore();
    },

    drawHUD() {
        ctx.font = "14px monospace";
        ctx.fillStyle = "#00FF00";

        if (
            gameState.hyperjumpDeniedMessage &&
            !gameState.isChargingHyperjump
        ) {
            ctx.fillStyle = "red";
            ctx.font = "16px monospace";
            const messageWidth = ctx.measureText(
                gameState.hyperjumpDeniedMessage,
            ).width;
            ctx.fillText(
                gameState.hyperjumpDeniedMessage,
                canvas.width / 2 - messageWidth / 2,
                canvas.height - 60,
            );
            ctx.fillStyle = "#00FF00";
        }

        if (!gameState.myShip || gameState.myShip.destroyed) {
            ctx.fillStyle = "red";
            ctx.font = "24px monospace";
            const msg = "SHIP DESTROYED - AWAITING RESPAWN";
            ctx.textAlign = "center";
            ctx.fillText(msg, canvas.width / 2, canvas.height / 2);
            ctx.textAlign = "left";
            return;
        }

        const myShip = gameState.myShip;
        const currentShipDef =
            gameState.clientGameData.shipTypes[myShip.type || 0];
        if (!currentShipDef) return;

        let cargoCount =
            myShip.cargo && myShip.cargo.length > 0
                ? myShip.cargo.reduce((s, v) => s + v, 0)
                : 0;

        const hudPadding = 15;
        ctx.textAlign = "left";
        ctx.fillText(
            `Pilot: ${gameState.currentUser.username}`,
            hudPadding,
            hudPadding + 14,
        );
        ctx.fillText(
            `Credits: $${myShip.credits.toLocaleString()}`,
            hudPadding,
            hudPadding + 32,
        );
        ctx.fillText(
            `Health: ${myShip.health || 0}/${myShip.maxHealth || 0}`,
            hudPadding,
            hudPadding + 50,
        );
        ctx.fillText(
            `Cargo: ${cargoCount}/${currentShipDef.maxCargo}`,
            hudPadding,
            hudPadding + 68,
        );

        const systemName =
            gameState.clientGameData.systems[myShip.system]?.name ||
            "Unknown System";
        ctx.fillText(`System: ${systemName}`, hudPadding, hudPadding + 86);

        if (myShip.activeWeapon) {
            const weaponDisplayName =
                gameState.clientGameData.weapons[myShip.activeWeapon]?.name ||
                myShip.activeWeapon;
            ctx.fillText(
                `Weapon: ${weaponDisplayName}`,
                hudPadding,
                hudPadding + 104,
            );
        }

        let hudNextY = hudPadding + 138;
        if (myShip.activeMissions && myShip.activeMissions.length > 0) {
            ctx.fillText("Active Missions:", hudPadding, hudNextY);
            hudNextY += 18;
            myShip.activeMissions.slice(0, 3).forEach((mission) => {
                let missionText =
                    mission.title.length > 40
                        ? mission.title.substring(0, 37) + "..."
                        : mission.title;
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
                missionText += ` (${timeRemainingMin}m)`;
                ctx.fillText(`- ${missionText}`, hudPadding + 5, hudNextY);
                hudNextY += 18;
            });
        }

        if (
            gameState.isChargingHyperjump &&
            gameState.hyperjumpChargeStartTime
        ) {
            const chargeProgress = Math.min(
                1,
                (Date.now() - gameState.hyperjumpChargeStartTime) /
                    HYPERJUMP_CHARGE_TIME_MS,
            );
            ctx.fillStyle = "#0af";
            ctx.font = "18px monospace";
            const chargeText = `Hyperdrive Charging: ${Math.round(chargeProgress * 100)}%`;
            const textWidth = ctx.measureText(chargeText).width;
            ctx.textAlign = "center";
            ctx.fillText(chargeText, canvas.width / 2, canvas.height - 80);
            const barWidth = 250;
            const barHeight = 15;
            const barX = canvas.width / 2 - barWidth / 2;
            const barY = canvas.height - 60;
            ctx.strokeStyle = "#0af";
            ctx.lineWidth = 2;
            ctx.strokeRect(barX, barY, barWidth, barHeight);
            ctx.fillRect(
                barX + 2,
                barY + 2,
                (barWidth - 4) * chargeProgress,
                barHeight - 4,
            );
            ctx.fillStyle = "#00FF00";
            ctx.lineWidth = 1;
            ctx.textAlign = "left";
        }

        if (
            !gameState.docked &&
            !gameState.isChargingHyperjump &&
            !gameState.hyperjumpDeniedMessage
        ) {
            const planets =
                gameState.clientGameData.systems[myShip.system]?.planets;
            let canDock = false,
                dockPlanetName = "";
            if (planets) {
                planets.forEach((p) => {
                    const interactionRadiusSq =
                        DOCKING_DISTANCE_SQUARED *
                        Math.pow(p.planetImageScale || 1.0, 2) *
                        2;
                    if (
                        (myShip.x - p.x) ** 2 + (myShip.y - p.y) ** 2 <
                        interactionRadiusSq
                    ) {
                        canDock = true;
                        dockPlanetName = p.name;
                    }
                });
            }
            if (canDock) {
                ctx.font = "16px monospace";
                const dockMsg = `Press 'D' to dock at ${dockPlanetName}`;
                ctx.textAlign = "center";
                ctx.fillText(dockMsg, canvas.width / 2, canvas.height - 30);
                ctx.textAlign = "left";
            }
        }
    },

    drawMinimap() {
        if (
            !minimapCtx ||
            !minimapCanvas ||
            !gameState.myShip ||
            gameState.myShip.system === undefined
        ) {
            if (minimapCtx) {
                // Clear if context exists but cannot draw
                minimapCtx.fillStyle = "#05080a";
                minimapCtx.fillRect(
                    0,
                    0,
                    minimapCanvas.width,
                    minimapCanvas.height,
                );
            }
            return;
        }

        minimapCtx.fillStyle = "#05080a"; // Very dark background
        minimapCtx.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);

        const currentSystemData =
            gameState.clientGameData.systems[gameState.myShip.system];
        if (!currentSystemData || !currentSystemData.planets) return;

        // Determine bounds of the current system to scale to minimap
        let minX = Infinity,
            maxX = -Infinity,
            minY = Infinity,
            maxY = -Infinity;
        currentSystemData.planets.forEach((p) => {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        });
        // Include player ship in bounds calculation
        if (gameState.myShip.x < minX) minX = gameState.myShip.x;
        if (gameState.myShip.x > maxX) maxX = gameState.myShip.x;
        if (gameState.myShip.y < minY) minY = gameState.myShip.y;
        if (gameState.myShip.y > maxY) maxY = gameState.myShip.y;

        const systemWidth = Math.max(500, maxX - minX); // Ensure a minimum extent
        const systemHeight = Math.max(500, maxY - minY);
        const systemCenterX = minX + systemWidth / 2;
        const systemCenterY = minY + systemHeight / 2;

        const mapPadding = 10; // Padding inside the minimap canvas
        const mapDrawableWidth = minimapCanvas.width - 2 * mapPadding;
        const mapDrawableHeight = minimapCanvas.height - 2 * mapPadding;

        const scaleX = mapDrawableWidth / systemWidth;
        const scaleY = mapDrawableHeight / systemHeight;
        const scale = Math.min(scaleX, scaleY) * 0.9; // Use 90% of the smallest scale to ensure fit

        minimapCtx.save();
        minimapCtx.translate(minimapCanvas.width / 2, minimapCanvas.height / 2); // Center the drawing origin

        // Draw planets
        currentSystemData.planets.forEach((p) => {
            const mapX = (p.x - systemCenterX) * scale;
            const mapY = (p.y - systemCenterY) * scale;
            const planetRadius = (p.planetImageScale || 1.0) * 3 * scale + 2; // Scaled radius

            minimapCtx.fillStyle = p.fallbackColor || "#557799";
            minimapCtx.beginPath();
            minimapCtx.arc(
                mapX,
                mapY,
                Math.max(2, planetRadius),
                0,
                Math.PI * 2,
            );
            minimapCtx.fill();

            minimapCtx.fillStyle = "#ccc";
            minimapCtx.font = `${Math.max(6, 8 * scale)}px monospace`;
            minimapCtx.textAlign = "center";
            minimapCtx.fillText(
                p.name.substring(0, 3),
                mapX,
                mapY + planetRadius + 8 * scale,
            );
        });

        // Draw player ship
        const playerMapX = (gameState.myShip.x - systemCenterX) * scale;
        const playerMapY = (gameState.myShip.y - systemCenterY) * scale;
        minimapCtx.fillStyle = "#00FF00"; // Player color
        minimapCtx.beginPath();
        minimapCtx.arc(
            playerMapX,
            playerMapY,
            Math.max(2, 3 * scale),
            0,
            Math.PI * 2,
        ); // Player dot size
        minimapCtx.fill();
        // Simple triangle for player orientation
        minimapCtx.save();
        minimapCtx.translate(playerMapX, playerMapY);
        minimapCtx.rotate(gameState.myShip.angle);
        minimapCtx.beginPath();
        minimapCtx.moveTo(5 * scale, 0);
        minimapCtx.lineTo(-2 * scale, -2 * scale);
        minimapCtx.lineTo(-2 * scale, 2 * scale);
        minimapCtx.closePath();
        minimapCtx.fill();
        minimapCtx.restore();

        minimapCtx.restore();
    },
};

