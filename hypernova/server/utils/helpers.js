function generateMissionId() {
    return `mission_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Note: systemsData is the live systems array from WorldManager
function getSystemDistance(systemIndex1, systemIndex2, numSystems) {
    if (numSystems === 0) return 0;
    const diff = Math.abs(systemIndex1 - systemIndex2);
    return Math.min(diff, numSystems - diff);
}

module.exports = {
    generateMissionId,
    getSystemDistance,
};
