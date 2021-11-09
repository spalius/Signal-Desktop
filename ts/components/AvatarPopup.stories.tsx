// Copyright 2020-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import * as React from 'react';

import { storiesOf } from '@storybook/react';
import { action } from '@storybook/addon-actions';
import { boolean, select, text } from '@storybook/addon-knobs';

import type { Props } from './AvatarPopup';
import { AvatarPopup } from './AvatarPopup';
import type { AvatarColorType } from '../types/Colors';
import { AvatarColors } from '../types/Colors';
import { setupI18n } from '../util/setupI18n';
import enMessages from '../../_locales/en/messages.json';

const i18n = setupI18n('en', enMessages);

const colorMap: Record<string, AvatarColorType> = AvatarColors.reduce(
  (m, color) => ({
    ...m,
    [color]: color,
  }),
  {}
);

const conversationTypeMap: Record<string, Props['conversationType']> = {
  direct: 'direct',
  group: 'group',
};

const createProps = (overrideProps: Partial<Props> = {}): Props => ({
  acceptedMessageRequest: true,
  avatarPath: text('avatarPath', overrideProps.avatarPath || ''),
  color: select('color', colorMap, overrideProps.color || AvatarColors[0]),
  conversationType: select(
    'conversationType',
    conversationTypeMap,
    overrideProps.conversationType || 'direct'
  ),
  hasPendingUpdate: Boolean(overrideProps.hasPendingUpdate),
  i18n,
  isMe: true,
  name: text('name', overrideProps.name || ''),
  noteToSelf: boolean('noteToSelf', overrideProps.noteToSelf || false),
  onEditProfile: action('onEditProfile'),
  onViewArchive: action('onViewArchive'),
  onViewPreferences: action('onViewPreferences'),
  phoneNumber: text('phoneNumber', overrideProps.phoneNumber || ''),
  profileName: text('profileName', overrideProps.profileName || ''),
  sharedGroupNames: [],
  size: 80,
  startUpdate: action('startUpdate'),
  style: {},
  title: text('title', overrideProps.title || ''),
});

const stories = storiesOf('Components/Avatar Popup', module);

stories.add('Avatar Only', () => {
  const props = createProps();

  return <AvatarPopup {...props} />;
});

stories.add('Title', () => {
  const props = createProps({
    title: 'My Great Title',
  });

  return <AvatarPopup {...props} />;
});

stories.add('Profile Name', () => {
  const props = createProps({
    profileName: 'Sam Neill',
  });

  return <AvatarPopup {...props} />;
});

stories.add('Phone Number', () => {
  const props = createProps({
    profileName: 'Sam Neill',
    phoneNumber: '(555) 867-5309',
  });

  return <AvatarPopup {...props} />;
});

stories.add('Update Available', () => {
  const props = createProps({
    hasPendingUpdate: true,
  });

  return <AvatarPopup {...props} />;
});
