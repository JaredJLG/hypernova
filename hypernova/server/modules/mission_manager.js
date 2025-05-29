// server/modules/mission_manager.js
const { generateMissionId, getSystemDistance } = require("../utils/helpers");
const {
    MISSION_TYPES,
    MAX_MISSIONS_PER_PLANET,
    MISSION_TIME_LIMIT_BASE_MS,
    MISSION_TIME_LIMIT_PER_SYSTEM_JUMP_MS,
} = require("../config/game_config");

class MissionManager {
    constructor(io, worldManager, playerManager, tradeGoods, gameConfig) {
        this.io = io;
        this.worldManager = worldManager;
        this.playerManager = playerManager;
        this.tradeGoods = tradeGoods;
        this.gameConfig = gameConfig; // For other mission params if any
    }

    generateCargoDeliveryMission(
        originSystemIndex,
        originPlanetIndex,
        systems,
    ) {
        const numSystems = systems.length;
        if (
            numSystems === 0 ||
            (numSystems === 1 && systems[0].planets.length < 2)
        )
            return null;

        let destSystemIndex, destPlanetIndex;
        let attempts = 0;
        const originSystem = systems[originSystemIndex];
        const originPlanet = originSystem.planets[originPlanetIndex];

        do {
            destSystemIndex = Math.floor(Math.random() * numSystems);
            const destSystem = systems[destSystemIndex];
            if (!destSystem || destSystem.planets.length === 0) {
                attempts++;
                continue;
            }
            destPlanetIndex = Math.floor(
                Math.random() * destSystem.planets.length,
            );
            attempts++;
        } while (
            destSystemIndex === originSystemIndex &&
            destPlanetIndex === originPlanetIndex &&
            numSystems > 1 &&
            systems[destSystemIndex].planets.length > 1 && // only try again if there are other options
            attempts < 20
        );

        // If still same after attempts (e.g. only one planet in one system, or two planets total)
        if (
            destSystemIndex === originSystemIndex &&
            destPlanetIndex === originPlanetIndex
        )
            return null;

        const goodIndex = Math.floor(Math.random() * this.tradeGoods.length);
        const goodToDeliver = this.tradeGoods[goodIndex];
        const quantity = Math.floor(Math.random() * 5) + 2; // 2 to 6 units

        const distance = getSystemDistance(
            originSystemIndex,
            destSystemIndex,
            numSystems,
        );
        const rewardCredits =
            goodToDeliver.basePrice * quantity * 1.5 + distance * 150 + 100;
        const timeLimit =
            Date.now() +
            MISSION_TIME_LIMIT_BASE_MS +
            distance * MISSION_TIME_LIMIT_PER_SYSTEM_JUMP_MS;
        const destPlanet = systems[destSystemIndex].planets[destPlanetIndex];

        return {
            id: generateMissionId(),
            type: MISSION_TYPES.CARGO_DELIVERY,
            title: `Deliver ${quantity} ${goodToDeliver.name} to ${destPlanet.name} (${systems[destSystemIndex].name})`,
            description: `Transport ${quantity} units of ${goodToDeliver.name} from ${originPlanet.name} (${originSystem.name}) to ${destPlanet.name} (${systems[destSystemIndex].name}).`,
            originSystemIndex,
            originPlanetIndex,
            destinationSystemIndex: destSystemIndex,
            destinationPlanetIndex: destPlanetIndex,
            cargoGoodName: goodToDeliver.name,
            cargoQuantity: quantity,
            rewardCredits: Math.round(rewardCredits),
            penaltyCredits: Math.round(rewardCredits * 0.3),
            timeLimit: timeLimit,
            status: "AVAILABLE", // Initial status
        };
    }

    generateBountyMission(originSystemIndex, originPlanetIndex, systems) {
        const numSystems = systems.length;
        if (numSystems === 0) return null;
        let targetSystemIndex;

        if (numSystems > 1) {
            do {
                targetSystemIndex = Math.floor(Math.random() * numSystems);
            } while (targetSystemIndex === originSystemIndex && numSystems > 1); // Ensure different system if possible
        } else {
            targetSystemIndex = originSystemIndex;
        }

        const numTargets = Math.floor(Math.random() * 2) + 1; // 1 to 2 pirates
        const distance = getSystemDistance(
            originSystemIndex,
            targetSystemIndex,
            numSystems,
        );
        const rewardCredits = numTargets * 500 + distance * 100; // Base reward + distance bonus
        const timeLimit =
            Date.now() +
            MISSION_TIME_LIMIT_BASE_MS +
            distance * MISSION_TIME_LIMIT_PER_SYSTEM_JUMP_MS;
        const originPlanet =
            systems[originSystemIndex].planets[originPlanetIndex];
        const originSystem = systems[originSystemIndex];

        return {
            id: generateMissionId(),
            type: MISSION_TYPES.BOUNTY,
            title: `Bounty: ${numTargets} Pirate${numTargets > 1 ? "s" : ""} in ${systems[targetSystemIndex].name}`,
            description: `Hostile elements reported in ${systems[targetSystemIndex].name} system. Originated near ${originPlanet.name} (${originSystem.name}). Eliminate ${numTargets} of them.`,
            originSystemIndex,
            originPlanetIndex,
            targetSystemIndex: targetSystemIndex,
            targetShipName: "Pirate", // Generic for now
            targetsRequired: numTargets,
            targetsDestroyed: 0,
            rewardCredits: Math.round(rewardCredits),
            penaltyCredits: Math.round(rewardCredits * 0.2),
            timeLimit: timeLimit,
            status: "AVAILABLE",
        };
    }

    populateAllPlanetMissions() {
        // Called by interval
        const systems = this.worldManager.systems;
        if (!systems) return;

        systems.forEach((system, sysIdx) => {
            system.planets.forEach((planet, pIdx) => {
                // Filter out expired or already taken missions (though 'taken' is handled on accept)
                planet.availableMissions = planet.availableMissions.filter(
                    (m) => m.status === "AVAILABLE" && m.timeLimit > Date.now(),
                );

                while (
                    planet.availableMissions.length < MAX_MISSIONS_PER_PLANET
                ) {
                    let newMission = null;
                    const missionTypeRoll = Math.random();
                    if (missionTypeRoll < 0.7) {
                        // 70% chance for cargo
                        newMission = this.generateCargoDeliveryMission(
                            sysIdx,
                            pIdx,
                            systems,
                        );
                    } else {
                        newMission = this.generateBountyMission(
                            sysIdx,
                            pIdx,
                            systems,
                        );
                    }
                    if (newMission) {
                        planet.availableMissions.push(newMission);
                    } else {
                        break; // Stop if no mission could be generated (e.g., single planet system for cargo)
                    }
                }
            });
        });
        // console.log("Planet missions populated.");
    }

    checkPlayerMissionTimeouts(player) {
        // player object directly modified
        let missionsChanged = false;
        const completedOrFailed = [];

        player.activeMissions.forEach((mission) => {
            if (
                mission.status === "ACCEPTED" &&
                Date.now() > mission.timeLimit
            ) {
                mission.status = "FAILED_TIME";
                player.credits -= mission.penaltyCredits;
                player.credits = Math.max(0, player.credits);
                missionsChanged = true;
                completedOrFailed.push({
                    missionId: mission.id,
                    status: mission.status,
                    reason: "Time expired.",
                    penalty: mission.penaltyCredits,
                });
            }
        });

        if (missionsChanged) {
            player.activeMissions = player.activeMissions.filter(
                (m) => m.status === "ACCEPTED",
            );
        }
        return { changed: missionsChanged, completedOrFailed };
    }

    checkCargoMissionCompletionOnDock(player, systemIndex, planetIndex) {
        let cargoChanged = false;
        let creditsChanged = false;
        let missionsChanged = false;

        if (player.activeMissions) {
            const remainingMissions = [];
            player.activeMissions.forEach((mission) => {
                if (
                    mission.type === MISSION_TYPES.CARGO_DELIVERY &&
                    mission.status === "ACCEPTED" &&
                    mission.destinationSystemIndex === systemIndex &&
                    mission.destinationPlanetIndex === planetIndex
                ) {
                    const goodIdx = this.tradeGoods.findIndex(
                        (g) => g.name === mission.cargoGoodName,
                    );
                    if (
                        goodIdx !== -1 &&
                        player.cargo[goodIdx] >= mission.cargoQuantity
                    ) {
                        player.cargo[goodIdx] -= mission.cargoQuantity;
                        player.credits += mission.rewardCredits;
                        mission.status = "COMPLETED"; // Mark for removal / notification
                        cargoChanged = true;
                        creditsChanged = true;
                        missionsChanged = true;

                        this.io.to(player.id).emit("missionUpdate", {
                            missionId: mission.id,
                            status: "COMPLETED",
                            reward: mission.rewardCredits,
                            message: `Delivered ${mission.cargoQuantity} ${mission.cargoGoodName}.`,
                        });
                    } else {
                        this.io.to(player.id).emit("missionUpdate", {
                            missionId: mission.id,
                            status: "INFO",
                            message: `Need ${mission.cargoQuantity} ${mission.cargoGoodName} to complete. You have ${player.cargo[goodIdx] || 0}.`,
                        });
                        remainingMissions.push(mission); // Keep mission
                    }
                } else {
                    remainingMissions.push(mission); // Keep other missions
                }
            });
            if (missionsChanged) player.activeMissions = remainingMissions;
        }
        return { cargoChanged, creditsChanged, missionsChanged };
    }

    // Called by CombatManager when a target is destroyed
    handleTargetDestroyed(attackerPlayer, destroyedTargetPlayer) {
        let missionsUpdated = false;
        const completedBountiesForNotification = [];
        const attacker = this.playerManager.getPlayer(attackerPlayer.id); // Get live player object
        if (!attacker || !attacker.activeMissions) return;

        attacker.activeMissions.forEach((mission) => {
            if (
                mission.type === MISSION_TYPES.BOUNTY &&
                mission.status === "ACCEPTED" &&
                mission.targetSystemIndex === attacker.system
            ) {
                // Check if in correct system

                // For now, any player kill in the target system counts for "Pirate" bounty
                // Later, you might check `destroyedTargetPlayer.type` or if it's an NPC
                mission.targetsDestroyed = (mission.targetsDestroyed || 0) + 1;
                missionsUpdated = true;

                if (mission.targetsDestroyed >= mission.targetsRequired) {
                    mission.status = "COMPLETED";
                    attacker.credits += mission.rewardCredits;
                    completedBountiesForNotification.push({
                        missionId: mission.id,
                        status: "COMPLETED",
                        reward: mission.rewardCredits,
                        progress: `${mission.targetsDestroyed}/${mission.targetsRequired}`,
                        message: "Bounty completed!",
                    });
                } else {
                    // Send progress update
                    this.io.to(attacker.id).emit("missionUpdate", {
                        missionId: mission.id,
                        status: "ACCEPTED", // Still accepted, just progress
                        progress: `${mission.targetsDestroyed}/${mission.targetsRequired}`,
                    });
                }
            }
        });

        if (missionsUpdated) {
            completedBountiesForNotification.forEach((update) =>
                this.io.to(attacker.id).emit("missionUpdate", update),
            );

            const oldMissionCount = attacker.activeMissions.length;
            attacker.activeMissions = attacker.activeMissions.filter(
                (m) => m.status === "ACCEPTED",
            );
            const newMissionCount = attacker.activeMissions.length;

            const playerUpdates = { credits: attacker.credits };
            if (oldMissionCount !== newMissionCount) {
                playerUpdates.activeMissions = attacker.activeMissions;
            }
            this.playerManager.updatePlayerState(attacker.id, playerUpdates);
        }
    }

    registerSocketHandlers(socket) {
        socket.on("requestMissions", ({ systemIndex, planetIndex }) => {
            const player = this.playerManager.getPlayer(socket.id);
            const planet = this.worldManager.getPlanet(
                systemIndex,
                planetIndex,
            );

            if (!player || !planet) {
                return socket.emit("actionFailed", {
                    message: "Invalid location for missions.",
                });
            }

            const availableMissions = planet.availableMissions.filter(
                (m) =>
                    m.timeLimit > Date.now() && // Not expired
                    (!player.activeMissions ||
                        !player.activeMissions.find((pm) => pm.id === m.id)), // Not already active for player
            );
            socket.emit("availableMissionsList", {
                systemIndex,
                planetIndex,
                missions: availableMissions,
            });
        });

        socket.on(
            "acceptMission",
            ({ missionId, systemIndex, planetIndex }) => {
                const player = this.playerManager.getPlayer(socket.id);
                const planet = this.worldManager.getPlanet(
                    systemIndex,
                    planetIndex,
                );

                if (!player || !planet) {
                    return socket.emit("actionFailed", {
                        message: "Cannot accept mission from this location.",
                    });
                }

                const missionIndex = planet.availableMissions.findIndex(
                    (m) => m.id === missionId,
                );
                if (missionIndex === -1) {
                    return socket.emit("actionFailed", {
                        message: "Mission not available or already taken.",
                    });
                }

                const missionToAccept = planet.availableMissions[missionIndex];

                if (missionToAccept.timeLimit < Date.now()) {
                    planet.availableMissions.splice(missionIndex, 1); // Remove expired
                    return socket.emit("actionFailed", {
                        message: "Mission has expired.",
                    });
                }
                if (player.activeMissions.length >= 5) {
                    // Max active missions limit
                    return socket.emit("actionFailed", {
                        message: "Too many active missions.",
                    });
                }

                missionToAccept.status = "ACCEPTED";
                if (
                    !missionToAccept.targetsDestroyed &&
                    missionToAccept.type === MISSION_TYPES.BOUNTY
                ) {
                    missionToAccept.targetsDestroyed = 0; // Ensure bounty missions start with 0 destroyed
                }
                player.activeMissions.push({ ...missionToAccept }); // Add a copy to player
                planet.availableMissions.splice(missionIndex, 1); // Remove from planet's available list

                socket.emit("missionAccepted", { mission: missionToAccept });
                this.playerManager.updatePlayerState(socket.id, {
                    activeMissions: player.activeMissions,
                });
            },
        );
    }
}

module.exports = MissionManager;
