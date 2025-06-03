// client/js/client_config.js
export const BASE_THRUST = 0.1;
export const BASE_ROTATION_SPEED = 0.12; // This will now be max angular velocity factor
export const ANGULAR_ACCELERATION = 0.004; // How quickly ship reaches max turn speed (radians/frame^2 approx)
export const ANGULAR_DAMPING = 0.92;     // How quickly ship stops turning (closer to 1 = less damping)
export const DAMPING = 0.9995; 
export const PROJECTILE_LIFESPAN_MS = 2000; 
export const DOCKING_DISTANCE_SQUARED = 400; // (20px)^2
export const MIN_HYPERJUMP_DISTANCE_FROM_PLANET_SQUARED = 22500; // (150px)^2 - adjust as needed
export const HYPERJUMP_CHARGE_TIME_MS = 3000; // 3 seconds
export const HYPERJUMP_DENIED_MESSAGE_DURATION_MS = 3000; // 3 seconds
export const EXPLOSION_LIFESPAN_MS = 500; 
