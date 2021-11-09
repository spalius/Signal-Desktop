// Copyright 2016-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/* eslint-disable max-classes-per-file */

import { isEqual } from 'lodash';
import { Collection, Model } from 'backbone';

import type { ConversationModel } from '../models/conversations';
import type { MessageModel } from '../models/messages';
import type { MessageModelCollectionType } from '../model-types.d';
import { isOutgoing } from '../state/selectors/message';
import { isDirectConversation } from '../util/whatTypeOfConversation';
import { getOwn } from '../util/getOwn';
import { missingCaseError } from '../util/missingCaseError';
import { createWaitBatcher } from '../util/waitBatcher';
import type { UUIDStringType } from '../types/UUID';
import {
  SendActionType,
  SendStatus,
  sendStateReducer,
} from '../messages/MessageSendState';
import type { DeleteSentProtoRecipientOptionsType } from '../sql/Interface';
import dataInterface from '../sql/Client';
import * as log from '../logging/log';

const { deleteSentProtoRecipient } = dataInterface;

export enum MessageReceiptType {
  Delivery = 'Delivery',
  Read = 'Read',
  View = 'View',
}

type MessageReceiptAttributesType = {
  messageSentAt: number;
  receiptTimestamp: number;
  sourceUuid: UUIDStringType;
  sourceConversationId: string;
  sourceDevice: number;
  type: MessageReceiptType;
};

class MessageReceiptModel extends Model<MessageReceiptAttributesType> {}

let singleton: MessageReceipts | undefined;

const deleteSentProtoBatcher = createWaitBatcher({
  name: 'deleteSentProtoBatcher',
  wait: 250,
  maxSize: 30,
  async processBatch(items: Array<DeleteSentProtoRecipientOptionsType>) {
    log.info(
      `MessageReceipts: Batching ${items.length} sent proto recipients deletes`
    );
    await deleteSentProtoRecipient(items);
  },
});

async function getTargetMessage(
  sourceId: string,
  sourceUuid: UUIDStringType,
  messages: MessageModelCollectionType
): Promise<MessageModel | null> {
  if (messages.length === 0) {
    return null;
  }
  const message = messages.find(
    item =>
      isOutgoing(item.attributes) && sourceId === item.get('conversationId')
  );
  if (message) {
    return window.MessageController.register(message.id, message);
  }

  const groups = await window.Signal.Data.getAllGroupsInvolvingUuid(
    sourceUuid,
    {
      ConversationCollection: window.Whisper.ConversationCollection,
    }
  );

  const ids = groups.pluck('id');
  ids.push(sourceId);

  const target = messages.find(
    item =>
      isOutgoing(item.attributes) && ids.includes(item.get('conversationId'))
  );
  if (!target) {
    return null;
  }

  return window.MessageController.register(target.id, target);
}

const wasDeliveredWithSealedSender = (
  conversationId: string,
  message: MessageModel
): boolean =>
  (message.get('unidentifiedDeliveries') || []).some(
    identifier =>
      window.ConversationController.getConversationId(identifier) ===
      conversationId
  );

export class MessageReceipts extends Collection<MessageReceiptModel> {
  static getSingleton(): MessageReceipts {
    if (!singleton) {
      singleton = new MessageReceipts();
    }

    return singleton;
  }

  forMessage(
    conversation: ConversationModel,
    message: MessageModel
  ): Array<MessageReceiptModel> {
    if (!isOutgoing(message.attributes)) {
      return [];
    }
    let ids: Array<string>;
    if (isDirectConversation(conversation.attributes)) {
      ids = [conversation.id];
    } else {
      ids = conversation.getMemberIds();
    }
    const receipts = this.filter(
      receipt =>
        receipt.get('messageSentAt') === message.get('sent_at') &&
        ids.includes(receipt.get('sourceConversationId'))
    );
    if (receipts.length) {
      log.info('Found early receipts for message');
      this.remove(receipts);
    }
    return receipts;
  }

  async onReceipt(receipt: MessageReceiptModel): Promise<void> {
    const type = receipt.get('type');
    const messageSentAt = receipt.get('messageSentAt');
    const sourceConversationId = receipt.get('sourceConversationId');
    const sourceUuid = receipt.get('sourceUuid');

    try {
      const messages = await window.Signal.Data.getMessagesBySentAt(
        messageSentAt,
        {
          MessageCollection: window.Whisper.MessageCollection,
        }
      );

      const message = await getTargetMessage(
        sourceConversationId,
        sourceUuid,
        messages
      );
      if (!message) {
        log.info(
          'No message for receipt',
          type,
          sourceConversationId,
          messageSentAt
        );
        return;
      }

      const oldSendStateByConversationId =
        message.get('sendStateByConversationId') || {};
      const oldSendState = getOwn(
        oldSendStateByConversationId,
        sourceConversationId
      ) ?? { status: SendStatus.Sent, updatedAt: undefined };

      let sendActionType: SendActionType;
      switch (type) {
        case MessageReceiptType.Delivery:
          sendActionType = SendActionType.GotDeliveryReceipt;
          break;
        case MessageReceiptType.Read:
          sendActionType = SendActionType.GotReadReceipt;
          break;
        case MessageReceiptType.View:
          sendActionType = SendActionType.GotViewedReceipt;
          break;
        default:
          throw missingCaseError(type);
      }

      const newSendState = sendStateReducer(oldSendState, {
        type: sendActionType,
        updatedAt: messageSentAt,
      });

      // The send state may not change. For example, this can happen if we get a read
      //   receipt before a delivery receipt.
      if (!isEqual(oldSendState, newSendState)) {
        message.set('sendStateByConversationId', {
          ...oldSendStateByConversationId,
          [sourceConversationId]: newSendState,
        });

        window.Signal.Util.queueUpdateMessage(message.attributes);

        // notify frontend listeners
        const conversation = window.ConversationController.get(
          message.get('conversationId')
        );
        const updateLeftPane = conversation
          ? conversation.debouncedUpdateLastMessage
          : undefined;
        if (updateLeftPane) {
          updateLeftPane();
        }
      }

      if (
        (type === MessageReceiptType.Delivery &&
          wasDeliveredWithSealedSender(sourceConversationId, message)) ||
        type === MessageReceiptType.Read
      ) {
        const recipient = window.ConversationController.get(
          sourceConversationId
        );
        const recipientUuid = recipient?.get('uuid');
        const deviceId = receipt.get('sourceDevice');

        if (recipientUuid && deviceId) {
          await deleteSentProtoBatcher.add({
            timestamp: messageSentAt,
            recipientUuid,
            deviceId,
          });
        } else {
          log.warn(
            `MessageReceipts.onReceipt: Missing uuid or deviceId for deliveredTo ${sourceConversationId}`
          );
        }
      }

      this.remove(receipt);
    } catch (error) {
      log.error(
        'MessageReceipts.onReceipt error:',
        error && error.stack ? error.stack : error
      );
    }
  }
}
