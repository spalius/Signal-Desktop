// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { ConversationType } from '../state/ducks/conversations';
import type { ProfileRequestDataType } from '../textsecure/WebAPI';
import { assert } from './assert';
import * as Bytes from '../Bytes';
import {
  PaddedLengths,
  encryptProfile,
  encryptProfileItemWithPadding,
} from '../Crypto';
import { deriveProfileKeyCommitment, deriveProfileKeyVersion } from './zkgroup';

export async function encryptProfileData(
  conversation: ConversationType,
  avatarBuffer?: Uint8Array
): Promise<[ProfileRequestDataType, Uint8Array | undefined]> {
  const {
    aboutEmoji,
    aboutText,
    familyName,
    firstName,
    profileKey,
    uuid,
  } = conversation;

  assert(profileKey, 'profileKey');
  assert(uuid, 'uuid');

  const keyBuffer = Bytes.fromBase64(profileKey);

  const fullName = [firstName, familyName].filter(Boolean).join('\0');

  const bytesName = encryptProfileItemWithPadding(
    Bytes.fromString(fullName),
    keyBuffer,
    PaddedLengths.Name
  );

  const bytesAbout = aboutText
    ? encryptProfileItemWithPadding(
        Bytes.fromString(aboutText),
        keyBuffer,
        PaddedLengths.About
      )
    : null;

  const bytesAboutEmoji = aboutEmoji
    ? encryptProfileItemWithPadding(
        Bytes.fromString(aboutEmoji),
        keyBuffer,
        PaddedLengths.AboutEmoji
      )
    : null;

  const encryptedAvatarData = avatarBuffer
    ? encryptProfile(avatarBuffer, keyBuffer)
    : undefined;

  const profileData = {
    version: deriveProfileKeyVersion(profileKey, uuid),
    name: Bytes.toBase64(bytesName),
    about: bytesAbout ? Bytes.toBase64(bytesAbout) : null,
    aboutEmoji: bytesAboutEmoji ? Bytes.toBase64(bytesAboutEmoji) : null,
    paymentAddress: window.storage.get('paymentAddress') || null,
    avatar: Boolean(avatarBuffer),
    commitment: deriveProfileKeyCommitment(profileKey, uuid),
  };

  return [profileData, encryptedAvatarData];
}
