// server/modules/combat_manager.js
class CombatManager {
    constructor(io, playerManager, missionManager, weaponsData, gameConfig) {
        this.io = io;
        this.playerManager = playerManager;
        this.missionManager = missionManager; // To notify about bounty completions
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
                attacker.dockedAtPlanetIdentifier
            )
                return;

            const weaponStats = this.weaponsData[attacker.activeWeapon];
            if (!weaponStats) return;

            // Optional: RPM check
            // const now = Date.now();
            // if (now - attacker.lastShot < (60000 / weaponStats.rpm)) return; // Too soon
            // attacker.lastShot = now;

            const fwdX = Math.cos(attacker.angle);
            const fwdY = Math.sin(attacker.angle);
            // beam represents the angle tolerance (e.g. 0.3 radians for half cone)
            const cosHalfBeam = Math.cos(weaponStats.beam * 0.5);
            let hitSomeone = false;

            const allPlayers = this.playerManager.getAllPlayers();

            for (const targetId in allPlayers) {
                if (targetId === socket.id) continue; // Can't shoot self

                const target = allPlayers[targetId];
                if (
                    !target ||
                    target.system !== attacker.system ||
                    target.destroyed ||
                    target.dockedAtPlanetIdentifier
                )
                    continue;

                const dx = target.x - attacker.x;
                const dy = target.y - attacker.y;
                const dist = Math.hypot(dx, dy);

                if (dist === 0 || dist > weaponStats.range) continue;

                // Check if target is within weapon cone
                // Normalize direction vector to target
                const dirToTargetX = dx / dist;
                const dirToTargetY = dy / dist;
                // Dot product between attacker's forward vector and direction to target
                const dotProduct = fwdX * dirToTargetX + fwdY * dirToTargetY;

                if (dotProduct < cosHalfBeam) continue; // Target is outside the firing cone

                // Hit!
                hitSomeone = true;
                target.health -= weaponStats.damage;
                let targetDestroyedThisShot = false;

                if (target.health <= 0) {
                    target.health = 0;
                    target.destroyed = true;
                    targetDestroyedThisShot = true;
                    // TODO: Handle dropping cargo, respawn logic, etc.
                    console.log(
                        `Player ${target.id} destroyed by ${attacker.id}`,
                    );
                }

                this.playerManager.broadcastPlayerState(target.id, {
                    health: target.health,
                    destroyed: target.destroyed,
                });

                if (targetDestroyedThisShot) {
                    this.missionManager.handleTargetDestroyed(attacker, target);
                }

                // For simplicity, one projectile hits one target and stops.
                // For beam weapons or piercing, this logic would change.
                break;
            }

            // Emit projectile for visual effect, regardless of hit for now, or only if aimed near someone.
            // The original logic was `if (hitSomeone)`
            // For client feedback, it's often better to always show the shot if fired.
            this.io.emit("projectile", {
                // Broadcast to all in system
                x: attacker.x,
                y: attacker.y,
                angle: attacker.angle,
                color: weaponStats.color,
                range: weaponStats.range,
                shooterId: attacker.id, // So client doesn't draw its own predictive projectile AND server one
            });
        });
    }
}

module.exports = CombatManager;
