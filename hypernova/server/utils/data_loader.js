const fs = require("fs").promises;
const path = require("path");

const dataDir = path.join(__dirname, "../data");

async function loadJson(filename) {
    const filePath = path.join(dataDir, filename);
    try {
        const fileContent = await fs.readFile(filePath, "utf-8");
        return JSON.parse(fileContent);
    } catch (error) {
        console.error(`Error loading data file ${filename}:`, error);
        throw error; // Or return null/empty object depending on desired error handling
    }
}

async function loadAllData() {
    try {
        const [tradeGoods, weapons, systemsBase, shipTypes] = await Promise.all(
            [
                loadJson("trade_goods.json"),
                loadJson("weapons.json"),
                loadJson("systems_init.json"),
                loadJson("ship_types.json"),
            ],
        );
        return { tradeGoods, weapons, systemsBase, shipTypes };
    } catch (error) {
        console.error("Failed to load critical game data. Exiting.", error);
        process.exit(1);
    }
}

module.exports = {
    loadAllData,
};
