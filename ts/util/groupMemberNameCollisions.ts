// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { mapValues, pickBy } from 'lodash';
import { groupBy, map, filter } from './iterables';
import { getOwn } from './getOwn';
import type { ConversationType } from '../state/ducks/conversations';
import { isConversationNameKnown } from './isConversationNameKnown';
import { isInSystemContacts } from './isInSystemContacts';

export type GroupNameCollisionsWithIdsByTitle = Record<string, Array<string>>;
export type GroupNameCollisionsWithConversationsByTitle = Record<
  string,
  Array<ConversationType>
>;
export type GroupNameCollisionsWithTitlesById = Record<string, string>;

export const dehydrateCollisionsWithConversations = (
  withConversations: Readonly<GroupNameCollisionsWithConversationsByTitle>
): GroupNameCollisionsWithIdsByTitle =>
  mapValues(withConversations, conversations => conversations.map(c => c.id));

export function getCollisionsFromMemberships(
  memberships: Iterable<{ member: ConversationType }>
): GroupNameCollisionsWithConversationsByTitle {
  const members = map(memberships, membership => membership.member);
  const candidateMembers = filter(
    members,
    member => !member.isMe && isConversationNameKnown(member)
  );
  const groupedByTitle = groupBy(candidateMembers, member => member.title);
  // This cast is here because `pickBy` returns a `Partial`, which is incompatible with
  //   `Record`. [This demonstates the problem][0], but I don't believe it's an actual
  //   issue in the code.
  //
  // Alternatively, we could filter undefined keys or something like that.
  //
  // [0]: https://www.typescriptlang.org/play?#code/C4TwDgpgBAYg9nKBeKAFAhgJ2AS3QGwB4AlCAYzkwBNCBnYTHAOwHMAaKJgVwFsAjCJgB8QgNwAoCk3pQAZgC5YCZFADeUABY5FAVigBfCeNCQoAISwrSFanQbN2nXgOESpMvoouYVs0UA
  return (pickBy(
    groupedByTitle,
    group =>
      group.length >= 2 && !group.every(person => isInSystemContacts(person))
  ) as unknown) as GroupNameCollisionsWithConversationsByTitle;
}

/**
 * Returns `true` if the user should see a group member name collision warning, and
 * `false` otherwise. Users should see these warnings if any collisions appear that they
 * haven't dismissed.
 */
export const hasUnacknowledgedCollisions = (
  previous: Readonly<GroupNameCollisionsWithIdsByTitle>,
  current: Readonly<GroupNameCollisionsWithIdsByTitle>
): boolean =>
  Object.entries(current).some(([title, currentIds]) => {
    const previousIds = new Set(getOwn(previous, title) || []);
    return currentIds.some(currentId => !previousIds.has(currentId));
  });

export const invertIdsByTitle = (
  idsByTitle: Readonly<GroupNameCollisionsWithIdsByTitle>
): GroupNameCollisionsWithTitlesById => {
  const result: GroupNameCollisionsWithTitlesById = Object.create(null);
  Object.entries(idsByTitle).forEach(([title, ids]) => {
    ids.forEach(id => {
      result[id] = title;
    });
  });
  return result;
};
