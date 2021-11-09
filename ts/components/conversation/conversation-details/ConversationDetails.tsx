// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { ReactNode } from 'react';
import React, { useState } from 'react';

import { Button, ButtonIconType, ButtonVariant } from '../../Button';
import type { ConversationType } from '../../../state/ducks/conversations';
import { assert } from '../../../util/assert';
import { getMutedUntilText } from '../../../util/getMutedUntilText';

import type { LocalizerType, ThemeType } from '../../../types/Util';
import type { MediaItemType } from '../../../types/MediaItem';
import type { BadgeType } from '../../../badges/types';
import { CapabilityError } from '../../../types/errors';
import { missingCaseError } from '../../../util/missingCaseError';

import { DisappearingTimerSelect } from '../../DisappearingTimerSelect';

import { PanelRow } from './PanelRow';
import { PanelSection } from './PanelSection';
import { AddGroupMembersModal } from './AddGroupMembersModal';
import { ConversationDetailsActions } from './ConversationDetailsActions';
import { ConversationDetailsHeader } from './ConversationDetailsHeader';
import { ConversationDetailsIcon, IconType } from './ConversationDetailsIcon';
import { ConversationDetailsMediaList } from './ConversationDetailsMediaList';
import type { GroupV2Membership } from './ConversationDetailsMembershipList';
import { ConversationDetailsMembershipList } from './ConversationDetailsMembershipList';
import type {
  GroupV2PendingMembership,
  GroupV2RequestingMembership,
} from './PendingInvites';
import { EditConversationAttributesModal } from './EditConversationAttributesModal';
import { RequestState } from './util';
import { getCustomColorStyle } from '../../../util/getCustomColorStyle';
import { ConfirmationDialog } from '../../ConfirmationDialog';
import { ConversationNotificationsModal } from './ConversationNotificationsModal';
import type {
  AvatarDataType,
  DeleteAvatarFromDiskActionType,
  ReplaceAvatarActionType,
  SaveAvatarToDiskActionType,
} from '../../../types/Avatar';
import { isMuted } from '../../../util/isMuted';

enum ModalState {
  NothingOpen,
  EditingGroupDescription,
  EditingGroupTitle,
  AddingGroupMembers,
  MuteNotifications,
  UnmuteNotifications,
}

export type StateProps = {
  addMembers: (conversationIds: ReadonlyArray<string>) => Promise<void>;
  badges?: ReadonlyArray<BadgeType>;
  canEditGroupInfo: boolean;
  candidateContactsToAdd: Array<ConversationType>;
  conversation?: ConversationType;
  hasGroupLink: boolean;
  i18n: LocalizerType;
  isAdmin: boolean;
  isGroup: boolean;
  loadRecentMediaItems: (limit: number) => void;
  memberships: Array<GroupV2Membership>;
  preferredBadgeByConversation: Record<string, BadgeType>;
  pendingApprovalMemberships: ReadonlyArray<GroupV2RequestingMembership>;
  pendingMemberships: ReadonlyArray<GroupV2PendingMembership>;
  setDisappearingMessages: (seconds: number) => void;
  showAllMedia: () => void;
  showChatColorEditor: () => void;
  showGroupLinkManagement: () => void;
  showGroupV2Permissions: () => void;
  showPendingInvites: () => void;
  showLightboxForMedia: (
    selectedMediaItem: MediaItemType,
    media: Array<MediaItemType>
  ) => void;
  showConversationNotificationsSettings: () => void;
  updateGroupAttributes: (
    _: Readonly<{
      avatar?: undefined | Uint8Array;
      description?: string;
      title?: string;
    }>
  ) => Promise<void>;
  onBlock: () => void;
  onLeave: () => void;
  onUnblock: () => void;
  theme: ThemeType;
  userAvatarData: Array<AvatarDataType>;
  setMuteExpiration: (muteExpiresAt: undefined | number) => unknown;
  onOutgoingAudioCallInConversation: () => unknown;
  onOutgoingVideoCallInConversation: () => unknown;
};

type ActionProps = {
  deleteAvatarFromDisk: DeleteAvatarFromDiskActionType;
  replaceAvatar: ReplaceAvatarActionType;
  saveAvatarToDisk: SaveAvatarToDiskActionType;
  showContactModal: (contactId: string, conversationId: string) => void;
  toggleSafetyNumberModal: (conversationId: string) => unknown;
  searchInConversation: (id: string) => unknown;
};

export type Props = StateProps & ActionProps;

export const ConversationDetails: React.ComponentType<Props> = ({
  addMembers,
  badges,
  canEditGroupInfo,
  candidateContactsToAdd,
  conversation,
  deleteAvatarFromDisk,
  hasGroupLink,
  i18n,
  isAdmin,
  isGroup,
  loadRecentMediaItems,
  memberships,
  onBlock,
  onLeave,
  onOutgoingAudioCallInConversation,
  onOutgoingVideoCallInConversation,
  onUnblock,
  pendingApprovalMemberships,
  pendingMemberships,
  preferredBadgeByConversation,
  replaceAvatar,
  saveAvatarToDisk,
  searchInConversation,
  setDisappearingMessages,
  setMuteExpiration,
  showAllMedia,
  showChatColorEditor,
  showContactModal,
  showConversationNotificationsSettings,
  showGroupLinkManagement,
  showGroupV2Permissions,
  showLightboxForMedia,
  showPendingInvites,
  theme,
  toggleSafetyNumberModal,
  updateGroupAttributes,
  userAvatarData,
}) => {
  const [modalState, setModalState] = useState<ModalState>(
    ModalState.NothingOpen
  );
  const [
    editGroupAttributesRequestState,
    setEditGroupAttributesRequestState,
  ] = useState<RequestState>(RequestState.Inactive);
  const [
    addGroupMembersRequestState,
    setAddGroupMembersRequestState,
  ] = useState<RequestState>(RequestState.Inactive);
  const [membersMissingCapability, setMembersMissingCapability] = useState(
    false
  );

  if (conversation === undefined) {
    throw new Error('ConversationDetails rendered without a conversation');
  }

  const invitesCount =
    pendingMemberships.length + pendingApprovalMemberships.length;

  const otherMemberships = memberships.filter(({ member }) => !member.isMe);
  const isJustMe = otherMemberships.length === 0;
  const isAnyoneElseAnAdmin = otherMemberships.some(
    membership => membership.isAdmin
  );
  const cannotLeaveBecauseYouAreLastAdmin =
    isAdmin && !isJustMe && !isAnyoneElseAnAdmin;

  let modalNode: ReactNode;
  switch (modalState) {
    case ModalState.NothingOpen:
      modalNode = undefined;
      break;
    case ModalState.EditingGroupDescription:
    case ModalState.EditingGroupTitle:
      modalNode = (
        <EditConversationAttributesModal
          avatarColor={conversation.color}
          avatarPath={conversation.avatarPath}
          conversationId={conversation.id}
          groupDescription={conversation.groupDescription}
          i18n={i18n}
          initiallyFocusDescription={
            modalState === ModalState.EditingGroupDescription
          }
          makeRequest={async (
            options: Readonly<{
              avatar?: undefined | Uint8Array;
              description?: string;
              title?: string;
            }>
          ) => {
            setEditGroupAttributesRequestState(RequestState.Active);

            try {
              await updateGroupAttributes(options);
              setModalState(ModalState.NothingOpen);
              setEditGroupAttributesRequestState(RequestState.Inactive);
            } catch (err) {
              setEditGroupAttributesRequestState(
                RequestState.InactiveWithError
              );
            }
          }}
          onClose={() => {
            setModalState(ModalState.NothingOpen);
            setEditGroupAttributesRequestState(RequestState.Inactive);
          }}
          requestState={editGroupAttributesRequestState}
          title={conversation.title}
          deleteAvatarFromDisk={deleteAvatarFromDisk}
          replaceAvatar={replaceAvatar}
          saveAvatarToDisk={saveAvatarToDisk}
          userAvatarData={userAvatarData}
        />
      );
      break;
    case ModalState.AddingGroupMembers:
      modalNode = (
        <AddGroupMembersModal
          candidateContacts={candidateContactsToAdd}
          clearRequestError={() => {
            setAddGroupMembersRequestState(oldRequestState => {
              assert(
                oldRequestState !== RequestState.Active,
                'Should not be clearing an active request state'
              );
              return RequestState.Inactive;
            });
          }}
          conversationIdsAlreadyInGroup={
            new Set(memberships.map(membership => membership.member.id))
          }
          groupTitle={conversation.title}
          i18n={i18n}
          makeRequest={async conversationIds => {
            setAddGroupMembersRequestState(RequestState.Active);

            try {
              await addMembers(conversationIds);
              setModalState(ModalState.NothingOpen);
              setAddGroupMembersRequestState(RequestState.Inactive);
            } catch (err) {
              if (err instanceof CapabilityError) {
                setMembersMissingCapability(true);
                setAddGroupMembersRequestState(RequestState.InactiveWithError);
              } else {
                setAddGroupMembersRequestState(RequestState.InactiveWithError);
              }
            }
          }}
          onClose={() => {
            setModalState(ModalState.NothingOpen);
            setEditGroupAttributesRequestState(RequestState.Inactive);
          }}
          requestState={addGroupMembersRequestState}
          theme={theme}
        />
      );
      break;
    case ModalState.MuteNotifications:
      modalNode = (
        <ConversationNotificationsModal
          i18n={i18n}
          muteExpiresAt={conversation.muteExpiresAt}
          onClose={() => {
            setModalState(ModalState.NothingOpen);
          }}
          setMuteExpiration={setMuteExpiration}
        />
      );
      break;
    case ModalState.UnmuteNotifications:
      modalNode = (
        <ConfirmationDialog
          actions={[
            {
              action: () => setMuteExpiration(0),
              style: 'affirmative',
              text: i18n('unmute'),
            },
          ]}
          hasXButton
          i18n={i18n}
          title={i18n('ConversationDetails__unmute--title')}
          onClose={() => {
            setModalState(ModalState.NothingOpen);
          }}
        >
          {getMutedUntilText(Number(conversation.muteExpiresAt), i18n)}
        </ConfirmationDialog>
      );
      break;
    default:
      throw missingCaseError(modalState);
  }

  const isConversationMuted = isMuted(conversation.muteExpiresAt);

  return (
    <div className="conversation-details-panel">
      {membersMissingCapability && (
        <ConfirmationDialog
          cancelText={i18n('Confirmation--confirm')}
          i18n={i18n}
          onClose={() => setMembersMissingCapability(false)}
        >
          {i18n('GroupV2--add--missing-capability')}
        </ConfirmationDialog>
      )}

      <ConversationDetailsHeader
        badges={badges}
        canEdit={canEditGroupInfo}
        conversation={conversation}
        i18n={i18n}
        isMe={conversation.isMe}
        isGroup={isGroup}
        memberships={memberships}
        startEditing={(isGroupTitle: boolean) => {
          setModalState(
            isGroupTitle
              ? ModalState.EditingGroupTitle
              : ModalState.EditingGroupDescription
          );
        }}
        theme={theme}
      />

      <div className="ConversationDetails__header-buttons">
        {!conversation.isMe && (
          <>
            <Button
              icon={ButtonIconType.video}
              onClick={onOutgoingVideoCallInConversation}
              variant={ButtonVariant.Details}
            >
              {i18n('video')}
            </Button>
            {!isGroup && (
              <Button
                icon={ButtonIconType.audio}
                onClick={onOutgoingAudioCallInConversation}
                variant={ButtonVariant.Details}
              >
                {i18n('audio')}
              </Button>
            )}
          </>
        )}
        <Button
          icon={
            isConversationMuted ? ButtonIconType.muted : ButtonIconType.unmuted
          }
          onClick={() => {
            if (isConversationMuted) {
              setModalState(ModalState.UnmuteNotifications);
            } else {
              setModalState(ModalState.MuteNotifications);
            }
          }}
          variant={ButtonVariant.Details}
        >
          {isConversationMuted ? i18n('unmute') : i18n('mute')}
        </Button>
        <Button
          icon={ButtonIconType.search}
          onClick={() => {
            searchInConversation(conversation.id);
          }}
          variant={ButtonVariant.Details}
        >
          {i18n('search')}
        </Button>
      </div>

      <PanelSection>
        {!isGroup || canEditGroupInfo ? (
          <PanelRow
            icon={
              <ConversationDetailsIcon
                ariaLabel={i18n(
                  'ConversationDetails--disappearing-messages-label'
                )}
                icon={IconType.timer}
              />
            }
            info={i18n('ConversationDetails--disappearing-messages-info')}
            label={i18n('ConversationDetails--disappearing-messages-label')}
            right={
              <DisappearingTimerSelect
                i18n={i18n}
                value={conversation.expireTimer || 0}
                onChange={setDisappearingMessages}
              />
            }
          />
        ) : null}
        <PanelRow
          icon={
            <ConversationDetailsIcon
              ariaLabel={i18n('showChatColorEditor')}
              icon={IconType.color}
            />
          }
          label={i18n('showChatColorEditor')}
          onClick={showChatColorEditor}
          right={
            <div
              className={`ConversationDetails__chat-color ConversationDetails__chat-color--${conversation.conversationColor}`}
              style={{
                ...getCustomColorStyle(conversation.customColor),
              }}
            />
          }
        />
        {isGroup && (
          <PanelRow
            icon={
              <ConversationDetailsIcon
                ariaLabel={i18n('ConversationDetails--notifications')}
                icon={IconType.notifications}
              />
            }
            label={i18n('ConversationDetails--notifications')}
            onClick={showConversationNotificationsSettings}
            right={
              conversation.muteExpiresAt
                ? getMutedUntilText(conversation.muteExpiresAt, i18n)
                : undefined
            }
          />
        )}
        {!isGroup && !conversation.isMe && (
          <>
            <PanelRow
              onClick={() => toggleSafetyNumberModal(conversation.id)}
              icon={
                <ConversationDetailsIcon
                  ariaLabel={i18n('verifyNewNumber')}
                  icon={IconType.verify}
                />
              }
              label={
                <div className="ConversationDetails__safety-number">
                  {i18n('verifyNewNumber')}
                </div>
              }
            />
          </>
        )}
      </PanelSection>

      {isGroup && (
        <ConversationDetailsMembershipList
          canAddNewMembers={canEditGroupInfo}
          conversationId={conversation.id}
          i18n={i18n}
          memberships={memberships}
          preferredBadgeByConversation={preferredBadgeByConversation}
          showContactModal={showContactModal}
          startAddingNewMembers={() => {
            setModalState(ModalState.AddingGroupMembers);
          }}
          theme={theme}
        />
      )}

      {isGroup && (
        <PanelSection>
          {isAdmin || hasGroupLink ? (
            <PanelRow
              icon={
                <ConversationDetailsIcon
                  ariaLabel={i18n('ConversationDetails--group-link')}
                  icon={IconType.link}
                />
              }
              label={i18n('ConversationDetails--group-link')}
              onClick={showGroupLinkManagement}
              right={hasGroupLink ? i18n('on') : i18n('off')}
            />
          ) : null}
          <PanelRow
            icon={
              <ConversationDetailsIcon
                ariaLabel={i18n('ConversationDetails--requests-and-invites')}
                icon={IconType.invites}
              />
            }
            label={i18n('ConversationDetails--requests-and-invites')}
            onClick={showPendingInvites}
            right={invitesCount}
          />
          {isAdmin ? (
            <PanelRow
              icon={
                <ConversationDetailsIcon
                  ariaLabel={i18n('permissions')}
                  icon={IconType.lock}
                />
              }
              label={i18n('permissions')}
              onClick={showGroupV2Permissions}
            />
          ) : null}
        </PanelSection>
      )}

      <ConversationDetailsMediaList
        conversation={conversation}
        i18n={i18n}
        loadRecentMediaItems={loadRecentMediaItems}
        showAllMedia={showAllMedia}
        showLightboxForMedia={showLightboxForMedia}
      />

      {!conversation.isMe && (
        <ConversationDetailsActions
          cannotLeaveBecauseYouAreLastAdmin={cannotLeaveBecauseYouAreLastAdmin}
          conversationTitle={conversation.title}
          i18n={i18n}
          isBlocked={Boolean(conversation.isBlocked)}
          isGroup={isGroup}
          left={Boolean(conversation.left)}
          onBlock={onBlock}
          onLeave={onLeave}
          onUnblock={onUnblock}
        />
      )}

      {modalNode}
    </div>
  );
};
