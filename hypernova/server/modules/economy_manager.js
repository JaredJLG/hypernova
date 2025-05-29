// server/modules/economy_manager.js
const {
    INITIAL_STOCK_BASE,
    STOCK_PRODUCED_MULTIPLIER,
    STOCK_CONSUMED_MULTIPLIER,
    PRICE_SUPPLY_FACTOR_LOW,
    PRICE_DEMAND_FACTOR_HIGH,
    PRICE_STOCK_MIN_EFFECT_MULTIPLIER,
    PRICE_STOCK_MAX_EFFECT_MULTIPLIER,
    PLANET_PROFIT_MARGIN,
} = require("../config/game_config");

class EconomyManager {
    constructor(io, worldManager, playerManager, tradeGoods, gameConfig) {
        this.io = io;
        this.worldManager = worldManager; // To get/update planet data
        this.playerManager = playerManager; // To update player credits/cargo
        this.tradeGoods = tradeGoods;
        this.gameConfig = gameConfig;
    }

    getTradeGoodByName(goodName) {
        return this.tradeGoods.find((g) => g.name === goodName);
    }

    calculatePricesForGoodOnPlanet(planet, goodName) {
        const good = this.getTradeGoodByName(goodName);
        if (!good) return;

        let baseValuation = good.basePrice;
        if (planet.produces.includes(goodName))
            baseValuation *= PRICE_SUPPLY_FACTOR_LOW;
        else if (planet.consumes.includes(goodName))
            baseValuation *= PRICE_DEMAND_FACTOR_HIGH;

        let targetStock = INITIAL_STOCK_BASE;
        if (planet.produces.includes(goodName))
            targetStock *= STOCK_PRODUCED_MULTIPLIER;
        if (planet.consumes.includes(goodName))
            targetStock *= STOCK_CONSUMED_MULTIPLIER;
        targetStock = Math.max(1, targetStock);

        let stockEffectMultiplier = 1.0;
        if (planet.stock[goodName] > 0) {
            stockEffectMultiplier = targetStock / planet.stock[goodName];
        } else {
            stockEffectMultiplier = PRICE_STOCK_MAX_EFFECT_MULTIPLIER * 2; // High price if no stock
        }
        stockEffectMultiplier = Math.max(
            PRICE_STOCK_MIN_EFFECT_MULTIPLIER,
            Math.min(PRICE_STOCK_MAX_EFFECT_MULTIPLIER, stockEffectMultiplier),
        );

        const planetInternalValue = Math.round(
            baseValuation * stockEffectMultiplier,
        );
        planet.buyPrices[goodName] = Math.max(
            1,
            Math.round(planetInternalValue * (1 + PLANET_PROFIT_MARGIN)),
        );
        planet.sellPrices[goodName] = Math.max(
            1,
            Math.round(planetInternalValue * (1 - PLANET_PROFIT_MARGIN)),
        );

        if (planet.buyPrices[goodName] <= planet.sellPrices[goodName]) {
            planet.buyPrices[goodName] = planet.sellPrices[goodName] + 1;
        }
        if (planet.sellPrices[goodName] <= 0) planet.sellPrices[goodName] = 1;
    }

    initializeAllPlanetEconomies(systems) {
        // `systems` is the live array from WorldManager
        systems.forEach((system) => {
            system.planets.forEach((planet) => {
                this.tradeGoods.forEach((good) => {
                    let initialStock = INITIAL_STOCK_BASE;
                    if (planet.produces.includes(good.name))
                        initialStock *= STOCK_PRODUCED_MULTIPLIER;
                    if (planet.consumes.includes(good.name))
                        initialStock *= STOCK_CONSUMED_MULTIPLIER;
                    planet.stock[good.name] = Math.floor(
                        Math.max(10, initialStock),
                    );
                    this.calculatePricesForGoodOnPlanet(planet, good.name);
                });
            });
        });
        console.log("Planet economies initialized by EconomyManager.");
    }

    updateAllPlanetEconomies() {
        // Called by interval in server.js
        const systems = this.worldManager.systems; // Get live systems data
        if (!systems || systems.length === 0) return;

        systems.forEach((system) => {
            system.planets.forEach((planet) => {
                this.tradeGoods.forEach((good) => {
                    let targetStock = INITIAL_STOCK_BASE;
                    if (planet.produces.includes(good.name))
                        targetStock *= STOCK_PRODUCED_MULTIPLIER;
                    if (planet.consumes.includes(good.name))
                        targetStock *= STOCK_CONSUMED_MULTIPLIER;
                    targetStock = Math.max(1, targetStock);

                    const currentStock = planet.stock[good.name] || 0;
                    const diff = targetStock - currentStock;
                    let change = Math.round(diff * 0.02); // Slow adjustment
                    if (change === 0 && diff !== 0) change = diff > 0 ? 1 : -1;

                    planet.stock[good.name] = currentStock + change;
                    planet.stock[good.name] = Math.max(
                        0,
                        Math.min(planet.stock[good.name], targetStock * 5),
                    ); // Cap stock
                    this.calculatePricesForGoodOnPlanet(planet, good.name);
                });
            });
        });

        this.io.emit(
            "updatePlanetEconomies",
            this.worldManager.getEconomiesForClient(),
        );
        // console.log("Planet economies updated and broadcasted.");
    }

    notifyPlanetEconomyUpdate(systemIndex, planetIndex) {
        const planet = this.worldManager.getPlanet(systemIndex, planetIndex);
        if (planet) {
            this.io.emit("planetEconomyUpdate", {
                systemIndex,
                planetIndex,
                name: planet.name, // Though client might not use name here
                buyPrices: planet.buyPrices,
                sellPrices: planet.sellPrices,
                stock: planet.stock,
            });
        }
    }

    registerSocketHandlers(socket) {
        socket.on(
            "buyGood",
            ({ goodName, quantity, systemIndex, planetIndex }) => {
                const player = this.playerManager.getPlayer(socket.id);
                const goodInfo = this.getTradeGoodByName(goodName);
                const goodIdx = this.tradeGoods.findIndex(
                    (g) => g.name === goodName,
                );

                if (
                    !player ||
                    !goodInfo ||
                    goodIdx === -1 ||
                    !player.dockedAtPlanetIdentifier ||
                    player.dockedAtPlanetIdentifier.systemIndex !==
                        systemIndex ||
                    player.dockedAtPlanetIdentifier.planetIndex !== planetIndex
                ) {
                    return socket.emit("tradeError", {
                        message: "Invalid trade conditions.",
                    });
                }

                const planet = this.worldManager.getPlanet(
                    systemIndex,
                    planetIndex,
                );
                if (!planet)
                    return socket.emit("tradeError", {
                        message: "Planet not found.",
                    });

                const pricePerUnit = planet.buyPrices[goodName];
                if (pricePerUnit === undefined)
                    return socket.emit("tradeError", {
                        message: "Good not sold here.",
                    });
                const totalCost = pricePerUnit * quantity;

                const currentCargoMass = player.cargo.reduce(
                    (sum, val, idx) => sum + this.tradeGoods[idx].mass * val,
                    0,
                );
                const newGoodMass = goodInfo.mass * quantity;

                if (player.credits < totalCost)
                    return socket.emit("tradeError", {
                        message: "Not enough credits.",
                    });
                if (currentCargoMass + newGoodMass > player.maxCargo)
                    return socket.emit("tradeError", {
                        message: "Not enough cargo space.",
                    });
                if (
                    !planet.stock[goodName] ||
                    planet.stock[goodName] < quantity
                )
                    return socket.emit("tradeError", {
                        message: "Planet out of stock.",
                    });

                player.credits -= totalCost;
                player.cargo[goodIdx] += quantity;
                planet.stock[goodName] -= quantity;
                this.calculatePricesForGoodOnPlanet(planet, goodName);

                socket.emit("tradeSuccess", {
                    credits: player.credits,
                    cargo: player.cargo,
                    updatedPlanetData: {
                        // For immediate UI update on client
                        systemIndex,
                        planetIndex,
                        buyPrices: planet.buyPrices,
                        sellPrices: planet.sellPrices,
                        stock: planet.stock,
                    },
                });
                this.playerManager.updatePlayerState(socket.id, {
                    credits: player.credits,
                    cargo: player.cargo,
                });
                this.notifyPlanetEconomyUpdate(systemIndex, planetIndex);
            },
        );

        socket.on(
            "sellGood",
            ({ goodName, quantity, systemIndex, planetIndex }) => {
                const player = this.playerManager.getPlayer(socket.id);
                const goodInfo = this.getTradeGoodByName(goodName);
                const goodIdx = this.tradeGoods.findIndex(
                    (g) => g.name === goodName,
                );

                if (
                    !player ||
                    !goodInfo ||
                    goodIdx === -1 ||
                    !player.dockedAtPlanetIdentifier ||
                    player.dockedAtPlanetIdentifier.systemIndex !==
                        systemIndex ||
                    player.dockedAtPlanetIdentifier.planetIndex !== planetIndex
                ) {
                    return socket.emit("tradeError", {
                        message: "Invalid trade conditions.",
                    });
                }
                if (player.cargo[goodIdx] < quantity)
                    return socket.emit("tradeError", {
                        message: "Not enough goods to sell.",
                    });

                const planet = this.worldManager.getPlanet(
                    systemIndex,
                    planetIndex,
                );
                if (!planet)
                    return socket.emit("tradeError", {
                        message: "Planet not found.",
                    });

                const pricePerUnit = planet.sellPrices[goodName];
                if (pricePerUnit === undefined)
                    return socket.emit("tradeError", {
                        message: "Good not bought here.",
                    });

                const totalGain = pricePerUnit * quantity;

                player.credits += totalGain;
                player.cargo[goodIdx] -= quantity;
                planet.stock[goodName] += quantity;
                this.calculatePricesForGoodOnPlanet(planet, goodName);

                socket.emit("tradeSuccess", {
                    credits: player.credits,
                    cargo: player.cargo,
                    updatedPlanetData: {
                        systemIndex,
                        planetIndex,
                        buyPrices: planet.buyPrices,
                        sellPrices: planet.sellPrices,
                        stock: planet.stock,
                    },
                });
                this.playerManager.updatePlayerState(socket.id, {
                    credits: player.credits,
                    cargo: player.cargo,
                });
                this.notifyPlanetEconomyUpdate(systemIndex, planetIndex);
            },
        );
    }
}

module.exports = EconomyManager;
