// server/modules/combat_manager.js
class CombatManager {
    constructor(io, playerManager, missionManager, weaponsData, gameConfig) {
        this.io = io;
        this.playerManager = playerManager;
        this.missionManager = missionManager;
        this.weaponsData = weaponsData; // This is gameConfig.staticWeaponsData (which is staticData.weapons)
        this.gameConfig = gameConfig;
    }

    _canFire(player, weaponKey, isPrimary) {
        if (
            !player ||
            !weaponKey ||
            player.destroyed ||
            player.dockedAtPlanetIdentifier ||
            player.hyperjumpState === "charging"
        ) {
            if (player && player.hyperjumpState === "charging") {
                this.io.to(player.id).emit("actionFailed", {
                    message: "Cannot fire weapons while hyperdrive is charging.",
                });
            }
            return false;
        }

        const weaponStats = this.weaponsData[weaponKey];
        if (!weaponStats) return false;

        const now = Date.now();
        const fireDelay = 60000 / (weaponStats.rpm || 60); //ms
        const lastShotTimestamp = isPrimary ? player.lastPrimaryShotTimestamp : player.lastSecondaryShotTimestamp;

        if (now - lastShotTimestamp < fireDelay) {
            // console.log(`Weapon ${weaponKey} on cooldown for ${player.id}`);
            return false; // Weapon on cooldown
        }

        if (!isPrimary) { // Secondary weapon ammo check
            if (!player.secondaryAmmo[weaponKey] || player.secondaryAmmo[weaponKey] <= 0) {
                this.io.to(player.id).emit("actionFailed", { message: `No ammo for ${weaponStats.name}.` });
                return false;
            }
        }
        return true;
    }

    _proces(attacker, target, weaponStats, weaponKey) {
        let damageDealt = weaponStats.damage || 0;
        damageDealt *= (weaponStats.shieldDamageMultiplier || 1.0);

        target.health -= damageDealt;
        let targetDestroyedThisShot = false;

        if (target.health > 0 && target.hyperjumpState === "charging") {
            this.playerManager.handlePlayerHitDuringHyperjumpCharge(target.id);
        }

        if (target.health <= 0) {
            target.health = 0;
            target.destroyed = true;
            targetDestroyedThisShot = true;

            if (target.hyperjumpState === "charging" && target.hyperjumpChargeTimeoutId) {
                clearTimeout(target.hyperjumpChargeTimeoutId);
                target.hyperjumpChargeTimeoutId = null;
                target.hyperjumpState = "idle";
            }
            console.log(`Player ${target.id} destroyed by ${attacker.id} with ${weaponKey}`);
        }

        this.playerManager.updatePlayerState(target.id, {
            health: target.health,
            destroyed: target.destroyed,
            hyperjumpState: target.hyperjumpState,
        });

        if (targetDestroyedThisShot) {
            this.missionManager.handleTargetDestroyed(attacker, target);
        }
    }

    _emitProjectile(attacker, weaponKey, weaponStats) {
        const attackerShipDef = this.playerManager.shipTypes[attacker.type];
        if (!attackerShipDef) {
            console.error(`CombatManager: Attacker ${attacker.id} has invalid ship type ${attacker.type}`);
            return;
        }
        const shipScale = attackerShipDef.scale || 1.0;
        // Use imgWidth as a basis for forward offset, assuming ships are point-forward or square
        // A more sophisticated system might use hardpoint definitions from shipType
        const forwardOffset = (attackerShipDef.imgWidth / 2) * shipScale * 1.2; // Push it slightly more forward

        const projectileStartX = attacker.x + forwardOffset * Math.cos(attacker.angle);
        const projectileStartY = attacker.y + forwardOffset * Math.sin(attacker.angle);

        let projectileSpeedComponentX = 0;
        let projectileSpeedComponentY = 0;
        const actualProjectileSpeed = weaponStats.projectileSpeed || 0;

        // For non-beam projectiles, add their own speed vector to the ship's velocity vector
        if (actualProjectileSpeed > 0) {
            projectileSpeedComponentX = actualProjectileSpeed * Math.cos(attacker.angle);
            projectileSpeedComponentY = actualProjectileSpeed * Math.sin(attacker.angle);
        }

        const projectileInitialVx = attacker.vx + projectileSpeedComponentX;
        const projectileInitialVy = attacker.vy + projectileSpeedComponentY;

        // Calculate lifetime
        let lifetimeMs = weaponStats.projectileLifetime; // ms from JSON definition
        if (!lifetimeMs || lifetimeMs <= 0) { // If 0 or undefined in JSON, calculate or use default
            if (actualProjectileSpeed > 0 && weaponStats.range > 0) {
                // (range / speed) is effectively "frames" or "updates" to reach range
                // Multiply by typical ms per update (e.g., 1000ms / 60 updates = 16.67ms/update)
                lifetimeMs = (weaponStats.range / actualProjectileSpeed) * (1000 / 60); // Approx for 60 updates/sec
            } else {
                // For beams (speed 0) or projectiles with no range/speed to calculate from
                const isBeamType = weaponStats.projectileType === 'beam' ||
                                   weaponStats.projectileType === 'heavy_beam' ||
                                   weaponStats.projectileType === 'arc';
                lifetimeMs = isBeamType ? 200 : 1000; // Default short visual persistence for beams, longer for others
            }
        }
        if (lifetimeMs <= 0) lifetimeMs = 150; // Absolute fallback minimum lifetime

        const projectileData = {
            shooterId: attacker.id,
            weaponKey: weaponKey,
            x: projectileStartX,        // Initial position X, offset from ship center
            y: projectileStartY,        // Initial position Y, offset from ship center
            vx: projectileInitialVx,    // Initial velocity X (ship_vx + proj_vx)
            vy: projectileInitialVy,    // Initial velocity Y (ship_vy + proj_vy)
            angle: attacker.angle,      // Firing angle, for visual orientation of projectile
            color: weaponStats.color,
            projectileLifetime: lifetimeMs, // Calculated lifetime in ms
        };

        const systemPlayers = Object.values(this.playerManager.getAllPlayers()).filter(
            (p) => p.system === attacker.system,
        );
        systemPlayers.forEach((p) => {
            this.io.to(p.id).emit("projectile", projectileData);
        });
    }


    registerSocketHandlers(socket) {
        socket.on("firePrimary", () => {
            const attacker = this.playerManager.getPlayer(socket.id);
            if (!attacker || !attacker.activeWeapon) return;

            const weaponKey = attacker.activeWeapon;
            if (!this._canFire(attacker, weaponKey, true)) return;

            const weaponStats = this.weaponsData[weaponKey];
            if (!weaponStats) return;
            attacker.lastPrimaryShotTimestamp = Date.now();

            // Simplified Hitscan for primary weapons
            const fwdX = Math.cos(attacker.angle);
            const fwdY = Math.sin(attacker.angle);
            // beamAngleWidth could be derived from weaponStats if needed, e.g. weaponStats.spreadAngle
            const beamAngleWidth = (weaponStats.projectileWidth || 2) * 0.05 + 0.02; // Approximation for spread, small tolerance

            const allPlayers = this.playerManager.getAllPlayers();
            for (const targetId in allPlayers) {
                if (targetId === socket.id) continue;
                const target = allPlayers[targetId];
                if (!target || target.system !== attacker.system || target.destroyed || target.dockedAtPlanetIdentifier) continue;

                const dx = target.x - attacker.x; // Ray origin is attacker's center for hitscan
                const dy = target.y - attacker.y;
                const dist = Math.hypot(dx, dy);

                if (dist === 0 || dist > weaponStats.range) continue;

                const dirToTargetX = dx / dist;
                const dirToTargetY = dy / dist;
                const dotProduct = fwdX * dirToTargetX + fwdY * dirToTargetY;
                const angleToTarget = Math.acos(Math.max(-1, Math.min(1, dotProduct))); // Clamp dotProduct for acos

                if (angleToTarget > beamAngleWidth / 2) continue; // Check if within weapon's cone/spread

                this._proces(attacker, target, weaponStats, weaponKey);
                break; // Primary weapons usually hit one target per shot instance
            }
            this._emitProjectile(attacker, weaponKey, weaponStats);
        });

        socket.on("fireSecondary", ({ weaponKey }) => {
            const attacker = this.playerManager.getPlayer(socket.id);
            if (!attacker || !weaponKey) return;

            if (!attacker.secondaryWeapons.includes(weaponKey)) {
                 this.io.to(attacker.id).emit("actionFailed", { message: `Weapon ${weaponKey} not equipped.` });
                return;
            }

            if (!this._canFire(attacker, weaponKey, false)) return;

            const weaponStats = this.weaponsData[weaponKey];
            if (!weaponStats) return;
            attacker.lastSecondaryShotTimestamp = Date.now();
            attacker.secondaryAmmo[weaponKey]--;

            this.playerManager.updatePlayerState(socket.id, { secondaryAmmo: attacker.secondaryAmmo });


            // Simplified Hitscan for secondary target acquisition
            const fwdX = Math.cos(attacker.angle);
            const fwdY = Math.sin(attacker.angle);
            const aimAssistAngle = 0.15; // Radians, wider cone for secondaries (approx 8.5 degrees)

            const allPlayers = this.playerManager.getAllPlayers();
            let hitTarget = null;

            for (const targetId in allPlayers) {
                if (targetId === socket.id) continue;
                const target = allPlayers[targetId];
                if (!target || target.system !== attacker.system || target.destroyed || target.dockedAtPlanetIdentifier) continue;

                const dx = target.x - attacker.x;
                const dy = target.y - attacker.y;
                const dist = Math.hypot(dx, dy);

                if (dist === 0 || dist > weaponStats.range) continue;

                const dirToTargetX = dx / dist;
                const dirToTargetY = dy / dist;
                const dotProduct = fwdX * dirToTargetX + fwdY * dirToTargetY;
                const angleToTarget = Math.acos(Math.max(-1, Math.min(1, dotProduct))); // Clamp dotProduct

                if (angleToTarget <= aimAssistAngle) {
                    if (!hitTarget || dist < Math.hypot(hitTarget.x - attacker.x, hitTarget.y - attacker.y)) {
                         hitTarget = target; // Prefer closer target within cone
                    }
                }
            }
            // If no target found in cone, some missiles might still fire straight
            // For now, we require a target in cone for simplicity of hit processing

            if (hitTarget) {
                if (weaponStats.blastRadius && weaponStats.blastRadius > 0) {
                    // Apply AoE around the hitTarget
                    for (const pId in allPlayers) {
                        const potentialAoETarget = allPlayers[pId];
                        if (!potentialAoETarget || potentialAoETarget.system !== attacker.system || potentialAoETarget.destroyed || potentialAoETarget.dockedAtPlanetIdentifier) continue;

                        const distToImpact = Math.hypot(potentialAoETarget.x - hitTarget.x, potentialAoETarget.y - hitTarget.y);
                        if (distToImpact <= weaponStats.blastRadius) {
                            this._proces(attacker, potentialAoETarget, weaponStats, weaponKey);
                        }
                    }
                } else {
                    // Single target hit
                    this._proces(attacker, hitTarget, weaponStats, weaponKey);
                }
            }
            // Emit projectile regardless of hit for visual effect (e.g. missile flies even if it misses)
            this._emitProjectile(attacker, weaponKey, weaponStats);
        });
    }
}

module.exports = CombatManager;

