// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { connect } from 'react-redux';

import type { ExternalProps as MessageDetailProps } from '../../components/conversation/MessageDetail';
import { MessageDetail } from '../../components/conversation/MessageDetail';

import { mapDispatchToProps } from '../actions';
import type { StateType } from '../reducer';
import { getIntl, getInteractionMode } from '../selectors/user';
import { renderAudioAttachment } from './renderAudioAttachment';
import { renderEmojiPicker } from './renderEmojiPicker';
import { renderReactionPicker } from './renderReactionPicker';
import { getContactNameColorSelector } from '../selectors/conversations';

export { Contact } from '../../components/conversation/MessageDetail';
export type OwnProps = Omit<
  MessageDetailProps,
  | 'i18n'
  | 'interactionMode'
  | 'renderAudioAttachment'
  | 'renderEmojiPicker'
  | 'renderReactionPicker'
>;

const mapStateToProps = (
  state: StateType,
  props: OwnProps
): MessageDetailProps => {
  const {
    contacts,
    errors,
    message,
    receivedAt,
    sentAt,

    showSafetyNumber,

    displayTapToViewMessage,
    kickOffAttachmentDownload,
    markAttachmentAsCorrupted,
    markViewed,
    openConversation,
    openLink,
    reactToMessage,
    replyToMessage,
    retrySend,
    showContactDetail,
    showContactModal,
    showExpiredIncomingTapToViewToast,
    showExpiredOutgoingTapToViewToast,
    showForwardMessageModal,
    showVisualAttachment,
  } = props;

  const contactNameColor =
    message.conversationType === 'group'
      ? getContactNameColorSelector(state)(
          message.conversationId,
          message.author.id
        )
      : undefined;

  return {
    contacts,
    contactNameColor,
    errors,
    message,
    receivedAt,
    sentAt,

    i18n: getIntl(state),
    interactionMode: getInteractionMode(state),

    showSafetyNumber,

    displayTapToViewMessage,
    kickOffAttachmentDownload,
    markAttachmentAsCorrupted,
    markViewed,
    openConversation,
    openLink,
    reactToMessage,
    renderAudioAttachment,
    renderEmojiPicker,
    renderReactionPicker,
    replyToMessage,
    retrySend,
    showContactDetail,
    showContactModal,
    showExpiredIncomingTapToViewToast,
    showExpiredOutgoingTapToViewToast,
    showForwardMessageModal,
    showVisualAttachment,
  };
};

const smart = connect(mapStateToProps, mapDispatchToProps);
export const SmartMessageDetail = smart(MessageDetail);
