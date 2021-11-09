// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import React from 'react';

import { storiesOf } from '@storybook/react';
import { action } from '@storybook/addon-actions';
import { setupI18n } from '../util/setupI18n';
import enMessages from '../../_locales/en/messages.json';

import type { PropsType } from './AvatarIconEditor';
import { AvatarIconEditor } from './AvatarIconEditor';
import { GroupAvatarIcons, PersonalAvatarIcons } from '../types/Avatar';
import { AvatarColors } from '../types/Colors';
import { createAvatarData } from '../util/createAvatarData';

const i18n = setupI18n('en', enMessages);

const createProps = (overrideProps: Partial<PropsType> = {}): PropsType => ({
  avatarData: overrideProps.avatarData || createAvatarData({}),
  i18n,
  onClose: action('onClose'),
});

const story = storiesOf('Components/AvatarIconEditor', module);

story.add('Personal Icon', () => (
  <AvatarIconEditor
    {...createProps({
      avatarData: createAvatarData({
        color: AvatarColors[3],
        icon: PersonalAvatarIcons[0],
      }),
    })}
  />
));

story.add('Group Icon', () => (
  <AvatarIconEditor
    {...createProps({
      avatarData: createAvatarData({
        color: AvatarColors[8],
        icon: GroupAvatarIcons[0],
      }),
    })}
  />
));
