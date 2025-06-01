// hypernova/client/js/renderer.js
import { gameState } from "./game_state.js";
import {
    PROJECTILE_LIFESPAN_MS,
    DOCKING_DISTANCE_SQUARED,
    HYPERJUMP_CHARGE_TIME_MS,
} from "./client_config.js";

let ctx = null;
let canvas = null;
const DEFAULT_PLANET_RADIUS = 20;
const DEFAULT_PLANET_IMAGE_SIZE = 64;

export const Renderer = {
    init(canvasElement) {
        canvas = canvasElement;
        ctx = canvas.getContext("2d");
        canvas.width = 800;
        canvas.height = 600;
    },

    draw() {
        if (!ctx) {
            // Removed !gameState.myShip from here, HUD handles destroyed state message
            return;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = "12px monospace";

        // Draw planets, projectiles, ships only if myShip exists and has a system
        if (gameState.myShip && gameState.myShip.system !== undefined) {
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
                    ctx.fillStyle = ship.color || "#0f0";
                    const shipDef =
                        gameState.clientGameData.shipTypes[ship.type];
                    const labelOffset =
                        shipDef && shipDef.imgHeight
                            ? shipDef.imgHeight / 2 + 5
                            : 15;
                    ctx.fillText(
                        id.substring(0, 6),
                        ship.x - 10,
                        ship.y - labelOffset,
                    );
                }
            }
        }
        this.drawHUD(); // HUD draws regardless of myShip existence for some messages
    },

    drawPlanet(planet) {
        const img = gameState.loadedImages[planet.imageFile];
        if (img) {
            const w = DEFAULT_PLANET_IMAGE_SIZE;
            const h = DEFAULT_PLANET_IMAGE_SIZE;
            ctx.drawImage(img, planet.x - w / 2, planet.y - h / 2, w, h);
        } else {
            ctx.fillStyle = "#080";
            ctx.beginPath();
            ctx.arc(planet.x, planet.y, DEFAULT_PLANET_RADIUS, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = "#0f0";
        ctx.fillText(
            planet.name,
            planet.x + DEFAULT_PLANET_RADIUS + 5,
            planet.y + 4,
        );
    },

    drawShip(ship) {
        if (ship.destroyed || ship.type === undefined) return;
        const shipTypeDefinition =
            gameState.clientGameData.shipTypes[ship.type];
        if (!shipTypeDefinition) return;

        const img = gameState.loadedImages[shipTypeDefinition.imageFile];
        ctx.save();
        ctx.translate(ship.x, ship.y);
        ctx.rotate(ship.angle);
        if (img) {
            const w = shipTypeDefinition.imgWidth || img.width;
            const h = shipTypeDefinition.imgHeight || img.height;
            ctx.drawImage(img, -w / 2, -h / 2, w, h);
        } else {
            ctx.fillStyle = ship.color || "#0f0";
            ctx.beginPath();
            ctx.moveTo(15, 0);
            ctx.lineTo(-10, 8);
            ctx.lineTo(-10, -8);
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
        ctx.stroke();
        ctx.restore();
    },

    drawHUD() {
        // Handle hyperjump denied message even if ship is destroyed or doesn't exist yet
        if (
            gameState.hyperjumpDeniedMessage &&
            !gameState.isChargingHyperjump
        ) {
            // Don't show denied if actively charging
            ctx.fillStyle = "red";
            ctx.font = "14px monospace";
            const messageWidth = ctx.measureText(
                gameState.hyperjumpDeniedMessage,
            ).width;
            ctx.fillText(
                gameState.hyperjumpDeniedMessage,
                canvas.width / 2 - messageWidth / 2,
                canvas.height - 50,
            );
        }

        if (!gameState.myShip || gameState.myShip.destroyed) {
            // Potentially a "You are destroyed" message here
            return;
        }

        const myShip = gameState.myShip;
        const currentShipDef =
            gameState.clientGameData.shipTypes[myShip.type || 0];
        if (!currentShipDef) return;

        let cargoCount =
            myShip.cargo && myShip.cargo.length > 0
                ? myShip.cargo.reduce((sum, val) => sum + val, 0)
                : 0;

        ctx.fillStyle = "#0f0";
        ctx.fillText(`Credits $${myShip.credits}`, 10, 20);
        ctx.fillText(
            `Health ${myShip.health || 0}/${myShip.maxHealth || 0}`,
            10,
            36,
        );
        ctx.fillText(`Cargo ${cargoCount}/${currentShipDef.maxCargo}`, 10, 52);

        const systemName =
            gameState.clientGameData.systems[myShip.system]?.name ||
            "Unknown System";
        ctx.fillText(`System: ${systemName}`, 10, 68);

        if (myShip.activeWeapon) {
            const weaponDisplayName =
                gameState.clientGameData.weapons[myShip.activeWeapon]?.name ||
                myShip.activeWeapon;
            ctx.fillText(`Weapon: ${weaponDisplayName}`, 10, 84);
        }

        let hudNextY = 116; // Adjusted Y for mission text
        if (myShip.activeMissions && myShip.activeMissions.length > 0) {
            ctx.fillText("Active Missions:", 10, hudNextY);
            hudNextY += 16;
            myShip.activeMissions.slice(0, 3).forEach((mission) => {
                let missionText =
                    mission.title.length > 35
                        ? mission.title.substring(0, 32) + "..."
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
                ctx.fillText(`- ${missionText}`, 15, hudNextY);
                hudNextY += 16;
            });
        }

        // Hyperjump Charging Status
        if (
            gameState.isChargingHyperjump &&
            gameState.hyperjumpChargeStartTime
        ) {
            const chargeProgress = Math.min(
                1,
                (Date.now() - gameState.hyperjumpChargeStartTime) /
                    HYPERJUMP_CHARGE_TIME_MS,
            );
            ctx.fillStyle = "#0af"; // Light blue for charging
            ctx.font = "16px monospace";
            const chargeText = `Hyperdrive Charging: ${Math.round(chargeProgress * 100)}%`;
            const textWidth = ctx.measureText(chargeText).width;
            ctx.fillText(
                chargeText,
                canvas.width / 2 - textWidth / 2,
                canvas.height - 70,
            );

            const barWidth = 200;
            const barHeight = 10;
            const barX = canvas.width / 2 - barWidth / 2;
            const barY = canvas.height - 55; // Adjusted bar Y
            ctx.strokeStyle = "#0af";
            ctx.strokeRect(barX, barY, barWidth, barHeight);
            ctx.fillRect(barX, barY, barWidth * chargeProgress, barHeight);
            ctx.fillStyle = "#0f0"; // Reset fillStyle for other HUD elements
        }

        // Docking message (ensure it doesn't overlap with hyperjump messages)
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
                    if (
                        (myShip.x - p.x) ** 2 + (myShip.y - p.y) ** 2 <
                        DOCKING_DISTANCE_SQUARED
                    ) {
                        canDock = true;
                        dockPlanetName = p.name;
                    }
                });
            }
            if (canDock) {
                ctx.fillStyle = "#0f0";
                ctx.font = "12px monospace";
                ctx.fillText(
                    `Press 'D' to dock at ${dockPlanetName}`,
                    canvas.width / 2 - 100,
                    canvas.height - 20,
                );
            }
        }
    },
};
