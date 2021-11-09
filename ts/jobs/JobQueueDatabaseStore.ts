// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { noop } from 'lodash';
import { AsyncQueue } from '../util/AsyncQueue';
import { concat, wrapPromise } from '../util/asyncIterables';
import type { JobQueueStore, StoredJob } from './types';
import { formatJobForInsert } from './formatJobForInsert';
import databaseInterface from '../sql/Client';
import * as log from '../logging/log';

type Database = {
  getJobsInQueue(queueType: string): Promise<Array<StoredJob>>;
  insertJob(job: Readonly<StoredJob>): Promise<void>;
  deleteJob(id: string): Promise<void>;
};

export class JobQueueDatabaseStore implements JobQueueStore {
  private activeQueueTypes = new Set<string>();

  private queues = new Map<string, AsyncQueue<StoredJob>>();

  private initialFetchPromises = new Map<string, Promise<void>>();

  constructor(private readonly db: Database) {}

  async insert(
    job: Readonly<StoredJob>,
    { shouldPersist = true }: Readonly<{ shouldPersist?: boolean }> = {}
  ): Promise<void> {
    log.info(
      `JobQueueDatabaseStore adding job ${job.id} to queue ${JSON.stringify(
        job.queueType
      )}`
    );

    const initialFetchPromise = this.initialFetchPromises.get(job.queueType);
    if (!initialFetchPromise) {
      throw new Error(
        `JobQueueDatabaseStore tried to add job for queue ${JSON.stringify(
          job.queueType
        )} but streaming had not yet started`
      );
    }
    await initialFetchPromise;

    if (shouldPersist) {
      await this.db.insertJob(formatJobForInsert(job));
    }

    this.getQueue(job.queueType).add(job);
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteJob(id);
  }

  stream(queueType: string): AsyncIterable<StoredJob> {
    if (this.activeQueueTypes.has(queueType)) {
      throw new Error(
        `Cannot stream queue type ${JSON.stringify(queueType)} more than once`
      );
    }
    this.activeQueueTypes.add(queueType);

    return concat([
      wrapPromise(this.fetchJobsAtStart(queueType)),
      this.getQueue(queueType),
    ]);
  }

  private getQueue(queueType: string): AsyncQueue<StoredJob> {
    const existingQueue = this.queues.get(queueType);
    if (existingQueue) {
      return existingQueue;
    }

    const result = new AsyncQueue<StoredJob>();
    this.queues.set(queueType, result);
    return result;
  }

  private async fetchJobsAtStart(queueType: string): Promise<Array<StoredJob>> {
    log.info(
      `JobQueueDatabaseStore fetching existing jobs for queue ${JSON.stringify(
        queueType
      )}`
    );

    // This is initialized to `noop` because TypeScript doesn't know that `Promise` calls
    //   its callback synchronously, making sure `onFinished` is defined.
    let onFinished: () => void = noop;
    const initialFetchPromise = new Promise<void>(resolve => {
      onFinished = resolve;
    });
    this.initialFetchPromises.set(queueType, initialFetchPromise);

    const result = await this.db.getJobsInQueue(queueType);
    log.info(
      `JobQueueDatabaseStore finished fetching existing ${
        result.length
      } jobs for queue ${JSON.stringify(queueType)}`
    );
    onFinished();
    return result;
  }
}

export const jobQueueDatabaseStore = new JobQueueDatabaseStore(
  databaseInterface
);
