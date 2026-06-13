import { GameModeInfo } from "./GameMode";
import { BLOCK, CHUNK_SIZE, WORLD_Y_OFFSET, isWaterBlock } from "../constants";
import { ChunkManager } from "../ChunkManager";
import { getSummerLabBlock } from "../../game/generation/SummerLabGenerator";
import { getWaterParkBlock } from "../../game/generation/WaterParkGenerator";
import { getHappyIslandBlock } from "../../game/generation/HappyIslandGenerator";
import { getBackroomsBlock } from "../../game/generation/BackroomsGenerator";
import { GameContext } from "../GameContext";
import { ItemType } from "../../game/Inventory";

export function getSummerLabPhase(now: number = Date.now()): number {
   return Math.floor(now / 300000) % 4; // 0: Classic, 1: WaterPark, 2: HappyIsland, 3: Backrooms
}

export class SummerLabMode implements GameModeInfo {
  name: string;
  allowPvP = true;
  allowMobSpawns = false;
  allowPlayerMobSpawns = false;
  currentPhase: number = 0;
  initialized: boolean = false;

  constructor(name: string) {
    this.name = name;
    this.currentPhase = getSummerLabPhase(Date.now());
  }

   generateSplats(ctx: GameContext) {
     if (this.currentPhase === 2 || this.currentPhase === 3) return; // Happy Island & Backrooms have no splats
     const isWaterPark = this.currentPhase === 1;
     const splatColor = isWaterPark ? 0x00A8FF : 0x3d1c04; // Blue for water park, Chocolate for classic
     let placed = 0;
     
     // 15000 randomized attempts to place up to 2000 splats
     for (let i = 0; i < 15000 && placed < 2000; i++) {
         const x = Math.floor(Math.random() * 128) - 64;
         const z = Math.floor(Math.random() * 128) - 64;
         
         // Optimize raycast starting Y based on map layout
         const ax = Math.abs(x);
         const az = Math.abs(z);
         let startY = 5; // Default for ground outside castle
         if (ax <= 4 && az <= 4) startY = 85; 
         else if (ax <= 20 && az <= 20) startY = 60; 
         else if (Math.abs(ax - 35) <= 7 && Math.abs(az - 35) <= 7) startY = 50; 
         else if (ax <= 40 && ax >= 20 && az <= 40) startY = 15; 
         
         if (isWaterPark) {
             // Water park is generally much lower vertically
             startY = 35;
         }
         
         // Raycast downwards from the localized max height 
         for (let y = startY; y >= -10; y--) {
             const block = isWaterPark ? getWaterParkBlock(x, y, z) : getSummerLabBlock(x, y, z);
             if (block !== 0) {
                 // Found surface
                 if (!isWaterBlock(block) && block !== ItemType.AIR) {
                     // Not water, we can place the splat
                     const sx = x + (Math.random() - 0.5) * 0.8;
                     const sz = z + (Math.random() - 0.5) * 0.8;
                     const sy = y + 1.01;
                     
                     let finalColor = splatColor;
                     if (isWaterPark) {
                        // Cyan/Aqua variations
                        finalColor = Math.random() < 0.3 ? 0x00E5FF : splatColor;
                     } else {
                        // Darker chocolate variations
                        finalColor = Math.random() < 0.3 ? 0x2b1301 : splatColor;
                     }
                     
                     const splat = [sx, sy, sz, 0, 1, 0, finalColor];
                     const key = Math.floor(sx * 5) + "," + Math.floor(sy * 5) + "," + Math.floor(sz * 5);
                     ctx.globalSplats.set(key, splat);
                     placed++;
                 }
                 break; // Hit a block, don't continue down
             }
         }
     }
  }

  onTick(ctx: GameContext, delta: number, now: number) {
     const phase = getSummerLabPhase(now);
     
     if (!this.initialized) {
         this.initialized = true;
         this.generateSplats(ctx);
     }
     
     if (this.currentPhase !== phase) {
         this.currentPhase = phase;
         ctx.chunkManager.resetWorld();
         ctx.globalSplats.clear();
         ctx.pendingBlockUpdates.length = 0;
         ctx.state.lastMapResetTime = Date.now();
         
         // Clear dropped items to prevent them from getting stuck
         for (const itemId in ctx.droppedItems) {
             ctx.ioNamespace.emit("itemDespawned", itemId);
             delete ctx.droppedItems[itemId];
         }
         
         // Clear mobs
         for (const mobId in ctx.mobs) {
             ctx.ioNamespace.emit("mobDespawned", mobId);
             ctx.releaseMobToPool(ctx.mobs[mobId]);
             delete ctx.mobs[mobId];
         }
         
         this.generateSplats(ctx);
         ctx.ioNamespace.emit("splats", Array.from(ctx.globalSplats.values()));
         
         // Notify players
         const modeName = phase === 1 ? "Water Park" : phase === 2 ? "Happy Island" : phase === 3 ? "The Backrooms" : "Summer Lab Classic";
         ctx.ioNamespace.emit("chatMessage", {
             sender: "System",
             message: `World updated! Now entering: ${modeName}!`,
         });
         
         // In a voxel engine, chunks aren't auto-sent if they were already sent and cleared from server.
         // Tell clients to clear their chunks and re-request.
         ctx.ioNamespace.emit("forceReloadMap", { phase: phase });
         
         // Reposition everyone
         const respawn = this.getRespawnPosition("system");
         for (const id in ctx.players) {
             const p = ctx.players[id];
             p.position = { x: respawn.x, y: respawn.y, z: respawn.z };
             p.velocity = { x: 0, y: 0, z: 0 };
             ctx.ioNamespace.emit("playerRespawn", { id, position: p.position, yaw: respawn.yaw });
         }
     }
  }

  isIndestructible(
    x: number,
    y: number,
    z: number,
    bakedBlocks: Map<string, number>,
    currentBlock: number = 0,
  ): boolean {
    const fx = Math.floor(x);
    const fy = Math.floor(y);
    const fz = Math.floor(z);

    // 5x5 disallowed building zone at spawn positions
    if (this.currentPhase === 1) {
      if (Math.abs(fx - 0) <= 2 && Math.abs(fz - 35) <= 2) return true;
    } else if (this.currentPhase === 2) {
      if (Math.abs(fx - 0) <= 2 && Math.abs(fz - 0) <= 2) return true;
    } else if (this.currentPhase === 3) {
      // The Backrooms is a maze that should not be altered, so protect its blocks fully.
      const initialBlock = getBackroomsBlock(fx, fy, fz);
      if (initialBlock !== 0 && initialBlock !== ItemType.AIR) return true;
      if (Math.abs(fx - 2) <= 2 && Math.abs(fz - 2) <= 2) return true;
    } else {
      if (Math.abs(fx - 0) <= 2 && Math.abs(fz - 25) <= 2) return true;
    }

    // Instead of just protecting y <= 0, protect ANY block that was part of the original map generation
    // so players can't tear down the castle, water park rules, or happy island trees.
    let initialBlock = 0;
    if (this.currentPhase === 1) initialBlock = getWaterParkBlock(fx, fy, fz);
    else if (this.currentPhase === 2) initialBlock = getHappyIslandBlock(fx, fy, fz);
    else if (this.currentPhase === 3) initialBlock = getBackroomsBlock(fx, fy, fz);
    else initialBlock = getSummerLabBlock(fx, fy, fz);
    
    if (initialBlock !== 0 && initialBlock !== ItemType.AIR) return true;

    return false;
  }

  getBlockAt(
    x: number,
    y: number,
    z: number,
    chunkManager: ChunkManager,
    bakedBlocks: Map<string, number>,
  ): number {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const chunkType = chunkManager.getBlockFromChunk(
      cx,
      cz,
      lx,
      Math.floor(y) - WORLD_Y_OFFSET,
      lz,
    );
    if (chunkType !== undefined) return chunkType;

    if (this.currentPhase === 1) return getWaterParkBlock(x, Math.floor(y), z);
    if (this.currentPhase === 2) return getHappyIslandBlock(x, Math.floor(y), z);
    if (this.currentPhase === 3) return getBackroomsBlock(x, Math.floor(y), z);
    return getSummerLabBlock(x, Math.floor(y), z);
  }

  getRespawnPosition(
    playerId: string,
    playerState?: any,
    chunkManager?: ChunkManager,
    bakedBlocks?: Map<string, number>,
  ): { x: number; y: number; z: number; yaw?: number } {
    let spawnY = 25;
    if (this.currentPhase === 1) {
      spawnY = 2; // Water Park Walkway
      for(let y = 10; y >= 0; y--) {
        if (getWaterParkBlock(0, y, 35) !== 0 && getWaterParkBlock(0, y, 35) !== ItemType.WATER) {
           spawnY = y + 1.5;
           break;
        }
      }
      return { x: 0, y: spawnY, z: 35, yaw: 0 };
    } else if (this.currentPhase === 2) {
      spawnY = 18;
      for(let y = 30; y >= 0; y--) {
        if (getHappyIslandBlock(0, y, 0) !== 0) {
           spawnY = y + 1.5;
           break;
        }
      }
      return { x: 0, y: spawnY, z: 0, yaw: 0 };
    } else if (this.currentPhase === 3) {
      return { x: 2.5, y: 1.5, z: 2.5, yaw: 0 };
    }
    
    spawnY = 2;
    for(let y = 20; y >= 0; y--) {
      if (getSummerLabBlock(0, y, 25) !== 0) {
         spawnY = y + 1.5;
         break;
      }
    }
    return { x: 0, y: spawnY, z: 25, yaw: 0 };
  }
}
