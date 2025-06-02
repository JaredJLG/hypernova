// hypernova/client/js/main.js

console.log("main.js script started");

import { gameState } from "./game_state.js";
window.gameState = gameState;

import { initNetwork } from "./network.js";
import { Renderer } from "./renderer.js";
import { initInputListeners, processInputs } from "./input_handler.js";
import { UIManager } from "./ui_manager.js";

// --- DYNAMIC LOGIN BACKGROUND & MUSIC (from previous update) ---
let loginBgCanvas, loginBgCtx;
let stars = [];
let shootingStars = [];
let loginAnimationId = null;

// const STAR_COLORS = ["#FFFFFF", "#FFFFE0", "#ADD8E6", "#FFDAB9"]; // Not used if stars are white
// const SHOOTING_STAR_COLOR = "rgba(220, 220, 255, 0.8)"; // Defined in ShootingStar class draw

function getRandom(min, max) {
    return Math.random() * (max - min) + min;
}
class Star {
    constructor(x, y, radius, opacity) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.opacity = opacity;
        this.maxOpacity = opacity;
        this.minOpacity = Math.max(0.1, opacity - 0.5);
        this.opacitySpeed =
            getRandom(0.005, 0.015) * (Math.random() > 0.5 ? 1 : -1);
    }
    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
        ctx.fill();
    }
    update() {
        this.opacity += this.opacitySpeed;
        if (this.opacity > this.maxOpacity || this.opacity < this.minOpacity) {
            this.opacitySpeed *= -1;
            this.opacity = Math.max(
                this.minOpacity,
                Math.min(this.maxOpacity, this.opacity),
            );
        }
    }
}
class ShootingStar {
    constructor() {
        this.reset();
    }
    reset() {
        this.active = true;
        this.x = Math.random() * loginBgCanvas.width;
        this.y = 0;
        this.length = getRandom(150, 300);
        this.angle = getRandom(Math.PI * 0.35, Math.PI * 0.65);
        this.speed = getRandom(300, 500);
        this.opacity = 1;
        this.life = 1;
        const side = Math.random();
        if (side < 0.4) {
            this.x = Math.random() * loginBgCanvas.width;
            this.y = -this.length;
            this.angle = getRandom(Math.PI * 0.4, Math.PI * 0.6);
        } else if (side < 0.7) {
            this.x = -this.length;
            this.y = Math.random() * loginBgCanvas.height * 0.7;
            this.angle = getRandom(Math.PI * 0.15, Math.PI * 0.35);
        } else {
            this.x = loginBgCanvas.width + this.length;
            this.y = Math.random() * loginBgCanvas.height * 0.7;
            this.angle = getRandom(Math.PI * 0.65, Math.PI * 0.85);
        }
        this.vx = Math.cos(this.angle) * this.speed;
        this.vy = Math.sin(this.angle) * this.speed;
    }
    update(deltaTime) {
        if (!this.active) return;
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;
        this.life -= 0.5 * deltaTime;
        if (this.life <= 0) {
            this.active = false;
        }
    }
    draw(ctx) {
        if (!this.active) return;
        const tailX = this.x - Math.cos(this.angle) * this.length;
        const tailY = this.y - Math.sin(this.angle) * this.length;
        const gradient = ctx.createLinearGradient(this.x, this.y, tailX, tailY);
        gradient.addColorStop(
            0,
            `rgba(220, 220, 255, ${this.opacity * this.life})`,
        );
        gradient.addColorStop(
            0.3,
            `rgba(200, 200, 255, ${this.opacity * this.life * 0.5})`,
        );
        gradient.addColorStop(1, `rgba(150, 150, 220, 0)`);
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(tailX, tailY);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = getRandom(1.5, 3);
        ctx.stroke();
    }
}
function createStars() {
    stars = [];
    const numStars = Math.floor(
        (loginBgCanvas.width * loginBgCanvas.height) / 6000,
    );
    for (let i = 0; i < numStars; i++) {
        const x = Math.random() * loginBgCanvas.width;
        const y = Math.random() * loginBgCanvas.height;
        const radius = getRandom(0.2, 1.2);
        const opacity = getRandom(0.2, 0.8);
        stars.push(new Star(x, y, radius, opacity));
    }
}
function animateLoginBackground() {
    loginAnimationId = requestAnimationFrame(animateLoginBackground);
    loginBgCtx.fillStyle = "#00000A";
    loginBgCtx.fillRect(0, 0, loginBgCanvas.width, loginBgCanvas.height);
    stars.forEach((star) => {
        star.update();
        star.draw(loginBgCtx);
    });
    if (Math.random() < 0.015) {
        let newShootingStar = shootingStars.find((s) => !s.active);
        if (newShootingStar) {
            newShootingStar.reset();
        } else if (shootingStars.length < 10) {
            shootingStars.push(new ShootingStar());
        }
    }
    const now = performance.now();
    const deltaTime = (now - (animateLoginBackground.lastTime || now)) / 1000;
    animateLoginBackground.lastTime = now;
    shootingStars.forEach((ss) => {
        ss.update(deltaTime);
        ss.draw(loginBgCtx);
    });
}
function setupLoginMusic() {
    const music = document.getElementById("login-music");
    if (music) {
        music.volume = 0.3;
        music.play().catch((error) => {
            console.warn(
                "Login music autoplay was prevented by the browser:",
                error.message,
            );
            const playMusicOnClick = () => {
                music
                    .play()
                    .catch((e) =>
                        console.warn(
                            "Still couldn't play music after interaction:",
                            e.message,
                        ),
                    );
                document.body.removeEventListener("click", playMusicOnClick);
                document.body.removeEventListener("keydown", playMusicOnClick);
            };
            document.body.addEventListener("click", playMusicOnClick, {
                once: true,
            });
            document.body.addEventListener("keydown", playMusicOnClick, {
                once: true,
            });
        });
    } else {
        console.warn("Login music audio element not found.");
    }
}
function stopLoginScreenVisualsAndMusic() {
    if (loginAnimationId) {
        cancelAnimationFrame(loginAnimationId);
        loginAnimationId = null;
    }
    const music = document.getElementById("login-music");
    if (music) {
        music.pause();
        music.currentTime = 0;
    }
    window.removeEventListener("resize", handleLoginResize);
}
function handleLoginResize() {
    if (loginBgCanvas) {
        loginBgCanvas.width = window.innerWidth;
        loginBgCanvas.height = window.innerHeight;
        createStars();
    }
}
function initLoginScreenVisuals() {
    loginBgCanvas = document.getElementById("login-background-canvas");
    if (!loginBgCanvas) {
        console.error("Login background canvas not found!");
        return;
    }
    loginBgCtx = loginBgCanvas.getContext("2d");
    handleLoginResize();
    animateLoginBackground.lastTime = performance.now();
    animateLoginBackground();
    setupLoginMusic();
    window.addEventListener("resize", handleLoginResize);
}
// --- END DYNAMIC LOGIN BACKGROUND & MUSIC ---

// --- FULLSCREEN GAMEPLAY SETUP ---
function setupGameCanvasFullscreen() {
    const canvas = document.getElementById("gameCanvas");
    if (!canvas) {
        console.error("Game canvas not found for fullscreen setup!");
        return;
    }
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        gameState.camera.width = canvas.width; // Update camera state
        gameState.camera.height = canvas.height;

        if (Renderer.isInitialized()) {
            Renderer.updateViewPort(canvas.width, canvas.height);
        }
        console.log(`Game canvas resized to: ${canvas.width}x${canvas.height}`);
    }
    window.addEventListener("resize", resizeCanvas, false);
    resizeCanvas(); // Initial resize
}
// --- END FULLSCREEN GAMEPLAY SETUP ---

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

            stopLoginScreenVisualsAndMusic();

            document.getElementById("login-screen").classList.add("hidden");
            const gameContainer = document.getElementById("game-container");
            gameContainer.classList.remove("hidden");

            setupGameCanvasFullscreen(); // <<<<<<< SETUP FULLSCREEN GAME CANVAS HERE

            initNetwork(async () => {
                console.log(
                    "main.js/onReadyCallback (from initNetwork): START.",
                );

                // Collect all image paths including system backgrounds
                const systemBackgroundPaths = gameState.clientGameData.systems
                    .filter((sys) => sys.backgroundFile) // Make sure backgroundFile exists
                    .map(
                        (sys) =>
                            `assets/images/backgrounds/${sys.backgroundFile}`,
                    );

                const allImagePaths = [
                    ...new Set([
                        ...gameState.imagePathsToLoad,
                        ...systemBackgroundPaths,
                    ]),
                ];
                // gameState.imagePathsToLoad = allImagePaths; // Update master list if needed elsewhere

                if (allImagePaths.length > 0) {
                    await loadImages(allImagePaths);
                    console.log(
                        "main.js/onReadyCallback: Image loading process complete for all images.",
                    );
                } else {
                    console.log("main.js/onReadyCallback: No images to load.");
                }

                await loadProgress();

                if (gameState.myId && !gameState.myShip) {
                    gameState.allShips[gameState.myId] =
                        gameState.allShips[gameState.myId] || {};
                    gameState.defaultShipProps(gameState.myShip);
                } else if (
                    gameState.myId &&
                    gameState.myShip &&
                    (gameState.myShip.type === undefined ||
                        gameState.myShip.type === null)
                ) {
                    gameState.defaultShipProps(gameState.myShip);
                }

                const canvas = document.getElementById("gameCanvas");
                if (canvas) canvas.focus();

                lastTime = performance.now();
                requestAnimationFrame(gameLoop);
            });
        } else {
            loginErrorEl.textContent =
                result.message || "Login/Registration failed.";
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
    try {
        const response = await fetch(
            `/load-progress?username=${gameState.currentUser.username}`,
        );
        if (response.ok) {
            const progress = await response.json();
            if (progress && progress.shipData) {
                if (gameState.myId) {
                    if (!gameState.allShips[gameState.myId]) {
                        gameState.allShips[gameState.myId] = {};
                    }
                    gameState.updateShipData(gameState.myId, progress.shipData);
                    const syncData = {
                        credits: progress.shipData.credits,
                        cargo: progress.shipData.cargo,
                        weapons: progress.shipData.weapons,
                        activeWeapon: progress.shipData.activeWeapon,
                        health: progress.shipData.health,
                        type: progress.shipData.type,
                        activeMissions: progress.shipData.activeMissions || [],
                    };
                    if (progress.dockedAtDetails) {
                        gameState.docked = true;
                        gameState.dockedAtDetails = progress.dockedAtDetails;
                        syncData.dockedAtDetails = gameState.dockedAtDetails;
                    } else {
                        gameState.docked = false;
                        gameState.dockedAtDetails = null;
                        syncData.dockedAtDetails = null;
                        syncData.x = progress.shipData.x;
                        syncData.y = progress.shipData.y;
                        syncData.angle = progress.shipData.angle;
                        syncData.vx = progress.shipData.vx;
                        syncData.vy = progress.shipData.vy;
                        syncData.system = progress.shipData.system;
                    }
                    if (gameState.socket) {
                        gameState.socket.emit(
                            "clientLoadedDockedState",
                            syncData,
                        );
                    }
                } else {
                    gameState.pendingProgressToApply = progress;
                }
            } else {
                gameState.docked = false;
                gameState.dockedAtDetails = null;
            }
        } else {
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
}

document.addEventListener("DOMContentLoaded", () => {
    console.log("main.js/DOMContentLoaded event fired");

    const loginScreenElement = document.getElementById("login-screen");
    if (
        loginScreenElement &&
        !loginScreenElement.classList.contains("hidden")
    ) {
        initLoginScreenVisuals();
    }

    const canvas = document.getElementById("gameCanvas");
    const uiContainer = document.getElementById("ui");
    const gameContainer = document.getElementById("game-container");

    if (!canvas || !uiContainer || !gameContainer) {
        console.error(
            "main.js/DOMContentLoaded: Required HTML elements not found!",
        );
        return;
    }
    if (canvas) {
        if (!canvas.hasAttribute("tabindex")) {
            canvas.setAttribute("tabindex", "0");
        }
    }

    Renderer.init(canvas);
    UIManager.init(uiContainer);
    initInputListeners(canvas);

    const loginForm = document.getElementById("login-form");
    if (loginForm) {
        loginForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const usernameInput = document.getElementById("username");
            const passwordInput = document.getElementById("password");
            if (usernameInput && passwordInput) {
                await handleLoginSubmit(
                    usernameInput.value,
                    passwordInput.value,
                );
            }
        });
    }
});

let gameLoopFrameCount = 0;
let lastTime = 0;

function gameLoop(timestamp) {
    gameLoopFrameCount++;
    lastTime = timestamp;

    // const canvas = document.getElementById("gameCanvas"); // Not needed here directly

    if (gameState.currentUser && gameState.myId && gameState.myShip) {
        // Update camera to follow player
        if (gameState.myShip) {
            // Simple direct centering
            gameState.camera.x =
                gameState.myShip.x - gameState.camera.width / 2;
            gameState.camera.y =
                gameState.myShip.y - gameState.camera.height / 2;

            // Optional: Smooth camera movement (lerp)
            // const targetX = gameState.myShip.x - gameState.camera.width / 2;
            // const targetY = gameState.myShip.y - gameState.camera.height / 2;
            // gameState.camera.x += (targetX - gameState.camera.x) * gameState.camera.lerpFactor;
            // gameState.camera.y += (targetY - gameState.camera.y) * gameState.camera.lerpFactor;
        }

        if (!gameState.docked) {
            processInputs(); // Canvas argument no longer needed as it refers to gameState.camera
        }
        Renderer.draw();
    }
    requestAnimationFrame(gameLoop);
}
