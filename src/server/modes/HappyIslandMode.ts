import { GameModeInfo } from "./GameMode";
import { GameContext } from "../GameContext";
import { getHappyIslandBlock } from "../../game/generation/HappyIslandGenerator";
import { ChunkManager } from "../ChunkManager";

export class HappyIslandMode implements GameModeInfo {
  name: string;
  allowPvP = true;
  allowMobSpawns = true;
  allowPlayerMobSpawns = true;

  constructor(name: string = '/happyisland') {
    this.name = name;
  }

  isIndestructible(
    x: number,
    y: number,
    z: number,
    bakedBlocks: Map<string, number>,
    currentBlock: number = 0,
  ): boolean {
    if (y < -10) return true;
    return false;
  }

  getBlockAt(
    x: number,
    y: number,
    z: number,
    chunkManager: ChunkManager,
    bakedBlocks: Map<string, number>,
  ): number {
    return getHappyIslandBlock(x, y, z);
  }

  getRespawnPosition(
    playerId: string,
    playerState?: any,
    chunkManager?: ChunkManager,
    bakedBlocks?: Map<string, number>,
  ): { x: number; y: number; z: number; yaw?: number } {
    let spawnY = 18;
    for (let y = 30; y >= 0; y--) {
      if (getHappyIslandBlock(0, y, 0) !== 0) {
        spawnY = y + 1.5;
        break;
      }
    }
    return { x: 0, y: spawnY, z: 0, yaw: 0 };
  }
}
