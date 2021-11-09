// Copyright 2020 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { connect } from 'react-redux';

import type { StateType } from '../reducer';
import type { PropsType } from '../../components/conversation/conversation-details/GroupLinkManagement';
import { GroupLinkManagement } from '../../components/conversation/conversation-details/GroupLinkManagement';
import { getConversationSelector } from '../selectors/conversations';
import { getIntl } from '../selectors/user';

export type SmartGroupLinkManagementProps = {
  changeHasGroupLink: (value: boolean) => void;
  conversationId: string;
  copyGroupLink: (groupLink: string) => void;
  generateNewGroupLink: () => void;
  setAccessControlAddFromInviteLinkSetting: (value: boolean) => void;
};

const mapStateToProps = (
  state: StateType,
  props: SmartGroupLinkManagementProps
): PropsType => {
  const conversation = getConversationSelector(state)(props.conversationId);
  const isAdmin = Boolean(conversation?.areWeAdmin);

  return {
    ...props,
    conversation,
    i18n: getIntl(state),
    isAdmin,
  };
};

const smart = connect(mapStateToProps);

export const SmartGroupLinkManagement = smart(GroupLinkManagement);
