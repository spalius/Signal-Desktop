// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { FunctionComponent } from 'react';
import React from 'react';

import {
  BaseConversationListItem,
  HEADER_CONTACT_NAME_CLASS_NAME,
} from './BaseConversationListItem';
import type { ConversationType } from '../../state/ducks/conversations';
import type { LocalizerType } from '../../types/Util';
import { ContactName } from '../conversation/ContactName';
import { About } from '../conversation/About';

export type PropsDataType = Pick<
  ConversationType,
  | 'about'
  | 'acceptedMessageRequest'
  | 'avatarPath'
  | 'color'
  | 'id'
  | 'isMe'
  | 'name'
  | 'phoneNumber'
  | 'profileName'
  | 'sharedGroupNames'
  | 'title'
  | 'type'
  | 'unblurredAvatarPath'
>;

type PropsHousekeepingType = {
  i18n: LocalizerType;
  onClick?: (id: string) => void;
};

type PropsType = PropsDataType & PropsHousekeepingType;

export const ContactListItem: FunctionComponent<PropsType> = React.memo(
  function ContactListItem({
    about,
    acceptedMessageRequest,
    avatarPath,
    color,
    i18n,
    id,
    isMe,
    name,
    onClick,
    phoneNumber,
    profileName,
    sharedGroupNames,
    title,
    type,
    unblurredAvatarPath,
  }) {
    const headerName = isMe ? (
      <span className={HEADER_CONTACT_NAME_CLASS_NAME}>
        {i18n('noteToSelf')}
      </span>
    ) : (
      <ContactName module={HEADER_CONTACT_NAME_CLASS_NAME} title={title} />
    );

    const messageText =
      about && !isMe ? <About className="" text={about} /> : null;

    return (
      <BaseConversationListItem
        acceptedMessageRequest={acceptedMessageRequest}
        avatarPath={avatarPath}
        color={color}
        conversationType={type}
        headerName={headerName}
        i18n={i18n}
        id={id}
        isMe={isMe}
        isSelected={false}
        messageText={messageText}
        name={name}
        onClick={onClick ? () => onClick(id) : undefined}
        phoneNumber={phoneNumber}
        profileName={profileName}
        sharedGroupNames={sharedGroupNames}
        title={title}
        unblurredAvatarPath={unblurredAvatarPath}
      />
    );
  }
);
