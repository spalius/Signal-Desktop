// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { chunk } from 'lodash';
import type { LoggerType } from '../../types/Logging';
import { getSendOptions } from '../../util/getSendOptions';
import type { SendTypesType } from '../../util/handleMessageSend';
import { handleMessageSend } from '../../util/handleMessageSend';
import { isNotNil } from '../../util/isNotNil';
import { strictAssert } from '../../util/assert';
import { isRecord } from '../../util/isRecord';

import { commonShouldJobContinue } from './commonShouldJobContinue';
import { handleCommonJobRequestError } from './handleCommonJobRequestError';

const CHUNK_SIZE = 100;

export type SyncType = {
  messageId?: string;
  senderE164?: string;
  senderUuid?: string;
  timestamp: number;
};

/**
 * Parse what _should_ be an array of `SyncType`s.
 *
 * Notably, `null`s made it into the job system and caused jobs to fail. This cleans that
 * up in addition to validating the data.
 */
export function parseRawSyncDataArray(value: unknown): Array<SyncType> {
  strictAssert(Array.isArray(value), 'syncs are not an array');
  return value.map((item: unknown) => {
    strictAssert(isRecord(item), 'sync is not an object');

    const { messageId, senderE164, senderUuid, timestamp } = item;
    strictAssert(typeof timestamp === 'number', 'timestamp should be a number');

    return {
      messageId: parseOptionalString('messageId', messageId),
      senderE164: parseOptionalString('senderE164', senderE164),
      senderUuid: parseOptionalString('senderUuid', senderUuid),
      timestamp,
    };
  });
}

function parseOptionalString(name: string, value: unknown): undefined | string {
  if (typeof value === 'string') {
    return value;
  }
  if (value === undefined || value === null) {
    return undefined;
  }
  throw new Error(`${name} was not a string`);
}

export async function runReadOrViewSyncJob({
  attempt,
  isView,
  log,
  maxRetryTime,
  syncs,
  timestamp,
}: Readonly<{
  attempt: number;
  isView: boolean;
  log: LoggerType;
  maxRetryTime: number;
  syncs: ReadonlyArray<SyncType>;
  timestamp: number;
}>): Promise<void> {
  let sendType: SendTypesType;
  let doSync:
    | typeof window.textsecure.messaging.syncReadMessages
    | typeof window.textsecure.messaging.syncView;
  if (isView) {
    sendType = 'viewSync';
    doSync = window.textsecure.messaging.syncView.bind(
      window.textsecure.messaging
    );
  } else {
    sendType = 'readSync';
    doSync = window.textsecure.messaging.syncReadMessages.bind(
      window.textsecure.messaging
    );
  }

  if (!syncs.length) {
    log.info("skipping this job because there's nothing to sync");
    return;
  }

  const timeRemaining = timestamp + maxRetryTime - Date.now();

  const shouldContinue = await commonShouldJobContinue({
    attempt,
    log,
    timeRemaining,
  });
  if (!shouldContinue) {
    return;
  }

  const ourConversation = window.ConversationController.getOurConversationOrThrow();
  const sendOptions = await getSendOptions(ourConversation.attributes, {
    syncMessage: true,
  });

  try {
    await Promise.all(
      chunk(syncs, CHUNK_SIZE).map(batch => {
        const messageIds = batch.map(item => item.messageId).filter(isNotNil);

        return handleMessageSend(doSync(batch, sendOptions), {
          messageIds,
          sendType,
        });
      })
    );
  } catch (err: unknown) {
    await handleCommonJobRequestError({ err, log, timeRemaining });
  }
}
