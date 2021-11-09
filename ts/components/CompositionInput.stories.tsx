// Copyright 2020-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import * as React from 'react';

import 'react-quill/dist/quill.core.css';
import { boolean, select } from '@storybook/addon-knobs';
import { storiesOf } from '@storybook/react';
import { action } from '@storybook/addon-actions';

import { getDefaultConversation } from '../test-both/helpers/getDefaultConversation';
import type { Props } from './CompositionInput';
import { CompositionInput } from './CompositionInput';
import { setupI18n } from '../util/setupI18n';
import enMessages from '../../_locales/en/messages.json';

const i18n = setupI18n('en', enMessages);

const story = storiesOf('Components/CompositionInput', module);

const createProps = (overrideProps: Partial<Props> = {}): Props => ({
  i18n,
  conversationId: 'conversation-id',
  disabled: boolean('disabled', overrideProps.disabled || false),
  onSubmit: action('onSubmit'),
  onEditorStateChange: action('onEditorStateChange'),
  onTextTooLong: action('onTextTooLong'),
  draftText: overrideProps.draftText || undefined,
  draftBodyRanges: overrideProps.draftBodyRanges || [],
  clearQuotedMessage: action('clearQuotedMessage'),
  getQuotedMessage: action('getQuotedMessage'),
  onPickEmoji: action('onPickEmoji'),
  large: boolean('large', overrideProps.large || false),
  scrollToBottom: action('scrollToBottom'),
  sortedGroupMembers: overrideProps.sortedGroupMembers || [],
  skinTone: select(
    'skinTone',
    {
      skinTone0: 0,
      skinTone1: 1,
      skinTone2: 2,
      skinTone3: 3,
      skinTone4: 4,
      skinTone5: 5,
    },
    overrideProps.skinTone || undefined
  ),
});

story.add('Default', () => {
  const props = createProps();

  return <CompositionInput {...props} />;
});

story.add('Large', () => {
  const props = createProps({
    large: true,
  });

  return <CompositionInput {...props} />;
});

story.add('Disabled', () => {
  const props = createProps({
    disabled: true,
  });

  return <CompositionInput {...props} />;
});

story.add('Starting Text', () => {
  const props = createProps({
    draftText: "here's some starting text",
  });

  return <CompositionInput {...props} />;
});

story.add('Multiline Text', () => {
  const props = createProps({
    draftText: `here's some starting text
and more on another line
and yet another line
and yet another line
and yet another line
and yet another line
and yet another line
and yet another line
and we're done`,
  });

  return <CompositionInput {...props} />;
});

story.add('Emojis', () => {
  const props = createProps({
    draftText: `⁣😐😐😐😐😐😐😐
😐😐😐😐😐😐😐
😐😐😐😂⁣😐😐😐
😐😐😐😐😐😐😐
😐😐😐😐😐😐😐`,
  });

  return <CompositionInput {...props} />;
});

story.add('Mentions', () => {
  const props = createProps({
    sortedGroupMembers: [
      getDefaultConversation({
        title: 'Kate Beaton',
      }),
      getDefaultConversation({
        title: 'Parry Gripp',
      }),
    ],
    draftText: 'send _ a message',
    draftBodyRanges: [
      {
        start: 5,
        length: 1,
        mentionUuid: '0',
        replacementText: 'Kate Beaton',
      },
    ],
  });

  return <CompositionInput {...props} />;
});
