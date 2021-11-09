// Copyright 2020-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import * as React from 'react';

import { storiesOf } from '@storybook/react';
import { action } from '@storybook/addon-actions';

import { gifUrl } from '../storybook/Fixtures';
import { setupI18n } from '../util/setupI18n';
import enMessages from '../../_locales/en/messages.json';
import { ContactListItem } from './ContactListItem';
import { getRandomColor } from '../test-both/helpers/getRandomColor';

const i18n = setupI18n('en', enMessages);
const onClick = action('onClick');

storiesOf('Components/ContactListItem', module)
  .add("It's me!", () => {
    return (
      <ContactListItem
        type="direct"
        acceptedMessageRequest
        i18n={i18n}
        isMe
        title="Someone 🔥 Somewhere"
        name="Someone 🔥 Somewhere"
        phoneNumber="(202) 555-0011"
        profileName="🔥Flames🔥"
        sharedGroupNames={[]}
        avatarPath={gifUrl}
        onClick={onClick}
      />
    );
  })
  .add('With name and profile (note vertical spacing)', () => {
    return (
      <div>
        <ContactListItem
          type="direct"
          acceptedMessageRequest
          i18n={i18n}
          isMe={false}
          title="Someone 🔥 Somewhere"
          name="Someone 🔥 Somewhere"
          phoneNumber="(202) 555-0011"
          profileName="🔥Flames🔥"
          sharedGroupNames={[]}
          about="👍 Free to chat"
          avatarPath={gifUrl}
          onClick={onClick}
        />
        <ContactListItem
          type="direct"
          acceptedMessageRequest
          i18n={i18n}
          isMe={false}
          title="Another ❄️ Yes"
          name="Another ❄️ Yes"
          phoneNumber="(202) 555-0011"
          profileName="❄️Ice❄️"
          sharedGroupNames={[]}
          about="🙏 Be kind"
          avatarPath={gifUrl}
          onClick={onClick}
        />
      </div>
    );
  })
  .add('With name and profile, admin', () => {
    return (
      <ContactListItem
        type="direct"
        acceptedMessageRequest
        i18n={i18n}
        isMe={false}
        isAdmin
        title="Someone 🔥 Somewhere"
        name="Someone 🔥 Somewhere"
        phoneNumber="(202) 555-0011"
        profileName="🔥Flames🔥"
        sharedGroupNames={[]}
        about="👍 This is my really long status message that I have in order to test line breaking"
        avatarPath={gifUrl}
        onClick={onClick}
      />
    );
  })
  .add('With a group with no avatarPath', () => {
    return (
      <ContactListItem
        type="group"
        i18n={i18n}
        isMe={false}
        isAdmin
        title="Group!"
        sharedGroupNames={[]}
        acceptedMessageRequest
        about="👍 Free to chat"
        onClick={onClick}
      />
    );
  })
  .add('With just number, admin', () => {
    return (
      <ContactListItem
        type="direct"
        acceptedMessageRequest
        i18n={i18n}
        isMe={false}
        isAdmin
        title="(202) 555-0011"
        phoneNumber="(202) 555-0011"
        sharedGroupNames={[]}
        about="👍 Free to chat"
        avatarPath={gifUrl}
        onClick={onClick}
      />
    );
  })
  .add('With name and profile, no avatar', () => {
    return (
      <ContactListItem
        type="direct"
        acceptedMessageRequest
        i18n={i18n}
        isMe={false}
        title="Someone 🔥 Somewhere"
        name="Someone 🔥 Somewhere"
        color={getRandomColor()}
        phoneNumber="(202) 555-0011"
        profileName="🔥Flames🔥"
        sharedGroupNames={[]}
        about="👍 Free to chat"
        onClick={onClick}
      />
    );
  })
  .add('Profile, no name, no avatar', () => {
    return (
      <ContactListItem
        type="direct"
        acceptedMessageRequest
        color={getRandomColor()}
        i18n={i18n}
        isMe={false}
        phoneNumber="(202) 555-0011"
        title="🔥Flames🔥"
        profileName="🔥Flames🔥"
        sharedGroupNames={[]}
        about="👍 Free to chat"
        onClick={onClick}
      />
    );
  })
  .add('No name, no profile, no avatar, no about', () => {
    return (
      <ContactListItem
        type="direct"
        acceptedMessageRequest
        i18n={i18n}
        isMe={false}
        phoneNumber="(202) 555-0011"
        sharedGroupNames={[]}
        title="(202) 555-0011"
        onClick={onClick}
      />
    );
  })
  .add('No name, no profile, no avatar', () => {
    return (
      <ContactListItem
        type="direct"
        acceptedMessageRequest
        i18n={i18n}
        isMe={false}
        title="(202) 555-0011"
        about="👍 Free to chat"
        sharedGroupNames={[]}
        phoneNumber="(202) 555-0011"
        onClick={onClick}
      />
    );
  })
  .add('No name, no profile, no number', () => {
    return (
      <ContactListItem
        type="direct"
        acceptedMessageRequest
        i18n={i18n}
        isMe={false}
        title="Unknown contact"
        sharedGroupNames={[]}
        onClick={onClick}
      />
    );
  });
