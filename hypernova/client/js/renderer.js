// hypernova/client/js/renderer.js
import { gameState } from "./game_state.js";
import {
    // PROJECTILE_LIFESPAN_MS, // DEPRECATED
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
            minimapCanvas.width = minimapCanvas.clientWidth;
            minimapCanvas.height = minimapCanvas.clientHeight;
        } else {
            console.warn("Minimap canvas not found!");
        }

        gameState.camera.width = canvas.width;
        gameState.camera.height = canvas.height;
        generateParallaxStars();
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
        generateParallaxStars();

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
                const parallaxX = star.x - camX * layer.speed;
                const parallaxY = star.y - camY * layer.speed;

                const wrapWidth = canvas.width + canvas.width / layer.speed;
                const wrapHeight = canvas.height + canvas.height / layer.speed;

                let screenX = parallaxX % wrapWidth;
                if (screenX < 0) screenX += wrapWidth;
                screenX %= canvas.width;

                let screenY = parallaxY % wrapHeight;
                if (screenY < 0) screenY += wrapHeight;
                screenY %= canvas.height;

                ctx.moveTo(screenX + star.radius, screenY);
                ctx.arc(screenX, screenY, star.radius, 0, Math.PI * 2);
            });
            ctx.fillStyle = `rgba(255, 255, 240, ${layer.opacity})`;
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

            // Projectiles are now filtered by updateProjectiles in main.js loop
            // But we still need to iterate the current gameState.projectiles for drawing
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
        // NaN Coordinate/Velocity Check - Crucial for preventing drawing errors
        if (isNaN(p.x) || isNaN(p.y) ||
            (p.vx !== undefined && (isNaN(p.vx) || !isFinite(p.vx))) ||
            (p.vy !== undefined && (isNaN(p.vy) || !isFinite(p.vy))) ) {
            console.error("Renderer: Projectile has NaN/Infinite coordinates or velocity:",
                          p.weaponKey, "Pos:", p.x, p.y, "Vel:", p.vx, p.vy);
            return;
        }

        const age = Date.now() - (p.time || 0);
        const lifetimeMs = p.projectileLifetime; // Server now always sends this, and it should be > 0

        if (lifetimeMs <= 0) {
            // This case should ideally not be reached if server sends valid lifetime.
            // It's a safeguard or indicates an issue with server data.
            console.warn("Renderer: Projectile with invalid or zero lifetime received from server:", p.weaponKey, lifetimeMs);
            return;
        }

        let lifeRatio = 1 - (age / lifetimeMs);
        lifeRatio = Math.max(0, Math.min(1, lifeRatio));

        // If lifeRatio is 0, it means the projectile has just expired or is about to be removed.
        // The updateProjectiles function in main.js should handle removal from the array.
        // Here, we just ensure we don't try to draw something that's effectively dead.
        if (lifeRatio <= 0 && age >= lifetimeMs) {
            return;
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);

        const glowColor = p.color || '#FFFFFF';
        const coreColor = '#FFFFFF';

        const muzzleFlashRadius = (p.projectileSize || p.projectileWidth || 2) * 1.5;
        const muzzleFlashAlpha = Math.pow(lifeRatio, 4) * 0.8; // Muzzle flash fades very quickly

        switch (p.projectileType) {
            case 'beam':
            case 'heavy_beam':
                const beamLength = p.range * 0.25;
                const beamWidth = p.projectileWidth || 2;

                if (isNaN(beamLength) || isNaN(beamWidth) || beamLength <=0 || beamWidth <=0) {
                     console.warn("Beam projectile with invalid dimensions:", p.weaponKey, beamLength, beamWidth);
                     ctx.restore(); return;
                }

                ctx.beginPath();
                ctx.arc(0, 0, muzzleFlashRadius, 0, Math.PI * 2);
                ctx.fillStyle = glowColor;
                ctx.globalAlpha = muzzleFlashAlpha;
                ctx.fill();

                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(beamLength, 0);
                ctx.strokeStyle = glowColor;
                ctx.lineWidth = beamWidth * 2.5;
                ctx.globalAlpha = lifeRatio * 0.4;
                ctx.filter = `blur(${beamWidth * 0.5}px)`;
                ctx.stroke();
                ctx.filter = 'none';

                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(beamLength, 0);
                ctx.strokeStyle = coreColor;
                ctx.lineWidth = beamWidth;
                ctx.globalAlpha = lifeRatio * 0.9;
                ctx.stroke();
                break;

            case 'bolt':
            case 'streak':
                const boltSize = p.projectileSize || 4;
                const boltLength = p.projectileType === 'streak' ? boltSize * 3 : boltSize * 1.5;

                if (isNaN(boltSize) || isNaN(boltLength) || boltSize <=0 || boltLength <=0) {
                     console.warn("Bolt/Streak projectile with invalid dimensions:", p.weaponKey, boltSize, boltLength);
                     ctx.restore(); return;
                }

                ctx.beginPath();
                ctx.arc(0, 0, muzzleFlashRadius * 0.8, 0, Math.PI * 2);
                ctx.fillStyle = glowColor;
                ctx.globalAlpha = muzzleFlashAlpha * 0.5;
                ctx.fill();

                ctx.beginPath();
                ctx.ellipse(boltLength / 2, 0, boltLength / 1.5, boltSize / 1.5, 0, 0, Math.PI * 2);
                ctx.fillStyle = glowColor;
                ctx.globalAlpha = lifeRatio * 0.5;
                ctx.filter = `blur(${boltSize * 0.4}px)`;
                ctx.fill();
                ctx.filter = 'none';

                ctx.beginPath();
                ctx.ellipse(boltLength / 2, 0, boltLength / 2, boltSize / 2, 0, 0, Math.PI * 2);
                ctx.fillStyle = coreColor;
                ctx.globalAlpha = lifeRatio;
                ctx.fill();
                break;

            case 'arc':
                const arcRadius = p.range * 0.15;
                const arcWidth = p.projectileWidth || 3;
                 if (isNaN(arcRadius) || isNaN(arcWidth) || arcRadius <=0 || arcWidth <=0) {
                     console.warn("Arc projectile with invalid dimensions:", p.weaponKey, arcRadius, arcWidth);
                     ctx.restore(); return;
                }
                ctx.beginPath();
                ctx.arc(arcRadius * 0.8, 0, arcRadius, -Math.PI / 3, Math.PI / 3);
                ctx.strokeStyle = glowColor;
                ctx.lineWidth = arcWidth + 2;
                ctx.globalAlpha = lifeRatio * 0.5;
                ctx.filter = 'blur(2px)';
                ctx.stroke();
                ctx.filter = 'none';

                ctx.beginPath();
                ctx.arc(arcRadius*0.8, 0, arcRadius, -Math.PI / 3, Math.PI / 3);
                ctx.strokeStyle = coreColor;
                ctx.lineWidth = arcWidth;
                ctx.globalAlpha = lifeRatio;
                ctx.stroke();
                break;

            case 'missile':
            case 'torpedo':
                const bodySize = p.projectileSize || 5;
                const bodyLengthMissile = bodySize * (p.projectileType === 'torpedo' ? 2.5 : 2);
                const trailLength = bodyLengthMissile * 3 * lifeRatio;

                if (isNaN(bodySize) || isNaN(bodyLengthMissile) || bodySize <=0 || bodyLengthMissile <=0) {
                     console.warn("Missile/Torpedo projectile with invalid dimensions:", p.weaponKey, bodySize, bodyLengthMissile);
                     ctx.restore(); return;
                }

                ctx.beginPath();
                ctx.moveTo(-bodyLengthMissile * 0.3, 0);
                ctx.lineTo(-bodyLengthMissile * 0.3 - trailLength, bodySize * 0.6);
                ctx.lineTo(-bodyLengthMissile * 0.3 - trailLength, -bodySize * 0.6);
                ctx.closePath();
                const trailGradient = ctx.createLinearGradient(-bodyLengthMissile*0.3,0, -bodyLengthMissile*0.3 - trailLength, 0);
                trailGradient.addColorStop(0, (p.color||'#FFD700') + 'AA');
                trailGradient.addColorStop(1, (p.color||'#FFD700') + '00');
                ctx.fillStyle = trailGradient;
                ctx.globalAlpha = lifeRatio * 0.8;
                ctx.fill();

                ctx.fillStyle = p.color || '#FFD700';
                ctx.globalAlpha = lifeRatio;
                ctx.fillRect(-bodyLengthMissile/2, -bodySize/2, bodyLengthMissile, bodySize);
                ctx.beginPath();
                ctx.moveTo(bodyLengthMissile/2, -bodySize/2);
                ctx.lineTo(bodyLengthMissile/2 + bodySize*0.5, 0);
                ctx.lineTo(bodyLengthMissile/2, bodySize/2);
                ctx.closePath();
                ctx.fill();
                break;

            case 'mine':
                const mineSize = p.projectileSize || 6;
                if (isNaN(mineSize) || mineSize <=0) {
                     console.warn("Mine projectile with invalid dimensions:", p.weaponKey, mineSize);
                     ctx.restore(); return;
                }
                const blinkSpeed = 500;
                const isLit = Math.floor(age / blinkSpeed) % 2 === 0;

                ctx.beginPath();
                ctx.arc(0,0, mineSize, 0, Math.PI * 2);
                ctx.fillStyle = p.color || '#FF0000';
                ctx.globalAlpha = lifeRatio * (isLit ? 1.0 : 0.5);
                ctx.fill();
                if (isLit) {
                    ctx.strokeStyle = coreColor;
                    ctx.lineWidth = 1;
                    ctx.globalAlpha = lifeRatio;
                    ctx.stroke();
                }
                break;

            case 'drain_field':
                const fieldRadius = p.projectileSize || 10;
                 if (isNaN(fieldRadius) || fieldRadius <=0) {
                     console.warn("Drain_field projectile with invalid dimensions:", p.weaponKey, fieldRadius);
                     ctx.restore(); return;
                }
                 ctx.beginPath();
                 ctx.arc(0,0, fieldRadius * lifeRatio, 0, Math.PI*2);
                 ctx.fillStyle = p.color || '#44FF44';
                 ctx.globalAlpha = lifeRatio * 0.3;
                 ctx.fill();
                 ctx.strokeStyle = coreColor;
                 ctx.lineWidth = 1;
                 ctx.globalAlpha = lifeRatio * 0.5;
                 ctx.stroke();
                break;

            default:
                const length = (p.range || 10) / 4;
                if (isNaN(length) || length <=0) {
                     console.warn("Default projectile with invalid dimensions:", p.weaponKey, length);
                     ctx.restore(); return;
                }
                ctx.strokeStyle = p.color || '#FFFFFF';
                ctx.lineWidth = 3;
                ctx.globalAlpha = lifeRatio;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(length, 0);
                ctx.stroke();
                break;
        }
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
        let hudY = hudPadding + 14;
        ctx.textAlign = "left";

        ctx.fillText(`Pilot: ${gameState.currentUser.username}`, hudPadding, hudY); hudY += 18;
        ctx.fillText(`Credits: $${myShip.credits.toLocaleString()}`, hudPadding, hudY); hudY += 18;
        ctx.fillText(`Health: ${myShip.health || 0}/${myShip.maxHealth || 0}`, hudPadding, hudY); hudY += 18;
        ctx.fillText(`Cargo: ${cargoCount}/${currentShipDef.maxCargo}`, hudPadding, hudY); hudY += 18;

        const systemName = gameState.clientGameData.systems[myShip.system]?.name || "Unknown System";
        ctx.fillText(`System: ${systemName}`, hudPadding, hudY); hudY += 18;

        // Primary Weapon Display
        if (myShip.activeWeapon) {
            const weaponDef = gameState.clientGameData.weapons[myShip.activeWeapon];
            const weaponDisplayName = weaponDef ? weaponDef.name : myShip.activeWeapon;
            ctx.fillText(`Primary: ${weaponDisplayName}`, hudPadding, hudY);
        } else {
            ctx.fillText(`Primary: None`, hudPadding, hudY);
        }
        hudY += 18;

        // Secondary Weapon Display
        if (gameState.activeSecondaryWeaponSlot !== -1 && myShip.secondaryWeapons && myShip.secondaryWeapons.length > 0) {
            const secondaryKey = myShip.secondaryWeapons[gameState.activeSecondaryWeaponSlot];
            if (secondaryKey) {
                const weaponDef = gameState.clientGameData.weapons[secondaryKey];
                const weaponDisplayName = weaponDef ? weaponDef.name : secondaryKey;
                const ammoCount = myShip.secondaryAmmo[secondaryKey] || 0;
                ctx.fillText(`Secondary: ${weaponDisplayName} [${ammoCount}]`, hudPadding, hudY);
            } else {
                 ctx.fillText(`Secondary: Error - Slot Invalid`, hudPadding, hudY);
            }
        } else {
            ctx.fillText(`Secondary: None Selected`, hudPadding, hudY);
        }
        hudY += 18;


        // Active Missions (simplified for main HUD)
        if (myShip.activeMissions && myShip.activeMissions.length > 0) {
            hudY += 10; // Little gap
            ctx.fillText("Active Missions:", hudPadding, hudY);
            hudY += 18;
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
                ctx.fillText(`- ${missionText}`, hudPadding + 5, hudY);
                hudY += 18;
            });
        }

        // Hyperjump Charge Bar
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

        let messageDisplayedAtBottom = false;

        if (
            gameState.plannedRoute.length > 0 &&
            gameState.currentRouteLegIndex !== -1 &&
            !gameState.docked &&
            !gameState.isChargingHyperjump &&
            !gameState.hyperjumpDeniedMessage
        ) {
            if (
                gameState.currentRouteLegIndex < gameState.plannedRoute.length
            ) {
                const nextDestSystemIndex =
                    gameState.plannedRoute[gameState.currentRouteLegIndex];
                const nextDestSystem =
                    gameState.clientGameData.systems[nextDestSystemIndex];
                if (nextDestSystem) {
                    ctx.font = "16px monospace";
                    ctx.fillStyle = "#FFA500";
                    const routeMsg = `Next Jump (J): ${nextDestSystem.name}`;
                    ctx.textAlign = "center";
                    ctx.fillText(
                        routeMsg,
                        canvas.width / 2,
                        canvas.height - 30,
                    );
                    messageDisplayedAtBottom = true;
                }
            } else {
                ctx.font = "16px monospace";
                ctx.fillStyle = "#00FF00";
                const routeMsg =
                    "Route complete. Press J to clear or plot new.";
                ctx.textAlign = "center";
                ctx.fillText(routeMsg, canvas.width / 2, canvas.height - 30);
                messageDisplayedAtBottom = true;
            }
            ctx.textAlign = "left";
            ctx.fillStyle = "#00FF00";
        }

        if (
            !messageDisplayedAtBottom &&
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
                messageDisplayedAtBottom = true;
            }
            ctx.textAlign = "left";
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

        minimapCtx.fillStyle = "#05080a";
        minimapCtx.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);

        const currentSystemData =
            gameState.clientGameData.systems[gameState.myShip.system];
        if (!currentSystemData || !currentSystemData.planets) return;

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
        if (gameState.myShip.x < minX) minX = gameState.myShip.x;
        if (gameState.myShip.x > maxX) maxX = gameState.myShip.x;
        if (gameState.myShip.y < minY) minY = gameState.myShip.y;
        if (gameState.myShip.y > maxY) maxY = gameState.myShip.y;

        const systemWidth = Math.max(500, maxX - minX);
        const systemHeight = Math.max(500, maxY - minY);
        const systemCenterX = minX + systemWidth / 2;
        const systemCenterY = minY + systemHeight / 2;

        const mapPadding = 10;
        const mapDrawableWidth = minimapCanvas.width - 2 * mapPadding;
        const mapDrawableHeight = minimapCanvas.height - 2 * mapPadding;

        const scaleX = mapDrawableWidth / systemWidth;
        const scaleY = mapDrawableHeight / systemHeight;
        const scale = Math.min(scaleX, scaleY) * 0.9;

        minimapCtx.save();
        minimapCtx.translate(minimapCanvas.width / 2, minimapCanvas.height / 2);

        currentSystemData.planets.forEach((p) => {
            const mapX = (p.x - systemCenterX) * scale;
            const mapY = (p.y - systemCenterY) * scale;
            const planetRadius = (p.planetImageScale || 1.0) * 3 * scale + 2;

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

        const playerMapX = (gameState.myShip.x - systemCenterX) * scale;
        const playerMapY = (gameState.myShip.y - systemCenterY) * scale;
        minimapCtx.fillStyle = "#00FF00";
        minimapCtx.save();
        minimapCtx.translate(playerMapX, playerMapY);
        minimapCtx.rotate(gameState.myShip.angle);
        const playerSize = Math.max(2, 4 * scale);
        minimapCtx.beginPath();
        minimapCtx.moveTo(playerSize, 0);
        minimapCtx.lineTo(-playerSize / 2, -playerSize / 1.5);
        minimapCtx.lineTo(-playerSize / 2, playerSize / 1.5);
        minimapCtx.closePath();
        minimapCtx.fill();
        minimapCtx.restore();

        minimapCtx.restore();
    },
};

