// hypernova/client/js/renderer.js
import { gameState } from "./game_state.js";
import {
    PROJECTILE_LIFESPAN_MS,
    DOCKING_DISTANCE_SQUARED,
    HYPERJUMP_CHARGE_TIME_MS,
} from "./client_config.js";

let ctx = null;
let canvas = null;
let minimapCanvas = null; 
let minimapCtx = null;
let initialized = false;

const PARALLAX_LAYERS = [
    { speed: 0.05, stars: [], starDensity: 0.000015, minStarSize: 0.2, maxStarSize: 0.7, opacity: 0.4 }, 
    { speed: 0.15, stars: [], starDensity: 0.00003, minStarSize: 0.4, maxStarSize: 1.0, opacity: 0.6 },
    { speed: 0.35, stars: [], starDensity: 0.00005, minStarSize: 0.6, maxStarSize: 1.5, opacity: 0.8 },
];

function getRandom(min, max) {
    return Math.random() * (max - min) + min;
}

function generateParallaxStars() {
    if (!canvas) return;
    PARALLAX_LAYERS.forEach((layer) => {
        layer.stars = [];
        const numStars = Math.floor(canvas.width * canvas.height * layer.starDensity);
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

function simpleHash(str) {
    let hash = 0;
    if (!str) return hash;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; 
    }
    return Math.abs(hash);
}

const placeholderPlanetColors = [
    { base: '#4A90E2', detail: '#357ABD', text: '#FFFFFF' }, { base: '#F5A623', detail: '#D08C1E', text: '#FFFFFF' },
    { base: '#7ED321', detail: '#68B01C', text: '#000000' }, { base: '#BD10E0', detail: '#9D0DB8', text: '#FFFFFF' },
    { base: '#D0021B', detail: '#B00216', text: '#FFFFFF' }, { base: '#8B572A', detail: '#6E4522', text: '#FFFFFF' },
    { base: '#50E3C2', detail: '#30C0A0', text: '#000000' }, { base: '#B8E986', detail: '#90C060', text: '#000000' },
    { base: '#4A4A4A', detail: '#303030', text: '#FFFFFF' }, { base: '#F8E71C', detail: '#D8C00A', text: '#000000' }
];

function generatePlanetPlaceholder(planetName, planetImageFileKey, renderSize) {
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = renderSize;
    offscreenCanvas.height = renderSize;
    const offCtx = offscreenCanvas.getContext('2d');

    const colorIndex = simpleHash(planetImageFileKey) % placeholderPlanetColors.length;
    const colors = placeholderPlanetColors[colorIndex];

    offCtx.fillStyle = colors.base;
    offCtx.beginPath();
    offCtx.arc(renderSize / 2, renderSize / 2, renderSize / 2, 0, Math.PI * 2);
    offCtx.fill();

    offCtx.strokeStyle = colors.detail;
    offCtx.lineWidth = Math.max(1, renderSize * 0.05);
    offCtx.beginPath();
    offCtx.arc(renderSize / 2, renderSize / 2, renderSize / 2 - offCtx.lineWidth / 2, 0, Math.PI * 2);
    offCtx.stroke();

    offCtx.fillStyle = colors.text;
    let fontSize = Math.max(10, renderSize / 8);
    offCtx.font = `bold ${fontSize}px Courier New`;
    offCtx.textAlign = 'center';
    offCtx.textBaseline = 'middle';

    const words = planetName.split(' ');
    let line = '';
    const lines = [];
    const maxWidth = renderSize * 0.8; 
    
    for (let n = 0; n < words.length; n++) {
        let testLine = line + words[n] + ' ';
        let metrics = offCtx.measureText(testLine.trim()); // Use trim for accurate measurement
        let testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0 && line.length > 0) { // Ensure line is not empty before pushing
            lines.push(line.trim());
            line = words[n] + ' ';
        } else {
            line = testLine;
        }
    }
    if (line.trim().length > 0) { // Add remaining line if it's not just whitespace
        lines.push(line.trim());
    }


    const lineHeight = fontSize * 1.1;
    const totalTextHeight = lines.length * lineHeight - (lines.length > 0 ? fontSize * 0.1 : 0) ; // Adjust for no trailing space
    const startY = renderSize / 2 - totalTextHeight / 2 + lineHeight / 2; // Adjust for textBaseline middle


    for (let i = 0; i < lines.length; i++) {
        offCtx.fillText(lines[i], renderSize / 2, startY + i * lineHeight);
    }
    
    return offscreenCanvas;
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
    },

    isInitialized() { return initialized; },

    updateViewPort(width, height) {
        generateParallaxStars();
        if (minimapCanvas) {
            minimapCanvas.width = minimapCanvas.clientWidth;
            minimapCanvas.height = minimapCanvas.clientHeight;
        }
    },

    drawSystemBackground() {
        if (!gameState.myShip || gameState.myShip.system === undefined) {
            ctx.fillStyle = "#000003";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            return;
        }
        const systemData = gameState.clientGameData.systems[gameState.myShip.system];
        if (systemData && systemData.backgroundFile) {
            const bgImg = gameState.loadedImages[systemData.backgroundFile];
            if (bgImg) {
                const camX = gameState.camera.x; const camY = gameState.camera.y;
                const parallaxFactor = 0.1; 
                const imgWidth = bgImg.width; const imgHeight = bgImg.height;
                const startX = Math.floor((camX * parallaxFactor) / imgWidth) * imgWidth;
                const startY = Math.floor((camY * parallaxFactor) / imgHeight) * imgHeight;
                ctx.save();
                ctx.translate(-(camX * parallaxFactor), -(camY * parallaxFactor));
                for (let x = startX - imgWidth; x < startX + canvas.width / (1 - parallaxFactor) + imgWidth * 2; x += imgWidth) {
                    for (let y = startY - imgHeight; y < startY + canvas.height / (1 - parallaxFactor) + imgHeight * 2; y += imgHeight) {
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
        const camX = gameState.camera.x; const camY = gameState.camera.y;
        PARALLAX_LAYERS.forEach((layer) => {
            ctx.beginPath();
            layer.stars.forEach((star) => {
                const parallaxX = star.x - camX * layer.speed;
                const parallaxY = star.y - camY * layer.speed;
                const wrapWidth = canvas.width + canvas.width / layer.speed; 
                const wrapHeight = canvas.height + canvas.height / layer.speed;
                let screenX = parallaxX % wrapWidth; if (screenX < 0) screenX += wrapWidth; screenX %= canvas.width; 
                let screenY = parallaxY % wrapHeight; if (screenY < 0) screenY += wrapHeight; screenY %= canvas.height;
                ctx.moveTo(screenX + star.radius, screenY); 
                ctx.arc(screenX, screenY, star.radius, 0, Math.PI * 2);
            });
            ctx.fillStyle = `rgba(255, 255, 240, ${layer.opacity})`;
            ctx.fill();
        });
    },

    draw() {
        if (!ctx || !initialized || !gameState.myShip) {
            if(ctx) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
            return;
        }
        this.drawSystemBackground();
        ctx.save();
        ctx.translate(-gameState.camera.x, -gameState.camera.y);
        if (gameState.myShip.system !== undefined) {
            const currentSystemData = gameState.clientGameData.systems[gameState.myShip.system];
            if (currentSystemData && currentSystemData.planets) {
                currentSystemData.planets.forEach((p) => this.drawPlanet(p));
            }
            const now = Date.now();
            gameState.projectiles = gameState.projectiles.filter((p) => now - (p.time || 0) < PROJECTILE_LIFESPAN_MS);
            gameState.projectiles.forEach((p) => this.drawProjectile(p));
            for (const id in gameState.allShips) {
                const ship = gameState.allShips[id];
                if (!ship || ship.system !== gameState.myShip.system) continue;
                this.drawShip(ship);
                if (id !== gameState.myId && !ship.destroyed && ship.type !== undefined) {
                    const shipDef = gameState.clientGameData.shipTypes[ship.type];
                    const shipRenderScale = shipDef.scale || 1.0;
                    const labelOffset = shipDef && shipDef.imgHeight ? (shipDef.imgHeight / 2) * shipRenderScale + 10 : 25;
                    ctx.fillStyle = ship.color || "#0f0"; ctx.font = "12px monospace"; ctx.textAlign = "center";
                    const displayName = ship.username || id.substring(0, 6);
                    ctx.fillText(displayName, ship.x, ship.y - labelOffset);
                    ctx.textAlign = "left";
                }
            }
        }
        ctx.restore();
        this.drawHUD();
        this.drawMinimap(); // Moved here, was missing in previous provided full gameLoop
    },

    drawPlanet(planet) {
        const BASE_PLANET_RENDER_SIZE = 128;
        const scale = planet.planetImageScale || 1.0;
        const renderSize = BASE_PLANET_RENDER_SIZE * scale;
        
        const filenameOnly = planet.imageFile && planet.imageFile.startsWith("planets/") 
            ? planet.imageFile.substring("planets/".length) 
            : planet.imageFile; // Handles cases like "planet_temperate.png"

        let planetImageToDraw = gameState.loadedImages[filenameOnly];
        
        if (!planetImageToDraw && planet.imageFile && planet.imageFile.startsWith("planets/")) {
            const placeholderCacheKey = filenameOnly;
            if (!gameState.generatedPlanetPlaceholders[placeholderCacheKey]) {
                // console.log(`Renderer: Generating client-side placeholder for ${planet.name} (key: ${placeholderCacheKey})`);
                gameState.generatedPlanetPlaceholders[placeholderCacheKey] = 
                    generatePlanetPlaceholder(planet.name, placeholderCacheKey, renderSize);
            }
            planetImageToDraw = gameState.generatedPlanetPlaceholders[placeholderCacheKey];
        }

        if (planetImageToDraw) { 
            ctx.save();
            ctx.drawImage(planetImageToDraw, planet.x - renderSize / 2, planet.y - renderSize / 2, renderSize, renderSize);
            if (planetImageToDraw instanceof HTMLImageElement) { 
                ctx.globalCompositeOperation = "lighter"; 
                const glowRadius = renderSize * 0.65; 
                const gradient = ctx.createRadialGradient(planet.x, planet.y, renderSize * 0.48, planet.x, planet.y, glowRadius);
                gradient.addColorStop(0, `rgba(120, 170, 255, 0.25)`); gradient.addColorStop(0.7, `rgba(120, 170, 255, 0.1)`); gradient.addColorStop(1, `rgba(120, 170, 255, 0)`); 
                ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(planet.x, planet.y, glowRadius, 0, Math.PI * 2); ctx.fill();
                ctx.globalCompositeOperation = "source-over"; 
            }
            ctx.restore();
        } else { 
            ctx.fillStyle = planet.fallbackColor || "#335577";
            ctx.beginPath(); ctx.arc(planet.x, planet.y, renderSize / 2, 0, Math.PI * 2); ctx.fill();
        }

        ctx.fillStyle = "#E0E8FF"; ctx.font = `${Math.max(10, 12 * scale)}px monospace`; 
        ctx.textAlign = "center"; ctx.shadowColor = "black"; ctx.shadowBlur = 2;
        ctx.fillText(planet.name, planet.x, planet.y + renderSize / 2 + Math.max(12, 15 * scale));
        ctx.shadowBlur = 0; ctx.textAlign = "left";
    },

    drawShip(ship) {
        if (ship.destroyed || ship.type === undefined) return;
        const shipTypeDefinition = gameState.clientGameData.shipTypes[ship.type];
        if (!shipTypeDefinition) return;
        const img = gameState.loadedImages[shipTypeDefinition.imageFile];
        const shipScale = shipTypeDefinition.scale || 1.0;
        ctx.save(); ctx.translate(ship.x, ship.y); ctx.rotate(ship.angle);
        if (img) {
            const w = (shipTypeDefinition.imgWidth || img.width) * shipScale;
            const h = (shipTypeDefinition.imgHeight || img.height) * shipScale;
            ctx.drawImage(img, -w / 2, -h / 2, w, h);
        } else {
            ctx.fillStyle = ship.color || "#0f0"; ctx.beginPath();
            ctx.moveTo(15 * shipScale, 0); ctx.lineTo(-10 * shipScale, 8 * shipScale); ctx.lineTo(-10 * shipScale, -8 * shipScale);
            ctx.closePath(); ctx.fill();
        }
        if (ship.shield > 0 && ship.maxShield > 0) {
            const shieldRadius = Math.max((shipTypeDefinition.imgWidth || 30) * shipScale * 0.6, (shipTypeDefinition.imgHeight || 30) * shipScale * 0.6);
            const shieldOpacity = Math.min(0.6, (ship.shield / ship.maxShield) * 0.5 + 0.1);
            ctx.beginPath(); ctx.arc(0, 0, shieldRadius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(100, 180, 255, ${shieldOpacity})`; ctx.fill();
        }
        ctx.restore();
    },

    drawProjectile(p) {
        const elapsedTime = (Date.now() - p.time) / 1000.0; 
        const projectileMuzzleSpeed = p.range / (PROJECTILE_LIFESPAN_MS / 1000.0);
        const inheritedVelX = (p.shooterVx || 0) * elapsedTime; // Add default for shooterVx/Vy
        const inheritedVelY = (p.shooterVy || 0) * elapsedTime;
        const muzzleVelX = Math.cos(p.startAngle) * projectileMuzzleSpeed * elapsedTime;
        const muzzleVelY = Math.sin(p.startAngle) * projectileMuzzleSpeed * elapsedTime;
        const currentTipX = p.startX + inheritedVelX + muzzleVelX;
        const currentTipY = p.startY + inheritedVelY + muzzleVelY;
        const visualLength = 15; const projectileWidth = 3; 
        ctx.save(); ctx.translate(currentTipX, currentTipY); ctx.rotate(p.startAngle); 
        ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 7;
        ctx.fillRect(-visualLength, -projectileWidth / 2, visualLength, projectileWidth);
        ctx.restore();
    },

    drawHUD() {
        ctx.font = "14px monospace"; ctx.fillStyle = "#00FF00";
        if (gameState.hyperjumpDeniedMessage && !gameState.isChargingHyperjump) {
            ctx.fillStyle = "red"; ctx.font = "16px monospace";
            const messageWidth = ctx.measureText(gameState.hyperjumpDeniedMessage).width;
            ctx.fillText(gameState.hyperjumpDeniedMessage, canvas.width / 2 - messageWidth / 2, canvas.height - 60);
            ctx.fillStyle = "#00FF00"; 
        }
        if (!gameState.myShip || gameState.myShip.destroyed) {
            ctx.fillStyle = "red"; ctx.font = "24px monospace";
            const msg = "SHIP DESTROYED - AWAITING RESPAWN";
            ctx.textAlign = "center"; ctx.fillText(msg, canvas.width / 2, canvas.height / 2);
            ctx.textAlign = "left"; return;
        }
        const myShip = gameState.myShip;
        const currentShipDef = gameState.clientGameData.shipTypes[myShip.type || 0];
        if (!currentShipDef) return; 
        let cargoCount = myShip.cargo && myShip.cargo.length > 0 ? myShip.cargo.reduce((s, v) => s + v, 0) : 0;
        const hudPadding = 15; let yOffset = hudPadding + 14;
        ctx.textAlign = "left";
        ctx.fillText(`Pilot: ${gameState.currentUser.username}`, hudPadding, yOffset); yOffset += 18;
        ctx.fillText(`Credits: $${myShip.credits.toLocaleString()}`, hudPadding, yOffset); yOffset += 18;
        if (myShip.maxShield > 0) {
            ctx.fillStyle = "#64B4FF"; 
            ctx.fillText(`Shield: ${Math.round(myShip.shield || 0)}/${myShip.maxShield || 0}`, hudPadding, yOffset); yOffset += 18;
            ctx.fillStyle = "#00FF00"; 
        }
        ctx.fillText(`Health: ${myShip.health || 0}/${myShip.maxHealth || 0}`, hudPadding, yOffset); yOffset += 18;
        ctx.fillText(`Cargo: ${cargoCount}/${currentShipDef.maxCargo}`, hudPadding, yOffset); yOffset += 18;
        const systemName = gameState.clientGameData.systems[myShip.system]?.name || "Unknown System";
        ctx.fillText(`System: ${systemName}`, hudPadding, yOffset); yOffset += 18;
        if (myShip.activeWeapon) {
            const weaponDisplayName = gameState.clientGameData.weapons[myShip.activeWeapon]?.name || myShip.activeWeapon;
            ctx.fillText(`Weapon: ${weaponDisplayName}`, hudPadding, yOffset);
        }
        yOffset += 18 + 14; 
        if (myShip.activeMissions && myShip.activeMissions.length > 0) {
            ctx.fillText("Active Missions:", hudPadding, yOffset); yOffset += 18;
            myShip.activeMissions.slice(0, 3).forEach((mission) => {
                let missionText = mission.title.length > 40 ? mission.title.substring(0, 37) + "..." : mission.title;
                if (mission.type === gameState.clientGameData.MISSION_TYPES.BOUNTY) {
                    missionText += ` (${mission.targetsDestroyed || 0}/${mission.targetsRequired})`;
                }
                const timeRemainingMin = Math.max(0, Math.round((mission.timeLimit - Date.now()) / 60000));
                missionText += ` (${timeRemainingMin}m)`;
                ctx.fillText(`- ${missionText}`, hudPadding + 5, yOffset); yOffset += 18;
            });
        }
        if (gameState.isChargingHyperjump && gameState.hyperjumpChargeStartTime) {
            const chargeProgress = Math.min(1, (Date.now() - gameState.hyperjumpChargeStartTime) / HYPERJUMP_CHARGE_TIME_MS);
            ctx.fillStyle = "#0af"; ctx.font = "18px monospace";
            const chargeText = `Hyperdrive Charging: ${Math.round(chargeProgress * 100)}%`;
            const textWidth = ctx.measureText(chargeText).width;
            ctx.textAlign = "center"; ctx.fillText(chargeText, canvas.width / 2, canvas.height - 80);
            const barWidth = 250; const barHeight = 15;
            const barX = canvas.width / 2 - barWidth / 2; const barY = canvas.height - 60;
            ctx.strokeStyle = "#0af"; ctx.lineWidth = 2; ctx.strokeRect(barX, barY, barWidth, barHeight);
            ctx.fillRect(barX + 2, barY + 2, (barWidth - 4) * chargeProgress, barHeight - 4);
            ctx.fillStyle = "#00FF00"; ctx.lineWidth = 1; ctx.textAlign = "left"; 
        }
        let messageDisplayedAtBottom = false; 
        if (gameState.plannedRoute.length > 0 && gameState.currentRouteLegIndex !== -1 && !gameState.docked && !gameState.isChargingHyperjump && !gameState.hyperjumpDeniedMessage) {
            if (gameState.currentRouteLegIndex < gameState.plannedRoute.length) {
                const nextDestSystemIndex = gameState.plannedRoute[gameState.currentRouteLegIndex];
                const nextDestSystem = gameState.clientGameData.systems[nextDestSystemIndex];
                if (nextDestSystem) {
                    ctx.font = "16px monospace"; ctx.fillStyle = "#FFA500"; 
                    const routeMsg = `Next Jump (J): ${nextDestSystem.name}`;
                    ctx.textAlign = "center"; ctx.fillText(routeMsg, canvas.width / 2, canvas.height - 30);
                    messageDisplayedAtBottom = true;
                }
            } else {
                ctx.font = "16px monospace"; ctx.fillStyle = "#00FF00";
                const routeMsg = "Route complete. Press J to clear or plot new.";
                ctx.textAlign = "center"; ctx.fillText(routeMsg, canvas.width / 2, canvas.height - 30);
                messageDisplayedAtBottom = true;
            }
            ctx.textAlign = "left"; ctx.fillStyle = "#00FF00";
        }
        if (!messageDisplayedAtBottom && !gameState.docked && !gameState.isChargingHyperjump && !gameState.hyperjumpDeniedMessage) {
            const planets = gameState.clientGameData.systems[myShip.system]?.planets;
            let canDock = false, dockPlanetName = "";
            if (planets) {
                planets.forEach((p) => {
                    const interactionRadiusSq = DOCKING_DISTANCE_SQUARED * Math.pow(p.planetImageScale || 1.0, 2) * 2;
                    if ((myShip.x - p.x) ** 2 + (myShip.y - p.y) ** 2 < interactionRadiusSq) {
                        canDock = true; dockPlanetName = p.name;
                    }
                });
            }
            if (canDock) {
                ctx.font = "16px monospace";
                const dockMsg = `Press 'D' to dock at ${dockPlanetName}`;
                ctx.textAlign = "center"; ctx.fillText(dockMsg, canvas.width / 2, canvas.height - 30);
            }
            ctx.textAlign = "left"; 
        }
    },

    drawMinimap() {
        if (!minimapCtx || !minimapCanvas || !gameState.myShip || gameState.myShip.system === undefined) {
            if (minimapCtx) { minimapCtx.fillStyle = "#05080a"; minimapCtx.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height); }
            return;
        }
        minimapCtx.fillStyle = "#05080a"; 
        minimapCtx.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);
        const currentSystemData = gameState.clientGameData.systems[gameState.myShip.system];
        if (!currentSystemData || !currentSystemData.planets) return;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        currentSystemData.planets.forEach((p) => {
            if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
        });
        if (gameState.myShip.x < minX) minX = gameState.myShip.x; if (gameState.myShip.x > maxX) maxX = gameState.myShip.x;
        if (gameState.myShip.y < minY) minY = gameState.myShip.y; if (gameState.myShip.y > maxY) maxY = gameState.myShip.y;
        const systemWidth = Math.max(500, maxX - minX); 
        const systemHeight = Math.max(500, maxY - minY);
        const systemCenterX = minX + systemWidth / 2; const systemCenterY = minY + systemHeight / 2;
        const mapPadding = 10; 
        const mapDrawableWidth = minimapCanvas.width - 2 * mapPadding; const mapDrawableHeight = minimapCanvas.height - 2 * mapPadding;
        const scaleX = mapDrawableWidth / systemWidth; const scaleY = mapDrawableHeight / systemHeight;
        const scale = Math.min(scaleX, scaleY) * 0.9; 
        minimapCtx.save();
        minimapCtx.translate(minimapCanvas.width / 2, minimapCanvas.height / 2); 
        currentSystemData.planets.forEach((p) => {
            const mapX = (p.x - systemCenterX) * scale; const mapY = (p.y - systemCenterY) * scale;
            const planetRadius = (p.planetImageScale || 1.0) * 3 * scale + 2; 
            minimapCtx.fillStyle = p.fallbackColor || "#557799"; minimapCtx.beginPath();
            minimapCtx.arc(mapX, mapY, Math.max(2, planetRadius), 0, Math.PI * 2); minimapCtx.fill();
            minimapCtx.fillStyle = "#ccc"; minimapCtx.font = `${Math.max(6, 8 * scale)}px monospace`;
            minimapCtx.textAlign = "center"; minimapCtx.fillText(p.name.substring(0, 3), mapX, mapY + planetRadius + 8 * scale);
        });
        const playerMapX = (gameState.myShip.x - systemCenterX) * scale; const playerMapY = (gameState.myShip.y - systemCenterY) * scale;
        minimapCtx.fillStyle = "#00FF00"; minimapCtx.save();
        minimapCtx.translate(playerMapX, playerMapY); minimapCtx.rotate(gameState.myShip.angle);
        const playerSize = Math.max(2, 4 * scale);
        minimapCtx.beginPath(); minimapCtx.moveTo(playerSize, 0);
        minimapCtx.lineTo(-playerSize / 2, -playerSize / 1.5); minimapCtx.lineTo(-playerSize / 2, playerSize / 1.5);
        minimapCtx.closePath(); minimapCtx.fill(); minimapCtx.restore();
        minimapCtx.restore(); 
    },
};
