// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { FunctionComponent, ReactNode } from 'react';
import React from 'react';

import {
  BaseConversationListItem,
  HEADER_CONTACT_NAME_CLASS_NAME,
} from './BaseConversationListItem';
import type { ConversationType } from '../../state/ducks/conversations';
import type { LocalizerType } from '../../types/Util';
import { ContactName } from '../conversation/ContactName';
import { About } from '../conversation/About';

export enum ContactCheckboxDisabledReason {
  // We start the enum at 1 because the default starting value of 0 is falsy.
  AlreadyAdded = 1,
  MaximumContactsSelected,
  NotCapable,
}

export type PropsDataType = {
  disabledReason?: ContactCheckboxDisabledReason;
  isChecked: boolean;
} & Pick<
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
  onClick: (
    id: string,
    disabledReason: undefined | ContactCheckboxDisabledReason
  ) => void;
};

type PropsType = PropsDataType & PropsHousekeepingType;

export const ContactCheckbox: FunctionComponent<PropsType> = React.memo(
  function ContactCheckbox({
    about,
    acceptedMessageRequest,
    avatarPath,
    color,
    disabledReason,
    i18n,
    id,
    isChecked,
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
    const disabled = Boolean(disabledReason);

    const headerName = isMe ? (
      <span className={HEADER_CONTACT_NAME_CLASS_NAME}>
        {i18n('noteToSelf')}
      </span>
    ) : (
      <ContactName module={HEADER_CONTACT_NAME_CLASS_NAME} title={title} />
    );

    let messageText: ReactNode;
    if (disabledReason === ContactCheckboxDisabledReason.AlreadyAdded) {
      messageText = i18n('alreadyAMember');
    } else if (about) {
      messageText = <About className="" text={about} />;
    } else {
      messageText = null;
    }

    const onClickItem = () => {
      onClick(id, disabledReason);
    };

    return (
      <BaseConversationListItem
        acceptedMessageRequest={acceptedMessageRequest}
        avatarPath={avatarPath}
        checked={isChecked}
        color={color}
        conversationType={type}
        disabled={disabled}
        headerName={headerName}
        i18n={i18n}
        id={id}
        isMe={isMe}
        isSelected={false}
        messageText={messageText}
        name={name}
        onClick={onClickItem}
        phoneNumber={phoneNumber}
        profileName={profileName}
        sharedGroupNames={sharedGroupNames}
        title={title}
        unblurredAvatarPath={unblurredAvatarPath}
      />
    );
  }
);
