// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { ConversationAttributesType } from '../model-types.d';
import type { ConversationType } from '../state/ducks/conversations';
import * as Bytes from '../Bytes';
import * as log from '../logging/log';

export enum ConversationTypes {
  Me = 'Me',
  Direct = 'Direct',
  GroupV1 = 'GroupV1',
  GroupV2 = 'GroupV2',
}

export function isDirectConversation(
  conversationAttrs:
    | Pick<ConversationAttributesType, 'type'>
    | Pick<ConversationType, 'type'>
): boolean {
  return (
    conversationAttrs.type === 'private' || conversationAttrs.type === 'direct'
  );
}

export function isMe(conversationAttrs: ConversationAttributesType): boolean {
  const { e164, uuid } = conversationAttrs;
  const ourNumber = window.textsecure.storage.user.getNumber();
  const ourUuid = window.textsecure.storage.user.getUuid()?.toString();
  return Boolean((e164 && e164 === ourNumber) || (uuid && uuid === ourUuid));
}

export function isGroupV1(
  conversationAttrs: Pick<ConversationAttributesType, 'groupId'>
): boolean {
  const { groupId } = conversationAttrs;
  if (!groupId) {
    return false;
  }

  const buffer = Bytes.fromBinary(groupId);
  return buffer.byteLength === window.Signal.Groups.ID_V1_LENGTH;
}

export function isGroupV2(
  conversationAttrs: Pick<
    ConversationAttributesType,
    'groupId' | 'groupVersion'
  >
): boolean {
  const { groupId, groupVersion = 0 } = conversationAttrs;
  if (!groupId) {
    return false;
  }

  try {
    return (
      groupVersion === 2 &&
      Bytes.fromBase64(groupId).byteLength === window.Signal.Groups.ID_LENGTH
    );
  } catch (error) {
    log.error('isGroupV2: Failed to process groupId in base64!');
    return false;
  }
}

export function typeofConversation(
  conversationAttrs: ConversationAttributesType
): ConversationTypes | undefined {
  if (isMe(conversationAttrs)) {
    return ConversationTypes.Me;
  }

  if (isDirectConversation(conversationAttrs)) {
    return ConversationTypes.Direct;
  }

  if (isGroupV2(conversationAttrs)) {
    return ConversationTypes.GroupV2;
  }

  if (isGroupV1(conversationAttrs)) {
    return ConversationTypes.GroupV1;
  }

  return undefined;
}
