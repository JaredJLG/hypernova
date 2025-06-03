// server/modules/combat_manager.js
class CombatManager {
    constructor(io, playerManager, missionManager, weaponsData, gameConfig) {
        this.io = io;
        this.playerManager = playerManager;
        this.missionManager = missionManager;
        this.weaponsData = weaponsData;
        this.gameConfig = gameConfig;
    }

    registerSocketHandlers(socket) {
        socket.on("fire", () => {
            const attacker = this.playerManager.getPlayer(socket.id);
            if (
                !attacker ||
                !attacker.activeWeapon ||
                attacker.destroyed ||
                attacker.dockedAtPlanetIdentifier ||
                attacker.hyperjumpState === "charging"
            ) {
                if (attacker && attacker.hyperjumpState === "charging") {
                    socket.emit("actionFailed", {
                        message:
                            "Cannot fire weapons while hyperdrive is charging.",
                    });
                }
                return;
            }

            const weaponStats = this.weaponsData[attacker.activeWeapon];
            if (!weaponStats) return;

            const now = Date.now();
            const timeSinceLastShot = now - (attacker.lastShot || 0);
            const minTimeBetweenShots = 60000 / weaponStats.rpm;
            if (timeSinceLastShot < minTimeBetweenShots) {
                return; 
            }
            attacker.lastShot = now; 


            const numBarrels = weaponStats.barrels || 1;
            const baseBarrelOffset = weaponStats.barrelOffset || 0; 

            for (let i = 0; i < numBarrels; i++) {
                let shotAngle = attacker.angle;
                let shotOriginX = attacker.x;
                let shotOriginY = attacker.y;

                if (numBarrels > 1 && baseBarrelOffset > 0) {
                    let actualOffsetMagnitude = 0;
                    if (numBarrels === 2) {
                        actualOffsetMagnitude = (i === 0) ? -baseBarrelOffset : baseBarrelOffset;
                    } else {
                         actualOffsetMagnitude = (i === 0) ? -baseBarrelOffset : baseBarrelOffset; 
                    }

                    if (actualOffsetMagnitude !== 0) { 
                        const perpendicularAngle = attacker.angle + Math.PI / 2; 
                        shotOriginX = attacker.x + Math.cos(perpendicularAngle) * actualOffsetMagnitude;
                        shotOriginY = attacker.y + Math.sin(perpendicularAngle) * actualOffsetMagnitude;
                    }
                }


                const fwdX = Math.cos(shotAngle);
                const fwdY = Math.sin(shotAngle);
                const cosHalfBeam = Math.cos((weaponStats.beam || 0.1) * 0.5); 

                const allPlayers = this.playerManager.getAllPlayers();

                for (const targetId in allPlayers) {
                    if (targetId === socket.id) continue;

                    const target = allPlayers[targetId];
                    if (
                        !target ||
                        target.system !== attacker.system ||
                        target.destroyed ||
                        target.dockedAtPlanetIdentifier
                    )
                        continue;

                    const dx = target.x - shotOriginX; 
                    const dy = target.y - shotOriginY; 
                    const dist = Math.hypot(dx, dy);

                    if (dist === 0 || dist > weaponStats.range) continue;

                    const dirToTargetX = dx / dist;
                    const dirToTargetY = dy / dist;
                    const dotProduct = fwdX * dirToTargetX + fwdY * dirToTargetY;

                    if (dotProduct < cosHalfBeam) continue;

                    let damageDealt = weaponStats.damage;
                    let targetDestroyedThisShot = false;

                    let damageToShield = 0;
                    if (target.shield > 0) {
                        damageToShield = Math.min(target.shield, damageDealt);
                        target.shield -= damageToShield;
                        damageDealt -= damageToShield;
                    }

                    let damageToHealth = 0;
                    if (damageDealt > 0) {
                        damageToHealth = Math.min(target.health, damageDealt);
                        target.health -= damageToHealth;
                    }


                    if (target.health > 0 && target.hyperjumpState === "charging") {
                        this.playerManager.handlePlayerHitDuringHyperjumpCharge(
                            target.id, 
                        );
                    }

                    if (target.health <= 0) {
                        target.health = 0;
                        target.destroyed = true;
                        targetDestroyedThisShot = true;

                        if (
                            target.hyperjumpState === "charging" &&
                            target.hyperjumpChargeTimeoutId
                        ) {
                            clearTimeout(target.hyperjumpChargeTimeoutId);
                            target.hyperjumpChargeTimeoutId = null;
                            target.hyperjumpState = "idle";
                            console.log(
                                `Hyperjump charge for destroyed player ${target.id} cleared.`,
                            );
                        }
                    }
                    
                    const updatePayload = {
                        health: target.health,
                        shield: target.shield,
                        destroyed: target.destroyed,
                        hyperjumpState: target.hyperjumpState,
                        // lastDamageTime is not needed here since regen is manual
                    };
                    this.playerManager.updatePlayerState(target.id, updatePayload);


                    if (targetDestroyedThisShot) {
                        this.missionManager.handleTargetDestroyed(attacker, target);
                    }
                    break; 
                }

                const systemPlayers = Object.values(this.playerManager.getAllPlayers()).filter(
                    (p) => p.system === attacker.system,
                );
                systemPlayers.forEach((p) => {
                    this.io.to(p.id).emit("projectile", {
                        x: shotOriginX,
                        y: shotOriginY,
                        angle: shotAngle,
                        color: weaponStats.color,
                        range: weaponStats.range,
                        shooterId: attacker.id,
                    });
                });
            } 
        });
    }
}

module.exports = CombatManager;
