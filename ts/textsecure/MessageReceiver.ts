// Copyright 2020-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/* eslint-disable no-bitwise */
/* eslint-disable class-methods-use-this */
/* eslint-disable camelcase */

import { isNumber, map } from 'lodash';
import PQueue from 'p-queue';
import { v4 as getGuid } from 'uuid';

import type {
  SealedSenderDecryptionResult,
  SenderCertificate,
  UnidentifiedSenderMessageContent,
} from '@signalapp/signal-client';
import {
  DecryptionErrorMessage,
  groupDecrypt,
  PlaintextContent,
  PreKeySignalMessage,
  processSenderKeyDistributionMessage,
  ProtocolAddress,
  PublicKey,
  sealedSenderDecryptMessage,
  sealedSenderDecryptToUsmc,
  SenderKeyDistributionMessage,
  signalDecrypt,
  signalDecryptPreKey,
  SignalMessage,
} from '@signalapp/signal-client';

import {
  IdentityKeys,
  PreKeys,
  SenderKeys,
  Sessions,
  SignedPreKeys,
} from '../LibSignalStores';
import { verifySignature } from '../Curve';
import { strictAssert } from '../util/assert';
import type { BatcherType } from '../util/batcher';
import { createBatcher } from '../util/batcher';
import { dropNull } from '../util/dropNull';
import { normalizeUuid } from '../util/normalizeUuid';
import { normalizeNumber } from '../util/normalizeNumber';
import { parseIntOrThrow } from '../util/parseIntOrThrow';
import { Zone } from '../util/Zone';
import { deriveMasterKeyFromGroupV1 } from '../Crypto';
import type { DownloadedAttachmentType } from '../types/Attachment';
import { Address } from '../types/Address';
import { QualifiedAddress } from '../types/QualifiedAddress';
import { UUID } from '../types/UUID';
import * as Errors from '../types/errors';

import { SignalService as Proto } from '../protobuf';
import type { UnprocessedType } from '../textsecure.d';
import { deriveGroupFields, MASTER_KEY_LENGTH } from '../groups';

import createTaskWithTimeout from './TaskWithTimeout';
import { processAttachment, processDataMessage } from './processDataMessage';
import { processSyncMessage } from './processSyncMessage';
import type { EventHandler } from './EventTarget';
import EventTarget from './EventTarget';
import { downloadAttachment } from './downloadAttachment';
import type { IncomingWebSocketRequest } from './WebsocketResources';
import { ContactBuffer, GroupBuffer } from './ContactsParser';
import type { WebAPIType } from './WebAPI';
import type { Storage } from './Storage';
import { WarnOnlyError } from './Errors';
import * as Bytes from '../Bytes';
import type {
  ProcessedDataMessage,
  ProcessedSyncMessage,
  ProcessedSent,
  ProcessedEnvelope,
  IRequestHandler,
} from './Types.d';
import type { ReconnectEvent, EnvelopeEvent } from './messageReceiverEvents';
import {
  EmptyEvent,
  ProgressEvent,
  TypingEvent,
  ErrorEvent,
  DeliveryEvent,
  DecryptionErrorEvent,
  SentEvent,
  ProfileKeyUpdateEvent,
  MessageEvent,
  RetryRequestEvent,
  ReadEvent,
  ViewEvent,
  ConfigurationEvent,
  ViewOnceOpenSyncEvent,
  MessageRequestResponseEvent,
  FetchLatestEvent,
  KeysEvent,
  StickerPackEvent,
  VerifiedEvent,
  ReadSyncEvent,
  ViewSyncEvent,
  ContactEvent,
  ContactSyncEvent,
  GroupEvent,
  GroupSyncEvent,
} from './messageReceiverEvents';
import * as log from '../logging/log';

const GROUPV1_ID_LENGTH = 16;
const GROUPV2_ID_LENGTH = 32;
const RETRY_TIMEOUT = 2 * 60 * 1000;

type UnsealedEnvelope = Readonly<
  ProcessedEnvelope & {
    unidentifiedDeliveryReceived?: boolean;
    contentHint?: number;
    groupId?: string;
    usmc?: UnidentifiedSenderMessageContent;
    certificate?: SenderCertificate;
    unsealedContent?: UnidentifiedSenderMessageContent;
  }
>;

type DecryptResult = Readonly<{
  envelope: UnsealedEnvelope;
  plaintext?: Uint8Array;
}>;

type DecryptSealedSenderResult = Readonly<{
  plaintext?: Uint8Array;
  unsealedPlaintext?: SealedSenderDecryptionResult;
}>;

type CacheAddItemType = {
  envelope: ProcessedEnvelope;
  data: UnprocessedType;
  request: Pick<IncomingWebSocketRequest, 'respond'>;
};

type LockedStores = {
  readonly sessionStore: Sessions;
  readonly identityKeyStore: IdentityKeys;
  readonly zone?: Zone;
};

enum TaskType {
  Encrypted = 'Encrypted',
  Decrypted = 'Decrypted',
}

export type MessageReceiverOptions = {
  server: WebAPIType;
  storage: Storage;
  serverTrustRoot: string;
};

export default class MessageReceiver
  extends EventTarget
  implements IRequestHandler {
  private server: WebAPIType;

  private storage: Storage;

  private appQueue: PQueue;

  private decryptAndCacheBatcher: BatcherType<CacheAddItemType>;

  private cacheRemoveBatcher: BatcherType<string>;

  private count: number;

  private processedCount: number;

  private incomingQueue: PQueue;

  private isEmptied?: boolean;

  private encryptedQueue: PQueue;

  private decryptedQueue: PQueue;

  private retryCachedTimeout: NodeJS.Timeout | undefined;

  private serverTrustRoot: Uint8Array;

  private stoppingProcessing?: boolean;

  constructor({ server, storage, serverTrustRoot }: MessageReceiverOptions) {
    super();

    this.server = server;
    this.storage = storage;

    this.count = 0;
    this.processedCount = 0;

    if (!serverTrustRoot) {
      throw new Error('Server trust root is required!');
    }
    this.serverTrustRoot = Bytes.fromBase64(serverTrustRoot);

    this.incomingQueue = new PQueue({ concurrency: 1, timeout: 1000 * 60 * 2 });
    this.appQueue = new PQueue({ concurrency: 1, timeout: 1000 * 60 * 2 });

    // All envelopes start in encryptedQueue and progress to decryptedQueue
    this.encryptedQueue = new PQueue({
      concurrency: 1,
      timeout: 1000 * 60 * 2,
    });
    this.decryptedQueue = new PQueue({
      concurrency: 1,
      timeout: 1000 * 60 * 2,
    });

    this.decryptAndCacheBatcher = createBatcher<CacheAddItemType>({
      name: 'MessageReceiver.decryptAndCacheBatcher',
      wait: 75,
      maxSize: 30,
      processBatch: (items: Array<CacheAddItemType>) => {
        // Not returning the promise here because we don't want to stall
        // the batch.
        this.decryptAndCacheBatch(items);
      },
    });
    this.cacheRemoveBatcher = createBatcher<string>({
      name: 'MessageReceiver.cacheRemoveBatcher',
      wait: 75,
      maxSize: 30,
      processBatch: this.cacheRemoveBatch.bind(this),
    });
  }

  public getProcessedCount(): number {
    return this.processedCount;
  }

  public handleRequest(request: IncomingWebSocketRequest): void {
    // We do the message decryption here, instead of in the ordered pending queue,
    // to avoid exposing the time it took us to process messages through the time-to-ack.
    log.info('MessageReceiver: got request', request.verb, request.path);
    if (request.path !== '/api/v1/message') {
      request.respond(200, 'OK');

      if (request.verb === 'PUT' && request.path === '/api/v1/queue/empty') {
        this.incomingQueue.add(() => {
          this.onEmpty();
        });
      }
      return;
    }

    const job = async () => {
      const headers = request.headers || [];

      if (!request.body) {
        throw new Error(
          'MessageReceiver.handleRequest: request.body was falsey!'
        );
      }

      const plaintext = request.body;

      try {
        const decoded = Proto.Envelope.decode(plaintext);
        const serverTimestamp = normalizeNumber(decoded.serverTimestamp);

        const envelope: ProcessedEnvelope = {
          // Make non-private envelope IDs dashless so they don't get redacted
          //   from logs
          id: getGuid().replace(/-/g, ''),
          receivedAtCounter: window.Signal.Util.incrementMessageCounter(),
          receivedAtDate: Date.now(),
          // Calculate the message age (time on server).
          messageAgeSec: this.calculateMessageAge(headers, serverTimestamp),

          // Proto.Envelope fields
          type: decoded.type,
          source: decoded.source,
          sourceUuid: decoded.sourceUuid
            ? normalizeUuid(
                decoded.sourceUuid,
                'MessageReceiver.handleRequest.sourceUuid'
              )
            : undefined,
          sourceDevice: decoded.sourceDevice,
          timestamp: normalizeNumber(decoded.timestamp),
          legacyMessage: dropNull(decoded.legacyMessage),
          content: dropNull(decoded.content),
          serverGuid: decoded.serverGuid,
          serverTimestamp,
        };

        // After this point, decoding errors are not the server's
        //   fault, and we should handle them gracefully and tell the
        //   user they received an invalid message

        this.decryptAndCache(envelope, plaintext, request);
        this.processedCount += 1;
      } catch (e) {
        request.respond(500, 'Bad encrypted websocket message');
        log.error('Error handling incoming message:', Errors.toLogFormat(e));
        await this.dispatchAndWait(new ErrorEvent(e));
      }
    };

    this.incomingQueue.add(job);
  }

  public reset(): void {
    // We always process our cache before processing a new websocket message
    this.incomingQueue.add(async () => this.queueAllCached());

    this.count = 0;
    this.isEmptied = false;
    this.stoppingProcessing = false;
  }

  public stopProcessing(): void {
    this.stoppingProcessing = true;
  }

  public hasEmptied(): boolean {
    return Boolean(this.isEmptied);
  }

  public async drain(): Promise<void> {
    const waitForEncryptedQueue = async () =>
      this.addToQueue(async () => {
        log.info('drained');
      }, TaskType.Decrypted);

    const waitForIncomingQueue = async () =>
      this.addToQueue(waitForEncryptedQueue, TaskType.Encrypted);

    return this.incomingQueue.add(waitForIncomingQueue);
  }

  //
  // EventTarget types
  //

  public addEventListener(
    name: 'reconnect',
    handler: (ev: ReconnectEvent) => void
  ): void;

  public addEventListener(
    name: 'empty',
    handler: (ev: EmptyEvent) => void
  ): void;

  public addEventListener(
    name: 'progress',
    handler: (ev: ProgressEvent) => void
  ): void;

  public addEventListener(
    name: 'typing',
    handler: (ev: TypingEvent) => void
  ): void;

  public addEventListener(
    name: 'error',
    handler: (ev: ErrorEvent) => void
  ): void;

  public addEventListener(
    name: 'delivery',
    handler: (ev: DeliveryEvent) => void
  ): void;

  public addEventListener(
    name: 'decryption-error',
    handler: (ev: DecryptionErrorEvent) => void
  ): void;

  public addEventListener(name: 'sent', handler: (ev: SentEvent) => void): void;

  public addEventListener(
    name: 'profileKeyUpdate',
    handler: (ev: ProfileKeyUpdateEvent) => void
  ): void;

  public addEventListener(
    name: 'message',
    handler: (ev: MessageEvent) => void
  ): void;

  public addEventListener(
    name: 'retry-request',
    handler: (ev: RetryRequestEvent) => void
  ): void;

  public addEventListener(name: 'read', handler: (ev: ReadEvent) => void): void;

  public addEventListener(name: 'view', handler: (ev: ViewEvent) => void): void;

  public addEventListener(
    name: 'configuration',
    handler: (ev: ConfigurationEvent) => void
  ): void;

  public addEventListener(
    name: 'viewOnceOpenSync',
    handler: (ev: ViewOnceOpenSyncEvent) => void
  ): void;

  public addEventListener(
    name: 'messageRequestResponse',
    handler: (ev: MessageRequestResponseEvent) => void
  ): void;

  public addEventListener(
    name: 'fetchLatest',
    handler: (ev: FetchLatestEvent) => void
  ): void;

  public addEventListener(name: 'keys', handler: (ev: KeysEvent) => void): void;

  public addEventListener(
    name: 'sticker-pack',
    handler: (ev: StickerPackEvent) => void
  ): void;

  public addEventListener(
    name: 'verified',
    handler: (ev: VerifiedEvent) => void
  ): void;

  public addEventListener(
    name: 'readSync',
    handler: (ev: ReadSyncEvent) => void
  ): void;

  public addEventListener(
    name: 'viewSync',
    handler: (ev: ViewSyncEvent) => void
  ): void;

  public addEventListener(
    name: 'contact',
    handler: (ev: ContactEvent) => void
  ): void;

  public addEventListener(
    name: 'contactSync',
    handler: (ev: ContactSyncEvent) => void
  ): void;

  public addEventListener(
    name: 'group',
    handler: (ev: GroupEvent) => void
  ): void;

  public addEventListener(
    name: 'groupSync',
    handler: (ev: GroupSyncEvent) => void
  ): void;

  public addEventListener(
    name: 'envelope',
    handler: (ev: EnvelopeEvent) => void
  ): void;

  public addEventListener(name: string, handler: EventHandler): void {
    return super.addEventListener(name, handler);
  }

  public removeEventListener(name: string, handler: EventHandler): void {
    return super.removeEventListener(name, handler);
  }

  //
  // Private
  //

  private async dispatchAndWait(event: Event): Promise<void> {
    this.appQueue.add(async () => Promise.all(this.dispatchEvent(event)));
  }

  private calculateMessageAge(
    headers: ReadonlyArray<string>,
    serverTimestamp?: number
  ): number {
    let messageAgeSec = 0; // Default to 0 in case of unreliable parameters.

    if (serverTimestamp) {
      // The 'X-Signal-Timestamp' is usually the last item, so start there.
      let it = headers.length;
      // eslint-disable-next-line no-plusplus
      while (--it >= 0) {
        const match = headers[it].match(/^X-Signal-Timestamp:\s*(\d+)\s*$/);
        if (match && match.length === 2) {
          const timestamp = Number(match[1]);

          // One final sanity check, the timestamp when a message is pulled from
          // the server should be later than when it was pushed.
          if (timestamp > serverTimestamp) {
            messageAgeSec = Math.floor((timestamp - serverTimestamp) / 1000);
          }

          break;
        }
      }
    }

    return messageAgeSec;
  }

  private async addToQueue<T>(
    task: () => Promise<T>,
    taskType: TaskType
  ): Promise<T> {
    if (taskType === TaskType.Encrypted) {
      this.count += 1;
    }

    const queue =
      taskType === TaskType.Encrypted
        ? this.encryptedQueue
        : this.decryptedQueue;

    try {
      return await queue.add(task);
    } finally {
      this.updateProgress(this.count);
    }
  }

  private onEmpty(): void {
    const emitEmpty = async () => {
      await Promise.all([
        this.decryptAndCacheBatcher.flushAndWait(),
        this.cacheRemoveBatcher.flushAndWait(),
      ]);

      log.info("MessageReceiver: emitting 'empty' event");
      this.dispatchEvent(new EmptyEvent());
      this.isEmptied = true;

      this.maybeScheduleRetryTimeout();
    };

    const waitForDecryptedQueue = async () => {
      log.info(
        "MessageReceiver: finished processing messages after 'empty', now waiting for application"
      );

      // We don't await here because we don't want this to gate future message processing
      this.appQueue.add(emitEmpty);
    };

    const waitForEncryptedQueue = async () => {
      this.addToQueue(waitForDecryptedQueue, TaskType.Decrypted);
    };

    const waitForIncomingQueue = () => {
      this.addToQueue(waitForEncryptedQueue, TaskType.Encrypted);

      // Note: this.count is used in addToQueue
      // Resetting count so everything from the websocket after this starts at zero
      this.count = 0;
    };

    const waitForCacheAddBatcher = async () => {
      await this.decryptAndCacheBatcher.onIdle();
      this.incomingQueue.add(waitForIncomingQueue);
    };

    waitForCacheAddBatcher();
  }

  private updateProgress(count: number): void {
    // count by 10s
    if (count % 10 !== 0) {
      return;
    }
    this.dispatchEvent(new ProgressEvent({ count }));
  }

  private async queueAllCached(): Promise<void> {
    const items = await this.getAllFromCache();
    const max = items.length;
    for (let i = 0; i < max; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await this.queueCached(items[i]);
    }
  }

  private async queueCached(item: UnprocessedType): Promise<void> {
    log.info('MessageReceiver.queueCached', item.id);
    try {
      let envelopePlaintext: Uint8Array;

      if (item.envelope && item.version === 2) {
        envelopePlaintext = Bytes.fromBase64(item.envelope);
      } else if (item.envelope && typeof item.envelope === 'string') {
        envelopePlaintext = Bytes.fromBinary(item.envelope);
      } else {
        throw new Error(
          'MessageReceiver.queueCached: item.envelope was malformed'
        );
      }

      const decoded = Proto.Envelope.decode(envelopePlaintext);

      const envelope: ProcessedEnvelope = {
        id: item.id,
        receivedAtCounter: item.timestamp,
        receivedAtDate: Date.now(),
        messageAgeSec: item.messageAgeSec || 0,

        // Proto.Envelope fields
        type: decoded.type,
        source: decoded.source || item.source,
        sourceUuid: decoded.sourceUuid || item.sourceUuid,
        sourceDevice: decoded.sourceDevice || item.sourceDevice,
        timestamp: normalizeNumber(decoded.timestamp),
        legacyMessage: dropNull(decoded.legacyMessage),
        content: dropNull(decoded.content),
        serverGuid: decoded.serverGuid,
        serverTimestamp: normalizeNumber(
          item.serverTimestamp || decoded.serverTimestamp
        ),
      };

      const { decrypted } = item;
      if (decrypted) {
        let payloadPlaintext: Uint8Array;

        if (item.version === 2) {
          payloadPlaintext = Bytes.fromBase64(decrypted);
        } else if (typeof decrypted === 'string') {
          payloadPlaintext = Bytes.fromBinary(decrypted);
        } else {
          throw new Error('Cached decrypted value was not a string!');
        }

        // Maintain invariant: encrypted queue => decrypted queue
        this.addToQueue(async () => {
          this.queueDecryptedEnvelope(envelope, payloadPlaintext);
        }, TaskType.Encrypted);
      } else {
        this.queueCachedEnvelope(item, envelope);
      }
    } catch (error) {
      log.error(
        'queueCached error handling item',
        item.id,
        'removing it. Error:',
        Errors.toLogFormat(error)
      );

      try {
        const { id } = item;
        await this.storage.protocol.removeUnprocessed(id);
      } catch (deleteError) {
        log.error(
          'queueCached error deleting item',
          item.id,
          'Error:',
          Errors.toLogFormat(deleteError)
        );
      }
    }
  }

  private getEnvelopeId(envelope: ProcessedEnvelope): string {
    const { timestamp } = envelope;

    if (envelope.sourceUuid || envelope.source) {
      const sender = envelope.sourceUuid || envelope.source;
      return `${sender}.${envelope.sourceDevice} ${timestamp} (${envelope.id})`;
    }

    return `${timestamp} (${envelope.id})`;
  }

  private clearRetryTimeout(): void {
    if (this.retryCachedTimeout) {
      clearInterval(this.retryCachedTimeout);
      this.retryCachedTimeout = undefined;
    }
  }

  private maybeScheduleRetryTimeout(): void {
    if (this.isEmptied) {
      this.clearRetryTimeout();
      this.retryCachedTimeout = setTimeout(() => {
        this.incomingQueue.add(async () => this.queueAllCached());
      }, RETRY_TIMEOUT);
    }
  }

  private async getAllFromCache(): Promise<Array<UnprocessedType>> {
    log.info('getAllFromCache');
    const count = await this.storage.protocol.getUnprocessedCount();

    if (count > 1500) {
      await this.storage.protocol.removeAllUnprocessed();
      log.warn(
        `There were ${count} messages in cache. Deleted all instead of reprocessing`
      );
      return [];
    }

    const items = await this.storage.protocol.getAllUnprocessed();
    log.info('getAllFromCache loaded', items.length, 'saved envelopes');

    return items.map(item => {
      const { attempts = 0 } = item;

      return {
        ...item,
        attempts: attempts + 1,
      };
    });
  }

  private async decryptAndCacheBatch(
    items: Array<CacheAddItemType>
  ): Promise<void> {
    log.info('MessageReceiver.decryptAndCacheBatch', items.length);

    const decrypted: Array<
      Readonly<{
        plaintext: Uint8Array;
        data: UnprocessedType;
        envelope: UnsealedEnvelope;
      }>
    > = [];

    const storageProtocol = this.storage.protocol;

    try {
      const zone = new Zone('decryptAndCacheBatch', {
        pendingSessions: true,
        pendingUnprocessed: true,
      });
      const ourUuid = this.storage.user.getCheckedUuid();
      const sessionStore = new Sessions({ zone, ourUuid });
      const identityKeyStore = new IdentityKeys({ zone, ourUuid });
      const failed: Array<UnprocessedType> = [];

      // Below we:
      //
      // 1. Enter zone
      // 2. Decrypt all batched envelopes
      // 3. Persist both decrypted envelopes and envelopes that we failed to
      //    decrypt (for future retries, see `attempts` field)
      // 4. Leave zone and commit all pending sessions and unprocesseds
      // 5. Acknowledge envelopes (can't fail)
      // 6. Finally process decrypted envelopes
      await storageProtocol.withZone(zone, 'MessageReceiver', async () => {
        await Promise.all<void>(
          items.map(async ({ data, envelope }) => {
            try {
              const result = await this.queueEncryptedEnvelope(
                { sessionStore, identityKeyStore, zone },
                envelope
              );
              if (result.plaintext) {
                decrypted.push({
                  plaintext: result.plaintext,
                  envelope: result.envelope,
                  data,
                });
              }
            } catch (error) {
              failed.push(data);
              log.error(
                'decryptAndCache error when processing the envelope',
                Errors.toLogFormat(error)
              );
            }
          })
        );

        log.info(
          'MessageReceiver.decryptAndCacheBatch storing ' +
            `${decrypted.length} decrypted envelopes, keeping ` +
            `${failed.length} failed envelopes.`
        );

        // Store both decrypted and failed unprocessed envelopes
        const unprocesseds: Array<UnprocessedType> = decrypted.map(
          ({ envelope, data, plaintext }) => {
            return {
              ...data,

              source: envelope.source,
              sourceUuid: envelope.sourceUuid,
              sourceDevice: envelope.sourceDevice,
              serverGuid: envelope.serverGuid,
              serverTimestamp: envelope.serverTimestamp,
              decrypted: Bytes.toBase64(plaintext),
            };
          }
        );

        await storageProtocol.addMultipleUnprocessed(
          unprocesseds.concat(failed),
          { zone }
        );
      });

      log.info('MessageReceiver.decryptAndCacheBatch acknowledging receipt');

      // Acknowledge all envelopes
      for (const { request } of items) {
        try {
          request.respond(200, 'OK');
        } catch (error) {
          log.error(
            'decryptAndCacheBatch: Failed to send 200 to server; still queuing envelope'
          );
        }
      }
    } catch (error) {
      log.error(
        'decryptAndCache error trying to add messages to cache:',
        Errors.toLogFormat(error)
      );

      items.forEach(item => {
        item.request.respond(500, 'Failed to cache message');
      });
      return;
    }

    await Promise.all(
      decrypted.map(async ({ envelope, plaintext }) => {
        try {
          await this.queueDecryptedEnvelope(envelope, plaintext);
        } catch (error) {
          log.error(
            'decryptAndCache error when processing decrypted envelope',
            Errors.toLogFormat(error)
          );
        }
      })
    );

    log.info('MessageReceiver.decryptAndCacheBatch fully processed');

    this.maybeScheduleRetryTimeout();
  }

  private decryptAndCache(
    envelope: ProcessedEnvelope,
    plaintext: Uint8Array,
    request: IncomingWebSocketRequest
  ): void {
    const { id } = envelope;
    const data: UnprocessedType = {
      id,
      version: 2,
      envelope: Bytes.toBase64(plaintext),
      timestamp: envelope.receivedAtCounter,
      attempts: 1,
      messageAgeSec: envelope.messageAgeSec,
    };
    this.decryptAndCacheBatcher.add({
      request,
      envelope,
      data,
    });
  }

  private async cacheRemoveBatch(items: Array<string>): Promise<void> {
    await this.storage.protocol.removeUnprocessed(items);
  }

  private removeFromCache(envelope: ProcessedEnvelope): void {
    const { id } = envelope;
    this.cacheRemoveBatcher.add(id);
  }

  private async queueDecryptedEnvelope(
    envelope: UnsealedEnvelope,
    plaintext: Uint8Array
  ): Promise<void> {
    const id = this.getEnvelopeId(envelope);
    log.info('queueing decrypted envelope', id);

    const task = this.handleDecryptedEnvelope.bind(this, envelope, plaintext);
    const taskWithTimeout = createTaskWithTimeout(
      task,
      `queueDecryptedEnvelope ${id}`
    );

    try {
      await this.addToQueue(taskWithTimeout, TaskType.Decrypted);
    } catch (error) {
      log.error(
        `queueDecryptedEnvelope error handling envelope ${id}:`,
        Errors.toLogFormat(error)
      );
    }
  }

  private async queueEncryptedEnvelope(
    stores: LockedStores,
    envelope: ProcessedEnvelope
  ): Promise<DecryptResult> {
    let logId = this.getEnvelopeId(envelope);
    log.info('queueing envelope', logId);

    const task = createTaskWithTimeout(async (): Promise<DecryptResult> => {
      const unsealedEnvelope = await this.unsealEnvelope(stores, envelope);

      logId = this.getEnvelopeId(unsealedEnvelope);

      return this.decryptEnvelope(stores, unsealedEnvelope);
    }, `MessageReceiver: unseal and decrypt ${logId}`);

    try {
      return await this.addToQueue(task, TaskType.Encrypted);
    } catch (error) {
      const args = [
        'queueEncryptedEnvelope error handling envelope',
        logId,
        ':',
        Errors.toLogFormat(error),
      ];
      if (error instanceof WarnOnlyError) {
        log.warn(...args);
      } else {
        log.error(...args);
      }
      throw error;
    }
  }

  private async queueCachedEnvelope(
    data: UnprocessedType,
    envelope: ProcessedEnvelope
  ): Promise<void> {
    this.decryptAndCacheBatcher.add({
      request: {
        respond(code, status) {
          log.info(
            'queueCachedEnvelope: fake response ' +
              `with code ${code} and status ${status}`
          );
        },
      },
      envelope,
      data,
    });
  }

  // Called after `decryptEnvelope` decrypted the message.
  private async handleDecryptedEnvelope(
    envelope: UnsealedEnvelope,
    plaintext: Uint8Array
  ): Promise<void> {
    if (this.stoppingProcessing) {
      return;
    }

    if (envelope.content) {
      await this.innerHandleContentMessage(envelope, plaintext);

      return;
    }
    if (envelope.legacyMessage) {
      await this.innerHandleLegacyMessage(envelope, plaintext);

      return;
    }

    this.removeFromCache(envelope);
    throw new Error('Received message with no content and no legacyMessage');
  }

  private async unsealEnvelope(
    stores: LockedStores,
    envelope: ProcessedEnvelope
  ): Promise<UnsealedEnvelope> {
    const logId = this.getEnvelopeId(envelope);

    if (this.stoppingProcessing) {
      log.warn(`MessageReceiver.unsealEnvelope(${logId}): dropping`);
      throw new Error('Sealed envelope dropped due to stopping processing');
    }

    if (envelope.type !== Proto.Envelope.Type.UNIDENTIFIED_SENDER) {
      return envelope;
    }

    const ciphertext = envelope.content || envelope.legacyMessage;
    if (!ciphertext) {
      this.removeFromCache(envelope);
      throw new Error('Received message with no content and no legacyMessage');
    }

    log.info(`MessageReceiver.unsealEnvelope(${logId}): unidentified message`);
    const messageContent = await sealedSenderDecryptToUsmc(
      Buffer.from(ciphertext),
      stores.identityKeyStore
    );

    // Here we take this sender information and attach it back to the envelope
    //   to make the rest of the app work properly.
    const certificate = messageContent.senderCertificate();

    const originalSource = envelope.source;
    const originalSourceUuid = envelope.sourceUuid;

    const newEnvelope: UnsealedEnvelope = {
      ...envelope,

      // Overwrite Envelope fields
      source: dropNull(certificate.senderE164()),
      sourceUuid: normalizeUuid(
        certificate.senderUuid(),
        'MessageReceiver.unsealEnvelope.UNIDENTIFIED_SENDER.sourceUuid'
      ),
      sourceDevice: certificate.senderDeviceId(),

      // UnsealedEnvelope-only fields
      unidentifiedDeliveryReceived: !(originalSource || originalSourceUuid),
      contentHint: messageContent.contentHint(),
      groupId: messageContent.groupId()?.toString('base64'),
      usmc: messageContent,
      certificate,
      unsealedContent: messageContent,
    };

    // This will throw if there's a problem
    this.validateUnsealedEnvelope(newEnvelope);

    return newEnvelope;
  }

  private async decryptEnvelope(
    stores: LockedStores,
    envelope: UnsealedEnvelope
  ): Promise<DecryptResult> {
    const logId = this.getEnvelopeId(envelope);

    if (this.stoppingProcessing) {
      log.warn(`MessageReceiver.decryptEnvelope(${logId}): dropping unsealed`);
      throw new Error('Unsealed envelope dropped due to stopping processing');
    }

    if (envelope.type === Proto.Envelope.Type.RECEIPT) {
      await this.onDeliveryReceipt(envelope);
      return { plaintext: undefined, envelope };
    }

    let ciphertext: Uint8Array;
    let isLegacy = false;
    if (envelope.content) {
      ciphertext = envelope.content;
    } else if (envelope.legacyMessage) {
      ciphertext = envelope.legacyMessage;
      isLegacy = true;
    } else {
      this.removeFromCache(envelope);
      strictAssert(
        false,
        'Contentless envelope should be handled by unsealEnvelope'
      );
    }

    log.info(
      `MessageReceiver.decryptEnvelope(${logId})${isLegacy ? ' (legacy)' : ''}`
    );
    const plaintext = await this.decrypt(stores, envelope, ciphertext);

    if (!plaintext) {
      log.warn('MessageReceiver.decryptEnvelope: plaintext was falsey');
      return { plaintext, envelope };
    }

    // Legacy envelopes do not carry senderKeyDistributionMessage
    if (isLegacy) {
      return { plaintext, envelope };
    }

    // Note: we need to process this as part of decryption, because we might need this
    //   sender key to decrypt the next message in the queue!
    try {
      const content = Proto.Content.decode(plaintext);

      if (
        content.senderKeyDistributionMessage &&
        Bytes.isNotEmpty(content.senderKeyDistributionMessage)
      ) {
        await this.handleSenderKeyDistributionMessage(
          stores,
          envelope,
          content.senderKeyDistributionMessage
        );
      }
    } catch (error) {
      log.error(
        'MessageReceiver.decryptEnvelope: Failed to process sender ' +
          `key distribution message: ${Errors.toLogFormat(error)}`
      );
    }

    if (
      (envelope.source && this.isBlocked(envelope.source)) ||
      (envelope.sourceUuid && this.isUuidBlocked(envelope.sourceUuid))
    ) {
      log.info(
        'MessageReceiver.decryptEnvelope: Dropping message from blocked sender'
      );
      return { plaintext: undefined, envelope };
    }

    return { plaintext, envelope };
  }

  private validateUnsealedEnvelope(envelope: UnsealedEnvelope): void {
    const { unsealedContent: messageContent, certificate } = envelope;
    strictAssert(
      messageContent !== undefined,
      'Missing message content for sealed sender message'
    );
    strictAssert(
      certificate !== undefined,
      'Missing sender certificate for sealed sender message'
    );

    if (!envelope.serverTimestamp) {
      throw new Error(
        'MessageReceiver.decryptSealedSender: ' +
          'Sealed sender message was missing serverTimestamp'
      );
    }

    const serverCertificate = certificate.serverCertificate();

    if (
      !verifySignature(
        this.serverTrustRoot,
        serverCertificate.certificateData(),
        serverCertificate.signature()
      )
    ) {
      throw new Error(
        'MessageReceiver.validateUnsealedEnvelope: ' +
          'Server certificate trust root validation failed'
      );
    }

    if (
      !verifySignature(
        serverCertificate.key().serialize(),
        certificate.certificate(),
        certificate.signature()
      )
    ) {
      throw new Error(
        'MessageReceiver.validateUnsealedEnvelope: ' +
          'Server certificate server signature validation failed'
      );
    }

    const logId = this.getEnvelopeId(envelope);

    if (envelope.serverTimestamp > certificate.expiration()) {
      throw new Error(
        'MessageReceiver.validateUnsealedEnvelope: ' +
          `Sender certificate is expired for envelope ${logId}`
      );
    }

    return undefined;
  }

  private async onDeliveryReceipt(envelope: ProcessedEnvelope): Promise<void> {
    await this.dispatchAndWait(
      new DeliveryEvent(
        {
          timestamp: envelope.timestamp,
          source: envelope.source,
          sourceUuid: envelope.sourceUuid,
          sourceDevice: envelope.sourceDevice,
        },
        this.removeFromCache.bind(this, envelope)
      )
    );
  }

  private unpad(paddedPlaintext: Uint8Array): Uint8Array {
    for (let i = paddedPlaintext.length - 1; i >= 0; i -= 1) {
      if (paddedPlaintext[i] === 0x80) {
        return new Uint8Array(paddedPlaintext.slice(0, i));
      }
      if (paddedPlaintext[i] !== 0x00) {
        throw new Error('Invalid padding');
      }
    }

    return paddedPlaintext;
  }

  private async decryptSealedSender(
    { sessionStore, identityKeyStore, zone }: LockedStores,
    envelope: UnsealedEnvelope,
    ciphertext: Uint8Array
  ): Promise<DecryptSealedSenderResult> {
    const localE164 = this.storage.user.getNumber();
    const ourUuid = this.storage.user.getCheckedUuid();
    const localDeviceId = parseIntOrThrow(
      this.storage.user.getDeviceId(),
      'MessageReceiver.decryptSealedSender: localDeviceId'
    );

    const logId = this.getEnvelopeId(envelope);

    const { unsealedContent: messageContent, certificate } = envelope;
    strictAssert(
      messageContent !== undefined,
      'Missing message content for sealed sender message'
    );
    strictAssert(
      certificate !== undefined,
      'Missing sender certificate for sealed sender message'
    );

    const unidentifiedSenderTypeEnum =
      Proto.UnidentifiedSenderMessage.Message.Type;

    if (
      messageContent.msgType() === unidentifiedSenderTypeEnum.PLAINTEXT_CONTENT
    ) {
      log.info(
        `MessageReceiver.decryptSealedSender(${logId}): ` +
          'unidentified message/plaintext contents'
      );
      const plaintextContent = PlaintextContent.deserialize(
        messageContent.contents()
      );

      return {
        plaintext: plaintextContent.body(),
      };
    }

    if (
      messageContent.msgType() === unidentifiedSenderTypeEnum.SENDERKEY_MESSAGE
    ) {
      log.info(
        `MessageReceiver.decryptSealedSender(${logId}): ` +
          'unidentified message/sender key contents'
      );
      const sealedSenderIdentifier = certificate.senderUuid();
      const sealedSenderSourceDevice = certificate.senderDeviceId();
      const senderKeyStore = new SenderKeys({ ourUuid });

      const address = new QualifiedAddress(
        ourUuid,
        Address.create(sealedSenderIdentifier, sealedSenderSourceDevice)
      );

      const plaintext = await this.storage.protocol.enqueueSenderKeyJob(
        address,
        () =>
          groupDecrypt(
            ProtocolAddress.new(
              sealedSenderIdentifier,
              sealedSenderSourceDevice
            ),
            senderKeyStore,
            messageContent.contents()
          ),
        zone
      );
      return { plaintext };
    }

    log.info(
      `MessageReceiver.decryptSealedSender(${logId}): ` +
        'unidentified message/passing to sealedSenderDecryptMessage'
    );

    const preKeyStore = new PreKeys({ ourUuid });
    const signedPreKeyStore = new SignedPreKeys({ ourUuid });

    const sealedSenderIdentifier = envelope.sourceUuid;
    strictAssert(
      sealedSenderIdentifier !== undefined,
      'Empty sealed sender identifier'
    );
    strictAssert(
      envelope.sourceDevice !== undefined,
      'Empty sealed sender device'
    );
    const address = new QualifiedAddress(
      ourUuid,
      Address.create(sealedSenderIdentifier, envelope.sourceDevice)
    );
    const unsealedPlaintext = await this.storage.protocol.enqueueSessionJob(
      address,
      () =>
        sealedSenderDecryptMessage(
          Buffer.from(ciphertext),
          PublicKey.deserialize(Buffer.from(this.serverTrustRoot)),
          envelope.serverTimestamp,
          localE164 || null,
          ourUuid.toString(),
          localDeviceId,
          sessionStore,
          identityKeyStore,
          preKeyStore,
          signedPreKeyStore
        ),
      zone
    );

    return { unsealedPlaintext };
  }

  private async innerDecrypt(
    stores: LockedStores,
    envelope: ProcessedEnvelope,
    ciphertext: Uint8Array
  ): Promise<Uint8Array> {
    const { sessionStore, identityKeyStore, zone } = stores;

    const logId = this.getEnvelopeId(envelope);
    const envelopeTypeEnum = Proto.Envelope.Type;

    const identifier = envelope.sourceUuid;
    const { sourceDevice } = envelope;

    const ourUuid = this.storage.user.getCheckedUuid();
    const preKeyStore = new PreKeys({ ourUuid });
    const signedPreKeyStore = new SignedPreKeys({ ourUuid });

    strictAssert(identifier !== undefined, 'Empty identifier');
    strictAssert(sourceDevice !== undefined, 'Empty source device');

    const address = new QualifiedAddress(
      ourUuid,
      Address.create(identifier, sourceDevice)
    );

    if (envelope.type === envelopeTypeEnum.PLAINTEXT_CONTENT) {
      log.info(`decrypt/${logId}: plaintext message`);
      const buffer = Buffer.from(ciphertext);
      const plaintextContent = PlaintextContent.deserialize(buffer);

      return this.unpad(plaintextContent.body());
    }
    if (envelope.type === envelopeTypeEnum.CIPHERTEXT) {
      log.info(`decrypt/${logId}: ciphertext message`);
      if (!identifier) {
        throw new Error(
          'MessageReceiver.innerDecrypt: No identifier for CIPHERTEXT message'
        );
      }
      if (!sourceDevice) {
        throw new Error(
          'MessageReceiver.innerDecrypt: No sourceDevice for CIPHERTEXT message'
        );
      }
      const signalMessage = SignalMessage.deserialize(Buffer.from(ciphertext));

      const plaintext = await this.storage.protocol.enqueueSessionJob(
        address,
        async () =>
          this.unpad(
            await signalDecrypt(
              signalMessage,
              ProtocolAddress.new(identifier, sourceDevice),
              sessionStore,
              identityKeyStore
            )
          ),
        zone
      );
      return plaintext;
    }
    if (envelope.type === envelopeTypeEnum.PREKEY_BUNDLE) {
      log.info(`decrypt/${logId}: prekey message`);
      if (!identifier) {
        throw new Error(
          'MessageReceiver.innerDecrypt: No identifier for PREKEY_BUNDLE message'
        );
      }
      if (!sourceDevice) {
        throw new Error(
          'MessageReceiver.innerDecrypt: No sourceDevice for PREKEY_BUNDLE message'
        );
      }
      const preKeySignalMessage = PreKeySignalMessage.deserialize(
        Buffer.from(ciphertext)
      );

      const plaintext = await this.storage.protocol.enqueueSessionJob(
        address,
        async () =>
          this.unpad(
            await signalDecryptPreKey(
              preKeySignalMessage,
              ProtocolAddress.new(identifier, sourceDevice),
              sessionStore,
              identityKeyStore,
              preKeyStore,
              signedPreKeyStore
            )
          ),
        zone
      );
      return plaintext;
    }
    if (envelope.type === envelopeTypeEnum.UNIDENTIFIED_SENDER) {
      log.info(`decrypt/${logId}: unidentified message`);
      const { plaintext, unsealedPlaintext } = await this.decryptSealedSender(
        stores,
        envelope,
        ciphertext
      );

      if (plaintext) {
        return this.unpad(plaintext);
      }

      if (unsealedPlaintext) {
        const content = unsealedPlaintext.message();

        if (!content) {
          throw new Error(
            'MessageReceiver.innerDecrypt: Content returned was falsey!'
          );
        }

        // Return just the content because that matches the signature of the other
        //   decrypt methods used above.
        return this.unpad(content);
      }

      throw new Error('Unexpected lack of plaintext from unidentified sender');
    }
    throw new Error('Unknown message type');
  }

  private async decrypt(
    stores: LockedStores,
    envelope: UnsealedEnvelope,
    ciphertext: Uint8Array
  ): Promise<Uint8Array | undefined> {
    try {
      return await this.innerDecrypt(stores, envelope, ciphertext);
    } catch (error) {
      const uuid = envelope.sourceUuid;
      const deviceId = envelope.sourceDevice;

      // We don't do anything if it's just a duplicated message
      if (
        error?.message?.includes &&
        error.message.includes('message with old counter')
      ) {
        this.removeFromCache(envelope);
        throw error;
      }

      // We don't do a light session reset if it's an error with the sealed sender
      //   wrapper, since we don't trust the sender information.
      if (
        error?.message?.includes &&
        error.message.includes('trust root validation failed')
      ) {
        this.removeFromCache(envelope);
        throw error;
      }

      if (
        (envelope.source && this.isBlocked(envelope.source)) ||
        (envelope.sourceUuid && this.isUuidBlocked(envelope.sourceUuid))
      ) {
        log.info(
          'MessageReceiver.decrypt: Error from blocked sender; no further processing'
        );
        this.removeFromCache(envelope);
        throw error;
      }

      if (uuid && deviceId) {
        const { usmc } = envelope;
        const event = new DecryptionErrorEvent(
          {
            cipherTextBytes: usmc ? usmc.contents() : undefined,
            cipherTextType: usmc ? usmc.msgType() : undefined,
            contentHint: envelope.contentHint,
            groupId: envelope.groupId,
            receivedAtCounter: envelope.receivedAtCounter,
            receivedAtDate: envelope.receivedAtDate,
            senderDevice: deviceId,
            senderUuid: uuid,
            timestamp: envelope.timestamp,
          },
          () => this.removeFromCache(envelope)
        );

        // Avoid deadlocks by scheduling processing on decrypted queue
        this.addToQueue(
          async () => this.dispatchEvent(event),
          TaskType.Decrypted
        );
      } else {
        const envelopeId = this.getEnvelopeId(envelope);
        this.removeFromCache(envelope);
        log.error(
          `MessageReceiver.decrypt: Envelope ${envelopeId} missing uuid or deviceId`
        );
      }

      throw error;
    }
  }

  private async handleSentMessage(
    envelope: ProcessedEnvelope,
    sentContainer: ProcessedSent
  ) {
    log.info('MessageReceiver.handleSentMessage', this.getEnvelopeId(envelope));
    const {
      destination,
      destinationUuid,
      timestamp,
      message: msg,
      expirationStartTimestamp,
      unidentifiedStatus,
      isRecipientUpdate,
    } = sentContainer;

    if (!msg) {
      throw new Error('MessageReceiver.handleSentMessage: message was falsey!');
    }

    let p: Promise<void> = Promise.resolve();
    // eslint-disable-next-line no-bitwise
    if (msg.flags && msg.flags & Proto.DataMessage.Flags.END_SESSION) {
      if (destinationUuid) {
        p = this.handleEndSession(new UUID(destinationUuid));
      } else if (destination) {
        const theirUuid = UUID.lookup(destination);
        if (theirUuid) {
          p = this.handleEndSession(theirUuid);
        } else {
          log.warn(`handleSentMessage: uuid not found for ${destination}`);
          p = Promise.resolve();
        }
      } else {
        throw new Error(
          'MessageReceiver.handleSentMessage: Cannot end session with falsey destination'
        );
      }
    }
    await p;

    const message = await this.processDecrypted(envelope, msg);
    const groupId = this.getProcessedGroupId(message);
    const isBlocked = groupId ? this.isGroupBlocked(groupId) : false;
    const { source, sourceUuid } = envelope;
    const ourE164 = this.storage.user.getNumber();
    const ourUuid = this.storage.user.getCheckedUuid().toString();
    const isMe =
      (source && ourE164 && source === ourE164) ||
      (sourceUuid && ourUuid && sourceUuid === ourUuid);
    const isLeavingGroup = Boolean(
      !message.groupV2 &&
        message.group &&
        message.group.type === Proto.GroupContext.Type.QUIT
    );

    if (groupId && isBlocked && !(isMe && isLeavingGroup)) {
      log.warn(
        `Message ${this.getEnvelopeId(
          envelope
        )} ignored; destined for blocked group`
      );
      this.removeFromCache(envelope);
      return undefined;
    }

    const ev = new SentEvent(
      {
        destination: dropNull(destination),
        destinationUuid: dropNull(destinationUuid),
        timestamp: timestamp ? normalizeNumber(timestamp) : undefined,
        serverTimestamp: envelope.serverTimestamp,
        device: envelope.sourceDevice,
        unidentifiedStatus,
        message,
        isRecipientUpdate: Boolean(isRecipientUpdate),
        receivedAtCounter: envelope.receivedAtCounter,
        receivedAtDate: envelope.receivedAtDate,
        expirationStartTimestamp: expirationStartTimestamp
          ? normalizeNumber(expirationStartTimestamp)
          : undefined,
      },
      this.removeFromCache.bind(this, envelope)
    );
    return this.dispatchAndWait(ev);
  }

  private async handleDataMessage(
    envelope: UnsealedEnvelope,
    msg: Proto.IDataMessage
  ): Promise<void> {
    log.info('MessageReceiver.handleDataMessage', this.getEnvelopeId(envelope));
    let p: Promise<void> = Promise.resolve();
    // eslint-disable-next-line no-bitwise
    const destination = envelope.sourceUuid;
    if (!destination) {
      throw new Error(
        'MessageReceiver.handleDataMessage: source and sourceUuid were falsey'
      );
    }

    if (this.isInvalidGroupData(msg, envelope)) {
      this.removeFromCache(envelope);
      return undefined;
    }

    await this.checkGroupV1Data(msg);

    if (msg.flags && msg.flags & Proto.DataMessage.Flags.END_SESSION) {
      p = this.handleEndSession(new UUID(destination));
    }

    if (msg.flags && msg.flags & Proto.DataMessage.Flags.PROFILE_KEY_UPDATE) {
      strictAssert(msg.profileKey, 'PROFILE_KEY_UPDATE without profileKey');

      const ev = new ProfileKeyUpdateEvent(
        {
          source: envelope.source,
          sourceUuid: envelope.sourceUuid,
          profileKey: Bytes.toBase64(msg.profileKey),
        },
        this.removeFromCache.bind(this, envelope)
      );
      return this.dispatchAndWait(ev);
    }
    await p;

    const message = await this.processDecrypted(envelope, msg);
    const groupId = this.getProcessedGroupId(message);
    const isBlocked = groupId ? this.isGroupBlocked(groupId) : false;
    const { source, sourceUuid } = envelope;
    const ourE164 = this.storage.user.getNumber();
    const ourUuid = this.storage.user.getCheckedUuid().toString();
    const isMe =
      (source && ourE164 && source === ourE164) ||
      (sourceUuid && ourUuid && sourceUuid === ourUuid);
    const isLeavingGroup = Boolean(
      !message.groupV2 &&
        message.group &&
        message.group.type === Proto.GroupContext.Type.QUIT
    );

    if (groupId && isBlocked && !(isMe && isLeavingGroup)) {
      log.warn(
        `Message ${this.getEnvelopeId(
          envelope
        )} ignored; destined for blocked group`
      );
      this.removeFromCache(envelope);
      return undefined;
    }

    const ev = new MessageEvent(
      {
        source: envelope.source,
        sourceUuid: envelope.sourceUuid,
        sourceDevice: envelope.sourceDevice,
        timestamp: envelope.timestamp,
        serverGuid: envelope.serverGuid,
        serverTimestamp: envelope.serverTimestamp,
        unidentifiedDeliveryReceived: Boolean(
          envelope.unidentifiedDeliveryReceived
        ),
        message,
        receivedAtCounter: envelope.receivedAtCounter,
        receivedAtDate: envelope.receivedAtDate,
      },
      this.removeFromCache.bind(this, envelope)
    );
    return this.dispatchAndWait(ev);
  }

  private async innerHandleLegacyMessage(
    envelope: ProcessedEnvelope,
    plaintext: Uint8Array
  ) {
    const message = Proto.DataMessage.decode(plaintext);
    return this.handleDataMessage(envelope, message);
  }

  private async maybeUpdateTimestamp(
    envelope: ProcessedEnvelope
  ): Promise<ProcessedEnvelope> {
    const { retryPlaceholders } = window.Signal.Services;
    if (!retryPlaceholders) {
      log.warn('maybeUpdateTimestamp: retry placeholders not available!');
      return envelope;
    }

    const { timestamp } = envelope;
    const identifier = envelope.groupId || envelope.sourceUuid;
    const conversation = window.ConversationController.get(identifier);

    try {
      if (!conversation) {
        log.info(
          `maybeUpdateTimestamp/${timestamp}: No conversation found for identifier ${identifier}`
        );
        return envelope;
      }

      const logId = `${conversation.idForLogging()}/${timestamp}`;
      const item = await retryPlaceholders.findByMessageAndRemove(
        conversation.id,
        timestamp
      );
      if (item && item.wasOpened) {
        log.info(
          `maybeUpdateTimestamp/${logId}: found retry placeholder, but conversation was opened. No updates made.`
        );
      } else if (item) {
        log.info(
          `maybeUpdateTimestamp/${logId}: found retry placeholder. Updating receivedAtCounter/receivedAtDate`
        );

        return {
          ...envelope,
          receivedAtCounter: item.receivedAtCounter,
          receivedAtDate: item.receivedAt,
        };
      }
    } catch (error) {
      log.error(
        `maybeUpdateTimestamp/${timestamp}: Failed to process message: ${Errors.toLogFormat(
          error
        )}`
      );
    }

    return envelope;
  }

  private async innerHandleContentMessage(
    incomingEnvelope: ProcessedEnvelope,
    plaintext: Uint8Array
  ): Promise<void> {
    const content = Proto.Content.decode(plaintext);
    const envelope = await this.maybeUpdateTimestamp(incomingEnvelope);

    if (
      content.decryptionErrorMessage &&
      Bytes.isNotEmpty(content.decryptionErrorMessage)
    ) {
      await this.handleDecryptionError(
        envelope,
        content.decryptionErrorMessage
      );
      return;
    }
    if (content.syncMessage) {
      await this.handleSyncMessage(
        envelope,
        processSyncMessage(content.syncMessage)
      );
      return;
    }
    if (content.dataMessage) {
      await this.handleDataMessage(envelope, content.dataMessage);
      return;
    }
    if (content.nullMessage) {
      await this.handleNullMessage(envelope);
      return;
    }
    if (content.callingMessage) {
      await this.handleCallingMessage(envelope, content.callingMessage);
      return;
    }
    if (content.receiptMessage) {
      await this.handleReceiptMessage(envelope, content.receiptMessage);
      return;
    }
    if (content.typingMessage) {
      await this.handleTypingMessage(envelope, content.typingMessage);
      return;
    }

    this.removeFromCache(envelope);

    if (Bytes.isEmpty(content.senderKeyDistributionMessage)) {
      throw new Error('Unsupported content message');
    }
  }

  private async handleDecryptionError(
    envelope: UnsealedEnvelope,
    decryptionError: Uint8Array
  ) {
    const logId = this.getEnvelopeId(envelope);
    log.info(`handleDecryptionError: ${logId}`);

    const buffer = Buffer.from(decryptionError);
    const request = DecryptionErrorMessage.deserialize(buffer);

    const { sourceUuid, sourceDevice } = envelope;
    if (!sourceUuid || !sourceDevice) {
      log.error(`handleDecryptionError/${logId}: Missing uuid or device!`);
      this.removeFromCache(envelope);
      return;
    }

    const event = new RetryRequestEvent(
      {
        groupId: envelope.groupId,
        requesterDevice: sourceDevice,
        requesterUuid: sourceUuid,
        ratchetKey: request.ratchetKey(),
        senderDevice: request.deviceId(),
        sentAt: request.timestamp(),
      },
      () => this.removeFromCache(envelope)
    );
    await this.dispatchEvent(event);
  }

  private async handleSenderKeyDistributionMessage(
    stores: LockedStores,
    envelope: ProcessedEnvelope,
    distributionMessage: Uint8Array
  ): Promise<void> {
    const envelopeId = this.getEnvelopeId(envelope);
    log.info(`handleSenderKeyDistributionMessage/${envelopeId}`);

    // Note: we don't call removeFromCache here because this message can be combined
    //   with a dataMessage, for example. That processing will dictate cache removal.

    const identifier = envelope.sourceUuid;
    const { sourceDevice } = envelope;
    if (!identifier) {
      throw new Error(
        `handleSenderKeyDistributionMessage: No identifier for envelope ${envelopeId}`
      );
    }
    if (!isNumber(sourceDevice)) {
      throw new Error(
        `handleSenderKeyDistributionMessage: Missing sourceDevice for envelope ${envelopeId}`
      );
    }

    const sender = ProtocolAddress.new(identifier, sourceDevice);
    const senderKeyDistributionMessage = SenderKeyDistributionMessage.deserialize(
      Buffer.from(distributionMessage)
    );
    const ourUuid = this.storage.user.getCheckedUuid();
    const senderKeyStore = new SenderKeys({ ourUuid });
    const address = new QualifiedAddress(
      ourUuid,
      Address.create(identifier, sourceDevice)
    );

    await this.storage.protocol.enqueueSenderKeyJob(
      address,
      () =>
        processSenderKeyDistributionMessage(
          sender,
          senderKeyDistributionMessage,
          senderKeyStore
        ),
      stores.zone
    );
  }

  private async handleCallingMessage(
    envelope: ProcessedEnvelope,
    callingMessage: Proto.ICallingMessage
  ): Promise<void> {
    this.removeFromCache(envelope);
    await window.Signal.Services.calling.handleCallingMessage(
      envelope,
      callingMessage
    );
  }

  private async handleReceiptMessage(
    envelope: ProcessedEnvelope,
    receiptMessage: Proto.IReceiptMessage
  ): Promise<void> {
    strictAssert(receiptMessage.timestamp, 'Receipt message without timestamp');

    let EventClass: typeof DeliveryEvent | typeof ReadEvent | typeof ViewEvent;
    switch (receiptMessage.type) {
      case Proto.ReceiptMessage.Type.DELIVERY:
        EventClass = DeliveryEvent;
        break;
      case Proto.ReceiptMessage.Type.READ:
        EventClass = ReadEvent;
        break;
      case Proto.ReceiptMessage.Type.VIEWED:
        EventClass = ViewEvent;
        break;
      default:
        // This can happen if we get a receipt type we don't know about yet, which
        //   is totally fine.
        return;
    }

    await Promise.all(
      receiptMessage.timestamp.map(async rawTimestamp => {
        const ev = new EventClass(
          {
            timestamp: normalizeNumber(rawTimestamp),
            envelopeTimestamp: envelope.timestamp,
            source: envelope.source,
            sourceUuid: envelope.sourceUuid,
            sourceDevice: envelope.sourceDevice,
          },
          this.removeFromCache.bind(this, envelope)
        );
        await this.dispatchAndWait(ev);
      })
    );
  }

  private async handleTypingMessage(
    envelope: ProcessedEnvelope,
    typingMessage: Proto.ITypingMessage
  ): Promise<void> {
    this.removeFromCache(envelope);

    if (envelope.timestamp && typingMessage.timestamp) {
      const envelopeTimestamp = envelope.timestamp;
      const typingTimestamp = normalizeNumber(typingMessage.timestamp);

      if (typingTimestamp !== envelopeTimestamp) {
        log.warn(
          `Typing message envelope timestamp (${envelopeTimestamp}) did not match typing timestamp (${typingTimestamp})`
        );
        return;
      }
    }

    strictAssert(
      envelope.sourceDevice !== undefined,
      'TypingMessage requires sourceDevice in the envelope'
    );

    const { groupId, timestamp, action } = typingMessage;

    let groupIdString: string | undefined;
    let groupV2IdString: string | undefined;
    if (groupId && groupId.byteLength > 0) {
      if (groupId.byteLength === GROUPV1_ID_LENGTH) {
        groupIdString = Bytes.toBinary(groupId);
        groupV2IdString = this.deriveGroupV2FromV1(groupId);
      } else if (groupId.byteLength === GROUPV2_ID_LENGTH) {
        groupV2IdString = Bytes.toBase64(groupId);
      } else {
        log.error('handleTypingMessage: Received invalid groupId value');
      }
    }

    await this.dispatchEvent(
      new TypingEvent({
        sender: envelope.source,
        senderUuid: envelope.sourceUuid,
        senderDevice: envelope.sourceDevice,
        typing: {
          typingMessage,
          timestamp: timestamp ? normalizeNumber(timestamp) : Date.now(),
          started: action === Proto.TypingMessage.Action.STARTED,
          stopped: action === Proto.TypingMessage.Action.STOPPED,

          groupId: groupIdString,
          groupV2Id: groupV2IdString,
        },
      })
    );
  }

  private handleNullMessage(envelope: ProcessedEnvelope): void {
    log.info('MessageReceiver.handleNullMessage', this.getEnvelopeId(envelope));
    this.removeFromCache(envelope);
  }

  private isInvalidGroupData(
    message: Proto.IDataMessage,
    envelope: ProcessedEnvelope
  ): boolean {
    const { group, groupV2 } = message;

    if (group) {
      const { id } = group;
      strictAssert(id, 'Group data has no id');
      const isInvalid = id.byteLength !== GROUPV1_ID_LENGTH;

      if (isInvalid) {
        log.info(
          'isInvalidGroupData: invalid GroupV1 message from',
          this.getEnvelopeId(envelope)
        );
      }

      return isInvalid;
    }

    if (groupV2) {
      const { masterKey } = groupV2;
      strictAssert(masterKey, 'Group v2 data has no masterKey');
      const isInvalid = masterKey.byteLength !== MASTER_KEY_LENGTH;

      if (isInvalid) {
        log.info(
          'isInvalidGroupData: invalid GroupV2 message from',
          this.getEnvelopeId(envelope)
        );
      }
      return isInvalid;
    }

    return false;
  }

  private deriveGroupV2FromV1(groupId: Uint8Array): string {
    if (groupId.byteLength !== GROUPV1_ID_LENGTH) {
      throw new Error(
        `deriveGroupV2FromV1: had id with wrong byteLength: ${groupId.byteLength}`
      );
    }
    const masterKey = deriveMasterKeyFromGroupV1(groupId);
    const data = deriveGroupFields(masterKey);

    return Bytes.toBase64(data.id);
  }

  private async checkGroupV1Data(
    message: Readonly<Proto.IDataMessage>
  ): Promise<void> {
    const { group } = message;

    if (!group) {
      return;
    }

    if (!group.id) {
      throw new Error('deriveGroupV1Data: had falsey id');
    }

    const { id } = group;
    if (id.byteLength !== GROUPV1_ID_LENGTH) {
      throw new Error(
        `deriveGroupV1Data: had id with wrong byteLength: ${id.byteLength}`
      );
    }
  }

  private getProcessedGroupId(
    message: ProcessedDataMessage
  ): string | undefined {
    if (message.groupV2) {
      return message.groupV2.id;
    }
    if (message.group && message.group.id) {
      return message.group.id;
    }
    return undefined;
  }

  private getGroupId(message: Proto.IDataMessage): string | undefined {
    if (message.groupV2) {
      strictAssert(message.groupV2.masterKey, 'Missing groupV2.masterKey');
      const { id } = deriveGroupFields(message.groupV2.masterKey);
      return Bytes.toBase64(id);
    }
    if (message.group && message.group.id) {
      return Bytes.toBinary(message.group.id);
    }

    return undefined;
  }

  private getDestination(sentMessage: Proto.SyncMessage.ISent) {
    if (sentMessage.message && sentMessage.message.groupV2) {
      return `groupv2(${this.getGroupId(sentMessage.message)})`;
    }
    if (sentMessage.message && sentMessage.message.group) {
      strictAssert(sentMessage.message.group.id, 'group without id');
      return `group(${this.getGroupId(sentMessage.message)})`;
    }
    return sentMessage.destination || sentMessage.destinationUuid;
  }

  private async handleSyncMessage(
    envelope: ProcessedEnvelope,
    syncMessage: ProcessedSyncMessage
  ): Promise<void> {
    const ourNumber = this.storage.user.getNumber();
    const ourUuid = this.storage.user.getCheckedUuid();

    const fromSelfSource = envelope.source && envelope.source === ourNumber;
    const fromSelfSourceUuid =
      envelope.sourceUuid && envelope.sourceUuid === ourUuid.toString();
    if (!fromSelfSource && !fromSelfSourceUuid) {
      throw new Error('Received sync message from another number');
    }

    const ourDeviceId = this.storage.user.getDeviceId();
    // eslint-disable-next-line eqeqeq
    if (envelope.sourceDevice == ourDeviceId) {
      throw new Error('Received sync message from our own device');
    }
    if (syncMessage.sent) {
      const sentMessage = syncMessage.sent;

      if (!sentMessage || !sentMessage.message) {
        throw new Error(
          'MessageReceiver.handleSyncMessage: sync sent message was missing message'
        );
      }

      if (this.isInvalidGroupData(sentMessage.message, envelope)) {
        this.removeFromCache(envelope);
        return undefined;
      }

      await this.checkGroupV1Data(sentMessage.message);

      strictAssert(sentMessage.timestamp, 'sent message without timestamp');

      log.info(
        'sent message to',
        this.getDestination(sentMessage),
        normalizeNumber(sentMessage.timestamp),
        'from',
        this.getEnvelopeId(envelope)
      );
      return this.handleSentMessage(envelope, sentMessage);
    }
    if (syncMessage.contacts) {
      this.handleContacts(envelope, syncMessage.contacts);
      return undefined;
    }
    if (syncMessage.groups) {
      this.handleGroups(envelope, syncMessage.groups);
      return undefined;
    }
    if (syncMessage.blocked) {
      return this.handleBlocked(envelope, syncMessage.blocked);
    }
    if (syncMessage.request) {
      log.info('Got SyncMessage Request');
      this.removeFromCache(envelope);
      return undefined;
    }
    if (syncMessage.read && syncMessage.read.length) {
      return this.handleRead(envelope, syncMessage.read);
    }
    if (syncMessage.verified) {
      return this.handleVerified(envelope, syncMessage.verified);
    }
    if (syncMessage.configuration) {
      return this.handleConfiguration(envelope, syncMessage.configuration);
    }
    if (
      syncMessage.stickerPackOperation &&
      syncMessage.stickerPackOperation.length > 0
    ) {
      return this.handleStickerPackOperation(
        envelope,
        syncMessage.stickerPackOperation
      );
    }
    if (syncMessage.viewOnceOpen) {
      return this.handleViewOnceOpen(envelope, syncMessage.viewOnceOpen);
    }
    if (syncMessage.messageRequestResponse) {
      return this.handleMessageRequestResponse(
        envelope,
        syncMessage.messageRequestResponse
      );
    }
    if (syncMessage.fetchLatest) {
      return this.handleFetchLatest(envelope, syncMessage.fetchLatest);
    }
    if (syncMessage.keys) {
      return this.handleKeys(envelope, syncMessage.keys);
    }
    if (syncMessage.viewed && syncMessage.viewed.length) {
      return this.handleViewed(envelope, syncMessage.viewed);
    }

    this.removeFromCache(envelope);
    log.warn(
      `handleSyncMessage/${this.getEnvelopeId(envelope)}: Got empty SyncMessage`
    );
    return Promise.resolve();
  }

  private async handleConfiguration(
    envelope: ProcessedEnvelope,
    configuration: Proto.SyncMessage.IConfiguration
  ): Promise<void> {
    log.info('got configuration sync message');
    const ev = new ConfigurationEvent(
      configuration,
      this.removeFromCache.bind(this, envelope)
    );
    return this.dispatchAndWait(ev);
  }

  private async handleViewOnceOpen(
    envelope: ProcessedEnvelope,
    sync: Proto.SyncMessage.IViewOnceOpen
  ): Promise<void> {
    log.info('got view once open sync message');

    const ev = new ViewOnceOpenSyncEvent(
      {
        source: dropNull(sync.sender),
        sourceUuid: sync.senderUuid
          ? normalizeUuid(sync.senderUuid, 'handleViewOnceOpen.senderUuid')
          : undefined,
        timestamp: sync.timestamp ? normalizeNumber(sync.timestamp) : undefined,
      },
      this.removeFromCache.bind(this, envelope)
    );

    return this.dispatchAndWait(ev);
  }

  private async handleMessageRequestResponse(
    envelope: ProcessedEnvelope,
    sync: Proto.SyncMessage.IMessageRequestResponse
  ): Promise<void> {
    log.info('got message request response sync message');

    const { groupId } = sync;

    let groupIdString: string | undefined;
    let groupV2IdString: string | undefined;
    if (groupId && groupId.byteLength > 0) {
      if (groupId.byteLength === GROUPV1_ID_LENGTH) {
        groupIdString = Bytes.toBinary(groupId);
        groupV2IdString = this.deriveGroupV2FromV1(groupId);
      } else if (groupId.byteLength === GROUPV2_ID_LENGTH) {
        groupV2IdString = Bytes.toBase64(groupId);
      } else {
        this.removeFromCache(envelope);
        log.error('Received message request with invalid groupId');
        return undefined;
      }
    }

    const ev = new MessageRequestResponseEvent(
      {
        threadE164: dropNull(sync.threadE164),
        threadUuid: sync.threadUuid
          ? normalizeUuid(
              sync.threadUuid,
              'handleMessageRequestResponse.threadUuid'
            )
          : undefined,
        messageRequestResponseType: sync.type,
        groupId: groupIdString,
        groupV2Id: groupV2IdString,
      },
      this.removeFromCache.bind(this, envelope)
    );

    return this.dispatchAndWait(ev);
  }

  private async handleFetchLatest(
    envelope: ProcessedEnvelope,
    sync: Proto.SyncMessage.IFetchLatest
  ): Promise<void> {
    log.info('got fetch latest sync message');

    const ev = new FetchLatestEvent(
      sync.type,
      this.removeFromCache.bind(this, envelope)
    );

    return this.dispatchAndWait(ev);
  }

  private async handleKeys(
    envelope: ProcessedEnvelope,
    sync: Proto.SyncMessage.IKeys
  ): Promise<void> {
    log.info('got keys sync message');

    if (!sync.storageService) {
      return undefined;
    }

    const ev = new KeysEvent(
      sync.storageService,
      this.removeFromCache.bind(this, envelope)
    );

    return this.dispatchAndWait(ev);
  }

  private async handleStickerPackOperation(
    envelope: ProcessedEnvelope,
    operations: Array<Proto.SyncMessage.IStickerPackOperation>
  ): Promise<void> {
    const ENUM = Proto.SyncMessage.StickerPackOperation.Type;
    log.info('got sticker pack operation sync message');

    const stickerPacks = operations.map(operation => ({
      id: operation.packId ? Bytes.toHex(operation.packId) : undefined,
      key: operation.packKey ? Bytes.toBase64(operation.packKey) : undefined,
      isInstall: operation.type === ENUM.INSTALL,
      isRemove: operation.type === ENUM.REMOVE,
    }));

    const ev = new StickerPackEvent(
      stickerPacks,
      this.removeFromCache.bind(this, envelope)
    );

    return this.dispatchAndWait(ev);
  }

  private async handleVerified(
    envelope: ProcessedEnvelope,
    verified: Proto.IVerified
  ): Promise<void> {
    const ev = new VerifiedEvent(
      {
        state: verified.state,
        destination: dropNull(verified.destination),
        destinationUuid: verified.destinationUuid
          ? normalizeUuid(
              verified.destinationUuid,
              'handleVerified.destinationUuid'
            )
          : undefined,
        identityKey: verified.identityKey ? verified.identityKey : undefined,
      },
      this.removeFromCache.bind(this, envelope)
    );
    return this.dispatchAndWait(ev);
  }

  private async handleRead(
    envelope: ProcessedEnvelope,
    read: Array<Proto.SyncMessage.IRead>
  ): Promise<void> {
    log.info('MessageReceiver.handleRead', this.getEnvelopeId(envelope));
    const results = [];
    for (const { timestamp, sender, senderUuid } of read) {
      const ev = new ReadSyncEvent(
        {
          envelopeTimestamp: envelope.timestamp,
          timestamp: normalizeNumber(dropNull(timestamp)),
          sender: dropNull(sender),
          senderUuid: senderUuid
            ? normalizeUuid(senderUuid, 'handleRead.senderUuid')
            : undefined,
        },
        this.removeFromCache.bind(this, envelope)
      );
      results.push(this.dispatchAndWait(ev));
    }
    await Promise.all(results);
  }

  private async handleViewed(
    envelope: ProcessedEnvelope,
    viewed: ReadonlyArray<Proto.SyncMessage.IViewed>
  ): Promise<void> {
    log.info('MessageReceiver.handleViewed', this.getEnvelopeId(envelope));
    await Promise.all(
      viewed.map(async ({ timestamp, senderE164, senderUuid }) => {
        const ev = new ViewSyncEvent(
          {
            envelopeTimestamp: envelope.timestamp,
            timestamp: normalizeNumber(dropNull(timestamp)),
            senderE164: dropNull(senderE164),
            senderUuid: senderUuid
              ? normalizeUuid(senderUuid, 'handleViewed.senderUuid')
              : undefined,
          },
          this.removeFromCache.bind(this, envelope)
        );
        await this.dispatchAndWait(ev);
      })
    );
  }

  private async handleContacts(
    envelope: ProcessedEnvelope,
    contacts: Proto.SyncMessage.IContacts
  ): Promise<void> {
    log.info('contact sync');
    const { blob } = contacts;
    if (!blob) {
      throw new Error('MessageReceiver.handleContacts: blob field was missing');
    }

    this.removeFromCache(envelope);

    // Note: we do not return here because we don't want to block the next message on
    //   this attachment download and a lot of processing of that attachment.
    const attachmentPointer = await this.handleAttachment(blob);
    const results = [];
    const contactBuffer = new ContactBuffer(attachmentPointer.data);
    let contactDetails = contactBuffer.next();
    while (contactDetails !== undefined) {
      const contactEvent = new ContactEvent(contactDetails);
      results.push(this.dispatchAndWait(contactEvent));

      contactDetails = contactBuffer.next();
    }

    const finalEvent = new ContactSyncEvent();
    results.push(this.dispatchAndWait(finalEvent));

    await Promise.all(results);

    log.info('handleContacts: finished');
  }

  private async handleGroups(
    envelope: ProcessedEnvelope,
    groups: Proto.SyncMessage.IGroups
  ): Promise<void> {
    log.info('group sync');
    const { blob } = groups;

    this.removeFromCache(envelope);

    if (!blob) {
      throw new Error('MessageReceiver.handleGroups: blob field was missing');
    }

    // Note: we do not return here because we don't want to block the next message on
    //   this attachment download and a lot of processing of that attachment.
    const attachmentPointer = await this.handleAttachment(blob);
    const groupBuffer = new GroupBuffer(attachmentPointer.data);
    let groupDetails = groupBuffer.next();
    const promises = [];
    while (groupDetails) {
      const { id } = groupDetails;
      strictAssert(id, 'Group details without id');

      if (id.byteLength !== 16) {
        log.error(
          `onGroupReceived: Id was ${id} bytes, expected 16 bytes. Dropping group.`
        );
        continue;
      }

      const ev = new GroupEvent({
        ...groupDetails,
        id: Bytes.toBinary(id),
      });
      const promise = this.dispatchAndWait(ev).catch(e => {
        log.error('error processing group', e);
      });
      groupDetails = groupBuffer.next();
      promises.push(promise);
    }

    await Promise.all(promises);

    const ev = new GroupSyncEvent();
    return this.dispatchAndWait(ev);
  }

  private async handleBlocked(
    envelope: ProcessedEnvelope,
    blocked: Proto.SyncMessage.IBlocked
  ): Promise<void> {
    log.info('Setting these numbers as blocked:', blocked.numbers);
    if (blocked.numbers) {
      await this.storage.put('blocked', blocked.numbers);
    }
    if (blocked.uuids) {
      const uuids = blocked.uuids.map((uuid, index) => {
        return normalizeUuid(uuid, `handleBlocked.uuids.${index}`);
      });
      log.info('Setting these uuids as blocked:', uuids);
      await this.storage.put('blocked-uuids', uuids);
    }

    const groupIds = map(blocked.groupIds, groupId => Bytes.toBinary(groupId));
    log.info(
      'Setting these groups as blocked:',
      groupIds.map(groupId => `group(${groupId})`)
    );
    await this.storage.put('blocked-groups', groupIds);

    this.removeFromCache(envelope);
  }

  private isBlocked(number: string): boolean {
    return this.storage.blocked.isBlocked(number);
  }

  private isUuidBlocked(uuid: string): boolean {
    return this.storage.blocked.isUuidBlocked(uuid);
  }

  private isGroupBlocked(groupId: string): boolean {
    return this.storage.blocked.isGroupBlocked(groupId);
  }

  private async handleAttachment(
    attachment: Proto.IAttachmentPointer
  ): Promise<DownloadedAttachmentType> {
    const cleaned = processAttachment(attachment);
    return downloadAttachment(this.server, cleaned);
  }

  private async handleEndSession(theirUuid: UUID): Promise<void> {
    log.info(`handleEndSession: closing sessions for ${theirUuid.toString()}`);
    await this.storage.protocol.archiveAllSessions(theirUuid);
  }

  private async processDecrypted(
    envelope: ProcessedEnvelope,
    decrypted: Proto.IDataMessage
  ): Promise<ProcessedDataMessage> {
    return processDataMessage(decrypted, envelope.timestamp);
  }
}
