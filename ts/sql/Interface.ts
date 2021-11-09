// Copyright 2020-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable camelcase */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  ConversationAttributesType,
  ConversationModelCollectionType,
  MessageAttributesType,
  MessageModelCollectionType,
} from '../model-types.d';
import type { MessageModel } from '../models/messages';
import type { ConversationModel } from '../models/conversations';
import type { StoredJob } from '../jobs/types';
import type { ReactionType } from '../types/Reactions';
import type { ConversationColorType, CustomColorType } from '../types/Colors';
import type { ProcessGroupCallRingRequestResult } from '../types/Calling';
import type { StorageAccessType } from '../types/Storage.d';
import type { AttachmentType } from '../types/Attachment';
import type { BodyRangesType } from '../types/Util';
import type { QualifiedAddressStringType } from '../types/QualifiedAddress';
import type { UUIDStringType } from '../types/UUID';
import type { BadgeType } from '../badges/types';
import type { RemoveAllConfiguration } from '../types/RemoveAllConfiguration';
import type { LoggerType } from '../types/Logging';

export type AttachmentDownloadJobTypeType =
  | 'long-message'
  | 'attachment'
  | 'preview'
  | 'contact'
  | 'quote'
  | 'sticker';

export type AttachmentDownloadJobType = {
  attachment: AttachmentType;
  attempts: number;
  id: string;
  index: number;
  messageId: string;
  pending: number;
  timestamp: number;
  type: AttachmentDownloadJobTypeType;
};
export type MessageMetricsType = {
  id: string;
  // eslint-disable-next-line camelcase
  received_at: number;
  // eslint-disable-next-line camelcase
  sent_at: number;
};
export type ConversationMetricsType = {
  oldest?: MessageMetricsType;
  newest?: MessageMetricsType;
  oldestUnread?: MessageMetricsType;
  totalUnread: number;
};
export type ConversationType = ConversationAttributesType;
export type EmojiType = {
  shortName: string;
  lastUsage: number;
};

export type IdentityKeyType = {
  firstUse: boolean;
  id: UUIDStringType | `conversation:${string}`;
  nonblockingApproval: boolean;
  publicKey: Uint8Array;
  timestamp: number;
  verified: number;
};
export type IdentityKeyIdType = IdentityKeyType['id'];

export type ItemKeyType = keyof StorageAccessType;
export type AllItemsType = Partial<StorageAccessType>;
export type ItemType<K extends ItemKeyType> = {
  id: K;
  value: StorageAccessType[K];
};
export type MessageType = MessageAttributesType;
export type MessageTypeUnhydrated = {
  json: string;
};
export type PreKeyType = {
  id: `${UUIDStringType}:${number}`;
  keyId: number;
  ourUuid: UUIDStringType;
  privateKey: Uint8Array;
  publicKey: Uint8Array;
};
export type PreKeyIdType = PreKeyType['id'];
export type SearchResultMessageType = {
  json: string;
  snippet: string;
};
export type ClientSearchResultMessageType = MessageType & {
  json: string;
  bodyRanges: BodyRangesType;
  snippet: string;
};

export type SentProtoType = {
  contentHint: number;
  proto: Uint8Array;
  timestamp: number;
};
export type SentProtoWithMessageIdsType = SentProtoType & {
  messageIds: Array<string>;
};
export type SentRecipientsType = Record<string, Array<number>>;
export type SentMessagesType = Array<string>;

// These two are for test only
export type SentRecipientsDBType = {
  payloadId: number;
  recipientUuid: string;
  deviceId: number;
};
export type SentMessageDBType = {
  payloadId: number;
  messageId: string;
};

export type SenderKeyType = {
  // Primary key
  id: `${QualifiedAddressStringType}--${string}`;
  // These two are combined into one string to give us the final id
  senderId: string;
  distributionId: string;
  // Raw data to serialize/deserialize into signal-client SenderKeyRecord
  data: Uint8Array;
  lastUpdatedDate: number;
};
export type SenderKeyIdType = SenderKeyType['id'];
export type SessionType = {
  id: QualifiedAddressStringType;
  ourUuid: UUIDStringType;
  uuid: UUIDStringType;
  conversationId: string;
  deviceId: number;
  record: string;
  version?: number;
};
export type SessionIdType = SessionType['id'];
export type SignedPreKeyType = {
  confirmed: boolean;
  // eslint-disable-next-line camelcase
  created_at: number;
  ourUuid: UUIDStringType;
  id: `${UUIDStringType}:${number}`;
  keyId: number;
  privateKey: Uint8Array;
  publicKey: Uint8Array;
};
export type SignedPreKeyIdType = SignedPreKeyType['id'];

export type StickerType = Readonly<{
  id: number;
  packId: string;

  emoji?: string;
  isCoverOnly: boolean;
  lastUsed?: number;
  path: string;

  width: number;
  height: number;
}>;

export const StickerPackStatuses = [
  'known',
  'ephemeral',
  'downloaded',
  'installed',
  'pending',
  'error',
] as const;

export type StickerPackStatusType = typeof StickerPackStatuses[number];

export type StickerPackType = Readonly<{
  id: string;
  key: string;

  attemptedStatus?: 'downloaded' | 'installed' | 'ephemeral';
  author: string;
  coverStickerId: number;
  createdAt: number;
  downloadAttempts: number;
  installedAt?: number;
  lastUsed?: number;
  status: StickerPackStatusType;
  stickerCount: number;
  stickers: Record<string, StickerType>;
  title: string;
}>;

export type UnprocessedType = {
  id: string;
  timestamp: number;
  version: number;
  attempts: number;
  envelope?: string;

  source?: string;
  sourceUuid?: string;
  sourceDevice?: number;
  serverGuid?: string;
  serverTimestamp?: number;
  decrypted?: string;
};

export type UnprocessedUpdateType = {
  source?: string;
  sourceUuid?: string;
  sourceDevice?: number;
  serverGuid?: string;
  serverTimestamp?: number;
  decrypted?: string;
};

export type LastConversationMessagesServerType = {
  activity?: MessageType;
  preview?: MessageType;
  hasUserInitiatedMessages: boolean;
};

export type LastConversationMessagesType = {
  activity?: MessageModel;
  preview?: MessageModel;
  hasUserInitiatedMessages: boolean;
};

export type DeleteSentProtoRecipientOptionsType = Readonly<{
  timestamp: number;
  recipientUuid: string;
  deviceId: number;
}>;

export type DataInterface = {
  close: () => Promise<void>;
  removeDB: () => Promise<void>;
  removeIndexedDBFiles: () => Promise<void>;

  createOrUpdateIdentityKey: (data: IdentityKeyType) => Promise<void>;
  getIdentityKeyById: (
    id: IdentityKeyIdType
  ) => Promise<IdentityKeyType | undefined>;
  bulkAddIdentityKeys: (array: Array<IdentityKeyType>) => Promise<void>;
  removeIdentityKeyById: (id: IdentityKeyIdType) => Promise<void>;
  removeAllIdentityKeys: () => Promise<void>;
  getAllIdentityKeys: () => Promise<Array<IdentityKeyType>>;

  createOrUpdatePreKey: (data: PreKeyType) => Promise<void>;
  getPreKeyById: (id: PreKeyIdType) => Promise<PreKeyType | undefined>;
  bulkAddPreKeys: (array: Array<PreKeyType>) => Promise<void>;
  removePreKeyById: (id: PreKeyIdType) => Promise<void>;
  removeAllPreKeys: () => Promise<void>;
  getAllPreKeys: () => Promise<Array<PreKeyType>>;

  createOrUpdateSignedPreKey: (data: SignedPreKeyType) => Promise<void>;
  getSignedPreKeyById: (
    id: SignedPreKeyIdType
  ) => Promise<SignedPreKeyType | undefined>;
  bulkAddSignedPreKeys: (array: Array<SignedPreKeyType>) => Promise<void>;
  removeSignedPreKeyById: (id: SignedPreKeyIdType) => Promise<void>;
  removeAllSignedPreKeys: () => Promise<void>;
  getAllSignedPreKeys: () => Promise<Array<SignedPreKeyType>>;

  createOrUpdateItem<K extends ItemKeyType>(data: ItemType<K>): Promise<void>;
  getItemById<K extends ItemKeyType>(id: K): Promise<ItemType<K> | undefined>;
  removeItemById: (id: ItemKeyType) => Promise<void>;
  removeAllItems: () => Promise<void>;
  getAllItems: () => Promise<AllItemsType>;

  createOrUpdateSenderKey: (key: SenderKeyType) => Promise<void>;
  getSenderKeyById: (id: SenderKeyIdType) => Promise<SenderKeyType | undefined>;
  removeAllSenderKeys: () => Promise<void>;
  getAllSenderKeys: () => Promise<Array<SenderKeyType>>;
  removeSenderKeyById: (id: SenderKeyIdType) => Promise<void>;

  insertSentProto: (
    proto: SentProtoType,
    options: {
      recipients: SentRecipientsType;
      messageIds: SentMessagesType;
    }
  ) => Promise<number>;
  deleteSentProtosOlderThan: (timestamp: number) => Promise<void>;
  deleteSentProtoByMessageId: (messageId: string) => Promise<void>;
  insertProtoRecipients: (options: {
    id: number;
    recipientUuid: string;
    deviceIds: Array<number>;
  }) => Promise<void>;
  deleteSentProtoRecipient: (
    options:
      | DeleteSentProtoRecipientOptionsType
      | ReadonlyArray<DeleteSentProtoRecipientOptionsType>
  ) => Promise<void>;
  getSentProtoByRecipient: (options: {
    now: number;
    recipientUuid: string;
    timestamp: number;
  }) => Promise<SentProtoWithMessageIdsType | undefined>;
  removeAllSentProtos: () => Promise<void>;
  getAllSentProtos: () => Promise<Array<SentProtoType>>;
  // Test-only
  _getAllSentProtoRecipients: () => Promise<Array<SentRecipientsDBType>>;
  _getAllSentProtoMessageIds: () => Promise<Array<SentMessageDBType>>;

  createOrUpdateSession: (data: SessionType) => Promise<void>;
  createOrUpdateSessions: (array: Array<SessionType>) => Promise<void>;
  commitSessionsAndUnprocessed(options: {
    sessions: Array<SessionType>;
    unprocessed: Array<UnprocessedType>;
  }): Promise<void>;
  bulkAddSessions: (array: Array<SessionType>) => Promise<void>;
  removeSessionById: (id: SessionIdType) => Promise<void>;
  removeSessionsByConversation: (conversationId: string) => Promise<void>;
  removeAllSessions: () => Promise<void>;
  getAllSessions: () => Promise<Array<SessionType>>;

  eraseStorageServiceStateFromConversations: () => Promise<void>;
  getConversationCount: () => Promise<number>;
  saveConversation: (data: ConversationType) => Promise<void>;
  saveConversations: (array: Array<ConversationType>) => Promise<void>;
  updateConversations: (array: Array<ConversationType>) => Promise<void>;
  getAllConversationIds: () => Promise<Array<string>>;

  searchConversations: (
    query: string,
    options?: { limit?: number }
  ) => Promise<Array<ConversationType>>;

  getMessagesById: (messageIds: Array<string>) => Promise<Array<MessageType>>;
  saveMessage: (
    data: MessageType,
    options?: {
      jobToInsert?: StoredJob;
      forceSave?: boolean;
    }
  ) => Promise<string>;
  saveMessages: (
    arrayOfMessages: Array<MessageType>,
    options?: { forceSave?: boolean }
  ) => Promise<void>;
  getMessageCount: (conversationId?: string) => Promise<number>;
  getAllMessageIds: () => Promise<Array<string>>;
  getMessageMetricsForConversation: (
    conversationId: string
  ) => Promise<ConversationMetricsType>;
  hasGroupCallHistoryMessage: (
    conversationId: string,
    eraId: string
  ) => Promise<boolean>;
  migrateConversationMessages: (
    obsoleteId: string,
    currentId: string
  ) => Promise<void>;
  getNextTapToViewMessageTimestampToAgeOut: () => Promise<undefined | number>;

  getUnreadCountForConversation: (conversationId: string) => Promise<number>;
  getUnreadByConversationAndMarkRead: (
    conversationId: string,
    newestUnreadId: number,
    readAt?: number
  ) => Promise<
    Array<
      Pick<MessageType, 'id' | 'source' | 'sourceUuid' | 'sent_at' | 'type'>
    >
  >;
  getUnreadReactionsAndMarkRead: (
    conversationId: string,
    newestUnreadId: number
  ) => Promise<
    Array<
      Pick<ReactionType, 'targetAuthorUuid' | 'targetTimestamp' | 'messageId'>
    >
  >;
  markReactionAsRead: (
    targetAuthorUuid: string,
    targetTimestamp: number
  ) => Promise<ReactionType | undefined>;
  removeReactionFromConversation: (reaction: {
    emoji: string;
    fromId: string;
    targetAuthorUuid: string;
    targetTimestamp: number;
  }) => Promise<void>;
  addReaction: (reactionObj: ReactionType) => Promise<void>;
  _getAllReactions: () => Promise<Array<ReactionType>>;

  getUnprocessedCount: () => Promise<number>;
  getAllUnprocessed: () => Promise<Array<UnprocessedType>>;
  updateUnprocessedWithData: (
    id: string,
    data: UnprocessedUpdateType
  ) => Promise<void>;
  updateUnprocessedsWithData: (
    array: Array<{ id: string; data: UnprocessedUpdateType }>
  ) => Promise<void>;
  getUnprocessedById: (id: string) => Promise<UnprocessedType | undefined>;
  removeUnprocessed: (id: string | Array<string>) => Promise<void>;
  removeAllUnprocessed: () => Promise<void>;

  getNextAttachmentDownloadJobs: (
    limit?: number,
    options?: { timestamp?: number }
  ) => Promise<Array<AttachmentDownloadJobType>>;
  saveAttachmentDownloadJob: (job: AttachmentDownloadJobType) => Promise<void>;
  setAttachmentDownloadJobPending: (
    id: string,
    pending: boolean
  ) => Promise<void>;
  resetAttachmentDownloadPending: () => Promise<void>;
  removeAttachmentDownloadJob: (id: string) => Promise<void>;
  removeAllAttachmentDownloadJobs: () => Promise<void>;

  createOrUpdateStickerPack: (pack: StickerPackType) => Promise<void>;
  updateStickerPackStatus: (
    id: string,
    status: StickerPackStatusType,
    options?: { timestamp: number }
  ) => Promise<void>;
  createOrUpdateSticker: (sticker: StickerType) => Promise<void>;
  updateStickerLastUsed: (
    packId: string,
    stickerId: number,
    lastUsed: number
  ) => Promise<void>;
  addStickerPackReference: (messageId: string, packId: string) => Promise<void>;
  deleteStickerPackReference: (
    messageId: string,
    packId: string
  ) => Promise<ReadonlyArray<string> | undefined>;
  getStickerCount: () => Promise<number>;
  deleteStickerPack: (packId: string) => Promise<Array<string>>;
  getAllStickerPacks: () => Promise<Array<StickerPackType>>;
  getAllStickers: () => Promise<Array<StickerType>>;
  getRecentStickers: (options?: {
    limit?: number;
  }) => Promise<Array<StickerType>>;
  clearAllErrorStickerPackAttempts: () => Promise<void>;

  updateEmojiUsage: (shortName: string, timeUsed?: number) => Promise<void>;
  getRecentEmojis: (limit?: number) => Promise<Array<EmojiType>>;

  getAllBadges(): Promise<Array<BadgeType>>;
  updateOrCreateBadges(badges: ReadonlyArray<BadgeType>): Promise<void>;
  badgeImageFileDownloaded(url: string, localPath: string): Promise<void>;

  removeAll: () => Promise<void>;
  removeAllConfiguration: (type?: RemoveAllConfiguration) => Promise<void>;

  getMessagesNeedingUpgrade: (
    limit: number,
    options: { maxVersion: number }
  ) => Promise<Array<MessageType>>;
  getMessagesWithVisualMediaAttachments: (
    conversationId: string,
    options: { limit: number }
  ) => Promise<Array<MessageType>>;
  getMessagesWithFileAttachments: (
    conversationId: string,
    options: { limit: number }
  ) => Promise<Array<MessageType>>;
  getMessageServerGuidsForSpam: (
    conversationId: string
  ) => Promise<Array<string>>;
  getMessagesUnexpectedlyMissingExpirationStartTimestamp: () => Promise<
    Array<MessageType>
  >;
  getSoonestMessageExpiry: () => Promise<undefined | number>;

  getJobsInQueue(queueType: string): Promise<Array<StoredJob>>;
  insertJob(job: Readonly<StoredJob>): Promise<void>;
  deleteJob(id: string): Promise<void>;

  processGroupCallRingRequest(
    ringId: bigint
  ): Promise<ProcessGroupCallRingRequestResult>;
  processGroupCallRingCancelation(ringId: bigint): Promise<void>;
  cleanExpiredGroupCallRings(): Promise<void>;

  updateAllConversationColors: (
    conversationColor?: ConversationColorType,
    customColorData?: {
      id: string;
      value: CustomColorType;
    }
  ) => Promise<void>;

  getMaxMessageCounter(): Promise<number | undefined>;
  getStatisticsForLogging(): Promise<Record<string, string>>;
};

// The reason for client/server divergence is the need to inject Backbone models and
//   collections into data calls so those are the objects returned. This was necessary in
//   July 2018 when creating the Data API as a drop-in replacement for previous database
//   requests via ORM.

// Note: It is extremely important that items are duplicated between these two. Client.js
//   loops over all of its local functions to generate the server-side IPC-based API.

export type ServerInterface = DataInterface & {
  getAllConversations: () => Promise<Array<ConversationType>>;
  getAllGroupsInvolvingUuid: (
    id: UUIDStringType
  ) => Promise<Array<ConversationType>>;
  getAllPrivateConversations: () => Promise<Array<ConversationType>>;
  getConversationById: (id: string) => Promise<ConversationType | undefined>;
  getExpiredMessages: () => Promise<Array<MessageType>>;
  getMessageById: (id: string) => Promise<MessageType | undefined>;
  getMessageBySender: (options: {
    source: string;
    sourceUuid: string;
    sourceDevice: number;
    sent_at: number;
  }) => Promise<Array<MessageType>>;
  getMessagesBySentAt: (sentAt: number) => Promise<Array<MessageType>>;
  getOlderMessagesByConversation: (
    conversationId: string,
    options?: {
      limit?: number;
      receivedAt?: number;
      sentAt?: number;
      messageId?: string;
    }
  ) => Promise<Array<MessageTypeUnhydrated>>;
  getNewerMessagesByConversation: (
    conversationId: string,
    options?: { limit?: number; receivedAt?: number; sentAt?: number }
  ) => Promise<Array<MessageTypeUnhydrated>>;
  getLastConversationMessages: (options: {
    conversationId: string;
    ourUuid: UUIDStringType;
  }) => Promise<LastConversationMessagesServerType>;
  getTapToViewMessagesNeedingErase: () => Promise<Array<MessageType>>;
  removeConversation: (id: Array<string> | string) => Promise<void>;
  removeMessage: (id: string) => Promise<void>;
  removeMessages: (ids: Array<string>) => Promise<void>;
  searchMessages: (
    query: string,
    options?: { limit?: number }
  ) => Promise<Array<SearchResultMessageType>>;
  searchMessagesInConversation: (
    query: string,
    conversationId: string,
    options?: { limit?: number }
  ) => Promise<Array<SearchResultMessageType>>;
  updateConversation: (data: ConversationType) => Promise<void>;

  // For testing only
  _getAllMessages: () => Promise<Array<MessageType>>;

  // Server-only

  getCorruptionLog: () => string;

  initialize: (options: {
    configDir: string;
    key: string;
    logger: LoggerType;
  }) => Promise<void>;

  initializeRenderer: (options: {
    configDir: string;
    key: string;
  }) => Promise<void>;

  removeKnownAttachments: (
    allAttachments: Array<string>
  ) => Promise<Array<string>>;
  removeKnownStickers: (allStickers: Array<string>) => Promise<Array<string>>;
  removeKnownDraftAttachments: (
    allStickers: Array<string>
  ) => Promise<Array<string>>;
  getAllBadgeImageFileLocalPaths: () => Promise<Set<string>>;
};

export type ClientInterface = DataInterface & {
  getAllConversations: (options: {
    ConversationCollection: typeof ConversationModelCollectionType;
  }) => Promise<ConversationModelCollectionType>;
  getAllGroupsInvolvingUuid: (
    id: UUIDStringType,
    options: {
      ConversationCollection: typeof ConversationModelCollectionType;
    }
  ) => Promise<ConversationModelCollectionType>;
  getAllPrivateConversations: (options: {
    ConversationCollection: typeof ConversationModelCollectionType;
  }) => Promise<ConversationModelCollectionType>;
  getConversationById: (
    id: string,
    options: { Conversation: typeof ConversationModel }
  ) => Promise<ConversationModel | undefined>;
  getExpiredMessages: (options: {
    MessageCollection: typeof MessageModelCollectionType;
  }) => Promise<MessageModelCollectionType>;
  getMessageById: (
    id: string,
    options: { Message: typeof MessageModel }
  ) => Promise<MessageModel | undefined>;
  getMessageBySender: (
    data: {
      source: string;
      sourceUuid: string;
      sourceDevice: number;
      sent_at: number;
    },
    options: { Message: typeof MessageModel }
  ) => Promise<MessageModel | null>;
  getMessagesBySentAt: (
    sentAt: number,
    options: { MessageCollection: typeof MessageModelCollectionType }
  ) => Promise<MessageModelCollectionType>;
  getOlderMessagesByConversation: (
    conversationId: string,
    options: {
      limit?: number;
      messageId?: string;
      receivedAt?: number;
      sentAt?: number;
      MessageCollection: typeof MessageModelCollectionType;
    }
  ) => Promise<MessageModelCollectionType>;
  getNewerMessagesByConversation: (
    conversationId: string,
    options: {
      limit?: number;
      receivedAt?: number;
      sentAt?: number;
      MessageCollection: typeof MessageModelCollectionType;
    }
  ) => Promise<MessageModelCollectionType>;
  getLastConversationMessages: (options: {
    conversationId: string;
    ourUuid: UUIDStringType;
    Message: typeof MessageModel;
  }) => Promise<LastConversationMessagesType>;
  getTapToViewMessagesNeedingErase: (options: {
    MessageCollection: typeof MessageModelCollectionType;
  }) => Promise<MessageModelCollectionType>;
  removeConversation: (
    id: string,
    options: { Conversation: typeof ConversationModel }
  ) => Promise<void>;
  removeMessage: (
    id: string,
    options: { Message: typeof MessageModel }
  ) => Promise<void>;
  removeMessages: (
    ids: Array<string>,
    options: { Message: typeof MessageModel }
  ) => Promise<void>;
  searchMessages: (
    query: string,
    options?: { limit?: number }
  ) => Promise<Array<ClientSearchResultMessageType>>;
  searchMessagesInConversation: (
    query: string,
    conversationId: string,
    options?: { limit?: number }
  ) => Promise<Array<ClientSearchResultMessageType>>;
  updateConversation: (data: ConversationType, extra?: unknown) => void;

  // Test-only

  _getAllMessages: (options: {
    MessageCollection: typeof MessageModelCollectionType;
  }) => Promise<MessageModelCollectionType>;

  // Client-side only

  shutdown: () => Promise<void>;
  removeAllMessagesInConversation: (
    conversationId: string,
    options: {
      logId: string;
      MessageCollection: typeof MessageModelCollectionType;
    }
  ) => Promise<void>;
  removeOtherData: () => Promise<void>;
  cleanupOrphanedAttachments: () => Promise<void>;
  ensureFilePermissions: () => Promise<void>;

  // Client-side only, and test-only

  _removeConversations: (ids: Array<string>) => Promise<void>;
  _jobs: { [id: string]: ClientJobType };

  // These are defined on the server-only and used in the client to determine
  // whether we should use IPC to use the database in the main process or
  // use the db already running in the renderer.
  goBackToMainProcess: () => Promise<void>;
  startInRendererProcess: (isTesting?: boolean) => Promise<void>;
};

export type ClientJobType = {
  fnName: string;
  start: number;
  resolve?: Function;
  reject?: Function;

  // Only in DEBUG mode
  complete?: boolean;
  args?: Array<any>;
};
