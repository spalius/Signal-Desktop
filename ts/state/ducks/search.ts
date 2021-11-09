// Copyright 2019-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { ThunkAction, ThunkDispatch } from 'redux-thunk';
import { debounce, omit, reject } from 'lodash';

import type { StateType as RootStateType } from '../reducer';
import { cleanSearchTerm } from '../../util/cleanSearchTerm';
import type {
  ClientSearchResultMessageType,
  ClientInterface,
} from '../../sql/Interface';
import dataInterface from '../../sql/Client';
import { makeLookup } from '../../util/makeLookup';

import type {
  ConversationUnloadedActionType,
  DBConversationType,
  MessageDeletedActionType,
  MessageType,
  RemoveAllConversationsActionType,
  SelectedConversationChangedActionType,
  ShowArchivedConversationsActionType,
} from './conversations';
import { getQuery, getSearchConversation } from '../selectors/search';
import { getIntl, getUserConversationId } from '../selectors/user';

const {
  searchConversations: dataSearchConversations,
  searchMessages: dataSearchMessages,
  searchMessagesInConversation,
}: ClientInterface = dataInterface;

// State

export type MessageSearchResultType = MessageType & {
  snippet?: string;
};

export type MessageSearchResultLookupType = {
  [id: string]: MessageSearchResultType;
};

export type SearchStateType = {
  startSearchCounter: number;
  searchConversationId?: string;
  contactIds: Array<string>;
  conversationIds: Array<string>;
  query: string;
  messageIds: Array<string>;
  // We do store message data to pass through the selector
  messageLookup: MessageSearchResultLookupType;
  selectedMessage?: string;
  // Loading state
  discussionsLoading: boolean;
  messagesLoading: boolean;
};

// Actions

type SearchMessagesResultsFulfilledActionType = {
  type: 'SEARCH_MESSAGES_RESULTS_FULFILLED';
  payload: {
    messages: Array<MessageSearchResultType>;
    query: string;
  };
};
type SearchDiscussionsResultsFulfilledActionType = {
  type: 'SEARCH_DISCUSSIONS_RESULTS_FULFILLED';
  payload: {
    conversationIds: Array<string>;
    contactIds: Array<string>;
    query: string;
  };
};
type UpdateSearchTermActionType = {
  type: 'SEARCH_UPDATE';
  payload: {
    query: string;
  };
};
type StartSearchActionType = {
  type: 'SEARCH_START';
  payload: null;
};
type ClearSearchActionType = {
  type: 'SEARCH_CLEAR';
  payload: null;
};
type ClearConversationSearchActionType = {
  type: 'CLEAR_CONVERSATION_SEARCH';
  payload: null;
};
type SearchInConversationActionType = {
  type: 'SEARCH_IN_CONVERSATION';
  payload: { searchConversationId: string };
};

export type SearchActionType =
  | SearchMessagesResultsFulfilledActionType
  | SearchDiscussionsResultsFulfilledActionType
  | UpdateSearchTermActionType
  | StartSearchActionType
  | ClearSearchActionType
  | ClearConversationSearchActionType
  | SearchInConversationActionType
  | MessageDeletedActionType
  | RemoveAllConversationsActionType
  | SelectedConversationChangedActionType
  | ShowArchivedConversationsActionType
  | ConversationUnloadedActionType;

// Action Creators

export const actions = {
  startSearch,
  clearSearch,
  clearConversationSearch,
  searchInConversation,
  updateSearchTerm,
};

function startSearch(): StartSearchActionType {
  return {
    type: 'SEARCH_START',
    payload: null,
  };
}
function clearSearch(): ClearSearchActionType {
  return {
    type: 'SEARCH_CLEAR',
    payload: null,
  };
}
function clearConversationSearch(): ClearConversationSearchActionType {
  return {
    type: 'CLEAR_CONVERSATION_SEARCH',
    payload: null,
  };
}
function searchInConversation(
  searchConversationId: string
): SearchInConversationActionType {
  return {
    type: 'SEARCH_IN_CONVERSATION',
    payload: { searchConversationId },
  };
}

function updateSearchTerm(
  query: string
): ThunkAction<void, RootStateType, unknown, UpdateSearchTermActionType> {
  return (dispatch, getState) => {
    dispatch({
      type: 'SEARCH_UPDATE',
      payload: { query },
    });

    const state = getState();

    doSearch({
      dispatch,
      noteToSelf: getIntl(state)('noteToSelf').toLowerCase(),
      ourConversationId: getUserConversationId(state),
      query: getQuery(state),
      searchConversationId: getSearchConversation(state)?.id,
    });
  };
}

const doSearch = debounce(
  ({
    dispatch,
    noteToSelf,
    ourConversationId,
    query,
    searchConversationId,
  }: Readonly<{
    dispatch: ThunkDispatch<
      RootStateType,
      unknown,
      | SearchMessagesResultsFulfilledActionType
      | SearchDiscussionsResultsFulfilledActionType
    >;
    noteToSelf: string;
    ourConversationId: string;
    query: string;
    searchConversationId: undefined | string;
  }>) => {
    if (!query) {
      return;
    }

    (async () => {
      dispatch({
        type: 'SEARCH_MESSAGES_RESULTS_FULFILLED',
        payload: {
          messages: await queryMessages(query, searchConversationId),
          query,
        },
      });
    })();

    if (!searchConversationId) {
      (async () => {
        const {
          conversationIds,
          contactIds,
        } = await queryConversationsAndContacts(query, {
          ourConversationId,
          noteToSelf,
        });

        dispatch({
          type: 'SEARCH_DISCUSSIONS_RESULTS_FULFILLED',
          payload: {
            conversationIds,
            contactIds,
            query,
          },
        });
      })();
    }
  },
  200
);

async function queryMessages(
  query: string,
  searchConversationId?: string
): Promise<Array<ClientSearchResultMessageType>> {
  try {
    const normalized = cleanSearchTerm(query);
    if (normalized.length === 0) {
      return [];
    }

    if (searchConversationId) {
      return searchMessagesInConversation(normalized, searchConversationId);
    }

    return dataSearchMessages(normalized);
  } catch (e) {
    return [];
  }
}

async function queryConversationsAndContacts(
  providedQuery: string,
  options: {
    ourConversationId: string;
    noteToSelf: string;
  }
): Promise<{
  contactIds: Array<string>;
  conversationIds: Array<string>;
}> {
  const { ourConversationId, noteToSelf } = options;
  const query = providedQuery.replace(/[+.()]*/g, '');

  const searchResults: Array<DBConversationType> = await dataSearchConversations(
    query
  );

  // Split into two groups - active conversations and items just from address book
  let conversationIds: Array<string> = [];
  let contactIds: Array<string> = [];
  const max = searchResults.length;
  for (let i = 0; i < max; i += 1) {
    const conversation = searchResults[i];

    if (conversation.type === 'private' && !conversation.lastMessage) {
      contactIds.push(conversation.id);
    } else {
      conversationIds.push(conversation.id);
    }
  }

  // // @ts-ignore
  // console._log(
  //   '%cqueryConversationsAndContacts',
  //   'background:black;color:red;',
  //   { searchResults, conversations, ourNumber, ourUuid }
  // );

  // Inject synthetic Note to Self entry if query matches localized 'Note to Self'
  if (noteToSelf.indexOf(providedQuery.toLowerCase()) !== -1) {
    // ensure that we don't have duplicates in our results
    contactIds = contactIds.filter(id => id !== ourConversationId);
    conversationIds = conversationIds.filter(id => id !== ourConversationId);

    contactIds.unshift(ourConversationId);
  }

  return { conversationIds, contactIds };
}

// Reducer

export function getEmptyState(): SearchStateType {
  return {
    startSearchCounter: 0,
    query: '',
    messageIds: [],
    messageLookup: {},
    conversationIds: [],
    contactIds: [],
    discussionsLoading: false,
    messagesLoading: false,
  };
}

export function reducer(
  state: Readonly<SearchStateType> = getEmptyState(),
  action: Readonly<SearchActionType>
): SearchStateType {
  if (action.type === 'SHOW_ARCHIVED_CONVERSATIONS') {
    return getEmptyState();
  }

  if (action.type === 'SEARCH_START') {
    return {
      ...state,
      searchConversationId: undefined,
      startSearchCounter: state.startSearchCounter + 1,
    };
  }

  if (action.type === 'SEARCH_CLEAR') {
    return getEmptyState();
  }

  if (action.type === 'SEARCH_UPDATE') {
    const { payload } = action;
    const { query } = payload;

    const hasQuery = Boolean(query);
    const isWithinConversation = Boolean(state.searchConversationId);

    return {
      ...state,
      query,
      messagesLoading: hasQuery,
      ...(hasQuery
        ? {
            messageIds: [],
            messageLookup: {},
            discussionsLoading: !isWithinConversation,
            contactIds: [],
            conversationIds: [],
          }
        : {}),
    };
  }

  if (action.type === 'SEARCH_IN_CONVERSATION') {
    const { payload } = action;
    const { searchConversationId } = payload;

    if (searchConversationId === state.searchConversationId) {
      return {
        ...state,
        startSearchCounter: state.startSearchCounter + 1,
      };
    }

    return {
      ...getEmptyState(),
      searchConversationId,
      startSearchCounter: state.startSearchCounter + 1,
    };
  }
  if (action.type === 'CLEAR_CONVERSATION_SEARCH') {
    const { searchConversationId } = state;

    return {
      ...getEmptyState(),
      searchConversationId,
    };
  }

  if (action.type === 'SEARCH_MESSAGES_RESULTS_FULFILLED') {
    const { payload } = action;
    const { messages, query } = payload;

    // Reject if the associated query is not the most recent user-provided query
    if (state.query !== query) {
      return state;
    }

    const messageIds = messages.map(message => message.id);

    return {
      ...state,
      query,
      messageIds,
      messageLookup: makeLookup(messages, 'id'),
      messagesLoading: false,
    };
  }

  if (action.type === 'SEARCH_DISCUSSIONS_RESULTS_FULFILLED') {
    const { payload } = action;
    const { contactIds, conversationIds, query } = payload;

    // Reject if the associated query is not the most recent user-provided query
    if (state.query !== query) {
      return state;
    }

    return {
      ...state,
      contactIds,
      conversationIds,
      discussionsLoading: false,
    };
  }

  if (action.type === 'CONVERSATIONS_REMOVE_ALL') {
    return getEmptyState();
  }

  if (action.type === 'SELECTED_CONVERSATION_CHANGED') {
    const { payload } = action;
    const { id, messageId } = payload;
    const { searchConversationId } = state;

    if (searchConversationId && searchConversationId !== id) {
      return getEmptyState();
    }

    return {
      ...state,
      selectedMessage: messageId,
    };
  }

  if (action.type === 'CONVERSATION_UNLOADED') {
    const { payload } = action;
    const { id } = payload;
    const { searchConversationId } = state;

    if (searchConversationId && searchConversationId === id) {
      return getEmptyState();
    }

    return state;
  }

  if (action.type === 'MESSAGE_DELETED') {
    const { messageIds, messageLookup } = state;
    if (!messageIds || messageIds.length < 1) {
      return state;
    }

    const { payload } = action;
    const { id } = payload;

    return {
      ...state,
      messageIds: reject(messageIds, messageId => id === messageId),
      messageLookup: omit(messageLookup, id),
    };
  }

  return state;
}
