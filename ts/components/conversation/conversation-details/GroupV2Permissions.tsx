// Copyright 2020 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import React from 'react';

import type { ConversationType } from '../../../state/ducks/conversations';
import type { LocalizerType } from '../../../types/Util';
import { getAccessControlOptions } from '../../../util/getAccessControlOptions';
import { SignalService as Proto } from '../../../protobuf';

import { PanelRow } from './PanelRow';
import { PanelSection } from './PanelSection';
import { Select } from '../../Select';

export type PropsType = {
  conversation?: ConversationType;
  i18n: LocalizerType;
  setAccessControlAttributesSetting: (value: number) => void;
  setAccessControlMembersSetting: (value: number) => void;
  setAnnouncementsOnly: (value: boolean) => void;
};

export const GroupV2Permissions = ({
  conversation,
  i18n,
  setAccessControlAttributesSetting,
  setAccessControlMembersSetting,
  setAnnouncementsOnly,
}: PropsType): JSX.Element => {
  if (conversation === undefined) {
    throw new Error('GroupV2Permissions rendered without a conversation');
  }

  const updateAccessControlAttributes = (value: string) => {
    setAccessControlAttributesSetting(Number(value));
  };
  const updateAccessControlMembers = (value: string) => {
    setAccessControlMembersSetting(Number(value));
  };
  const AccessControlEnum = Proto.AccessControl.AccessRequired;
  const updateAnnouncementsOnly = (value: string) => {
    setAnnouncementsOnly(Number(value) === AccessControlEnum.ADMINISTRATOR);
  };
  const accessControlOptions = getAccessControlOptions(i18n);
  const announcementsOnlyValue = String(
    conversation.announcementsOnly
      ? AccessControlEnum.ADMINISTRATOR
      : AccessControlEnum.MEMBER
  );

  const showAnnouncementsOnlyPermission =
    conversation.areWeAdmin &&
    (conversation.announcementsOnly || conversation.announcementsOnlyReady);

  return (
    <PanelSection>
      <PanelRow
        label={i18n('ConversationDetails--add-members-label')}
        info={i18n('ConversationDetails--add-members-info')}
        right={
          <Select
            onChange={updateAccessControlMembers}
            options={accessControlOptions}
            value={String(conversation.accessControlMembers)}
          />
        }
      />
      <PanelRow
        label={i18n('ConversationDetails--group-info-label')}
        info={i18n('ConversationDetails--group-info-info')}
        right={
          <Select
            onChange={updateAccessControlAttributes}
            options={accessControlOptions}
            value={String(conversation.accessControlAttributes)}
          />
        }
      />
      {showAnnouncementsOnlyPermission && (
        <PanelRow
          label={i18n('ConversationDetails--announcement-label')}
          info={i18n('ConversationDetails--announcement-info')}
          right={
            <Select
              onChange={updateAnnouncementsOnly}
              options={accessControlOptions}
              value={announcementsOnlyValue}
            />
          }
        />
      )}
    </PanelSection>
  );
};
