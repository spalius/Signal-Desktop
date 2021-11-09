// Copyright 2020-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import * as React from 'react';
import { times } from 'lodash';
import { storiesOf } from '@storybook/react';
import { boolean } from '@storybook/addon-knobs';
import { action } from '@storybook/addon-actions';

import { AvatarColors } from '../types/Colors';
import type { ConversationType } from '../state/ducks/conversations';
import type { PropsType } from './CallingPip';
import { CallingPip } from './CallingPip';
import type { ActiveCallType } from '../types/Calling';
import {
  CallMode,
  CallState,
  GroupCallConnectionState,
  GroupCallJoinState,
} from '../types/Calling';
import { getDefaultConversation } from '../test-both/helpers/getDefaultConversation';
import { fakeGetGroupCallVideoFrameSource } from '../test-both/helpers/fakeGetGroupCallVideoFrameSource';
import { setupI18n } from '../util/setupI18n';
import enMessages from '../../_locales/en/messages.json';

const i18n = setupI18n('en', enMessages);

const conversation: ConversationType = getDefaultConversation({
  id: '3051234567',
  avatarPath: undefined,
  color: AvatarColors[0],
  title: 'Rick Sanchez',
  name: 'Rick Sanchez',
  phoneNumber: '3051234567',
  profileName: 'Rick Sanchez',
});

const getCommonActiveCallData = () => ({
  conversation,
  hasLocalAudio: boolean('hasLocalAudio', true),
  hasLocalVideo: boolean('hasLocalVideo', false),
  isInSpeakerView: boolean('isInSpeakerView', false),
  joinedAt: Date.now(),
  outgoingRing: true,
  pip: true,
  settingsDialogOpen: false,
  showParticipantsList: false,
});

const defaultCall: ActiveCallType = {
  ...getCommonActiveCallData(),
  callMode: CallMode.Direct as CallMode.Direct,
  callState: CallState.Accepted,
  peekedParticipants: [],
  remoteParticipants: [
    { hasRemoteVideo: true, presenting: false, title: 'Arsene' },
  ],
};

const createProps = (overrideProps: Partial<PropsType> = {}): PropsType => ({
  activeCall: overrideProps.activeCall || defaultCall,
  getGroupCallVideoFrameSource: fakeGetGroupCallVideoFrameSource,
  hangUp: action('hang-up'),
  hasLocalVideo: boolean('hasLocalVideo', overrideProps.hasLocalVideo || false),
  i18n,
  setGroupCallVideoRequest: action('set-group-call-video-request'),
  setLocalPreview: action('set-local-preview'),
  setRendererCanvas: action('set-renderer-canvas'),
  togglePip: action('toggle-pip'),
  toggleSpeakerView: action('toggleSpeakerView'),
});

const story = storiesOf('Components/CallingPip', module);

story.add('Default', () => {
  const props = createProps({});
  return <CallingPip {...props} />;
});

story.add('Contact (with avatar and no video)', () => {
  const props = createProps({
    activeCall: {
      ...defaultCall,
      conversation: {
        ...conversation,
        avatarPath: 'https://www.fillmurray.com/64/64',
      },
      remoteParticipants: [
        { hasRemoteVideo: false, presenting: false, title: 'Julian' },
      ],
    },
  });
  return <CallingPip {...props} />;
});

story.add('Contact (no color)', () => {
  const props = createProps({
    activeCall: {
      ...defaultCall,
      conversation: {
        ...conversation,
        color: undefined,
      },
    },
  });
  return <CallingPip {...props} />;
});

story.add('Group Call', () => {
  const props = createProps({
    activeCall: {
      ...getCommonActiveCallData(),
      callMode: CallMode.Group as CallMode.Group,
      connectionState: GroupCallConnectionState.Connected,
      conversationsWithSafetyNumberChanges: [],
      groupMembers: times(3, () => getDefaultConversation()),
      joinState: GroupCallJoinState.Joined,
      maxDevices: 5,
      deviceCount: 0,
      peekedParticipants: [],
      remoteParticipants: [],
    },
  });
  return <CallingPip {...props} />;
});
