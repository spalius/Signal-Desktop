// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { assert } from 'chai';
import sinon from 'sinon';
import { ConversationModel } from '../models/conversations';
import type { ConversationAttributesType } from '../model-types.d';
import type SendMessage from '../textsecure/SendMessage';
import { UUID } from '../types/UUID';

import { updateConversationsWithUuidLookup } from '../updateConversationsWithUuidLookup';

describe('updateConversationsWithUuidLookup', () => {
  class FakeConversationController {
    constructor(
      private readonly conversations: Array<ConversationModel> = []
    ) {}

    get(id?: string | null): ConversationModel | undefined {
      return this.conversations.find(
        conversation =>
          conversation.id === id ||
          conversation.get('e164') === id ||
          conversation.get('uuid') === id
      );
    }

    ensureContactIds({
      e164,
      uuid: uuidFromServer,
      highTrust,
    }: {
      e164?: string | null;
      uuid?: string | null;
      highTrust?: boolean;
    }): string | undefined {
      assert(
        e164,
        'FakeConversationController is not set up for this case (E164 must be provided)'
      );
      assert(
        uuidFromServer,
        'FakeConversationController is not set up for this case (UUID must be provided)'
      );
      assert(
        highTrust,
        'FakeConversationController is not set up for this case (must be "high trust")'
      );
      const normalizedUuid = uuidFromServer!.toLowerCase();

      const convoE164 = this.get(e164);
      const convoUuid = this.get(normalizedUuid);
      assert(
        convoE164 || convoUuid,
        'FakeConversationController is not set up for this case (at least one conversation should be found)'
      );

      if (convoE164 && convoUuid) {
        if (convoE164 === convoUuid) {
          return convoUuid.get('id');
        }

        convoE164.unset('e164');
        convoUuid.updateE164(e164);
        return convoUuid.get('id');
      }

      if (convoE164 && !convoUuid) {
        convoE164.updateUuid(normalizedUuid);
        return convoE164.get('id');
      }

      assert.fail('FakeConversationController should never get here');
      return undefined;
    }
  }

  function createConversation(
    attributes: Readonly<Partial<ConversationAttributesType>> = {}
  ): ConversationModel {
    return new ConversationModel({
      id: UUID.generate().toString(),
      inbox_position: 0,
      isPinned: false,
      lastMessageDeletedForEveryone: false,
      markedUnread: false,
      messageCount: 1,
      profileSharing: true,
      sentMessageCount: 0,
      type: 'private' as const,
      version: 0,
      ...attributes,
    });
  }

  let sinonSandbox: sinon.SinonSandbox;

  let fakeGetUuidsForE164s: sinon.SinonStub;
  let fakeMessaging: Pick<SendMessage, 'getUuidsForE164s'>;

  beforeEach(() => {
    sinonSandbox = sinon.createSandbox();

    sinonSandbox.stub(window.Signal.Data, 'updateConversation');

    fakeGetUuidsForE164s = sinonSandbox.stub().resolves({});
    fakeMessaging = { getUuidsForE164s: fakeGetUuidsForE164s };
  });

  afterEach(() => {
    sinonSandbox.restore();
  });

  it('does nothing when called with an empty array', async () => {
    await updateConversationsWithUuidLookup({
      conversationController: new FakeConversationController(),
      conversations: [],
      messaging: fakeMessaging,
    });

    sinon.assert.notCalled(fakeMessaging.getUuidsForE164s as sinon.SinonStub);
  });

  it('does nothing when called with an array of conversations that lack E164s', async () => {
    await updateConversationsWithUuidLookup({
      conversationController: new FakeConversationController(),
      conversations: [
        createConversation(),
        createConversation({ uuid: UUID.generate().toString() }),
      ],
      messaging: fakeMessaging,
    });

    sinon.assert.notCalled(fakeMessaging.getUuidsForE164s as sinon.SinonStub);
  });

  it('updates conversations with their UUID', async () => {
    const conversation1 = createConversation({ e164: '+13215559876' });
    const conversation2 = createConversation({
      e164: '+16545559876',
      uuid: UUID.generate().toString(), // should be overwritten
    });

    const uuid1 = UUID.generate().toString();
    const uuid2 = UUID.generate().toString();

    fakeGetUuidsForE164s.resolves({
      '+13215559876': uuid1,
      '+16545559876': uuid2,
    });

    await updateConversationsWithUuidLookup({
      conversationController: new FakeConversationController([
        conversation1,
        conversation2,
      ]),
      conversations: [conversation1, conversation2],
      messaging: fakeMessaging,
    });

    assert.strictEqual(conversation1.get('uuid'), uuid1);
    assert.strictEqual(conversation2.get('uuid'), uuid2);
  });

  it("marks conversations unregistered if we didn't have a UUID for them and the server also doesn't have one", async () => {
    const conversation = createConversation({ e164: '+13215559876' });
    assert.isUndefined(
      conversation.get('discoveredUnregisteredAt'),
      'Test was not set up correctly'
    );

    fakeGetUuidsForE164s.resolves({ '+13215559876': null });

    await updateConversationsWithUuidLookup({
      conversationController: new FakeConversationController([conversation]),
      conversations: [conversation],
      messaging: fakeMessaging,
    });

    assert.approximately(
      conversation.get('discoveredUnregisteredAt') || 0,
      Date.now(),
      5000
    );
  });

  it("doesn't mark conversations unregistered if we already had a UUID for them, even if the server doesn't return one", async () => {
    const existingUuid = UUID.generate().toString();
    const conversation = createConversation({
      e164: '+13215559876',
      uuid: existingUuid,
    });
    assert.isUndefined(
      conversation.get('discoveredUnregisteredAt'),
      'Test was not set up correctly'
    );

    fakeGetUuidsForE164s.resolves({ '+13215559876': null });

    await updateConversationsWithUuidLookup({
      conversationController: new FakeConversationController([conversation]),
      conversations: [conversation],
      messaging: fakeMessaging,
    });

    assert.strictEqual(conversation.get('uuid'), existingUuid);
    assert.isUndefined(conversation.get('discoveredUnregisteredAt'));
  });
});
