import { Mutex } from "async-mutex";

const writeMutex = new Mutex();

export async function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  return writeMutex.runExclusive(fn);
}
