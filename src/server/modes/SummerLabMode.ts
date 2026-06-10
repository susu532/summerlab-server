import { GameModeInfo } from "./GameMode";
import { BLOCK, CHUNK_SIZE, WORLD_Y_OFFSET, isWaterBlock } from "../constants";
import { ChunkManager } from "../ChunkManager";
import { getSummerLabBlock } from "../../game/generation/SummerLabGenerator";
import { getWaterParkBlock } from "../../game/generation/WaterParkGenerator";

export function isWaterParkPhase(now: number = Date.now()): boolean {
   return Math.floor(now / 600000) % 2 === 1;
}
import { GameContext } from "../GameContext";
import { ItemType } from "../../game/Inventory";

export class SummerLabMode implements GameModeInfo {
  name: string;
  allowPvP = true;
  allowMobSpawns = false;
  allowPlayerMobSpawns = false;
  currentPhase: boolean = false;
  initialized: boolean = false;

  constructor(name: string) {
    this.name = name;
    this.currentPhase = isWaterParkPhase(Date.now());
  }

   generateSplats(ctx: GameContext) {
     const isWaterPark = this.currentPhase;
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
                     
                     const splat = [sx, sy, sz, 0, 1, 0, splatColor];
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
     const phase = isWaterParkPhase(now);
     
     if (!this.initialized) {
         this.initialized = true;
         this.generateSplats(ctx);
     }
     
     if (this.currentPhase !== phase) {
         this.currentPhase = phase;
         ctx.chunkManager.resetWorld();
         ctx.globalSplats.clear();
         
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
         
         // Notify players
         const modeName = phase ? "Water Park" : "Summer Lab Classic";
         ctx.ioNamespace.emit("chatMessage", {
             sender: "System",
             message: `World updated! Now entering: ${modeName}!`,
         });
         
         // In a voxel engine, chunks aren't auto-sent if they were already sent and cleared from server.
         // Tell clients to clear their chunks and re-request.
         ctx.ioNamespace.emit("forceReloadMap", { isWaterPark: phase });
         
         // Reposition everyone
         const respawn = this.getRespawnPosition("system");
         for (const id in ctx.players) {
             const p = ctx.players[id];
             p.position = { x: respawn.x, y: respawn.y, z: respawn.z };
             p.velocity = { x: 0, y: 0, z: 0 };
             if (!p.isBot) {
               ctx.ioNamespace.to(id).emit("playerRespawn", { id, position: p.position });
             }
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
    if (this.currentPhase) {
      if (Math.abs(fx - 0) <= 2 && Math.abs(fz - 35) <= 2) return true;
    } else {
      if (Math.abs(fx - 0) <= 2 && Math.abs(fz - 25) <= 2) return true;
    }

    if (y <= 0 && y >= -2) {
       const initialBlock = this.currentPhase ? getWaterParkBlock(fx, fy, fz) : getSummerLabBlock(fx, fy, fz);
       if (initialBlock !== 0) return true;
    }
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

    return this.currentPhase ? getWaterParkBlock(x, Math.floor(y), z) : getSummerLabBlock(x, Math.floor(y), z);
  }

  getRespawnPosition(
    playerId: string,
    playerState?: any,
    chunkManager?: ChunkManager,
    bakedBlocks?: Map<string, number>,
  ): { x: number; y: number; z: number; yaw?: number } {
    if (this.currentPhase) {
         // Water Park mode -> spawn on the main walkway at z=35, perfectly flat ground, y=5 drops them gently to y=1
      return { x: 0, y: 6, z: 35, yaw: 0 };
    }
    // Summer Lab Classic mode -> spawn in the courtyard outside the keep at z=25, ground is at y=0
    return { x: 0, y: 6, z: 25, yaw: 0 };
  }
}
