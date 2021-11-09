// Copyright 2019-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { createSelector } from 'reselect';

import type { StateType } from '../reducer';
import type { AccountsStateType } from '../ducks/accounts';

export const getAccounts = (state: StateType): AccountsStateType =>
  state.accounts;

export type AccountSelectorType = (identifier?: string) => boolean;
export const getAccountSelector = createSelector(
  getAccounts,
  (accounts: AccountsStateType): AccountSelectorType => {
    return (identifier?: string) => {
      if (!identifier) {
        return false;
      }

      return accounts.accounts[identifier] || false;
    };
  }
);
