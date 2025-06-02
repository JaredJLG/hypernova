// hypernova/server/server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs").promises; // Use promises for async file operations
const bodyParser = require("body-parser"); // To parse JSON request bodies

const gameConfig = require("./config/game_config");
const DataLoader = require("./utils/data_loader");

const PlayerManager = require("./modules/player_manager");
const WorldManager = require("./modules/world_manager");
const EconomyManager = require("./modules/economy_manager");
const MissionManager = require("./modules/mission_manager");
const CombatManager = require("./modules/combat_manager");

const app = express();
const serverHttp = http.createServer(app);
const io = new Server(serverHttp, {
    cors: {
        origin: "*", // Be more restrictive in production
        methods: ["GET", "POST"],
    },
});

app.use(bodyParser.json()); // Middleware to parse JSON request bodies
app.use(express.static(path.join(__dirname, "../client")));

app.get("/socket.io/socket.io.js", (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            "../../node_modules/socket.io/client-dist/socket.io.js",
        ),
    );
});

const USERS_DIR = path.join(__dirname, "data/users");

async function ensureUsersDir() {
    try {
        await fs.mkdir(USERS_DIR, { recursive: true });
        console.log("Users directory ensured:", USERS_DIR);
    } catch (error) {
        console.error("Failed to create users directory:", error);
    }
}
ensureUsersDir(); // Call this to ensure directory exists on server startup

// --- Authentication and User Data ---
async function findUser(username) {
    const filePath = path.join(USERS_DIR, `${username}.json`);
    try {
        const data = await fs.readFile(filePath, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        if (error.code === "ENOENT") return null; // User file not found
        console.error(`Error reading user file for ${username}:`, error);
        throw error; // Re-throw other errors
    }
}

async function createUser(username, password) {
    // WARNING: Storing plain text passwords is a major security risk!
    // Use bcrypt.hashSync(password, saltRounds) in a real app.
    const userFilePath = path.join(USERS_DIR, `${username}.json`);
    const userData = {
        username,
        password /* In a real app, store HASHED password */,
    };
    try {
        await fs.writeFile(userFilePath, JSON.stringify(userData, null, 2));
        console.log(`User ${username} created.`);
        return userData;
    } catch (err) {
        console.error(`Error creating user ${username}:`, err);
        return null; // Indicate failure
    }
}

app.post("/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: "Username and password are required.",
        });
    }

    try {
        let user = await findUser(username);
        if (!user) {
            // Simplified: Auto-register if user not found
            console.log(`User ${username} not found. Registering...`);
            user = await createUser(username, password);
            if (!user) {
                return res.status(500).json({
                    success: false,
                    message: "Failed to register user.",
                });
            }
            // Security note: Do not send password back, even in registration success
            return res.json({
                success: true,
                username: user.username,
                message: "Registration successful. Logged in.",
            });
        }

        // WARNING: Plain text password comparison. Insecure!
        // In a real app: const match = await bcrypt.compare(password, user.hashedPassword);
        if (user.password !== password) {
            return res
                .status(401)
                .json({ success: false, message: "Invalid password." });
        }
        // Security note: Do not send password back
        res.json({
            success: true,
            username: user.username,
            message: "Login successful",
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({
            success: false,
            message: "Server error during login.",
        });
    }
});

// --- Progress Saving and Loading ---
app.post("/save-progress", async (req, res) => {
    // In a real app, authenticate user here (e.g., check session token from request headers)
    const { username, shipData, dockedAtDetails } = req.body;
    if (!username) {
        // This check is more for direct API calls; if called by logged-in client, username should be reliable
        // Or, better, get username from authenticated session/token on server-side
        return res
            .status(400)
            .json({ success: false, message: "Username required." });
    }
    if (!shipData) {
        // Basic validation
        return res.status(400).json({
            success: false,
            message: "Ship data required for saving progress.",
        });
    }

    const progressFilePath = path.join(USERS_DIR, `${username}_progress.json`);
    const progress = {
        username,
        lastSaved: new Date().toISOString(),
        shipData,
        dockedAtDetails, // Can be null if not docked
    };

    try {
        await fs.writeFile(progressFilePath, JSON.stringify(progress, null, 2));
        res.json({ success: true, message: "Progress saved." });
    } catch (error) {
        console.error(`Error saving progress for ${username}:`, error);
        res.status(500).json({
            success: false,
            message: "Server error saving progress.",
        });
    }
});

app.get("/load-progress", async (req, res) => {
    // In a real app, authenticate user here
    const { username } = req.query;
    if (!username) {
        return res
            .status(400)
            .json({ success: false, message: "Username required." });
    }

    const progressFilePath = path.join(USERS_DIR, `${username}_progress.json`);
    try {
        const data = await fs.readFile(progressFilePath, "utf-8");
        res.json(JSON.parse(data)); // Send the progress data back
    } catch (error) {
        if (error.code === "ENOENT") {
            // It's not an error if a user has no saved progress yet
            return res.status(200).json(null); // Send null or an empty object, client should handle this
        }
        console.error(`Error loading progress for ${username}:`, error);
        res.status(500).json({
            success: false,
            message: "Server error loading progress.",
        });
    }
});

async function startServer() {
    const staticData = await DataLoader.loadAllData();
    gameConfig.staticWeaponsData = staticData.weapons;

    // Instantiate WorldManager first as PlayerManager will need it
    const worldManager = new WorldManager(
        io,
        staticData.systemsBase,
        staticData.tradeGoods,
        gameConfig,
    );

    // Pass the worldManager instance to PlayerManager
    const playerManager = new PlayerManager(
        io,
        staticData.shipTypes,
        staticData.tradeGoods,
        gameConfig,
        worldManager, // <<< MODIFICATION HERE: Pass worldManager instance
    );

    // Other managers can now receive playerManager and worldManager as needed
    const economyManager = new EconomyManager(
        io,
        worldManager,
        playerManager,
        staticData.tradeGoods,
        gameConfig,
    );
    const missionManager = new MissionManager(
        io,
        worldManager,
        playerManager,
        staticData.tradeGoods,
        gameConfig,
    );
    const combatManager = new CombatManager(
        io,
        playerManager,
        missionManager,
        staticData.weapons,
        gameConfig,
    );

    // Initialize worldManager AFTER all managers it might use internally during initialization are created
    // (though in this case, it mainly uses economyManager and missionManager passed to it)
    worldManager.initialize(economyManager, missionManager);

    setInterval(
        () => economyManager.updateAllPlanetEconomies(),
        gameConfig.ECONOMY_UPDATE_INTERVAL_MS,
    );
    setInterval(
        () => missionManager.populateAllPlanetMissions(), // This probably needs this.systems from worldManager
        gameConfig.MISSION_GENERATION_INTERVAL_MS,
    );
    setInterval(
        () => playerManager.checkAllPlayerMissionTimeouts(missionManager),
        gameConfig.PLAYER_MISSION_CHECK_INTERVAL_MS,
    );

    io.on("connection", (socket) => {
        const initialWorldData = {
            systems: worldManager.getSystemsForClient(),
            economies: worldManager.getEconomiesForClient(),
        };
        // PlayerManager's handleConnection now has access to worldManager via `this.worldManager`
        playerManager.handleConnection(socket, initialWorldData);

        economyManager.registerSocketHandlers(socket);
        missionManager.registerSocketHandlers(socket);
        combatManager.registerSocketHandlers(socket);
        // WorldManager registers its own handlers for 'dock' and 'undock' etc.
        worldManager.registerSocketHandlers(socket, playerManager);

        socket.on("disconnect", () => {
            playerManager.handleDisconnect(socket);
        });
    });

    serverHttp.listen(gameConfig.PORT, () =>
        console.log(
            `Server structured and listening on port ${gameConfig.PORT}`,
        ),
    );
}

startServer().catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1); // Exit if server fails to start
});

