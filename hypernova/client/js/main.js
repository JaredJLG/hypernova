// hypernova/client/js/main.js
console.log("main.js script started");

import { gameState } from "./game_state.js";
window.gameState = gameState; // For debugging via console

import {
    initNetwork,
    // saveProgress, // saveProgress is called from network.js, not directly here
    // sendControls as networkSendControls, // sendControls is called by input_handler.js
} from "./network.js";
import { Renderer } from "./renderer.js";
import { initInputListeners, processInputs } from "./input_handler.js";
import { UIManager } from "./ui_manager.js";

async function loadImages(imagePaths) {
    console.log("main.js/loadImages function called with paths:", imagePaths);
    const imagePromises = imagePaths.map((path) => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const filename = path.substring(path.lastIndexOf("/") + 1);
                gameState.loadedImages[filename] = img;
                resolve(img);
            };
            img.onerror = (err) => {
                console.error(`Failed to load image: ${path}`, err);
                reject(new Error(`Failed to load image: ${path}`));
            };
            img.src = path;
        });
    });

    try {
        await Promise.all(imagePromises);
        console.log(
            "main.js/loadImages: All images to be loaded have been processed.",
        );
    } catch (error) {
        console.error(
            "main.js/loadImages: Error during image loading process:",
            error,
        );
    }
}

async function handleLoginSubmit(username, password) {
    console.log(`main.js/handleLoginSubmit called for user: ${username}`);
    const loginErrorEl = document.getElementById("login-error");
    const loginMessageEl = document.getElementById("login-message");
    loginErrorEl.textContent = "";
    loginMessageEl.textContent = "";

    try {
        const response = await fetch("/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password }),
        });
        const result = await response.json();
        console.log("main.js/handleLoginSubmit: Login API response:", result);

        if (response.ok && result.success) {
            loginMessageEl.textContent = result.message || "Success!";
            gameState.currentUser = { username: result.username };
            console.log(
                "main.js/handleLoginSubmit: Set gameState.currentUser to:",
                JSON.stringify(gameState.currentUser),
            );

            document.getElementById("login-screen").classList.add("hidden");
            document
                .getElementById("game-container")
                .classList.remove("hidden");
            console.log(
                "main.js/handleLoginSubmit: Login screen hidden, game container shown. Calling initNetwork.",
            );

            initNetwork(async () => {
                // This is the onReadyCallback for initNetwork
                console.log(
                    "main.js/onReadyCallback (from initNetwork): START. Current gameState.docked:",
                    gameState.docked,
                    "currentUser:",
                    JSON.stringify(gameState.currentUser),
                    "myId:",
                    gameState.myId,
                );
                if (
                    gameState.imagePathsToLoad &&
                    gameState.imagePathsToLoad.length > 0
                ) {
                    await loadImages(gameState.imagePathsToLoad);
                    console.log(
                        "main.js/onReadyCallback: Image loading process complete.",
                    );
                } else {
                    console.log(
                        "main.js/onReadyCallback: No images to load (or imagePathsToLoad not populated).",
                    );
                }

                console.log(
                    "main.js/onReadyCallback: Calling loadProgress(). Current gameState.docked:",
                    gameState.docked,
                );
                await loadProgress(); // This will now potentially emit "clientLoadedDockedState"
                console.log(
                    "main.js/onReadyCallback: AFTER loadProgress() call. gameState.docked:",
                    gameState.docked,
                    "myShip:",
                    JSON.stringify(gameState.myShip),
                );

                if (gameState.myId && !gameState.myShip) {
                    console.warn(
                        "main.js/onReadyCallback: myId exists but myShip is missing! Creating and applying defaults. gameState.docked:",
                        gameState.docked,
                    );
                    gameState.allShips[gameState.myId] =
                        gameState.allShips[gameState.myId] || {};
                    gameState.defaultShipProps(gameState.myShip);
                    console.log(
                        "main.js/onReadyCallback: Initialized myShip with defaults (was missing). gameState.docked:",
                        gameState.docked,
                        "myShip:",
                        JSON.stringify(gameState.myShip),
                    );
                } else if (
                    gameState.myId &&
                    gameState.myShip &&
                    (gameState.myShip.type === undefined ||
                        gameState.myShip.type === null)
                ) {
                    console.warn(
                        "main.js/onReadyCallback: myShip exists but seems uninitialized (e.g. type missing). Applying default props. gameState.docked:",
                        gameState.docked,
                    );
                    gameState.defaultShipProps(gameState.myShip);
                    console.log(
                        "main.js/onReadyCallback: Applied default props to existing myShip. gameState.docked:",
                        gameState.docked,
                        "myShip:",
                        JSON.stringify(gameState.myShip),
                    );
                }

                console.log(
                    "main.js/onReadyCallback: Starting game loop. Final gameState.docked before loop:",
                    gameState.docked,
                    "currentUser:",
                    !!gameState.currentUser,
                    "myId:",
                    gameState.myId,
                    "myShip:",
                    !!gameState.myShip,
                );
                const canvas = document.getElementById("gameCanvas");
                if (canvas) {
                    canvas.focus();
                    console.log(
                        "main.js/onReadyCallback: Attempted to focus canvas.",
                    );
                }
                lastTime = performance.now();
                requestAnimationFrame(gameLoop);
            });
        } else {
            loginErrorEl.textContent =
                result.message || "Login/Registration failed.";
            console.warn(
                "main.js/handleLoginSubmit: Login/Registration failed. Server message:",
                result.message,
            );
        }
    } catch (error) {
        console.error(
            "main.js/handleLoginSubmit: Login request fetch failed:",
            error,
        );
        loginErrorEl.textContent = "Login request error. Check console.";
    }
}

async function loadProgress() {
    console.log("main.js/loadProgress: Function called.");
    if (!gameState.currentUser || !gameState.currentUser.username) {
        console.log(
            "main.js/loadProgress: No current user or username, returning.",
        );
        return;
    }
    console.log(
        `main.js/loadProgress: Attempting to load progress for ${gameState.currentUser.username}. Current myId: ${gameState.myId}`,
    );
    try {
        const response = await fetch(
            `/load-progress?username=${gameState.currentUser.username}`,
        );
        if (response.ok) {
            const progress = await response.json();
            console.log(
                "main.js/loadProgress: Received progress from server:",
                JSON.stringify(progress),
            );

            if (progress && progress.shipData) {
                console.log(
                    "main.js/loadProgress: Progress and shipData found. Applying... Current myId:",
                    gameState.myId,
                );

                if (gameState.myId) {
                    if (!gameState.allShips[gameState.myId]) {
                        console.log(
                            "main.js/loadProgress: myShip object for myId didn't exist, creating it before applying progress.",
                        );
                        gameState.allShips[gameState.myId] = {};
                    }
                    gameState.updateShipData(gameState.myId, progress.shipData);
                    console.log(
                        "main.js/loadProgress: After updateShipData. myShip:",
                        JSON.stringify(gameState.myShip),
                    );

                    if (
                        gameState.myShip &&
                        progress.shipData.system !== undefined
                    ) {
                        gameState.myShip.system = progress.shipData.system;
                        console.log(
                            "main.js/loadProgress: Set gameState.myShip.system to",
                            gameState.myShip.system,
                        );
                    }

                    if (progress.dockedAtDetails) {
                        gameState.docked = true;
                        gameState.dockedAtDetails = progress.dockedAtDetails;
                        console.log(
                            "main.js/loadProgress: SETTING gameState.docked = true from progress.dockedAtDetails. Details:",
                            JSON.stringify(gameState.dockedAtDetails),
                        );
                        // ***** NEW: Inform server about loaded docked state *****
                        if (gameState.socket) {
                            console.log(
                                "main.js/loadProgress: Emitting 'clientLoadedDockedState' to server with details:",
                                JSON.stringify(gameState.dockedAtDetails),
                            );
                            gameState.socket.emit(
                                "clientLoadedDockedState",
                                gameState.dockedAtDetails,
                            );
                        }
                        // *******************************************************
                    } else {
                        gameState.docked = false;
                        gameState.dockedAtDetails = null;
                        console.log(
                            "main.js/loadProgress: SETTING gameState.docked = false (no dockedAtDetails in loaded progress)",
                        );
                    }
                    console.log(
                        "main.js/loadProgress: Applied loaded progress directly. gameState.docked is now:",
                        gameState.docked,
                        "myShip:",
                        JSON.stringify(gameState.myShip),
                    );
                } else {
                    gameState.pendingProgressToApply = progress;
                    console.warn(
                        "main.js/loadProgress: My ID not set YET. Progress stored in pendingProgressToApply. gameState.docked NOT YET SET from this path.",
                    );
                }
            } else {
                console.log(
                    "main.js/loadProgress: No saved progress found (or progress was null/no shipData). Ensuring gameState.docked is false.",
                );
                if (gameState.myId && gameState.myShip) {
                    console.log(
                        "main.js/loadProgress: (No progress file) myShip exists. Its state after defaults (if any applied elsewhere):",
                        JSON.stringify(gameState.myShip),
                    );
                }
                gameState.docked = false;
                gameState.dockedAtDetails = null;
            }
        } else {
            console.error(
                "main.js/loadProgress: Fetch to /load-progress failed with status:",
                response.statusText,
            );
            gameState.docked = false;
            gameState.dockedAtDetails = null;
        }
    } catch (error) {
        console.error(
            "main.js/loadProgress: Error during fetch/processing in loadProgress:",
            error,
        );
        gameState.docked = false;
        gameState.dockedAtDetails = null;
    }
    console.log(
        "main.js/loadProgress: Function finished. Final gameState.docked:",
        gameState.docked,
    );
}

document.addEventListener("DOMContentLoaded", () => {
    console.log("main.js/DOMContentLoaded event fired");
    const canvas = document.getElementById("gameCanvas");
    const uiContainer = document.getElementById("ui");
    const gameContainer = document.getElementById("game-container");

    if (!canvas || !uiContainer || !gameContainer) {
        console.error(
            "main.js/DOMContentLoaded: Required HTML elements (canvas, ui, game-container) not found!",
        );
        return;
    }
    if (canvas) {
        if (!canvas.hasAttribute("tabindex")) {
            canvas.setAttribute("tabindex", "0");
            console.log(
                "main.js/DOMContentLoaded: Added tabindex=0 to canvas for focus.",
            );
        }
    }

    Renderer.init(canvas);
    UIManager.init(uiContainer);
    initInputListeners(canvas);

    const loginForm = document.getElementById("login-form");
    if (loginForm) {
        loginForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            console.log("main.js/DOMContentLoaded: Login form submitted.");
            const usernameInput = document.getElementById("username");
            const passwordInput = document.getElementById("password");
            if (usernameInput && passwordInput) {
                const username = usernameInput.value;
                const password = passwordInput.value;
                await handleLoginSubmit(username, password);
            } else {
                console.error(
                    "main.js/DOMContentLoaded: Username or password input field not found in login form.",
                );
            }
        });
    } else {
        console.error(
            "main.js/DOMContentLoaded: Login form #login-form not found!",
        );
    }
});

let gameLoopFrameCount = 0;
let lastTime = 0;

function gameLoop(timestamp) {
    gameLoopFrameCount++;
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;

    const canvas = document.getElementById("gameCanvas");

    if (gameLoopFrameCount < 5 || gameLoopFrameCount % 300 === 0) {
        console.log(
            `GameLoop Check (Frame ${gameLoopFrameCount}): deltaTime: ${deltaTime.toFixed(2)}ms, currentUser: ${!!gameState.currentUser}, myId: ${gameState.myId}, myShip Exists: ${!!gameState.myShip}, myShip Content: ${JSON.stringify(gameState.myShip)}, docked: ${gameState.docked}`,
        );
    }

    if (gameState.currentUser && gameState.myId && gameState.myShip) {
        if (!gameState.docked) {
            processInputs(canvas);
        }
        Renderer.draw();
    } else {
        if (gameLoopFrameCount < 5 || gameLoopFrameCount % 300 === 0) {
            console.warn(
                `GameLoop: Main condition FAILED. currentUser: ${!!gameState.currentUser}, myId: ${gameState.myId}, myShip Exists: ${!!gameState.myShip}`,
            );
        }
    }
    requestAnimationFrame(gameLoop);
}
