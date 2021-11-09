// Copyright 2020 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { connect } from 'react-redux';
import { mapDispatchToProps } from '../actions';
import type { PropsType as GroupV1MigrationDialogPropsType } from '../../components/GroupV1MigrationDialog';
import { GroupV1MigrationDialog } from '../../components/GroupV1MigrationDialog';
import type { ConversationType } from '../ducks/conversations';
import type { StateType } from '../reducer';
import { getConversationSelector } from '../selectors/conversations';

import { getIntl } from '../selectors/user';
import * as log from '../../logging/log';

export type PropsType = {
  readonly droppedMemberIds: Array<string>;
  readonly invitedMemberIds: Array<string>;
} & Omit<
  GroupV1MigrationDialogPropsType,
  'i18n' | 'droppedMembers' | 'invitedMembers'
>;

const mapStateToProps = (
  state: StateType,
  props: PropsType
): GroupV1MigrationDialogPropsType => {
  const getConversation = getConversationSelector(state);
  const { droppedMemberIds, invitedMemberIds } = props;

  const droppedMembers = droppedMemberIds
    .map(getConversation)
    .filter(Boolean) as Array<ConversationType>;
  if (droppedMembers.length !== droppedMemberIds.length) {
    log.warn('smart/GroupV1MigrationDialog: droppedMembers length changed');
  }

  const invitedMembers = invitedMemberIds
    .map(getConversation)
    .filter(Boolean) as Array<ConversationType>;
  if (invitedMembers.length !== invitedMemberIds.length) {
    log.warn('smart/GroupV1MigrationDialog: invitedMembers length changed');
  }

  return {
    ...props,
    droppedMembers,
    invitedMembers,
    i18n: getIntl(state),
  };
};

const smart = connect(mapStateToProps, mapDispatchToProps);

export const SmartGroupV1MigrationDialog = smart(GroupV1MigrationDialog);
