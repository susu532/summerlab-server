import { GameModeInfo } from "./GameMode";
import { BLOCK, CHUNK_SIZE, WORLD_Y_OFFSET } from "../constants";
import { ChunkManager } from "../ChunkManager";
import { getSummerLabBlock } from "../../game/generation/SummerLabGenerator";

export class SummerLabMode implements GameModeInfo {
  name: string;
  allowPvP = true;
  allowMobSpawns = false;
  allowPlayerMobSpawns = false;

  constructor(name: string) {
    this.name = name;
  }

  isIndestructible(
    x: number,
    y: number,
    z: number,
    bakedBlocks: Map<string, number>,
    currentBlock: number = 0,
  ): boolean {
    if (y <= 0 && y >= -2) {
       const initialBlock = getSummerLabBlock(Math.floor(x), Math.floor(y), Math.floor(z));
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

    return getSummerLabBlock(x, Math.floor(y), z);
  }

  getRespawnPosition(
    playerId: string,
    playerState?: any,
    chunkManager?: ChunkManager,
    bakedBlocks?: Map<string, number>,
  ): { x: number; y: number; z: number; yaw?: number } {
    return { x: 0, y: 1, z: 0, yaw: 0 };
  }
}
