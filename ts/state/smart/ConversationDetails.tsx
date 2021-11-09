// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { connect } from 'react-redux';

import type { StateType } from '../reducer';
import { mapDispatchToProps } from '../actions';
import type { StateProps } from '../../components/conversation/conversation-details/ConversationDetails';
import { ConversationDetails } from '../../components/conversation/conversation-details/ConversationDetails';
import {
  getCandidateContactsForNewGroup,
  getConversationByIdSelector,
  getConversationByUuidSelector,
} from '../selectors/conversations';
import { getGroupMemberships } from '../../util/getGroupMemberships';
import { getIntl, getTheme } from '../selectors/user';
import type { MediaItemType } from '../../types/MediaItem';
import {
  getBadgesSelector,
  getPreferredBadgeSelector,
} from '../selectors/badges';
import type { BadgeType } from '../../badges/types';
import { assert } from '../../util/assert';
import { SignalService as Proto } from '../../protobuf';

export type SmartConversationDetailsProps = {
  addMembers: (conversationIds: ReadonlyArray<string>) => Promise<void>;
  conversationId: string;
  loadRecentMediaItems: (limit: number) => void;
  setDisappearingMessages: (seconds: number) => void;
  showAllMedia: () => void;
  showChatColorEditor: () => void;
  showGroupLinkManagement: () => void;
  showGroupV2Permissions: () => void;
  showConversationNotificationsSettings: () => void;
  showPendingInvites: () => void;
  showLightboxForMedia: (
    selectedMediaItem: MediaItemType,
    media: Array<MediaItemType>
  ) => void;
  updateGroupAttributes: (
    _: Readonly<{
      avatar?: undefined | Uint8Array;
      title?: string;
    }>
  ) => Promise<void>;
  onBlock: () => void;
  onLeave: () => void;
  onUnblock: () => void;
  setMuteExpiration: (muteExpiresAt: undefined | number) => unknown;
  onOutgoingAudioCallInConversation: () => unknown;
  onOutgoingVideoCallInConversation: () => unknown;
};

const ACCESS_ENUM = Proto.AccessControl.AccessRequired;

const mapStateToProps = (
  state: StateType,
  props: SmartConversationDetailsProps
): StateProps => {
  const conversationSelector = getConversationByIdSelector(state);
  const conversation = conversationSelector(props.conversationId);
  assert(
    conversation,
    '<SmartConversationDetails> expected a conversation to be found'
  );

  const canEditGroupInfo = Boolean(conversation.canEditGroupInfo);
  const isAdmin = Boolean(conversation.areWeAdmin);
  const candidateContactsToAdd = getCandidateContactsForNewGroup(state);

  const hasGroupLink =
    Boolean(conversation.groupLink) &&
    conversation.accessControlAddFromInviteLink !== ACCESS_ENUM.UNSATISFIABLE;

  const conversationByUuidSelector = getConversationByUuidSelector(state);
  const groupMemberships = getGroupMemberships(
    conversation,
    conversationByUuidSelector
  );

  const badges = getBadgesSelector(state)(conversation.badges);

  const preferredBadgeByConversation: Record<string, BadgeType> = {};
  const getPreferredBadge = getPreferredBadgeSelector(state);
  groupMemberships.memberships.forEach(({ member }) => {
    const preferredBadge = getPreferredBadge(member.badges);
    if (preferredBadge) {
      preferredBadgeByConversation[member.id] = preferredBadge;
    }
  });

  return {
    ...props,
    badges,
    canEditGroupInfo,
    candidateContactsToAdd,
    conversation,
    i18n: getIntl(state),
    isAdmin,
    preferredBadgeByConversation,
    ...groupMemberships,
    userAvatarData: conversation.avatars || [],
    hasGroupLink,
    isGroup: conversation.type === 'group',
    theme: getTheme(state),
  };
};

const smart = connect(mapStateToProps, mapDispatchToProps);

export const SmartConversationDetails = smart(ConversationDetails);
