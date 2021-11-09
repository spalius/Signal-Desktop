// Copyright 2019-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { omit } from 'lodash';

import { SignalService as Proto } from '../protobuf';
import type { MessageAttributesType } from '../model-types.d';

import { isNotNil } from '../util/isNotNil';
import {
  format as formatPhoneNumber,
  parse as parsePhoneNumber,
} from './PhoneNumber';
import type { AttachmentType, migrateDataToFileSystem } from './Attachment';
import { toLogFormat } from './errors';
import type { LoggerType } from './Logging';

export type EmbeddedContactType = {
  name?: Name;
  number?: Array<Phone>;
  email?: Array<Email>;
  address?: Array<PostalAddress>;
  avatar?: Avatar;
  organization?: string;

  // Populated by selector
  firstNumber?: string;
  isNumberOnSignal?: boolean;
};

type Name = {
  givenName?: string;
  familyName?: string;
  prefix?: string;
  suffix?: string;
  middleName?: string;
  displayName?: string;
};

export enum ContactFormType {
  HOME = 1,
  MOBILE = 2,
  WORK = 3,
  CUSTOM = 4,
}

export enum AddressType {
  HOME = 1,
  WORK = 2,
  CUSTOM = 3,
}

export type Phone = {
  value: string;
  type: ContactFormType;
  label?: string;
};

export type Email = {
  value: string;
  type: ContactFormType;
  label?: string;
};

export type PostalAddress = {
  type: AddressType;
  label?: string;
  street?: string;
  pobox?: string;
  neighborhood?: string;
  city?: string;
  region?: string;
  postcode?: string;
  country?: string;
};

export type Avatar = {
  avatar: AttachmentType;
  isProfile: boolean;
};

const DEFAULT_PHONE_TYPE = Proto.DataMessage.Contact.Phone.Type.HOME;
const DEFAULT_EMAIL_TYPE = Proto.DataMessage.Contact.Email.Type.HOME;
const DEFAULT_ADDRESS_TYPE = Proto.DataMessage.Contact.PostalAddress.Type.HOME;

export function embeddedContactSelector(
  contact: EmbeddedContactType,
  options: {
    regionCode: string;
    firstNumber?: string;
    isNumberOnSignal?: boolean;
    getAbsoluteAttachmentPath: (path: string) => string;
  }
): EmbeddedContactType {
  const {
    getAbsoluteAttachmentPath,
    firstNumber,
    isNumberOnSignal,
    regionCode,
  } = options;

  let { avatar } = contact;
  if (avatar && avatar.avatar) {
    if (avatar.avatar.error) {
      avatar = undefined;
    } else {
      avatar = {
        ...avatar,
        avatar: {
          ...avatar.avatar,
          path: avatar.avatar.path
            ? getAbsoluteAttachmentPath(avatar.avatar.path)
            : undefined,
        },
      };
    }
  }

  return {
    ...contact,
    firstNumber,
    isNumberOnSignal,
    avatar,
    number:
      contact.number &&
      contact.number.map(item => ({
        ...item,
        value: formatPhoneNumber(item.value, {
          ourRegionCode: regionCode,
        }),
      })),
  };
}

export function getName(contact: EmbeddedContactType): string | undefined {
  const { name, organization } = contact;
  const displayName = (name && name.displayName) || undefined;
  const givenName = (name && name.givenName) || undefined;
  const familyName = (name && name.familyName) || undefined;
  const backupName =
    (givenName && familyName && `${givenName} ${familyName}`) || undefined;

  return displayName || organization || backupName || givenName || familyName;
}

export function parseAndWriteAvatar(
  upgradeAttachment: typeof migrateDataToFileSystem
) {
  return async (
    contact: EmbeddedContactType,
    context: {
      message: MessageAttributesType;
      regionCode: string;
      logger: Pick<LoggerType, 'error'>;
      writeNewAttachmentData: (data: Uint8Array) => Promise<string>;
    }
  ): Promise<EmbeddedContactType> => {
    const { message, regionCode, logger } = context;
    const { avatar } = contact;

    const contactWithUpdatedAvatar =
      avatar && avatar.avatar
        ? {
            ...contact,
            avatar: {
              ...avatar,
              avatar: await upgradeAttachment(avatar.avatar, context),
            },
          }
        : omit(contact, ['avatar']);

    // eliminates empty numbers, emails, and addresses; adds type if not provided
    const parsedContact = parseContact(contactWithUpdatedAvatar, {
      regionCode,
    });

    const error = _validate(parsedContact, {
      messageId: idForLogging(message),
    });
    if (error) {
      logger.error(
        'parseAndWriteAvatar: contact was malformed.',
        toLogFormat(error)
      );
    }

    return parsedContact;
  };
}

function parseContact(
  contact: EmbeddedContactType,
  { regionCode }: { regionCode: string }
): EmbeddedContactType {
  const boundParsePhone = (phoneNumber: Phone): Phone | undefined =>
    parsePhoneItem(phoneNumber, { regionCode });

  const skipEmpty = <T>(arr: Array<T | undefined>): Array<T> | undefined => {
    const filtered: Array<T> = arr.filter(isNotNil);
    return filtered.length ? filtered : undefined;
  };

  const number = skipEmpty((contact.number || []).map(boundParsePhone));
  const email = skipEmpty((contact.email || []).map(parseEmailItem));
  const address = skipEmpty((contact.address || []).map(parseAddress));

  let result = {
    ...omit(contact, ['avatar', 'number', 'email', 'address']),
    ...parseAvatar(contact.avatar),
  };

  if (number) {
    result = { ...result, number };
  }
  if (email) {
    result = { ...result, email };
  }
  if (address) {
    result = { ...result, address };
  }
  return result;
}

function idForLogging(message: MessageAttributesType): string {
  return `${message.source}.${message.sourceDevice} ${message.sent_at}`;
}

// Exported for testing
export function _validate(
  contact: EmbeddedContactType,
  { messageId }: { messageId: string }
): Error | undefined {
  const { name, number, email, address, organization } = contact;

  if ((!name || !name.displayName) && !organization) {
    return new Error(
      `Message ${messageId}: Contact had neither 'displayName' nor 'organization'`
    );
  }

  if (
    (!number || !number.length) &&
    (!email || !email.length) &&
    (!address || !address.length)
  ) {
    return new Error(
      `Message ${messageId}: Contact had no included numbers, email or addresses`
    );
  }

  return undefined;
}

function parsePhoneItem(
  item: Phone,
  { regionCode }: { regionCode: string }
): Phone | undefined {
  if (!item.value) {
    return undefined;
  }

  return {
    ...item,
    type: item.type || DEFAULT_PHONE_TYPE,
    value: parsePhoneNumber(item.value, { regionCode }),
  };
}

function parseEmailItem(item: Email): Email | undefined {
  if (!item.value) {
    return undefined;
  }

  return { ...item, type: item.type || DEFAULT_EMAIL_TYPE };
}

function parseAddress(address: PostalAddress): PostalAddress | undefined {
  if (!address) {
    return undefined;
  }

  if (
    !address.street &&
    !address.pobox &&
    !address.neighborhood &&
    !address.city &&
    !address.region &&
    !address.postcode &&
    !address.country
  ) {
    return undefined;
  }

  return { ...address, type: address.type || DEFAULT_ADDRESS_TYPE };
}

function parseAvatar(avatar?: Avatar): { avatar: Avatar } | undefined {
  if (!avatar) {
    return undefined;
  }

  return {
    avatar: {
      ...avatar,
      isProfile: avatar.isProfile || false,
    },
  };
}
