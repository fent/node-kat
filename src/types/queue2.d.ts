declare module 'queue2' {
  import { EventEmitter } from 'node:events';

  namespace Q {
    export interface Task {
      num: number;
      injected: boolean;
      args: unknown[];
      callback?:
        | ((err?: Error | null, ...results: unknown[]) => void)
        | undefined;
    }

    export interface Worker1World {
      num: number;
      injected: boolean;
      inject: (list: unknown[]) => void;
    }

    export type Worker1 = (this: Worker1World, ...args: never[]) => unknown;
    export type Worker2 = (...args: never[]) => unknown;
  }

  class Q extends EventEmitter {
    public worker1: Q.Worker1;
    public worker2: Q.Worker2;
    public concurrency: number | undefined;
    public queue: Q.Task[];
    public running1: Q.Task[];
    public running2: Q.Task[];
    public active: number;
    constructor(worker1: Q.Worker1, worker2: Q.Worker2, concurrency?: number);
    push(...args: unknown[]): void;
    die(): void;
  }

  export = Q;
}
