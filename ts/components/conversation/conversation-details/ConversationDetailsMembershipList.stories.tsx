// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import * as React from 'react';
import { isBoolean } from 'lodash';

import { storiesOf } from '@storybook/react';
import { action } from '@storybook/addon-actions';
import { number } from '@storybook/addon-knobs';

import { setupI18n } from '../../../util/setupI18n';
import enMessages from '../../../../_locales/en/messages.json';
import { getDefaultConversation } from '../../../test-both/helpers/getDefaultConversation';
import { getFakeBadge } from '../../../test-both/helpers/getFakeBadge';
import { ThemeType } from '../../../types/Util';
import type { BadgeType } from '../../../badges/types';

import type {
  Props,
  GroupV2Membership,
} from './ConversationDetailsMembershipList';
import { ConversationDetailsMembershipList } from './ConversationDetailsMembershipList';

const i18n = setupI18n('en', enMessages);

const story = storiesOf(
  'Components/Conversation/ConversationDetails/ConversationDetailsMembershipList',
  module
);

const createMemberships = (
  numberOfMemberships = 10
): Array<GroupV2Membership> => {
  return Array.from(
    new Array(number('number of memberships', numberOfMemberships))
  ).map(
    (_, i): GroupV2Membership => ({
      isAdmin: i % 3 === 0,
      member: getDefaultConversation({
        isMe: i === 2,
      }),
    })
  );
};

const createProps = (overrideProps: Partial<Props>): Props => ({
  canAddNewMembers: isBoolean(overrideProps.canAddNewMembers)
    ? overrideProps.canAddNewMembers
    : false,
  conversationId: '123',
  i18n,
  memberships: overrideProps.memberships || [],
  preferredBadgeByConversation:
    overrideProps.preferredBadgeByConversation ||
    (overrideProps.memberships || []).reduce(
      (result: Record<string, BadgeType>, { member }, index) =>
        (index + 1) % 3 === 0
          ? {
              ...result,
              [member.id]: getFakeBadge({ alternate: index % 2 !== 0 }),
            }
          : result,
      {}
    ),
  showContactModal: action('showContactModal'),
  startAddingNewMembers: action('startAddingNewMembers'),
  theme: ThemeType.light,
});

story.add('Few', () => {
  const memberships = createMemberships(3);

  const props = createProps({ memberships });

  return <ConversationDetailsMembershipList {...props} />;
});

story.add('Limit', () => {
  const memberships = createMemberships(5);

  const props = createProps({ memberships });

  return <ConversationDetailsMembershipList {...props} />;
});

story.add('Limit +1', () => {
  const memberships = createMemberships(6);

  const props = createProps({ memberships });

  return <ConversationDetailsMembershipList {...props} />;
});

story.add('Limit +2', () => {
  const memberships = createMemberships(7);

  const props = createProps({ memberships });

  return <ConversationDetailsMembershipList {...props} />;
});

story.add('Many', () => {
  const memberships = createMemberships(100);

  const props = createProps({ memberships });

  return <ConversationDetailsMembershipList {...props} />;
});

story.add('None', () => {
  const props = createProps({ memberships: [] });

  return <ConversationDetailsMembershipList {...props} />;
});

story.add('Can add new members', () => {
  const memberships = createMemberships(10);

  const props = createProps({ canAddNewMembers: true, memberships });

  return <ConversationDetailsMembershipList {...props} />;
});
