// 3D world dimensions (metres)
export const FIELD_W   = 90;          // X: –45 … +45
export const FIELD_D   = 130;         // Z: 0 (bunker face) … 130 (allied trench)

export const FINISH_Z  = 4.5;         // player wins when z <= this
export const START_Z   = FIELD_D - 4; // player spawns here

export const BUNKER_H  = 8;           // enemy bunker height
export const TOWER_Y   = 9.8;         // MG tower elevation (on top of bunker)
export const TOWER_Z   = 2.0;         // MG tower depth into scene

export const PLAYER_SPEED     = 7.0;
export const CRAWL_MULT       = 0.30;
export const SPRINT_MULT      = 1.85;
export const PLAYER_MAX_HEALTH = 150;
export const PLAYER_R         = 0.55;  // collision sphere

export const BULLET_DAMAGE    = 14;
export const BULLET_SPEED     = 42;
export const BULLET_LIFE      = 6;     // seconds before despawn
export const BULLET_SPREAD    = 3.5;   // max aim offset (world units)

export const ARTILLERY_DAMAGE        = 90;
export const WIRE_DAMAGE_PER_TICK    = 0.18;

export const ARTILLERY_BLAST_RADIUS  = 6.0;
export const ARTILLERY_WARN_DURATION = 2.2;
export const ARTILLERY_BLAST_DURATION= 0.35;

export const WIRE_BAND_ZS = [26, 64, 98] as const;  // z positions of the 3 wire bands
export const WIRE_GAP_W   = 5.5;

export const FIXED_DT = 1 / 60;
