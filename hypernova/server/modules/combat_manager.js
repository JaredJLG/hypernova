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

            const fwdX = Math.cos(attacker.angle);
            const fwdY = Math.sin(attacker.angle);
            const cosHalfBeam = Math.cos(weaponStats.beam * 0.5);

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

                const dx = target.x - attacker.x;
                const dy = target.y - attacker.y;
                const dist = Math.hypot(dx, dy);

                if (dist === 0 || dist > weaponStats.range) continue;

                const dirToTargetX = dx / dist;
                const dirToTargetY = dy / dist;
                const dotProduct = fwdX * dirToTargetX + fwdY * dirToTargetY;

                if (dotProduct < cosHalfBeam) continue;

                target.health -= weaponStats.damage;
                let targetDestroyedThisShot = false;

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
                    console.log(
                        `Player ${target.id} destroyed by ${attacker.id}`,
                    );
                }

                this.playerManager.updatePlayerState(target.id, {
                    // Changed to updatePlayerState for broader sync
                    health: target.health,
                    destroyed: target.destroyed,
                    hyperjumpState: target.hyperjumpState, // ensure hyperjump state is also synced if changed
                });

                if (targetDestroyedThisShot) {
                    this.missionManager.handleTargetDestroyed(attacker, target);
                }
                break;
            }

            // Emit projectile to all players in the attacker's system
            const systemPlayers = Object.values(allPlayers).filter(
                (p) => p.system === attacker.system,
            );
            systemPlayers.forEach((p) => {
                this.io.to(p.id).emit("projectile", {
                    x: attacker.x,
                    y: attacker.y,
                    angle: attacker.angle,
                    color: weaponStats.color,
                    range: weaponStats.range,
                    shooterId: attacker.id,
                });
            });
        });
    }
}

module.exports = CombatManager;
