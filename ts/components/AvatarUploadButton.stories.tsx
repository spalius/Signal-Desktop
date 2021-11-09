// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import React from 'react';

import { storiesOf } from '@storybook/react';
import { action } from '@storybook/addon-actions';
import { setupI18n } from '../util/setupI18n';
import enMessages from '../../_locales/en/messages.json';

import type { PropsType } from './AvatarUploadButton';
import { AvatarUploadButton } from './AvatarUploadButton';

const i18n = setupI18n('en', enMessages);

const createProps = (overrideProps: Partial<PropsType> = {}): PropsType => ({
  className: overrideProps.className || '',
  i18n,
  onChange: action('onChange'),
});

const story = storiesOf('Components/AvatarUploadButton', module);

story.add('Default', () => <AvatarUploadButton {...createProps()} />);
