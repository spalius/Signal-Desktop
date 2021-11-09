// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { last } from 'lodash';
import type { ReactChild } from 'react';
import React from 'react';

import { Intl } from '../Intl';
import type { ToFindType } from './LeftPaneHelper';
import { LeftPaneHelper } from './LeftPaneHelper';
import { getConversationInDirection } from './getConversationInDirection';
import type { Row } from '../ConversationList';
import { RowType } from '../ConversationList';
import type { PropsData as ConversationListItemPropsType } from '../conversationList/ConversationListItem';
import type { LocalizerType } from '../../types/Util';
import { handleKeydownForSearch } from './handleKeydownForSearch';

export type LeftPaneInboxPropsType = {
  conversations: ReadonlyArray<ConversationListItemPropsType>;
  archivedConversations: ReadonlyArray<ConversationListItemPropsType>;
  pinnedConversations: ReadonlyArray<ConversationListItemPropsType>;
  isAboutToSearchInAConversation: boolean;
  startSearchCounter: number;
};

/* eslint-disable class-methods-use-this */

export class LeftPaneInboxHelper extends LeftPaneHelper<LeftPaneInboxPropsType> {
  private readonly conversations: ReadonlyArray<ConversationListItemPropsType>;

  private readonly archivedConversations: ReadonlyArray<ConversationListItemPropsType>;

  private readonly pinnedConversations: ReadonlyArray<ConversationListItemPropsType>;

  private readonly isAboutToSearchInAConversation: boolean;

  private readonly startSearchCounter: number;

  constructor({
    conversations,
    archivedConversations,
    pinnedConversations,
    isAboutToSearchInAConversation,
    startSearchCounter,
  }: Readonly<LeftPaneInboxPropsType>) {
    super();

    this.conversations = conversations;
    this.archivedConversations = archivedConversations;
    this.pinnedConversations = pinnedConversations;
    this.isAboutToSearchInAConversation = isAboutToSearchInAConversation;
    this.startSearchCounter = startSearchCounter;
  }

  getRowCount(): number {
    const headerCount = this.hasPinnedAndNonpinned() ? 2 : 0;
    const buttonCount = this.archivedConversations.length ? 1 : 0;
    return (
      headerCount +
      this.pinnedConversations.length +
      this.conversations.length +
      buttonCount
    );
  }

  getPreRowsNode({
    i18n,
  }: Readonly<{ i18n: LocalizerType }>): null | ReactChild {
    if (this.getRowCount() === 0) {
      return (
        <div className="module-left-pane__empty">
          <div>
            <Intl
              i18n={i18n}
              id="emptyInboxMessage"
              components={[
                <span>
                  <strong>{i18n('composeIcon')}</strong>
                  <span className="module-left-pane__empty--composer_icon">
                    <i className="module-left-pane__empty--composer_icon--icon" />
                  </span>
                </span>,
              ]}
            />
          </div>
        </div>
      );
    }

    return null;
  }

  getRow(rowIndex: number): undefined | Row {
    const { conversations, archivedConversations, pinnedConversations } = this;

    const archivedConversationsCount = archivedConversations.length;

    if (this.hasPinnedAndNonpinned()) {
      switch (rowIndex) {
        case 0:
          return {
            type: RowType.Header,
            i18nKey: 'LeftPane--pinned',
          };
        case pinnedConversations.length + 1:
          return {
            type: RowType.Header,
            i18nKey: 'LeftPane--chats',
          };
        case pinnedConversations.length + conversations.length + 2:
          if (archivedConversationsCount) {
            return {
              type: RowType.ArchiveButton,
              archivedConversationsCount,
            };
          }
          return undefined;
        default: {
          const pinnedConversation = pinnedConversations[rowIndex - 1];
          if (pinnedConversation) {
            return {
              type: RowType.Conversation,
              conversation: pinnedConversation,
            };
          }
          const conversation =
            conversations[rowIndex - pinnedConversations.length - 2];
          return conversation
            ? {
                type: RowType.Conversation,
                conversation,
              }
            : undefined;
        }
      }
    }

    const onlyConversations = pinnedConversations.length
      ? pinnedConversations
      : conversations;
    if (rowIndex < onlyConversations.length) {
      const conversation = onlyConversations[rowIndex];
      return conversation
        ? {
            type: RowType.Conversation,
            conversation,
          }
        : undefined;
    }

    if (rowIndex === onlyConversations.length && archivedConversationsCount) {
      return {
        type: RowType.ArchiveButton,
        archivedConversationsCount,
      };
    }

    return undefined;
  }

  getRowIndexToScrollTo(
    selectedConversationId: undefined | string
  ): undefined | number {
    if (!selectedConversationId) {
      return undefined;
    }

    const isConversationSelected = (
      conversation: Readonly<ConversationListItemPropsType>
    ) => conversation.id === selectedConversationId;
    const hasHeaders = this.hasPinnedAndNonpinned();

    const pinnedConversationIndex = this.pinnedConversations.findIndex(
      isConversationSelected
    );
    if (pinnedConversationIndex !== -1) {
      const headerOffset = hasHeaders ? 1 : 0;
      return pinnedConversationIndex + headerOffset;
    }

    const conversationIndex = this.conversations.findIndex(
      isConversationSelected
    );
    if (conversationIndex !== -1) {
      const pinnedOffset = this.pinnedConversations.length;
      const headerOffset = hasHeaders ? 2 : 0;
      return conversationIndex + pinnedOffset + headerOffset;
    }

    return undefined;
  }

  requiresFullWidth(): boolean {
    const hasNoConversations =
      !this.conversations.length &&
      !this.pinnedConversations.length &&
      !this.archivedConversations.length;
    return (
      hasNoConversations ||
      this.isAboutToSearchInAConversation ||
      Boolean(this.startSearchCounter)
    );
  }

  shouldRecomputeRowHeights(old: Readonly<LeftPaneInboxPropsType>): boolean {
    return old.pinnedConversations.length !== this.pinnedConversations.length;
  }

  getConversationAndMessageAtIndex(
    conversationIndex: number
  ): undefined | { conversationId: string } {
    const { conversations, pinnedConversations } = this;
    const conversation =
      pinnedConversations[conversationIndex] ||
      conversations[conversationIndex - pinnedConversations.length] ||
      last(conversations) ||
      last(pinnedConversations);
    return conversation ? { conversationId: conversation.id } : undefined;
  }

  getConversationAndMessageInDirection(
    toFind: Readonly<ToFindType>,
    selectedConversationId: undefined | string,
    _selectedMessageId: unknown
  ): undefined | { conversationId: string } {
    return getConversationInDirection(
      [...this.pinnedConversations, ...this.conversations],
      toFind,
      selectedConversationId
    );
  }

  onKeyDown(
    event: KeyboardEvent,
    options: Readonly<{
      searchInConversation: (conversationId: string) => unknown;
      selectedConversationId: undefined | string;
      startSearch: () => unknown;
    }>
  ): void {
    handleKeydownForSearch(event, options);
  }

  private hasPinnedAndNonpinned(): boolean {
    return Boolean(
      this.pinnedConversations.length && this.conversations.length
    );
  }
}
