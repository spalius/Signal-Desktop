// Copyright 2016-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { without } from 'lodash';

import type { StorageInterface } from '../../types/Storage.d';
import * as log from '../../logging/log';

const BLOCKED_NUMBERS_ID = 'blocked';
const BLOCKED_UUIDS_ID = 'blocked-uuids';
const BLOCKED_GROUPS_ID = 'blocked-groups';

export class Blocked {
  constructor(private readonly storage: StorageInterface) {}

  public getBlockedNumbers(): Array<string> {
    return this.storage.get(BLOCKED_NUMBERS_ID, new Array<string>());
  }

  public isBlocked(number: string): boolean {
    return this.getBlockedNumbers().includes(number);
  }

  public async addBlockedNumber(number: string): Promise<void> {
    const numbers = this.getBlockedNumbers();
    if (numbers.includes(number)) {
      return;
    }

    log.info('adding', number, 'to blocked list');
    await this.storage.put(BLOCKED_NUMBERS_ID, numbers.concat(number));
  }

  public async removeBlockedNumber(number: string): Promise<void> {
    const numbers = this.getBlockedNumbers();
    if (!numbers.includes(number)) {
      return;
    }

    log.info('removing', number, 'from blocked list');
    await this.storage.put(BLOCKED_NUMBERS_ID, without(numbers, number));
  }

  public getBlockedUuids(): Array<string> {
    return this.storage.get(BLOCKED_UUIDS_ID, new Array<string>());
  }

  public isUuidBlocked(uuid: string): boolean {
    return this.getBlockedUuids().includes(uuid);
  }

  public async addBlockedUuid(uuid: string): Promise<void> {
    const uuids = this.getBlockedUuids();
    if (uuids.includes(uuid)) {
      return;
    }

    log.info('adding', uuid, 'to blocked list');
    await this.storage.put(BLOCKED_UUIDS_ID, uuids.concat(uuid));
  }

  public async removeBlockedUuid(uuid: string): Promise<void> {
    const numbers = this.getBlockedUuids();
    if (!numbers.includes(uuid)) {
      return;
    }

    log.info('removing', uuid, 'from blocked list');
    await this.storage.put(BLOCKED_UUIDS_ID, without(numbers, uuid));
  }

  public getBlockedGroups(): Array<string> {
    return this.storage.get(BLOCKED_GROUPS_ID, new Array<string>());
  }

  public isGroupBlocked(groupId: string): boolean {
    return this.getBlockedGroups().includes(groupId);
  }

  public async addBlockedGroup(groupId: string): Promise<void> {
    const groupIds = this.getBlockedGroups();
    if (groupIds.includes(groupId)) {
      return;
    }

    log.info(`adding group(${groupId}) to blocked list`);
    await this.storage.put(BLOCKED_GROUPS_ID, groupIds.concat(groupId));
  }

  public async removeBlockedGroup(groupId: string): Promise<void> {
    const groupIds = this.getBlockedGroups();
    if (!groupIds.includes(groupId)) {
      return;
    }

    log.info(`removing group(${groupId} from blocked list`);
    await this.storage.put(BLOCKED_GROUPS_ID, without(groupIds, groupId));
  }
}
