// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { connect } from 'react-redux';
import { mapDispatchToProps } from '../actions';
import type { PropsType } from '../../components/conversation/conversation-details/PendingInvites';
import { PendingInvites } from '../../components/conversation/conversation-details/PendingInvites';
import type { StateType } from '../reducer';

import { getIntl } from '../selectors/user';
import {
  getConversationByIdSelector,
  getConversationByUuidSelector,
} from '../selectors/conversations';
import { getGroupMemberships } from '../../util/getGroupMemberships';
import { assert } from '../../util/assert';

export type SmartPendingInvitesProps = {
  conversationId: string;
  ourConversationId?: string;
  readonly approvePendingMembership: (conversationid: string) => void;
  readonly revokePendingMemberships: (membershipIds: Array<string>) => void;
};

const mapStateToProps = (
  state: StateType,
  props: SmartPendingInvitesProps
): PropsType => {
  const conversationSelector = getConversationByIdSelector(state);
  const conversationByUuidSelector = getConversationByUuidSelector(state);

  const conversation = conversationSelector(props.conversationId);
  assert(
    conversation,
    '<SmartPendingInvites> expected a conversation to be found'
  );

  return {
    ...props,
    ...getGroupMemberships(conversation, conversationByUuidSelector),
    conversation,
    i18n: getIntl(state),
  };
};

const smart = connect(mapStateToProps, mapDispatchToProps);

export const SmartPendingInvites = smart(PendingInvites);
