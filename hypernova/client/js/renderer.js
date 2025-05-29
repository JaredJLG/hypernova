// hypernova/client/js/renderer.js
import { gameState } from "./game_state.js";
import {
    PROJECTILE_LIFESPAN_MS,
    DOCKING_DISTANCE_SQUARED,
} from "./client_config.js";

let ctx = null;
let canvas = null;
const DEFAULT_PLANET_RADIUS = 20; // Default visual radius if image fails or for placeholder
const DEFAULT_PLANET_IMAGE_SIZE = 64; // Assumed default render size for planet images

export const Renderer = {
    init(canvasElement) {
        canvas = canvasElement;
        ctx = canvas.getContext("2d");
        canvas.width = 800;
        canvas.height = 600;
    },

    draw() {
        if (!ctx || !gameState.myShip) {
            return;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = "12px monospace";

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
                const shipDef = gameState.clientGameData.shipTypes[ship.type];
                const labelOffset =
                    shipDef && shipDef.imgHeight
                        ? shipDef.imgHeight / 2 + 5
                        : 15; // Adjust label based on image height
                ctx.fillText(
                    id.substring(0, 6),
                    ship.x - 10,
                    ship.y - labelOffset,
                );
            }
        }

        this.drawHUD();
    },

    drawPlanet(planet) {
        // planet.imageFile should be just the filename, e.g., "planet_alpha.png"
        const img = gameState.loadedImages[planet.imageFile];

        if (img) {
            const w = DEFAULT_PLANET_IMAGE_SIZE; // Or use img.width if you want original size
            const h = DEFAULT_PLANET_IMAGE_SIZE; // Or use img.height
            ctx.drawImage(img, planet.x - w / 2, planet.y - h / 2, w, h);
        } else {
            ctx.fillStyle = "#080"; // Fallback color
            ctx.beginPath();
            ctx.arc(planet.x, planet.y, DEFAULT_PLANET_RADIUS, 0, Math.PI * 2);
            ctx.fill();
            if (planet.imageFile) {
                // Only warn if an imageFile was specified but not loaded
                // console.warn(`Image not found or loaded for planet: ${planet.name} (${planet.imageFile})`);
            }
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
        if (!shipTypeDefinition) {
            // console.warn(`Ship type definition not found for ship.type: ${ship.type}`);
            return;
        }

        // shipTypeDefinition.imageFile should be just the filename
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
            if (shipTypeDefinition.imageFile) {
                // console.warn(`Image not found or loaded for ship type: ${shipTypeDefinition.name} (${shipTypeDefinition.imageFile})`);
            }
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
        if (!gameState.myShip || gameState.myShip.destroyed) return;

        const myShip = gameState.myShip;
        const currentShipDef =
            gameState.clientGameData.shipTypes[myShip.type || 0];
        if (!currentShipDef) {
            return;
        }

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

        let hudNextY = 116;
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

        if (
            !gameState.docked &&
            gameState.clientGameData.systems[myShip.system] &&
            gameState.clientGameData.systems[myShip.system].planets
        ) {
            const planets =
                gameState.clientGameData.systems[myShip.system].planets;
            let canDock = false,
                dockPlanetName = "";
            planets.forEach((p) => {
                if (
                    (myShip.x - p.x) ** 2 + (myShip.y - p.y) ** 2 <
                    DOCKING_DISTANCE_SQUARED
                ) {
                    canDock = true;
                    dockPlanetName = p.name;
                }
            });
            if (canDock) {
                ctx.fillText(
                    `Press 'D' to dock at ${dockPlanetName}`,
                    canvas.width / 2 - 100,
                    canvas.height - 20,
                );
            }
        }
    },
};
