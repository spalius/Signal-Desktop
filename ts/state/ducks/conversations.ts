// Copyright 2019-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/* eslint-disable camelcase */
import type { ThunkAction } from 'redux-thunk';
import {
  difference,
  fromPairs,
  intersection,
  omit,
  orderBy,
  pick,
  uniq,
  values,
  without,
} from 'lodash';

import type { StateType as RootStateType } from '../reducer';
import * as groups from '../../groups';
import * as log from '../../logging/log';
import { calling } from '../../services/calling';
import { getOwn } from '../../util/getOwn';
import { assert, strictAssert } from '../../util/assert';
import * as universalExpireTimer from '../../util/universalExpireTimer';
import { trigger } from '../../shims/events';
import type { ToggleProfileEditorErrorActionType } from './globalModals';
import { TOGGLE_PROFILE_EDITOR_ERROR } from './globalModals';
import { isRecord } from '../../util/isRecord';

import type {
  AvatarColorType,
  ConversationColorType,
  CustomColorType,
} from '../../types/Colors';
import type {
  LastMessageStatus,
  ConversationAttributesType,
  MessageAttributesType,
} from '../../model-types.d';
import type { BodyRangeType } from '../../types/Util';
import { CallMode } from '../../types/Calling';
import type { MediaItemType } from '../../types/MediaItem';
import type { UUIDStringType } from '../../types/UUID';
import {
  getGroupSizeRecommendedLimit,
  getGroupSizeHardLimit,
} from '../../groups/limits';
import { getMessagesById } from '../../messages/getMessagesById';
import { isMessageUnread } from '../../util/isMessageUnread';
import { toggleSelectedContactForGroupAddition } from '../../groups/toggleSelectedContactForGroupAddition';
import type { GroupNameCollisionsWithIdsByTitle } from '../../util/groupMemberNameCollisions';
import { ContactSpoofingType } from '../../util/contactSpoofing';
import { writeProfile } from '../../services/writeProfile';
import { writeUsername } from '../../services/writeUsername';
import {
  getMe,
  getMessageIdsPendingBecauseOfVerification,
  getUsernameSaveState,
} from '../selectors/conversations';
import type { AvatarDataType } from '../../types/Avatar';
import { getDefaultAvatars } from '../../types/Avatar';
import { getAvatarData } from '../../util/getAvatarData';
import { isSameAvatarData } from '../../util/isSameAvatarData';
import { longRunningTaskWrapper } from '../../util/longRunningTaskWrapper';
import {
  UsernameSaveState,
  ComposerStep,
  OneTimeModalState,
} from './conversationsEnums';
import { showToast } from '../../util/showToast';
import { ToastFailedToDeleteUsername } from '../../components/ToastFailedToDeleteUsername';

import type { NoopActionType } from './noop';

// State

export type DBConversationType = {
  id: string;
  activeAt?: number;
  lastMessage?: string | null;
  type: string;
};

export const InteractionModes = ['mouse', 'keyboard'] as const;
export type InteractionModeType = typeof InteractionModes[number];

export type MessageType = MessageAttributesType & {
  interactionType?: InteractionModeType;
};

export const ConversationTypes = ['direct', 'group'] as const;
export type ConversationTypeType = typeof ConversationTypes[number];

export type ConversationType = {
  id: string;
  uuid?: UUIDStringType;
  e164?: string;
  name?: string;
  familyName?: string;
  firstName?: string;
  profileName?: string;
  username?: string;
  about?: string;
  aboutText?: string;
  aboutEmoji?: string;
  avatars?: Array<AvatarDataType>;
  avatarPath?: string;
  avatarHash?: string;
  unblurredAvatarPath?: string;
  areWeAdmin?: boolean;
  areWePending?: boolean;
  areWePendingApproval?: boolean;
  canChangeTimer?: boolean;
  canEditGroupInfo?: boolean;
  color?: AvatarColorType;
  conversationColor?: ConversationColorType;
  customColor?: CustomColorType;
  customColorId?: string;
  discoveredUnregisteredAt?: number;
  isArchived?: boolean;
  isBlocked?: boolean;
  isGroupV1AndDisabled?: boolean;
  isGroupV2Capable?: boolean;
  isPinned?: boolean;
  isUntrusted?: boolean;
  isVerified?: boolean;
  activeAt?: number;
  timestamp?: number;
  inboxPosition?: number;
  left?: boolean;
  lastMessage?:
    | {
        status?: LastMessageStatus;
        text: string;
        deletedForEveryone: false;
      }
    | { deletedForEveryone: true };
  markedUnread?: boolean;
  phoneNumber?: string;
  membersCount?: number;
  messageCount?: number;
  accessControlAddFromInviteLink?: number;
  accessControlAttributes?: number;
  accessControlMembers?: number;
  announcementsOnly?: boolean;
  announcementsOnlyReady?: boolean;
  expireTimer?: number;
  memberships?: Array<{
    uuid: UUIDStringType;
    isAdmin: boolean;
  }>;
  pendingMemberships?: Array<{
    uuid: UUIDStringType;
    addedByUserId?: UUIDStringType;
  }>;
  pendingApprovalMemberships?: Array<{
    uuid: UUIDStringType;
  }>;
  muteExpiresAt?: number;
  dontNotifyForMentionsIfMuted?: boolean;
  type: ConversationTypeType;
  isMe: boolean;
  lastUpdated?: number;
  // This is used by the CompositionInput for @mentions
  sortedGroupMembers?: Array<ConversationType>;
  title: string;
  searchableTitle?: string;
  unreadCount?: number;
  isSelected?: boolean;
  isFetchingUUID?: boolean;
  typingContact?: {
    acceptedMessageRequest: boolean;
    avatarPath?: string;
    color?: AvatarColorType;
    isMe: boolean;
    name?: string;
    phoneNumber?: string;
    profileName?: string;
    sharedGroupNames: Array<string>;
    title: string;
  } | null;
  recentMediaItems?: Array<MediaItemType>;
  profileSharing?: boolean;

  shouldShowDraft?: boolean;
  draftText?: string | null;
  draftBodyRanges?: Array<BodyRangeType>;
  draftPreview?: string;

  sharedGroupNames: Array<string>;
  groupDescription?: string;
  groupVersion?: 1 | 2;
  groupId?: string;
  groupLink?: string;
  messageRequestsEnabled?: boolean;
  acceptedMessageRequest: boolean;
  secretParams?: string;
  publicParams?: string;
  acknowledgedGroupNameCollisions?: GroupNameCollisionsWithIdsByTitle;
  profileKey?: string;

  badges: Array<
    | {
        id: string;
      }
    | {
        id: string;
        expiresAt: number;
        isVisible: boolean;
      }
  >;
};
export type ProfileDataType = {
  firstName: string;
} & Pick<ConversationType, 'aboutEmoji' | 'aboutText' | 'familyName'>;

export type ConversationLookupType = {
  [key: string]: ConversationType;
};
export type CustomError = Error & {
  identifier?: string;
  number?: string;
};

type MessagePointerType = {
  id: string;
  received_at: number;
  sent_at?: number;
};
type MessageMetricsType = {
  newest?: MessagePointerType;
  oldest?: MessagePointerType;
  oldestUnread?: MessagePointerType;
  totalUnread: number;
};

export type MessageLookupType = {
  [key: string]: MessageAttributesType;
};
export type ConversationMessageType = {
  heightChangeMessageIds: Array<string>;
  isLoadingMessages: boolean;
  isNearBottom?: boolean;
  loadCountdownStart?: number;
  messageIds: Array<string>;
  metrics: MessageMetricsType;
  resetCounter: number;
  scrollToBottomCounter: number;
  scrollToMessageId?: string;
  scrollToMessageCounter: number;
};

export type MessagesByConversationType = {
  [key: string]: ConversationMessageType | undefined;
};

export type PreJoinConversationType = {
  avatar?: {
    loading?: boolean;
    url?: string;
  };
  groupDescription?: string;
  memberCount: number;
  title: string;
  approvalRequired: boolean;
};

type ComposerGroupCreationState = {
  groupAvatar: undefined | Uint8Array;
  groupName: string;
  groupExpireTimer: number;
  maximumGroupSizeModalState: OneTimeModalState;
  recommendedGroupSizeModalState: OneTimeModalState;
  selectedConversationIds: Array<string>;
  userAvatarData: Array<AvatarDataType>;
};

type ComposerStateType =
  | {
      step: ComposerStep.StartDirectConversation;
      searchTerm: string;
    }
  | ({
      step: ComposerStep.ChooseGroupMembers;
      searchTerm: string;
      cantAddContactIdForModal: undefined | string;
    } & ComposerGroupCreationState)
  | ({
      step: ComposerStep.SetGroupMetadata;
      isEditingAvatar: boolean;
    } & ComposerGroupCreationState &
      (
        | { isCreating: false; hasError: boolean }
        | { isCreating: true; hasError: false }
      ));

type ContactSpoofingReviewStateType =
  | {
      type: ContactSpoofingType.DirectConversationWithSameTitle;
      safeConversationId: string;
    }
  | {
      type: ContactSpoofingType.MultipleGroupMembersWithSameTitle;
      groupConversationId: string;
    };

export type ConversationsStateType = {
  preJoinConversation?: PreJoinConversationType;
  invitedUuidsForNewlyCreatedGroup?: Array<string>;
  conversationLookup: ConversationLookupType;
  conversationsByE164: ConversationLookupType;
  conversationsByUuid: ConversationLookupType;
  conversationsByGroupId: ConversationLookupType;
  selectedConversationId?: string;
  selectedMessage?: string;
  selectedMessageCounter: number;
  selectedConversationTitle?: string;
  selectedConversationPanelDepth: number;
  showArchived: boolean;
  composer?: ComposerStateType;
  contactSpoofingReview?: ContactSpoofingReviewStateType;
  usernameSaveState: UsernameSaveState;

  /**
   * Each key is a conversation ID. Each value is an array of message IDs stopped by that
   * conversation being unverified.
   */
  outboundMessagesPendingConversationVerification: Record<
    string,
    Array<string>
  >;

  // Note: it's very important that both of these locations are always kept up to date
  messagesLookup: MessageLookupType;
  messagesByConversation: MessagesByConversationType;
};

// Helpers

export const getConversationCallMode = (
  conversation: ConversationType
): CallMode => {
  if (
    conversation.left ||
    conversation.isBlocked ||
    conversation.isMe ||
    !conversation.acceptedMessageRequest
  ) {
    return CallMode.None;
  }

  if (conversation.type === 'direct') {
    return CallMode.Direct;
  }

  if (conversation.type === 'group' && conversation.groupVersion === 2) {
    return CallMode.Group;
  }

  return CallMode.None;
};

// Actions

export const COLORS_CHANGED = 'conversations/COLORS_CHANGED';
export const COLOR_SELECTED = 'conversations/COLOR_SELECTED';
const CANCEL_MESSAGES_PENDING_CONVERSATION_VERIFICATION =
  'conversations/CANCEL_MESSAGES_PENDING_CONVERSATION_VERIFICATION';
const COMPOSE_TOGGLE_EDITING_AVATAR =
  'conversations/compose/COMPOSE_TOGGLE_EDITING_AVATAR';
const COMPOSE_ADD_AVATAR = 'conversations/compose/ADD_AVATAR';
const COMPOSE_REMOVE_AVATAR = 'conversations/compose/REMOVE_AVATAR';
const COMPOSE_REPLACE_AVATAR = 'conversations/compose/REPLACE_AVATAR';
const CUSTOM_COLOR_REMOVED = 'conversations/CUSTOM_COLOR_REMOVED';
const MESSAGE_STOPPED_BY_MISSING_VERIFICATION =
  'conversations/MESSAGE_STOPPED_BY_MISSING_VERIFICATION';
const REPLACE_AVATARS = 'conversations/REPLACE_AVATARS';
const UPDATE_USERNAME_SAVE_STATE = 'conversations/UPDATE_USERNAME_SAVE_STATE';

type CancelMessagesPendingConversationVerificationActionType = {
  type: typeof CANCEL_MESSAGES_PENDING_CONVERSATION_VERIFICATION;
};
type CantAddContactToGroupActionType = {
  type: 'CANT_ADD_CONTACT_TO_GROUP';
  payload: {
    conversationId: string;
  };
};
type ClearGroupCreationErrorActionType = { type: 'CLEAR_GROUP_CREATION_ERROR' };
type ClearInvitedUuidsForNewlyCreatedGroupActionType = {
  type: 'CLEAR_INVITED_UUIDS_FOR_NEWLY_CREATED_GROUP';
};
type CloseCantAddContactToGroupModalActionType = {
  type: 'CLOSE_CANT_ADD_CONTACT_TO_GROUP_MODAL';
};
type CloseContactSpoofingReviewActionType = {
  type: 'CLOSE_CONTACT_SPOOFING_REVIEW';
};
type CloseMaximumGroupSizeModalActionType = {
  type: 'CLOSE_MAXIMUM_GROUP_SIZE_MODAL';
};
type CloseRecommendedGroupSizeModalActionType = {
  type: 'CLOSE_RECOMMENDED_GROUP_SIZE_MODAL';
};
type ColorsChangedActionType = {
  type: typeof COLORS_CHANGED;
  payload: {
    conversationColor?: ConversationColorType;
    customColorData?: {
      id: string;
      value: CustomColorType;
    };
  };
};
type ColorSelectedPayloadType = {
  conversationId: string;
  conversationColor?: ConversationColorType;
  customColorData?: {
    id: string;
    value: CustomColorType;
  };
};
export type ColorSelectedActionType = {
  type: typeof COLOR_SELECTED;
  payload: ColorSelectedPayloadType;
};
type ComposeDeleteAvatarActionType = {
  type: typeof COMPOSE_REMOVE_AVATAR;
  payload: AvatarDataType;
};
type ComposeReplaceAvatarsActionType = {
  type: typeof COMPOSE_REPLACE_AVATAR;
  payload: {
    curr: AvatarDataType;
    prev?: AvatarDataType;
  };
};
type ComposeSaveAvatarActionType = {
  type: typeof COMPOSE_ADD_AVATAR;
  payload: AvatarDataType;
};
type CustomColorRemovedActionType = {
  type: typeof CUSTOM_COLOR_REMOVED;
  payload: {
    colorId: string;
  };
};
type SetPreJoinConversationActionType = {
  type: 'SET_PRE_JOIN_CONVERSATION';
  payload: {
    data: PreJoinConversationType | undefined;
  };
};

type ConversationAddedActionType = {
  type: 'CONVERSATION_ADDED';
  payload: {
    id: string;
    data: ConversationType;
  };
};
export type ConversationChangedActionType = {
  type: 'CONVERSATION_CHANGED';
  payload: {
    id: string;
    data: ConversationType;
  };
};
type ConversationRemovedActionType = {
  type: 'CONVERSATION_REMOVED';
  payload: {
    id: string;
  };
};
export type ConversationUnloadedActionType = {
  type: 'CONVERSATION_UNLOADED';
  payload: {
    id: string;
  };
};
type CreateGroupPendingActionType = {
  type: 'CREATE_GROUP_PENDING';
};
type CreateGroupFulfilledActionType = {
  type: 'CREATE_GROUP_FULFILLED';
  payload: {
    invitedUuids: Array<UUIDStringType>;
  };
};
type CreateGroupRejectedActionType = {
  type: 'CREATE_GROUP_REJECTED';
};
export type RemoveAllConversationsActionType = {
  type: 'CONVERSATIONS_REMOVE_ALL';
  payload: null;
};
export type MessageSelectedActionType = {
  type: 'MESSAGE_SELECTED';
  payload: {
    messageId: string;
    conversationId: string;
  };
};
type MessageStoppedByMissingVerificationActionType = {
  type: typeof MESSAGE_STOPPED_BY_MISSING_VERIFICATION;
  payload: {
    messageId: string;
    untrustedConversationIds: ReadonlyArray<string>;
  };
};
export type MessageChangedActionType = {
  type: 'MESSAGE_CHANGED';
  payload: {
    id: string;
    conversationId: string;
    data: MessageAttributesType;
  };
};
export type MessageDeletedActionType = {
  type: 'MESSAGE_DELETED';
  payload: {
    id: string;
    conversationId: string;
  };
};
type MessageSizeChangedActionType = {
  type: 'MESSAGE_SIZE_CHANGED';
  payload: {
    id: string;
    conversationId: string;
  };
};
export type MessagesAddedActionType = {
  type: 'MESSAGES_ADDED';
  payload: {
    conversationId: string;
    messages: Array<MessageAttributesType>;
    isNewMessage: boolean;
    isActive: boolean;
  };
};

export type RepairNewestMessageActionType = {
  type: 'REPAIR_NEWEST_MESSAGE';
  payload: {
    conversationId: string;
  };
};
export type RepairOldestMessageActionType = {
  type: 'REPAIR_OLDEST_MESSAGE';
  payload: {
    conversationId: string;
  };
};
export type MessagesResetActionType = {
  type: 'MESSAGES_RESET';
  payload: {
    conversationId: string;
    messages: Array<MessageAttributesType>;
    metrics: MessageMetricsType;
    scrollToMessageId?: string;
    // The set of provided messages should be trusted, even if it conflicts with metrics,
    //   because we weren't looking for a specific time window of messages with our query.
    unboundedFetch: boolean;
  };
};
export type SetMessagesLoadingActionType = {
  type: 'SET_MESSAGES_LOADING';
  payload: {
    conversationId: string;
    isLoadingMessages: boolean;
  };
};
export type SetLoadCountdownStartActionType = {
  type: 'SET_LOAD_COUNTDOWN_START';
  payload: {
    conversationId: string;
    loadCountdownStart?: number;
  };
};
export type SetIsNearBottomActionType = {
  type: 'SET_NEAR_BOTTOM';
  payload: {
    conversationId: string;
    isNearBottom: boolean;
  };
};
export type SetConversationHeaderTitleActionType = {
  type: 'SET_CONVERSATION_HEADER_TITLE';
  payload: { title?: string };
};
export type SetSelectedConversationPanelDepthActionType = {
  type: 'SET_SELECTED_CONVERSATION_PANEL_DEPTH';
  payload: { panelDepth: number };
};
export type ScrollToBpttomActionType = {
  type: 'SCROLL_TO_BOTTOM';
  payload: {
    conversationId: string;
  };
};
export type ScrollToMessageActionType = {
  type: 'SCROLL_TO_MESSAGE';
  payload: {
    conversationId: string;
    messageId: string;
  };
};
export type ClearChangedMessagesActionType = {
  type: 'CLEAR_CHANGED_MESSAGES';
  payload: {
    conversationId: string;
  };
};
export type ClearSelectedMessageActionType = {
  type: 'CLEAR_SELECTED_MESSAGE';
  payload: null;
};
export type ClearUnreadMetricsActionType = {
  type: 'CLEAR_UNREAD_METRICS';
  payload: {
    conversationId: string;
  };
};
export type SelectedConversationChangedActionType = {
  type: 'SELECTED_CONVERSATION_CHANGED';
  payload: {
    id: string;
    messageId?: string;
  };
};
type ReviewGroupMemberNameCollisionActionType = {
  type: 'REVIEW_GROUP_MEMBER_NAME_COLLISION';
  payload: {
    groupConversationId: string;
  };
};
type ReviewMessageRequestNameCollisionActionType = {
  type: 'REVIEW_MESSAGE_REQUEST_NAME_COLLISION';
  payload: {
    safeConversationId: string;
  };
};
type ShowInboxActionType = {
  type: 'SHOW_INBOX';
  payload: null;
};
export type ShowArchivedConversationsActionType = {
  type: 'SHOW_ARCHIVED_CONVERSATIONS';
  payload: null;
};
type SetComposeGroupAvatarActionType = {
  type: 'SET_COMPOSE_GROUP_AVATAR';
  payload: { groupAvatar: undefined | Uint8Array };
};
type SetComposeGroupNameActionType = {
  type: 'SET_COMPOSE_GROUP_NAME';
  payload: { groupName: string };
};
type SetComposeGroupExpireTimerActionType = {
  type: 'SET_COMPOSE_GROUP_EXPIRE_TIMER';
  payload: { groupExpireTimer: number };
};
type SetComposeSearchTermActionType = {
  type: 'SET_COMPOSE_SEARCH_TERM';
  payload: { searchTerm: string };
};
type SetRecentMediaItemsActionType = {
  type: 'SET_RECENT_MEDIA_ITEMS';
  payload: {
    id: string;
    recentMediaItems: Array<MediaItemType>;
  };
};
type ToggleComposeEditingAvatarActionType = {
  type: typeof COMPOSE_TOGGLE_EDITING_AVATAR;
};
type StartComposingActionType = {
  type: 'START_COMPOSING';
};
type ShowChooseGroupMembersActionType = {
  type: 'SHOW_CHOOSE_GROUP_MEMBERS';
};
type StartSettingGroupMetadataActionType = {
  type: 'START_SETTING_GROUP_METADATA';
};
export type SwitchToAssociatedViewActionType = {
  type: 'SWITCH_TO_ASSOCIATED_VIEW';
  payload: { conversationId: string };
};
export type ToggleConversationInChooseMembersActionType = {
  type: 'TOGGLE_CONVERSATION_IN_CHOOSE_MEMBERS';
  payload: {
    conversationId: string;
    maxRecommendedGroupSize: number;
    maxGroupSize: number;
  };
};
type UpdateUsernameSaveStateActionType = {
  type: typeof UPDATE_USERNAME_SAVE_STATE;
  payload: {
    newSaveState: UsernameSaveState;
  };
};

type ReplaceAvatarsActionType = {
  type: typeof REPLACE_AVATARS;
  payload: {
    conversationId: string;
    avatars: Array<AvatarDataType>;
  };
};
export type ConversationActionType =
  | CancelMessagesPendingConversationVerificationActionType
  | CantAddContactToGroupActionType
  | ClearChangedMessagesActionType
  | ClearGroupCreationErrorActionType
  | ClearInvitedUuidsForNewlyCreatedGroupActionType
  | ClearSelectedMessageActionType
  | ClearUnreadMetricsActionType
  | CloseCantAddContactToGroupModalActionType
  | CloseContactSpoofingReviewActionType
  | CloseMaximumGroupSizeModalActionType
  | CloseRecommendedGroupSizeModalActionType
  | ColorSelectedActionType
  | ColorsChangedActionType
  | ComposeDeleteAvatarActionType
  | ComposeReplaceAvatarsActionType
  | ComposeSaveAvatarActionType
  | ConversationAddedActionType
  | ConversationChangedActionType
  | ConversationRemovedActionType
  | ConversationUnloadedActionType
  | CreateGroupFulfilledActionType
  | CreateGroupPendingActionType
  | CreateGroupRejectedActionType
  | CustomColorRemovedActionType
  | MessageStoppedByMissingVerificationActionType
  | MessageChangedActionType
  | MessageDeletedActionType
  | MessageSelectedActionType
  | MessageSizeChangedActionType
  | MessagesAddedActionType
  | MessagesResetActionType
  | RemoveAllConversationsActionType
  | RepairNewestMessageActionType
  | RepairOldestMessageActionType
  | ReplaceAvatarsActionType
  | ReviewGroupMemberNameCollisionActionType
  | ReviewMessageRequestNameCollisionActionType
  | ScrollToBpttomActionType
  | ScrollToMessageActionType
  | SelectedConversationChangedActionType
  | SetComposeGroupAvatarActionType
  | SetComposeGroupExpireTimerActionType
  | SetComposeGroupNameActionType
  | SetComposeSearchTermActionType
  | SetConversationHeaderTitleActionType
  | SetIsNearBottomActionType
  | SetLoadCountdownStartActionType
  | SetMessagesLoadingActionType
  | SetPreJoinConversationActionType
  | SetRecentMediaItemsActionType
  | SetSelectedConversationPanelDepthActionType
  | ShowArchivedConversationsActionType
  | ShowChooseGroupMembersActionType
  | ShowInboxActionType
  | StartComposingActionType
  | StartSettingGroupMetadataActionType
  | SwitchToAssociatedViewActionType
  | ToggleConversationInChooseMembersActionType
  | ToggleComposeEditingAvatarActionType
  | UpdateUsernameSaveStateActionType;

// Action Creators

export const actions = {
  cancelMessagesPendingConversationVerification,
  cantAddContactToGroup,
  clearChangedMessages,
  clearGroupCreationError,
  clearInvitedUuidsForNewlyCreatedGroup,
  clearSelectedMessage,
  clearUnreadMetrics,
  clearUsernameSave,
  closeCantAddContactToGroupModal,
  closeContactSpoofingReview,
  closeMaximumGroupSizeModal,
  closeRecommendedGroupSizeModal,
  colorSelected,
  composeDeleteAvatarFromDisk,
  composeReplaceAvatar,
  composeSaveAvatarToDisk,
  conversationAdded,
  conversationChanged,
  conversationRemoved,
  conversationUnloaded,
  createGroup,
  deleteAvatarFromDisk,
  doubleCheckMissingQuoteReference,
  messageStoppedByMissingVerification,
  messageChanged,
  messageDeleted,
  messageSizeChanged,
  messagesAdded,
  messagesReset,
  myProfileChanged,
  openConversationExternal,
  openConversationInternal,
  removeAllConversations,
  removeCustomColorOnConversations,
  removeMemberFromGroup,
  repairNewestMessage,
  repairOldestMessage,
  replaceAvatar,
  resetAllChatColors,
  reviewGroupMemberNameCollision,
  reviewMessageRequestNameCollision,
  saveAvatarToDisk,
  saveUsername,
  scrollToBottom,
  scrollToMessage,
  selectMessage,
  setComposeGroupAvatar,
  setComposeGroupExpireTimer,
  setComposeGroupName,
  setComposeSearchTerm,
  setIsNearBottom,
  setLoadCountdownStart,
  setMessagesLoading,
  setPreJoinConversation,
  setRecentMediaItems,
  setSelectedConversationHeaderTitle,
  setSelectedConversationPanelDepth,
  showArchivedConversations,
  showChooseGroupMembers,
  showInbox,
  startComposing,
  startNewConversationFromPhoneNumber,
  startSettingGroupMetadata,
  toggleAdmin,
  toggleConversationInChooseMembers,
  toggleComposeEditingAvatar,
  updateConversationModelSharedGroups,
  verifyConversationsStoppingMessageSend,
};

function filterAvatarData(
  avatars: ReadonlyArray<AvatarDataType>,
  data: AvatarDataType
): Array<AvatarDataType> {
  return avatars.filter(avatarData => !isSameAvatarData(data, avatarData));
}

function getNextAvatarId(avatars: Array<AvatarDataType>): number {
  return Math.max(...avatars.map(x => Number(x.id))) + 1;
}

async function getAvatarsAndUpdateConversation(
  conversations: ConversationsStateType,
  conversationId: string,
  getNextAvatarsData: (
    avatars: Array<AvatarDataType>,
    nextId: number
  ) => Array<AvatarDataType>
): Promise<Array<AvatarDataType>> {
  const conversation = window.ConversationController.get(conversationId);
  if (!conversation) {
    throw new Error('No conversation found');
  }

  const { conversationLookup } = conversations;
  const conversationAttrs = conversationLookup[conversationId];
  const avatars =
    conversationAttrs.avatars || getAvatarData(conversation.attributes);

  const nextAvatarId = getNextAvatarId(avatars);
  const nextAvatars = getNextAvatarsData(avatars, nextAvatarId);
  // We don't save buffers to the db, but we definitely want it in-memory so
  // we don't have to re-generate them.
  //
  // Mutating here because we don't want to trigger a model change
  // because we're updating redux here manually ourselves. Au revoir Backbone!
  conversation.attributes.avatars = nextAvatars.map(avatarData =>
    omit(avatarData, ['buffer'])
  );
  await window.Signal.Data.updateConversation(conversation.attributes);

  return nextAvatars;
}

function deleteAvatarFromDisk(
  avatarData: AvatarDataType,
  conversationId?: string
): ThunkAction<void, RootStateType, unknown, ReplaceAvatarsActionType> {
  return async (dispatch, getState) => {
    if (avatarData.imagePath) {
      await window.Signal.Migrations.deleteAvatar(avatarData.imagePath);
    } else {
      log.info(
        'No imagePath for avatarData. Removing from userAvatarData, but not disk'
      );
    }

    strictAssert(conversationId, 'conversationId not provided');

    const avatars = await getAvatarsAndUpdateConversation(
      getState().conversations,
      conversationId,
      prevAvatarsData => filterAvatarData(prevAvatarsData, avatarData)
    );

    dispatch({
      type: REPLACE_AVATARS,
      payload: {
        conversationId,
        avatars,
      },
    });
  };
}

function replaceAvatar(
  curr: AvatarDataType,
  prev?: AvatarDataType,
  conversationId?: string
): ThunkAction<void, RootStateType, unknown, ReplaceAvatarsActionType> {
  return async (dispatch, getState) => {
    strictAssert(conversationId, 'conversationId not provided');

    const avatars = await getAvatarsAndUpdateConversation(
      getState().conversations,
      conversationId,
      (prevAvatarsData, nextId) => {
        const newAvatarData = {
          ...curr,
          id: prev?.id ?? nextId,
        };
        const existingAvatarsData = prev
          ? filterAvatarData(prevAvatarsData, prev)
          : prevAvatarsData;

        return [newAvatarData, ...existingAvatarsData];
      }
    );

    dispatch({
      type: REPLACE_AVATARS,
      payload: {
        conversationId,
        avatars,
      },
    });
  };
}

function saveAvatarToDisk(
  avatarData: AvatarDataType,
  conversationId?: string
): ThunkAction<void, RootStateType, unknown, ReplaceAvatarsActionType> {
  return async (dispatch, getState) => {
    if (!avatarData.buffer) {
      throw new Error('No avatar Uint8Array provided');
    }

    strictAssert(conversationId, 'conversationId not provided');

    const imagePath = await window.Signal.Migrations.writeNewAvatarData(
      avatarData.buffer
    );

    const avatars = await getAvatarsAndUpdateConversation(
      getState().conversations,
      conversationId,
      (prevAvatarsData, id) => {
        const newAvatarData = {
          ...avatarData,
          imagePath,
          id,
        };

        return [newAvatarData, ...prevAvatarsData];
      }
    );

    dispatch({
      type: REPLACE_AVATARS,
      payload: {
        conversationId,
        avatars,
      },
    });
  };
}

function makeUsernameSaveType(
  newSaveState: UsernameSaveState
): UpdateUsernameSaveStateActionType {
  return {
    type: UPDATE_USERNAME_SAVE_STATE,
    payload: {
      newSaveState,
    },
  };
}

function clearUsernameSave(): UpdateUsernameSaveStateActionType {
  return makeUsernameSaveType(UsernameSaveState.None);
}

function saveUsername({
  username,
  previousUsername,
}: {
  username: string | undefined;
  previousUsername: string | undefined;
}): ThunkAction<
  void,
  RootStateType,
  unknown,
  UpdateUsernameSaveStateActionType
> {
  return async (dispatch, getState) => {
    const state = getState();

    const previousState = getUsernameSaveState(state);
    if (previousState !== UsernameSaveState.None) {
      log.error(
        `saveUsername: Save requested, but previous state was ${previousState}`
      );
      dispatch(makeUsernameSaveType(UsernameSaveState.GeneralError));
      return;
    }

    try {
      dispatch(makeUsernameSaveType(UsernameSaveState.Saving));
      await writeUsername({ username, previousUsername });

      // writeUsername above updates the backbone model which in turn updates
      // redux through it's on:change event listener. Once we lose Backbone
      // we'll need to manually sync these new changes.
      dispatch(makeUsernameSaveType(UsernameSaveState.Success));
    } catch (error: unknown) {
      // Check to see if we were deleting
      if (!username) {
        dispatch(makeUsernameSaveType(UsernameSaveState.DeleteFailed));
        showToast(ToastFailedToDeleteUsername);
        return;
      }

      if (!isRecord(error)) {
        dispatch(makeUsernameSaveType(UsernameSaveState.GeneralError));
        return;
      }

      if (error.code === 409) {
        dispatch(makeUsernameSaveType(UsernameSaveState.UsernameTakenError));
        return;
      }
      if (error.code === 400) {
        dispatch(
          makeUsernameSaveType(UsernameSaveState.UsernameMalformedError)
        );
        return;
      }

      dispatch(makeUsernameSaveType(UsernameSaveState.GeneralError));
    }
  };
}

function myProfileChanged(
  profileData: ProfileDataType,
  avatarBuffer?: Uint8Array
): ThunkAction<
  void,
  RootStateType,
  unknown,
  NoopActionType | ToggleProfileEditorErrorActionType
> {
  return async (dispatch, getState) => {
    const conversation = getMe(getState());

    try {
      await writeProfile(
        {
          ...conversation,
          ...profileData,
        },
        avatarBuffer
      );

      // writeProfile above updates the backbone model which in turn updates
      // redux through it's on:change event listener. Once we lose Backbone
      // we'll need to manually sync these new changes.
      dispatch({
        type: 'NOOP',
        payload: null,
      });
    } catch (err) {
      log.error('myProfileChanged', err && err.stack ? err.stack : err);
      dispatch({ type: TOGGLE_PROFILE_EDITOR_ERROR });
    }
  };
}

function removeCustomColorOnConversations(
  colorId: string
): ThunkAction<void, RootStateType, unknown, CustomColorRemovedActionType> {
  return async dispatch => {
    const conversationsToUpdate: Array<ConversationAttributesType> = [];
    // We don't want to trigger a model change because we're updating redux
    // here manually ourselves. Au revoir Backbone!
    window.getConversations().forEach(conversation => {
      if (conversation.get('customColorId') === colorId) {
        // eslint-disable-next-line no-param-reassign
        delete conversation.attributes.conversationColor;
        // eslint-disable-next-line no-param-reassign
        delete conversation.attributes.customColor;
        // eslint-disable-next-line no-param-reassign
        delete conversation.attributes.customColorId;

        conversationsToUpdate.push(conversation.attributes);
      }
    });

    if (conversationsToUpdate.length) {
      await window.Signal.Data.updateConversations(conversationsToUpdate);
    }

    dispatch({
      type: CUSTOM_COLOR_REMOVED,
      payload: {
        colorId,
      },
    });
  };
}

function resetAllChatColors(): ThunkAction<
  void,
  RootStateType,
  unknown,
  ColorsChangedActionType
> {
  return async dispatch => {
    // Calling this with no args unsets all the colors in the db
    await window.Signal.Data.updateAllConversationColors();

    // We don't want to trigger a model change because we're updating redux
    // here manually ourselves. Au revoir Backbone!
    window.getConversations().forEach(conversation => {
      // eslint-disable-next-line no-param-reassign
      delete conversation.attributes.conversationColor;
      // eslint-disable-next-line no-param-reassign
      delete conversation.attributes.customColor;
      // eslint-disable-next-line no-param-reassign
      delete conversation.attributes.customColorId;
    });

    dispatch({
      type: COLORS_CHANGED,
      payload: {
        conversationColor: undefined,
        customColorData: undefined,
      },
    });
  };
}

function colorSelected({
  conversationId,
  conversationColor,
  customColorData,
}: ColorSelectedPayloadType): ThunkAction<
  void,
  RootStateType,
  unknown,
  ColorSelectedActionType
> {
  return async dispatch => {
    // We don't want to trigger a model change because we're updating redux
    // here manually ourselves. Au revoir Backbone!
    const conversation = window.ConversationController.get(conversationId);
    if (conversation) {
      if (conversationColor) {
        conversation.attributes.conversationColor = conversationColor;
        if (customColorData) {
          conversation.attributes.customColor = customColorData.value;
          conversation.attributes.customColorId = customColorData.id;
        } else {
          delete conversation.attributes.customColor;
          delete conversation.attributes.customColorId;
        }
      } else {
        delete conversation.attributes.conversationColor;
        delete conversation.attributes.customColor;
        delete conversation.attributes.customColorId;
      }

      await window.Signal.Data.updateConversation(conversation.attributes);
    }

    dispatch({
      type: COLOR_SELECTED,
      payload: {
        conversationId,
        conversationColor,
        customColorData,
      },
    });
  };
}

function toggleComposeEditingAvatar(): ToggleComposeEditingAvatarActionType {
  return {
    type: COMPOSE_TOGGLE_EDITING_AVATAR,
  };
}

function verifyConversationsStoppingMessageSend(): ThunkAction<
  void,
  RootStateType,
  unknown,
  never
> {
  return async (_dispatch, getState) => {
    const conversationIds = Object.keys(
      getState().conversations.outboundMessagesPendingConversationVerification
    );

    await Promise.all(
      conversationIds.map(async conversationId => {
        const conversation = window.ConversationController.get(conversationId);
        await conversation?.setVerifiedDefault();
      })
    );
  };
}

function composeSaveAvatarToDisk(
  avatarData: AvatarDataType
): ThunkAction<void, RootStateType, unknown, ComposeSaveAvatarActionType> {
  return async dispatch => {
    if (!avatarData.buffer) {
      throw new Error('No avatar Uint8Array provided');
    }

    const imagePath = await window.Signal.Migrations.writeNewAvatarData(
      avatarData.buffer
    );

    dispatch({
      type: COMPOSE_ADD_AVATAR,
      payload: {
        ...avatarData,
        imagePath,
      },
    });
  };
}

function composeDeleteAvatarFromDisk(
  avatarData: AvatarDataType
): ThunkAction<void, RootStateType, unknown, ComposeDeleteAvatarActionType> {
  return async dispatch => {
    if (avatarData.imagePath) {
      await window.Signal.Migrations.deleteAvatar(avatarData.imagePath);
    } else {
      log.info(
        'No imagePath for avatarData. Removing from userAvatarData, but not disk'
      );
    }

    dispatch({
      type: COMPOSE_REMOVE_AVATAR,
      payload: avatarData,
    });
  };
}

function composeReplaceAvatar(
  curr: AvatarDataType,
  prev?: AvatarDataType
): ComposeReplaceAvatarsActionType {
  return {
    type: COMPOSE_REPLACE_AVATAR,
    payload: {
      curr,
      prev,
    },
  };
}

function cancelMessagesPendingConversationVerification(): ThunkAction<
  void,
  RootStateType,
  unknown,
  CancelMessagesPendingConversationVerificationActionType
> {
  return async (dispatch, getState) => {
    const messageIdsPending = getMessageIdsPendingBecauseOfVerification(
      getState()
    );
    const messagesStopped = await getMessagesById([...messageIdsPending]);
    messagesStopped.forEach(message => {
      message.markFailed();
    });

    dispatch({
      type: CANCEL_MESSAGES_PENDING_CONVERSATION_VERIFICATION,
    });

    await window.Signal.Data.saveMessages(
      messagesStopped.map(message => message.attributes)
    );
  };
}

function cantAddContactToGroup(
  conversationId: string
): CantAddContactToGroupActionType {
  return {
    type: 'CANT_ADD_CONTACT_TO_GROUP',
    payload: { conversationId },
  };
}
function setPreJoinConversation(
  data: PreJoinConversationType | undefined
): SetPreJoinConversationActionType {
  return {
    type: 'SET_PRE_JOIN_CONVERSATION',
    payload: {
      data,
    },
  };
}
function conversationAdded(
  id: string,
  data: ConversationType
): ConversationAddedActionType {
  return {
    type: 'CONVERSATION_ADDED',
    payload: {
      id,
      data,
    },
  };
}
function conversationChanged(
  id: string,
  data: ConversationType
): ThunkAction<void, RootStateType, unknown, ConversationChangedActionType> {
  return async (dispatch, getState) => {
    calling.groupMembersChanged(id);

    if (!data.isUntrusted) {
      const messageIdsPending =
        getOwn(
          getState().conversations
            .outboundMessagesPendingConversationVerification,
          id
        ) ?? [];
      if (messageIdsPending.length) {
        const messagesPending = await getMessagesById(messageIdsPending);
        messagesPending.forEach(message => {
          message.retrySend();
        });
      }
    }

    dispatch({
      type: 'CONVERSATION_CHANGED',
      payload: {
        id,
        data,
      },
    });
  };
}
function conversationRemoved(id: string): ConversationRemovedActionType {
  return {
    type: 'CONVERSATION_REMOVED',
    payload: {
      id,
    },
  };
}
function conversationUnloaded(id: string): ConversationUnloadedActionType {
  return {
    type: 'CONVERSATION_UNLOADED',
    payload: {
      id,
    },
  };
}

function createGroup(): ThunkAction<
  void,
  RootStateType,
  unknown,
  | CreateGroupPendingActionType
  | CreateGroupFulfilledActionType
  | CreateGroupRejectedActionType
  | SwitchToAssociatedViewActionType
> {
  return async (dispatch, getState, ...args) => {
    const { composer } = getState().conversations;
    if (
      composer?.step !== ComposerStep.SetGroupMetadata ||
      composer.isCreating
    ) {
      assert(false, 'Cannot create group in this stage; doing nothing');
      return;
    }

    dispatch({ type: 'CREATE_GROUP_PENDING' });

    try {
      const conversation = await groups.createGroupV2({
        name: composer.groupName.trim(),
        avatar: composer.groupAvatar,
        avatars: composer.userAvatarData.map(avatarData =>
          omit(avatarData, ['buffer'])
        ),
        expireTimer: composer.groupExpireTimer,
        conversationIds: composer.selectedConversationIds,
      });
      dispatch({
        type: 'CREATE_GROUP_FULFILLED',
        payload: {
          invitedUuids: (conversation.get('pendingMembersV2') || []).map(
            member => member.uuid
          ),
        },
      });
      openConversationInternal({
        conversationId: conversation.id,
        switchToAssociatedView: true,
      })(dispatch, getState, ...args);
    } catch (err) {
      log.error('Failed to create group', err && err.stack ? err.stack : err);
      dispatch({ type: 'CREATE_GROUP_REJECTED' });
    }
  };
}

function removeAllConversations(): RemoveAllConversationsActionType {
  return {
    type: 'CONVERSATIONS_REMOVE_ALL',
    payload: null,
  };
}

function selectMessage(
  messageId: string,
  conversationId: string
): MessageSelectedActionType {
  return {
    type: 'MESSAGE_SELECTED',
    payload: {
      messageId,
      conversationId,
    },
  };
}

function messageStoppedByMissingVerification(
  messageId: string,
  untrustedConversationIds: ReadonlyArray<string>
): MessageStoppedByMissingVerificationActionType {
  return {
    type: MESSAGE_STOPPED_BY_MISSING_VERIFICATION,
    payload: {
      messageId,
      untrustedConversationIds,
    },
  };
}

function messageChanged(
  id: string,
  conversationId: string,
  data: MessageAttributesType
): MessageChangedActionType {
  return {
    type: 'MESSAGE_CHANGED',
    payload: {
      id,
      conversationId,
      data,
    },
  };
}
function messageDeleted(
  id: string,
  conversationId: string
): MessageDeletedActionType {
  return {
    type: 'MESSAGE_DELETED',
    payload: {
      id,
      conversationId,
    },
  };
}
function messageSizeChanged(
  id: string,
  conversationId: string
): MessageSizeChangedActionType {
  return {
    type: 'MESSAGE_SIZE_CHANGED',
    payload: {
      id,
      conversationId,
    },
  };
}
function messagesAdded(
  conversationId: string,
  messages: Array<MessageAttributesType>,
  isNewMessage: boolean,
  isActive: boolean
): MessagesAddedActionType {
  return {
    type: 'MESSAGES_ADDED',
    payload: {
      conversationId,
      messages,
      isNewMessage,
      isActive,
    },
  };
}

function repairNewestMessage(
  conversationId: string
): RepairNewestMessageActionType {
  return {
    type: 'REPAIR_NEWEST_MESSAGE',
    payload: {
      conversationId,
    },
  };
}
function repairOldestMessage(
  conversationId: string
): RepairOldestMessageActionType {
  return {
    type: 'REPAIR_OLDEST_MESSAGE',
    payload: {
      conversationId,
    },
  };
}

function reviewGroupMemberNameCollision(
  groupConversationId: string
): ReviewGroupMemberNameCollisionActionType {
  return {
    type: 'REVIEW_GROUP_MEMBER_NAME_COLLISION',
    payload: { groupConversationId },
  };
}

function reviewMessageRequestNameCollision(
  payload: Readonly<{
    safeConversationId: string;
  }>
): ReviewMessageRequestNameCollisionActionType {
  return { type: 'REVIEW_MESSAGE_REQUEST_NAME_COLLISION', payload };
}

function messagesReset(
  conversationId: string,
  messages: Array<MessageAttributesType>,
  metrics: MessageMetricsType,
  scrollToMessageId?: string,
  unboundedFetch?: boolean
): MessagesResetActionType {
  return {
    type: 'MESSAGES_RESET',
    payload: {
      unboundedFetch: Boolean(unboundedFetch),
      conversationId,
      messages,
      metrics,
      scrollToMessageId,
    },
  };
}
function setMessagesLoading(
  conversationId: string,
  isLoadingMessages: boolean
): SetMessagesLoadingActionType {
  return {
    type: 'SET_MESSAGES_LOADING',
    payload: {
      conversationId,
      isLoadingMessages,
    },
  };
}
function setLoadCountdownStart(
  conversationId: string,
  loadCountdownStart?: number
): SetLoadCountdownStartActionType {
  return {
    type: 'SET_LOAD_COUNTDOWN_START',
    payload: {
      conversationId,
      loadCountdownStart,
    },
  };
}
function setIsNearBottom(
  conversationId: string,
  isNearBottom: boolean
): SetIsNearBottomActionType {
  return {
    type: 'SET_NEAR_BOTTOM',
    payload: {
      conversationId,
      isNearBottom,
    },
  };
}
function setSelectedConversationHeaderTitle(
  title?: string
): SetConversationHeaderTitleActionType {
  return {
    type: 'SET_CONVERSATION_HEADER_TITLE',
    payload: { title },
  };
}
function setSelectedConversationPanelDepth(
  panelDepth: number
): SetSelectedConversationPanelDepthActionType {
  return {
    type: 'SET_SELECTED_CONVERSATION_PANEL_DEPTH',
    payload: { panelDepth },
  };
}
function setRecentMediaItems(
  id: string,
  recentMediaItems: Array<MediaItemType>
): SetRecentMediaItemsActionType {
  return {
    type: 'SET_RECENT_MEDIA_ITEMS',
    payload: { id, recentMediaItems },
  };
}
function clearChangedMessages(
  conversationId: string
): ClearChangedMessagesActionType {
  return {
    type: 'CLEAR_CHANGED_MESSAGES',
    payload: {
      conversationId,
    },
  };
}
function clearInvitedUuidsForNewlyCreatedGroup(): ClearInvitedUuidsForNewlyCreatedGroupActionType {
  return { type: 'CLEAR_INVITED_UUIDS_FOR_NEWLY_CREATED_GROUP' };
}
function clearGroupCreationError(): ClearGroupCreationErrorActionType {
  return { type: 'CLEAR_GROUP_CREATION_ERROR' };
}
function clearSelectedMessage(): ClearSelectedMessageActionType {
  return {
    type: 'CLEAR_SELECTED_MESSAGE',
    payload: null,
  };
}
function clearUnreadMetrics(
  conversationId: string
): ClearUnreadMetricsActionType {
  return {
    type: 'CLEAR_UNREAD_METRICS',
    payload: {
      conversationId,
    },
  };
}
function closeCantAddContactToGroupModal(): CloseCantAddContactToGroupModalActionType {
  return { type: 'CLOSE_CANT_ADD_CONTACT_TO_GROUP_MODAL' };
}
function closeContactSpoofingReview(): CloseContactSpoofingReviewActionType {
  return { type: 'CLOSE_CONTACT_SPOOFING_REVIEW' };
}
function closeMaximumGroupSizeModal(): CloseMaximumGroupSizeModalActionType {
  return { type: 'CLOSE_MAXIMUM_GROUP_SIZE_MODAL' };
}
function closeRecommendedGroupSizeModal(): CloseRecommendedGroupSizeModalActionType {
  return { type: 'CLOSE_RECOMMENDED_GROUP_SIZE_MODAL' };
}
function scrollToBottom(conversationId: string): ScrollToBpttomActionType {
  return {
    type: 'SCROLL_TO_BOTTOM',
    payload: {
      conversationId,
    },
  };
}

function scrollToMessage(
  conversationId: string,
  messageId: string
): ScrollToMessageActionType {
  return {
    type: 'SCROLL_TO_MESSAGE',
    payload: {
      conversationId,
      messageId,
    },
  };
}

function setComposeGroupAvatar(
  groupAvatar: undefined | Uint8Array
): SetComposeGroupAvatarActionType {
  return {
    type: 'SET_COMPOSE_GROUP_AVATAR',
    payload: { groupAvatar },
  };
}

function setComposeGroupName(groupName: string): SetComposeGroupNameActionType {
  return {
    type: 'SET_COMPOSE_GROUP_NAME',
    payload: { groupName },
  };
}

function setComposeGroupExpireTimer(
  groupExpireTimer: number
): SetComposeGroupExpireTimerActionType {
  return {
    type: 'SET_COMPOSE_GROUP_EXPIRE_TIMER',
    payload: { groupExpireTimer },
  };
}

function setComposeSearchTerm(
  searchTerm: string
): SetComposeSearchTermActionType {
  return {
    type: 'SET_COMPOSE_SEARCH_TERM',
    payload: { searchTerm },
  };
}

function startComposing(): StartComposingActionType {
  return { type: 'START_COMPOSING' };
}

function showChooseGroupMembers(): ShowChooseGroupMembersActionType {
  return { type: 'SHOW_CHOOSE_GROUP_MEMBERS' };
}

function startNewConversationFromPhoneNumber(
  e164: string
): ThunkAction<void, RootStateType, unknown, ShowInboxActionType> {
  return dispatch => {
    trigger('showConversation', e164);

    dispatch(showInbox());
  };
}

function startSettingGroupMetadata(): StartSettingGroupMetadataActionType {
  return { type: 'START_SETTING_GROUP_METADATA' };
}

function toggleConversationInChooseMembers(
  conversationId: string
): ThunkAction<
  void,
  RootStateType,
  unknown,
  ToggleConversationInChooseMembersActionType
> {
  return dispatch => {
    const maxRecommendedGroupSize = getGroupSizeRecommendedLimit(151);
    const maxGroupSize = Math.max(
      getGroupSizeHardLimit(1001),
      maxRecommendedGroupSize + 1
    );

    assert(
      maxGroupSize > maxRecommendedGroupSize,
      'Expected the hard max group size to be larger than the recommended maximum'
    );

    dispatch({
      type: 'TOGGLE_CONVERSATION_IN_CHOOSE_MEMBERS',
      payload: { conversationId, maxGroupSize, maxRecommendedGroupSize },
    });
  };
}

// Note: we need two actions here to simplify. Operations outside of the left pane can
//   trigger an 'openConversation' so we go through Whisper.events for all
//   conversation selection. Internal just triggers the Whisper.event, and External
//   makes the changes to the store.
function openConversationInternal({
  conversationId,
  messageId,
  switchToAssociatedView,
}: Readonly<{
  conversationId: string;
  messageId?: string;
  switchToAssociatedView?: boolean;
}>): ThunkAction<
  void,
  RootStateType,
  unknown,
  SwitchToAssociatedViewActionType
> {
  return dispatch => {
    trigger('showConversation', conversationId, messageId);

    if (switchToAssociatedView) {
      dispatch({
        type: 'SWITCH_TO_ASSOCIATED_VIEW',
        payload: { conversationId },
      });
    }
  };
}
function openConversationExternal(
  id: string,
  messageId?: string
): SelectedConversationChangedActionType {
  return {
    type: 'SELECTED_CONVERSATION_CHANGED',
    payload: {
      id,
      messageId,
    },
  };
}

function removeMemberFromGroup(
  conversationId: string,
  contactId: string
): ThunkAction<void, RootStateType, unknown, NoopActionType> {
  return dispatch => {
    const conversationModel = window.ConversationController.get(conversationId);
    if (conversationModel) {
      const idForLogging = conversationModel.idForLogging();
      longRunningTaskWrapper({
        name: 'removeMemberFromGroup',
        idForLogging,
        task: () => conversationModel.removeFromGroupV2(contactId),
      });
    }
    dispatch({
      type: 'NOOP',
      payload: null,
    });
  };
}

function toggleAdmin(
  conversationId: string,
  contactId: string
): ThunkAction<void, RootStateType, unknown, NoopActionType> {
  return dispatch => {
    const conversationModel = window.ConversationController.get(conversationId);
    if (conversationModel) {
      conversationModel.toggleAdmin(contactId);
    }
    dispatch({
      type: 'NOOP',
      payload: null,
    });
  };
}

function updateConversationModelSharedGroups(
  conversationId: string
): ThunkAction<void, RootStateType, unknown, NoopActionType> {
  return dispatch => {
    const conversation = window.ConversationController.get(conversationId);
    if (conversation && conversation.throttledUpdateSharedGroups) {
      conversation.throttledUpdateSharedGroups();
    }
    dispatch({
      type: 'NOOP',
      payload: null,
    });
  };
}

function showInbox(): ShowInboxActionType {
  return {
    type: 'SHOW_INBOX',
    payload: null,
  };
}
function showArchivedConversations(): ShowArchivedConversationsActionType {
  return {
    type: 'SHOW_ARCHIVED_CONVERSATIONS',
    payload: null,
  };
}

function doubleCheckMissingQuoteReference(messageId: string): NoopActionType {
  const message = window.MessageController.getById(messageId);
  if (message) {
    message.doubleCheckMissingQuoteReference();
  }

  return {
    type: 'NOOP',
    payload: null,
  };
}

// Reducer

export function getEmptyState(): ConversationsStateType {
  return {
    conversationLookup: {},
    conversationsByE164: {},
    conversationsByUuid: {},
    conversationsByGroupId: {},
    outboundMessagesPendingConversationVerification: {},
    messagesByConversation: {},
    messagesLookup: {},
    selectedMessageCounter: 0,
    showArchived: false,
    selectedConversationTitle: '',
    selectedConversationPanelDepth: 0,
    usernameSaveState: UsernameSaveState.None,
  };
}

function hasMessageHeightChanged(
  message: MessageAttributesType,
  previous: MessageAttributesType
): boolean {
  const messageAttachments = message.attachments || [];
  const previousAttachments = previous.attachments || [];

  const errorStatusChanged =
    (!message.errors && previous.errors) ||
    (message.errors && !previous.errors) ||
    (message.errors &&
      previous.errors &&
      message.errors.length !== previous.errors.length);
  if (errorStatusChanged) {
    return true;
  }

  const groupUpdateChanged = message.group_update !== previous.group_update;
  if (groupUpdateChanged) {
    return true;
  }

  const stickerPendingChanged =
    message.sticker &&
    message.sticker.data &&
    previous.sticker &&
    previous.sticker.data &&
    !previous.sticker.data.blurHash &&
    previous.sticker.data.pending !== message.sticker.data.pending;
  if (stickerPendingChanged) {
    return true;
  }

  const longMessageAttachmentLoaded =
    previous.bodyPending && !message.bodyPending;
  if (longMessageAttachmentLoaded) {
    return true;
  }

  const firstAttachmentNoLongerPending =
    previousAttachments[0] &&
    previousAttachments[0].pending &&
    messageAttachments[0] &&
    !messageAttachments[0].pending;
  if (firstAttachmentNoLongerPending) {
    return true;
  }

  const currentReactions = message.reactions || [];
  const lastReactions = previous.reactions || [];
  const reactionsChanged =
    (currentReactions.length === 0) !== (lastReactions.length === 0);
  if (reactionsChanged) {
    return true;
  }

  const isDeletedForEveryone = message.deletedForEveryone;
  const wasDeletedForEveryone = previous.deletedForEveryone;
  if (isDeletedForEveryone !== wasDeletedForEveryone) {
    return true;
  }

  return false;
}

export function updateConversationLookups(
  added: ConversationType | undefined,
  removed: ConversationType | undefined,
  state: ConversationsStateType
): Pick<
  ConversationsStateType,
  'conversationsByE164' | 'conversationsByUuid' | 'conversationsByGroupId'
> {
  const result = {
    conversationsByE164: state.conversationsByE164,
    conversationsByUuid: state.conversationsByUuid,
    conversationsByGroupId: state.conversationsByGroupId,
  };

  if (removed && removed.e164) {
    result.conversationsByE164 = omit(result.conversationsByE164, removed.e164);
  }
  if (removed && removed.uuid) {
    result.conversationsByUuid = omit(result.conversationsByUuid, removed.uuid);
  }
  if (removed && removed.groupId) {
    result.conversationsByGroupId = omit(
      result.conversationsByGroupId,
      removed.groupId
    );
  }

  if (added && added.e164) {
    result.conversationsByE164 = {
      ...result.conversationsByE164,
      [added.e164]: added,
    };
  }
  if (added && added.uuid) {
    result.conversationsByUuid = {
      ...result.conversationsByUuid,
      [added.uuid]: added,
    };
  }
  if (added && added.groupId) {
    result.conversationsByGroupId = {
      ...result.conversationsByGroupId,
      [added.groupId]: added,
    };
  }

  return result;
}

function closeComposerModal(
  state: Readonly<ConversationsStateType>,
  modalToClose: 'maximumGroupSizeModalState' | 'recommendedGroupSizeModalState'
): ConversationsStateType {
  const { composer } = state;
  if (composer?.step !== ComposerStep.ChooseGroupMembers) {
    assert(false, "Can't close the modal in this composer step. Doing nothing");
    return state;
  }
  if (composer[modalToClose] !== OneTimeModalState.Showing) {
    return state;
  }
  return {
    ...state,
    composer: {
      ...composer,
      [modalToClose]: OneTimeModalState.Shown,
    },
  };
}

export function reducer(
  state: Readonly<ConversationsStateType> = getEmptyState(),
  action: Readonly<ConversationActionType>
): ConversationsStateType {
  if (action.type === CANCEL_MESSAGES_PENDING_CONVERSATION_VERIFICATION) {
    return {
      ...state,
      outboundMessagesPendingConversationVerification: {},
    };
  }

  if (action.type === 'CANT_ADD_CONTACT_TO_GROUP') {
    const { composer } = state;
    if (composer?.step !== ComposerStep.ChooseGroupMembers) {
      assert(false, "Can't update modal in this composer step. Doing nothing");
      return state;
    }
    return {
      ...state,
      composer: {
        ...composer,
        cantAddContactIdForModal: action.payload.conversationId,
      },
    };
  }

  if (action.type === 'CLEAR_INVITED_UUIDS_FOR_NEWLY_CREATED_GROUP') {
    return omit(state, 'invitedUuidsForNewlyCreatedGroup');
  }

  if (action.type === 'CLEAR_GROUP_CREATION_ERROR') {
    const { composer } = state;
    if (composer?.step !== ComposerStep.SetGroupMetadata) {
      assert(
        false,
        "Can't clear group creation error in this composer state. Doing nothing"
      );
      return state;
    }
    return {
      ...state,
      composer: {
        ...composer,
        hasError: false,
      },
    };
  }

  if (action.type === 'CLOSE_CANT_ADD_CONTACT_TO_GROUP_MODAL') {
    const { composer } = state;
    if (composer?.step !== ComposerStep.ChooseGroupMembers) {
      assert(
        false,
        "Can't close the modal in this composer step. Doing nothing"
      );
      return state;
    }
    return {
      ...state,
      composer: {
        ...composer,
        cantAddContactIdForModal: undefined,
      },
    };
  }

  if (action.type === 'CLOSE_CONTACT_SPOOFING_REVIEW') {
    return omit(state, 'contactSpoofingReview');
  }

  if (action.type === 'CLOSE_MAXIMUM_GROUP_SIZE_MODAL') {
    return closeComposerModal(state, 'maximumGroupSizeModalState' as const);
  }

  if (action.type === 'CLOSE_RECOMMENDED_GROUP_SIZE_MODAL') {
    return closeComposerModal(state, 'recommendedGroupSizeModalState' as const);
  }

  if (action.type === 'SET_PRE_JOIN_CONVERSATION') {
    const { payload } = action;
    const { data } = payload;

    return {
      ...state,
      preJoinConversation: data,
    };
  }
  if (action.type === 'CONVERSATION_ADDED') {
    const { payload } = action;
    const { id, data } = payload;
    const { conversationLookup } = state;

    return {
      ...state,
      conversationLookup: {
        ...conversationLookup,
        [id]: data,
      },
      ...updateConversationLookups(data, undefined, state),
      outboundMessagesPendingConversationVerification: data.isUntrusted
        ? state.outboundMessagesPendingConversationVerification
        : omit(state.outboundMessagesPendingConversationVerification, id),
    };
  }
  if (action.type === 'CONVERSATION_CHANGED') {
    const { payload } = action;
    const { id, data } = payload;
    const { conversationLookup } = state;

    const { selectedConversationId } = state;
    let { showArchived } = state;

    const existing = conversationLookup[id];
    // We only modify the lookup if we already had that conversation and the conversation
    //   changed.
    if (!existing || data === existing) {
      return state;
    }

    const keysToOmit: Array<keyof ConversationsStateType> = [];

    if (selectedConversationId === id) {
      // Archived -> Inbox: we go back to the normal inbox view
      if (existing.isArchived && !data.isArchived) {
        showArchived = false;
      }
      // Inbox -> Archived: no conversation is selected
      // Note: With today's stacked converastions architecture, this can result in weird
      //   behavior - no selected conversation in the left pane, but a conversation show
      //   in the right pane.
      if (!existing.isArchived && data.isArchived) {
        keysToOmit.push('selectedConversationId');
      }

      if (!existing.isBlocked && data.isBlocked) {
        keysToOmit.push('contactSpoofingReview');
      }
    }

    return {
      ...omit(state, keysToOmit),
      selectedConversationId,
      showArchived,
      conversationLookup: {
        ...conversationLookup,
        [id]: data,
      },
      ...updateConversationLookups(data, existing, state),
      outboundMessagesPendingConversationVerification: data.isUntrusted
        ? state.outboundMessagesPendingConversationVerification
        : omit(state.outboundMessagesPendingConversationVerification, id),
    };
  }
  if (action.type === 'CONVERSATION_REMOVED') {
    const { payload } = action;
    const { id } = payload;
    const { conversationLookup } = state;
    const existing = getOwn(conversationLookup, id);

    // No need to make a change if we didn't have a record of this conversation!
    if (!existing) {
      return state;
    }

    return {
      ...state,
      conversationLookup: omit(conversationLookup, [id]),
      ...updateConversationLookups(undefined, existing, state),
    };
  }
  if (action.type === 'CONVERSATION_UNLOADED') {
    const { payload } = action;
    const { id } = payload;
    const existingConversation = state.messagesByConversation[id];
    if (!existingConversation) {
      return state;
    }

    const { messageIds } = existingConversation;
    const selectedConversationId =
      state.selectedConversationId !== id
        ? state.selectedConversationId
        : undefined;

    return {
      ...omit(state, 'contactSpoofingReview'),
      selectedConversationId,
      selectedConversationPanelDepth: 0,
      messagesLookup: omit(state.messagesLookup, messageIds),
      messagesByConversation: omit(state.messagesByConversation, [id]),
    };
  }
  if (action.type === 'CONVERSATIONS_REMOVE_ALL') {
    return getEmptyState();
  }
  if (action.type === 'CREATE_GROUP_PENDING') {
    const { composer } = state;
    if (composer?.step !== ComposerStep.SetGroupMetadata) {
      // This should be unlikely, but it can happen if someone closes the composer while
      //   a group is being created.
      return state;
    }
    return {
      ...state,
      composer: {
        ...composer,
        hasError: false,
        isCreating: true,
      },
    };
  }
  if (action.type === 'CREATE_GROUP_FULFILLED') {
    // We don't do much here and instead rely on `openConversationInternal` to do most of
    //   the work.
    return {
      ...state,
      invitedUuidsForNewlyCreatedGroup: action.payload.invitedUuids,
    };
  }
  if (action.type === 'CREATE_GROUP_REJECTED') {
    const { composer } = state;
    if (composer?.step !== ComposerStep.SetGroupMetadata) {
      // This should be unlikely, but it can happen if someone closes the composer while
      //   a group is being created.
      return state;
    }
    return {
      ...state,
      composer: {
        ...composer,
        hasError: true,
        isCreating: false,
      },
    };
  }
  if (action.type === 'SET_SELECTED_CONVERSATION_PANEL_DEPTH') {
    return {
      ...state,
      selectedConversationPanelDepth: action.payload.panelDepth,
    };
  }
  if (action.type === 'MESSAGE_SELECTED') {
    const { messageId, conversationId } = action.payload;

    if (state.selectedConversationId !== conversationId) {
      return state;
    }

    return {
      ...state,
      selectedMessage: messageId,
      selectedMessageCounter: state.selectedMessageCounter + 1,
    };
  }
  if (action.type === MESSAGE_STOPPED_BY_MISSING_VERIFICATION) {
    const { messageId, untrustedConversationIds } = action.payload;

    const newOutboundMessagesPendingConversationVerification = {
      ...state.outboundMessagesPendingConversationVerification,
    };
    untrustedConversationIds.forEach(conversationId => {
      const existingPendingMessageIds =
        getOwn(
          newOutboundMessagesPendingConversationVerification,
          conversationId
        ) ?? [];
      if (!existingPendingMessageIds.includes(messageId)) {
        newOutboundMessagesPendingConversationVerification[conversationId] = [
          ...existingPendingMessageIds,
          messageId,
        ];
      }
    });

    return {
      ...state,
      outboundMessagesPendingConversationVerification: newOutboundMessagesPendingConversationVerification,
    };
  }
  if (action.type === 'MESSAGE_CHANGED') {
    const { id, conversationId, data } = action.payload;
    const existingConversation = state.messagesByConversation[conversationId];

    // We don't keep track of messages unless their conversation is loaded...
    if (!existingConversation) {
      return state;
    }
    // ...and we've already loaded that message once
    const existingMessage = state.messagesLookup[id];
    if (!existingMessage) {
      return state;
    }

    // Check for changes which could affect height - that's why we need this
    //   heightChangeMessageIds field. It tells Timeline to recalculate all of its heights
    const hasHeightChanged = hasMessageHeightChanged(data, existingMessage);

    const { heightChangeMessageIds } = existingConversation;
    const updatedChanges = hasHeightChanged
      ? uniq([...heightChangeMessageIds, id])
      : heightChangeMessageIds;

    return {
      ...state,
      messagesLookup: {
        ...state.messagesLookup,
        [id]: data,
      },
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: {
          ...existingConversation,
          heightChangeMessageIds: updatedChanges,
        },
      },
    };
  }
  if (action.type === 'MESSAGE_SIZE_CHANGED') {
    const { id, conversationId } = action.payload;

    const existingConversation = getOwn(
      state.messagesByConversation,
      conversationId
    );
    if (!existingConversation) {
      return state;
    }

    return {
      ...state,
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: {
          ...existingConversation,
          heightChangeMessageIds: uniq([
            ...existingConversation.heightChangeMessageIds,
            id,
          ]),
        },
      },
    };
  }
  if (action.type === 'MESSAGES_RESET') {
    const {
      conversationId,
      messages,
      metrics,
      scrollToMessageId,
      unboundedFetch,
    } = action.payload;
    const { messagesByConversation, messagesLookup } = state;

    const existingConversation = messagesByConversation[conversationId];
    const resetCounter = existingConversation
      ? existingConversation.resetCounter + 1
      : 0;

    const lookup = fromPairs(messages.map(message => [message.id, message]));
    const sorted = orderBy(
      values(lookup),
      ['received_at', 'sent_at'],
      ['ASC', 'ASC']
    );

    let { newest, oldest } = metrics;

    // If our metrics are a little out of date, we'll fix them up
    if (sorted.length > 0) {
      const first = sorted[0];
      if (first && (!oldest || first.received_at <= oldest.received_at)) {
        oldest = pick(first, ['id', 'received_at', 'sent_at']);
      }

      const last = sorted[sorted.length - 1];
      if (
        last &&
        (!newest || unboundedFetch || last.received_at >= newest.received_at)
      ) {
        newest = pick(last, ['id', 'received_at', 'sent_at']);
      }
    }

    const messageIds = sorted.map(message => message.id);

    return {
      ...state,
      selectedMessage: scrollToMessageId,
      selectedMessageCounter: state.selectedMessageCounter + 1,
      messagesLookup: {
        ...messagesLookup,
        ...lookup,
      },
      messagesByConversation: {
        ...messagesByConversation,
        [conversationId]: {
          isLoadingMessages: false,
          scrollToMessageId,
          scrollToMessageCounter: existingConversation
            ? existingConversation.scrollToMessageCounter + 1
            : 0,
          scrollToBottomCounter: existingConversation
            ? existingConversation.scrollToBottomCounter
            : 0,
          messageIds,
          metrics: {
            ...metrics,
            newest,
            oldest,
          },
          resetCounter,
          heightChangeMessageIds: [],
        },
      },
    };
  }
  if (action.type === 'SET_MESSAGES_LOADING') {
    const { payload } = action;
    const { conversationId, isLoadingMessages } = payload;

    const { messagesByConversation } = state;
    const existingConversation = messagesByConversation[conversationId];

    if (!existingConversation) {
      return state;
    }

    return {
      ...state,
      messagesByConversation: {
        ...messagesByConversation,
        [conversationId]: {
          ...existingConversation,
          loadCountdownStart: undefined,
          isLoadingMessages,
        },
      },
    };
  }
  if (action.type === 'SET_LOAD_COUNTDOWN_START') {
    const { payload } = action;
    const { conversationId, loadCountdownStart } = payload;

    const { messagesByConversation } = state;
    const existingConversation = messagesByConversation[conversationId];

    if (!existingConversation) {
      return state;
    }

    return {
      ...state,
      messagesByConversation: {
        ...messagesByConversation,
        [conversationId]: {
          ...existingConversation,
          loadCountdownStart,
        },
      },
    };
  }
  if (action.type === 'SET_NEAR_BOTTOM') {
    const { payload } = action;
    const { conversationId, isNearBottom } = payload;

    const { messagesByConversation } = state;
    const existingConversation = messagesByConversation[conversationId];

    if (!existingConversation) {
      return state;
    }

    return {
      ...state,
      messagesByConversation: {
        ...messagesByConversation,
        [conversationId]: {
          ...existingConversation,
          isNearBottom,
        },
      },
    };
  }
  if (action.type === 'SCROLL_TO_BOTTOM') {
    const { payload } = action;
    const { conversationId } = payload;
    const { messagesByConversation } = state;
    const existingConversation = messagesByConversation[conversationId];

    if (!existingConversation) {
      return state;
    }

    return {
      ...state,
      messagesByConversation: {
        ...messagesByConversation,
        [conversationId]: {
          ...existingConversation,
          scrollToBottomCounter: existingConversation.scrollToBottomCounter + 1,
        },
      },
    };
  }

  if (action.type === 'SCROLL_TO_MESSAGE') {
    const { payload } = action;
    const { conversationId, messageId } = payload;

    const { messagesByConversation, messagesLookup } = state;
    const existingConversation = messagesByConversation[conversationId];

    if (!existingConversation) {
      return state;
    }
    if (!messagesLookup[messageId]) {
      return state;
    }
    if (!existingConversation.messageIds.includes(messageId)) {
      return state;
    }

    return {
      ...state,
      selectedMessage: messageId,
      selectedMessageCounter: state.selectedMessageCounter + 1,
      messagesByConversation: {
        ...messagesByConversation,
        [conversationId]: {
          ...existingConversation,
          isLoadingMessages: false,
          scrollToMessageId: messageId,
          scrollToMessageCounter:
            existingConversation.scrollToMessageCounter + 1,
        },
      },
    };
  }
  if (action.type === 'MESSAGE_DELETED') {
    const { id, conversationId } = action.payload;
    const { messagesByConversation, messagesLookup } = state;

    const existingConversation = messagesByConversation[conversationId];
    if (!existingConversation) {
      return state;
    }

    // Assuming that we always have contiguous groups of messages in memory, the removal
    //   of one message at one end of our message set be replaced with the message right
    //   next to it.
    const oldIds = existingConversation.messageIds;
    let { newest, oldest } = existingConversation.metrics;

    if (oldIds.length > 1) {
      const firstId = oldIds[0];
      const lastId = oldIds[oldIds.length - 1];

      if (oldest && oldest.id === firstId && firstId === id) {
        const second = messagesLookup[oldIds[1]];
        oldest = second
          ? pick(second, ['id', 'received_at', 'sent_at'])
          : undefined;
      }
      if (newest && newest.id === lastId && lastId === id) {
        const penultimate = messagesLookup[oldIds[oldIds.length - 2]];
        newest = penultimate
          ? pick(penultimate, ['id', 'received_at', 'sent_at'])
          : undefined;
      }
    }

    // Removing it from our caches
    const messageIds = without(existingConversation.messageIds, id);
    const heightChangeMessageIds = without(
      existingConversation.heightChangeMessageIds,
      id
    );

    let metrics;
    if (messageIds.length === 0) {
      metrics = {
        totalUnread: 0,
      };
    } else {
      metrics = {
        ...existingConversation.metrics,
        oldest,
        newest,
      };
    }

    return {
      ...state,
      messagesLookup: omit(messagesLookup, id),
      messagesByConversation: {
        [conversationId]: {
          ...existingConversation,
          messageIds,
          heightChangeMessageIds,
          metrics,
        },
      },
    };
  }

  if (action.type === 'REPAIR_NEWEST_MESSAGE') {
    const { conversationId } = action.payload;
    const { messagesByConversation, messagesLookup } = state;

    const existingConversation = getOwn(messagesByConversation, conversationId);
    if (!existingConversation) {
      return state;
    }

    const { messageIds } = existingConversation;
    const lastId =
      messageIds && messageIds.length
        ? messageIds[messageIds.length - 1]
        : undefined;
    const last = lastId ? getOwn(messagesLookup, lastId) : undefined;
    const newest = last
      ? pick(last, ['id', 'received_at', 'sent_at'])
      : undefined;

    return {
      ...state,
      messagesByConversation: {
        ...messagesByConversation,
        [conversationId]: {
          ...existingConversation,
          metrics: {
            ...existingConversation.metrics,
            newest,
          },
        },
      },
    };
  }

  if (action.type === 'REPAIR_OLDEST_MESSAGE') {
    const { conversationId } = action.payload;
    const { messagesByConversation, messagesLookup } = state;

    const existingConversation = getOwn(messagesByConversation, conversationId);
    if (!existingConversation) {
      return state;
    }

    const { messageIds } = existingConversation;
    const firstId = messageIds && messageIds.length ? messageIds[0] : undefined;
    const first = firstId ? getOwn(messagesLookup, firstId) : undefined;
    const oldest = first
      ? pick(first, ['id', 'received_at', 'sent_at'])
      : undefined;

    return {
      ...state,
      messagesByConversation: {
        ...messagesByConversation,
        [conversationId]: {
          ...existingConversation,
          metrics: {
            ...existingConversation.metrics,
            oldest,
          },
        },
      },
    };
  }

  if (action.type === 'REVIEW_GROUP_MEMBER_NAME_COLLISION') {
    return {
      ...state,
      contactSpoofingReview: {
        type: ContactSpoofingType.MultipleGroupMembersWithSameTitle,
        ...action.payload,
      },
    };
  }

  if (action.type === 'REVIEW_MESSAGE_REQUEST_NAME_COLLISION') {
    return {
      ...state,
      contactSpoofingReview: {
        type: ContactSpoofingType.DirectConversationWithSameTitle,
        ...action.payload,
      },
    };
  }

  if (action.type === 'MESSAGES_ADDED') {
    const { conversationId, isActive, isNewMessage, messages } = action.payload;
    const { messagesByConversation, messagesLookup } = state;

    const existingConversation = messagesByConversation[conversationId];
    if (!existingConversation) {
      return state;
    }

    let {
      newest,
      oldest,
      oldestUnread,
      totalUnread,
    } = existingConversation.metrics;

    if (messages.length < 1) {
      return state;
    }

    const lookup = fromPairs(
      existingConversation.messageIds.map(id => [id, messagesLookup[id]])
    );
    messages.forEach(message => {
      lookup[message.id] = message;
    });

    const sorted = orderBy(
      values(lookup),
      ['received_at', 'sent_at'],
      ['ASC', 'ASC']
    );
    const messageIds = sorted.map(message => message.id);

    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    if (!newest) {
      newest = pick(first, ['id', 'received_at', 'sent_at']);
    }
    if (!oldest) {
      oldest = pick(last, ['id', 'received_at', 'sent_at']);
    }

    const existingTotal = existingConversation.messageIds.length;
    if (isNewMessage && existingTotal > 0) {
      const lastMessageId = existingConversation.messageIds[existingTotal - 1];

      // If our messages in memory don't include the most recent messages, then we
      //   won't add new messages to our message list.
      const haveLatest = newest && newest.id === lastMessageId;
      if (!haveLatest) {
        return state;
      }
    }

    // Update oldest and newest if we receive older/newer
    // messages (or duplicated timestamps!)
    if (first && oldest && first.received_at <= oldest.received_at) {
      oldest = pick(first, ['id', 'received_at', 'sent_at']);
    }
    if (last && newest && last.received_at >= newest.received_at) {
      newest = pick(last, ['id', 'received_at', 'sent_at']);
    }

    const newIds = messages.map(message => message.id);
    const newMessageIds = difference(newIds, existingConversation.messageIds);
    const { isNearBottom } = existingConversation;

    if ((!isNearBottom || !isActive) && !oldestUnread) {
      const oldestId = newMessageIds.find(messageId => {
        const message = lookup[messageId];

        return message && isMessageUnread(message);
      });

      if (oldestId) {
        oldestUnread = pick(lookup[oldestId], [
          'id',
          'received_at',
          'sent_at',
        ]) as MessagePointerType;
      }
    }

    if (oldestUnread) {
      const newUnread: number = newMessageIds.reduce((sum, messageId) => {
        const message = lookup[messageId];

        return sum + (message && isMessageUnread(message) ? 1 : 0);
      }, 0);
      totalUnread = (totalUnread || 0) + newUnread;
    }

    const changedIds = intersection(newIds, existingConversation.messageIds);
    const heightChangeMessageIds = uniq([
      ...changedIds,
      ...existingConversation.heightChangeMessageIds,
    ]);

    return {
      ...state,
      messagesLookup: {
        ...messagesLookup,
        ...lookup,
      },
      messagesByConversation: {
        ...messagesByConversation,
        [conversationId]: {
          ...existingConversation,
          isLoadingMessages: false,
          messageIds,
          heightChangeMessageIds,
          scrollToMessageId: undefined,
          metrics: {
            ...existingConversation.metrics,
            newest,
            oldest,
            totalUnread,
            oldestUnread,
          },
        },
      },
    };
  }
  if (action.type === 'CLEAR_SELECTED_MESSAGE') {
    return {
      ...state,
      selectedMessage: undefined,
    };
  }
  if (action.type === 'CLEAR_CHANGED_MESSAGES') {
    const { payload } = action;
    const { conversationId } = payload;
    const existingConversation = state.messagesByConversation[conversationId];

    if (!existingConversation) {
      return state;
    }

    return {
      ...state,
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: {
          ...existingConversation,
          heightChangeMessageIds: [],
        },
      },
    };
  }
  if (action.type === 'CLEAR_UNREAD_METRICS') {
    const { payload } = action;
    const { conversationId } = payload;
    const existingConversation = state.messagesByConversation[conversationId];

    if (!existingConversation) {
      return state;
    }

    return {
      ...state,
      messagesByConversation: {
        ...state.messagesByConversation,
        [conversationId]: {
          ...existingConversation,
          metrics: {
            ...existingConversation.metrics,
            oldestUnread: undefined,
            totalUnread: 0,
          },
        },
      },
    };
  }
  if (action.type === 'SELECTED_CONVERSATION_CHANGED') {
    const { payload } = action;
    const { id } = payload;

    return {
      ...omit(state, 'contactSpoofingReview'),
      selectedConversationId: id,
    };
  }
  if (action.type === 'SHOW_INBOX') {
    return {
      ...omit(state, 'composer'),
      showArchived: false,
    };
  }
  if (action.type === 'SHOW_ARCHIVED_CONVERSATIONS') {
    return {
      ...omit(state, 'composer'),
      showArchived: true,
    };
  }

  if (action.type === 'SET_CONVERSATION_HEADER_TITLE') {
    return {
      ...state,
      selectedConversationTitle: action.payload.title,
    };
  }

  if (action.type === 'SET_RECENT_MEDIA_ITEMS') {
    const { id, recentMediaItems } = action.payload;
    const { conversationLookup } = state;

    const conversationData = conversationLookup[id];

    if (!conversationData) {
      return state;
    }

    const data = {
      ...conversationData,
      recentMediaItems,
    };

    return {
      ...state,
      conversationLookup: {
        ...conversationLookup,
        [id]: data,
      },
      ...updateConversationLookups(data, undefined, state),
    };
  }

  if (action.type === 'START_COMPOSING') {
    if (state.composer?.step === ComposerStep.StartDirectConversation) {
      return state;
    }

    return {
      ...state,
      showArchived: false,
      composer: {
        step: ComposerStep.StartDirectConversation,
        searchTerm: '',
      },
    };
  }

  if (action.type === 'SHOW_CHOOSE_GROUP_MEMBERS') {
    let selectedConversationIds: Array<string>;
    let recommendedGroupSizeModalState: OneTimeModalState;
    let maximumGroupSizeModalState: OneTimeModalState;
    let groupName: string;
    let groupAvatar: undefined | Uint8Array;
    let groupExpireTimer: number;
    let userAvatarData = getDefaultAvatars(true);

    switch (state.composer?.step) {
      case ComposerStep.ChooseGroupMembers:
        return state;
      case ComposerStep.SetGroupMetadata:
        ({
          selectedConversationIds,
          recommendedGroupSizeModalState,
          maximumGroupSizeModalState,
          groupName,
          groupAvatar,
          groupExpireTimer,
          userAvatarData,
        } = state.composer);
        break;
      default:
        selectedConversationIds = [];
        recommendedGroupSizeModalState = OneTimeModalState.NeverShown;
        maximumGroupSizeModalState = OneTimeModalState.NeverShown;
        groupName = '';
        groupExpireTimer = universalExpireTimer.get();
        break;
    }

    return {
      ...state,
      showArchived: false,
      composer: {
        step: ComposerStep.ChooseGroupMembers,
        searchTerm: '',
        selectedConversationIds,
        cantAddContactIdForModal: undefined,
        recommendedGroupSizeModalState,
        maximumGroupSizeModalState,
        groupName,
        groupAvatar,
        groupExpireTimer,
        userAvatarData,
      },
    };
  }

  if (action.type === 'START_SETTING_GROUP_METADATA') {
    const { composer } = state;

    switch (composer?.step) {
      case ComposerStep.ChooseGroupMembers:
        return {
          ...state,
          showArchived: false,
          composer: {
            step: ComposerStep.SetGroupMetadata,
            isEditingAvatar: false,
            isCreating: false,
            hasError: false,
            ...pick(composer, [
              'groupAvatar',
              'groupName',
              'groupExpireTimer',
              'maximumGroupSizeModalState',
              'recommendedGroupSizeModalState',
              'selectedConversationIds',
              'userAvatarData',
            ]),
          },
        };
      case ComposerStep.SetGroupMetadata:
        return state;
      default:
        assert(
          false,
          'Cannot transition to setting group metadata from this state'
        );
        return state;
    }
  }

  if (action.type === 'SET_COMPOSE_GROUP_AVATAR') {
    const { composer } = state;

    switch (composer?.step) {
      case ComposerStep.ChooseGroupMembers:
      case ComposerStep.SetGroupMetadata:
        return {
          ...state,
          composer: {
            ...composer,
            groupAvatar: action.payload.groupAvatar,
          },
        };
      default:
        assert(false, 'Setting compose group avatar at this step is a no-op');
        return state;
    }
  }

  if (action.type === 'SET_COMPOSE_GROUP_NAME') {
    const { composer } = state;

    switch (composer?.step) {
      case ComposerStep.ChooseGroupMembers:
      case ComposerStep.SetGroupMetadata:
        return {
          ...state,
          composer: {
            ...composer,
            groupName: action.payload.groupName,
          },
        };
      default:
        assert(false, 'Setting compose group name at this step is a no-op');
        return state;
    }
  }

  if (action.type === 'SET_COMPOSE_GROUP_EXPIRE_TIMER') {
    const { composer } = state;

    switch (composer?.step) {
      case ComposerStep.ChooseGroupMembers:
      case ComposerStep.SetGroupMetadata:
        return {
          ...state,
          composer: {
            ...composer,
            groupExpireTimer: action.payload.groupExpireTimer,
          },
        };
      default:
        assert(false, 'Setting compose group name at this step is a no-op');
        return state;
    }
  }

  if (action.type === 'SET_COMPOSE_SEARCH_TERM') {
    const { composer } = state;
    if (!composer) {
      assert(
        false,
        'Setting compose search term with the composer closed is a no-op'
      );
      return state;
    }
    if (composer?.step === ComposerStep.SetGroupMetadata) {
      assert(false, 'Setting compose search term at this step is a no-op');
      return state;
    }

    return {
      ...state,
      composer: {
        ...composer,
        searchTerm: action.payload.searchTerm,
      },
    };
  }

  if (action.type === COMPOSE_TOGGLE_EDITING_AVATAR) {
    const { composer } = state;

    switch (composer?.step) {
      case ComposerStep.SetGroupMetadata:
        return {
          ...state,
          composer: {
            ...composer,
            isEditingAvatar: !composer.isEditingAvatar,
          },
        };
      default:
        assert(false, 'Setting editing avatar at this step is a no-op');
        return state;
    }
  }

  if (action.type === COMPOSE_ADD_AVATAR) {
    const { payload } = action;
    const { composer } = state;

    switch (composer?.step) {
      case ComposerStep.ChooseGroupMembers:
      case ComposerStep.SetGroupMetadata:
        return {
          ...state,
          composer: {
            ...composer,
            userAvatarData: [
              {
                ...payload,
                id: getNextAvatarId(composer.userAvatarData),
              },
              ...composer.userAvatarData,
            ],
          },
        };
      default:
        assert(false, 'Adding an avatar at this step is a no-op');
        return state;
    }
  }

  if (action.type === COMPOSE_REMOVE_AVATAR) {
    const { payload } = action;
    const { composer } = state;

    switch (composer?.step) {
      case ComposerStep.ChooseGroupMembers:
      case ComposerStep.SetGroupMetadata:
        return {
          ...state,
          composer: {
            ...composer,
            userAvatarData: filterAvatarData(composer.userAvatarData, payload),
          },
        };
      default:
        assert(false, 'Removing an avatar at this step is a no-op');
        return state;
    }
  }

  if (action.type === COMPOSE_REPLACE_AVATAR) {
    const { curr, prev } = action.payload;
    const { composer } = state;

    switch (composer?.step) {
      case ComposerStep.ChooseGroupMembers:
      case ComposerStep.SetGroupMetadata:
        return {
          ...state,
          composer: {
            ...composer,
            userAvatarData: [
              {
                ...curr,
                id: prev?.id ?? getNextAvatarId(composer.userAvatarData),
              },
              ...(prev
                ? filterAvatarData(composer.userAvatarData, prev)
                : composer.userAvatarData),
            ],
          },
        };
      default:
        assert(false, 'Replacing an avatar at this step is a no-op');
        return state;
    }
  }

  if (action.type === 'SWITCH_TO_ASSOCIATED_VIEW') {
    const conversation = getOwn(
      state.conversationLookup,
      action.payload.conversationId
    );
    if (!conversation) {
      return state;
    }
    return {
      ...omit(state, 'composer'),
      showArchived: Boolean(conversation.isArchived),
    };
  }

  if (action.type === 'TOGGLE_CONVERSATION_IN_CHOOSE_MEMBERS') {
    const { composer } = state;
    if (composer?.step !== ComposerStep.ChooseGroupMembers) {
      assert(
        false,
        'Toggling conversation members is a no-op in this composer step'
      );
      return state;
    }

    return {
      ...state,
      composer: {
        ...composer,
        ...toggleSelectedContactForGroupAddition(
          action.payload.conversationId,
          {
            maxGroupSize: action.payload.maxGroupSize,
            maxRecommendedGroupSize: action.payload.maxRecommendedGroupSize,
            maximumGroupSizeModalState: composer.maximumGroupSizeModalState,
            // We say you're already in the group, even though it hasn't been created yet.
            numberOfContactsAlreadyInGroup: 1,
            recommendedGroupSizeModalState:
              composer.recommendedGroupSizeModalState,
            selectedConversationIds: composer.selectedConversationIds,
          }
        ),
      },
    };
  }

  if (action.type === COLORS_CHANGED) {
    const { conversationLookup } = state;
    const { conversationColor, customColorData } = action.payload;

    const nextState = {
      ...state,
    };

    Object.keys(conversationLookup).forEach(id => {
      const existing = conversationLookup[id];
      const added = {
        ...existing,
        conversationColor,
        customColor: customColorData?.value,
        customColorId: customColorData?.id,
      };

      Object.assign(
        nextState,
        updateConversationLookups(added, existing, nextState),
        {
          conversationLookup: {
            ...nextState.conversationLookup,
            [id]: added,
          },
        }
      );
    });

    return nextState;
  }

  if (action.type === COLOR_SELECTED) {
    const { conversationLookup } = state;
    const {
      conversationId,
      conversationColor,
      customColorData,
    } = action.payload;

    const existing = conversationLookup[conversationId];
    if (!existing) {
      return state;
    }

    const changed = {
      ...existing,
      conversationColor,
      customColor: customColorData?.value,
      customColorId: customColorData?.id,
    };

    return {
      ...state,
      conversationLookup: {
        ...conversationLookup,
        [conversationId]: changed,
      },
      ...updateConversationLookups(changed, existing, state),
    };
  }

  if (action.type === CUSTOM_COLOR_REMOVED) {
    const { conversationLookup } = state;
    const { colorId } = action.payload;

    const nextState = {
      ...state,
    };

    Object.keys(conversationLookup).forEach(id => {
      const existing = conversationLookup[id];

      if (existing.customColorId !== colorId) {
        return;
      }

      const changed = {
        ...existing,
        conversationColor: undefined,
        customColor: undefined,
        customColorId: undefined,
      };

      Object.assign(
        nextState,
        updateConversationLookups(changed, existing, nextState),
        {
          conversationLookup: {
            ...nextState.conversationLookup,
            [id]: changed,
          },
        }
      );
    });

    return nextState;
  }

  if (action.type === REPLACE_AVATARS) {
    const { conversationLookup } = state;
    const { conversationId, avatars } = action.payload;

    const conversation = conversationLookup[conversationId];
    if (!conversation) {
      return state;
    }

    const changed = {
      ...conversation,
      avatars,
    };

    return {
      ...state,
      conversationLookup: {
        ...conversationLookup,
        [conversationId]: changed,
      },
      ...updateConversationLookups(changed, conversation, state),
    };
  }

  if (action.type === UPDATE_USERNAME_SAVE_STATE) {
    const { newSaveState } = action.payload;

    return {
      ...state,
      usernameSaveState: newSaveState,
    };
  }

  return state;
}
