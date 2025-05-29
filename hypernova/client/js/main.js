// hypernova/client/js/main.js
import { gameState } from "./game_state.js";
import { initNetwork } from "./network.js";
import { Renderer } from "./renderer.js";
import { initInputListeners, processInputs } from "./input_handler.js";
import { UIManager } from "./ui_manager.js";

// IMAGE LOADING FUNCTION
async function loadImages(imagePaths) {
    const imagePromises = imagePaths.map((path) => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                // Store by filename only for easier lookup in renderer
                const filename = path.substring(path.lastIndexOf("/") + 1);
                console.log(`Loaded image: ${path} as ${filename}`);
                gameState.loadedImages[filename] = img;
                resolve(img);
            };
            img.onerror = (err) => {
                console.error(`Failed to load image: ${path}`, err);
                // Optionally, resolve with a placeholder or mark as failed to prevent game from stalling
                // For now, we reject, which will be caught by Promise.all
                reject(new Error(`Failed to load image: ${path}`));
            };
            img.src = path; // Path should be relative to index.html, e.g., 'assets/images/planet.png'
        });
    });

    try {
        await Promise.all(imagePromises);
        console.log("All images to be loaded have been processed.");
    } catch (error) {
        console.error("Error during image loading process:", error);
        // Decide how to handle critical image loading failure.
        // For example, show an error message to the user or try to proceed with placeholders.
        // alert("Some game images failed to load. The game might not look right.");
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById("gameCanvas");
    const uiContainer = document.getElementById("ui");

    if (!canvas || !uiContainer) {
        console.error("Canvas or UI container not found!");
        return;
    }

    Renderer.init(canvas);
    UIManager.init(uiContainer);
    initInputListeners(canvas);

    // Initialize network and start game loop once connected, init data received, AND images loaded
    initNetwork(async () => {
        // Make the callback async
        console.log(
            "Network initialized, game data received. Preparing to load images.",
        );
        if (
            gameState.imagePathsToLoad &&
            gameState.imagePathsToLoad.length > 0
        ) {
            await loadImages(gameState.imagePathsToLoad); // Wait for images to load
            console.log("Image loading process complete. Starting game loop.");
        } else {
            console.log(
                "No images to load (or imagePathsToLoad not populated). Starting game loop directly.",
            );
        }
        gameLoop(); // Start the game loop
    });

    let lastTime = 0;
    function gameLoop(timestamp) {
        // const deltaTime = timestamp - lastTime; // Not used yet, but good for physics
        lastTime = timestamp;

        if (gameState.myId && gameState.myShip) {
            if (!gameState.docked) {
                processInputs(canvas);
            }
            Renderer.draw();
        } else {
            const ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "#0f0";
            ctx.font = "16px monospace";
            ctx.textAlign = "center";
            ctx.fillText(
                "Connecting to server or waiting for init data...",
                canvas.width / 2,
                canvas.height / 2,
            );
        }

        requestAnimationFrame(gameLoop);
    }
});
