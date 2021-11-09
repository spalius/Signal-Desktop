// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/* eslint-disable class-methods-use-this */

import * as durations from '../util/durations';
import type { LoggerType } from '../types/Logging';
import { exponentialBackoffMaxAttempts } from '../util/exponentialBackoff';
import type { SyncType } from './helpers/readAndViewSyncHelpers';
import {
  parseRawSyncDataArray,
  runReadOrViewSyncJob,
} from './helpers/readAndViewSyncHelpers';
import { strictAssert } from '../util/assert';
import { isRecord } from '../util/isRecord';

import { JobQueue } from './JobQueue';
import { jobQueueDatabaseStore } from './JobQueueDatabaseStore';

const MAX_RETRY_TIME = durations.DAY;

export type ViewSyncJobData = {
  viewSyncs: Array<SyncType>;
};

export class ViewSyncJobQueue extends JobQueue<ViewSyncJobData> {
  protected parseData(data: unknown): ViewSyncJobData {
    strictAssert(isRecord(data), 'data is not an object');
    return { viewSyncs: parseRawSyncDataArray(data.viewSyncs) };
  }

  protected async run(
    { data, timestamp }: Readonly<{ data: ViewSyncJobData; timestamp: number }>,
    { attempt, log }: Readonly<{ attempt: number; log: LoggerType }>
  ): Promise<void> {
    await runReadOrViewSyncJob({
      attempt,
      isView: true,
      log,
      maxRetryTime: MAX_RETRY_TIME,
      syncs: data.viewSyncs,
      timestamp,
    });
  }
}

export const viewSyncJobQueue = new ViewSyncJobQueue({
  store: jobQueueDatabaseStore,
  queueType: 'view sync',
  maxAttempts: exponentialBackoffMaxAttempts(MAX_RETRY_TIME),
});
