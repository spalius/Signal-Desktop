// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

// We prevent circular loops between ducks and selectors/components with `import type`.
//   For example, Selectors are used in action creators using thunk/getState, but those
//   Selectors need types from the ducks. Selectors shouldn't use code from ducks.
//
// But enums can be used as types but also as code. So we keep them out of the ducks.

export enum UsernameSaveState {
  None = 'None',
  Saving = 'Saving',
  UsernameTakenError = 'UsernameTakenError',
  UsernameMalformedError = 'UsernameMalformedError',
  GeneralError = 'GeneralError',
  DeleteFailed = 'DeleteFailed',
  Success = 'Success',
}

export enum ComposerStep {
  StartDirectConversation = 'StartDirectConversation',
  ChooseGroupMembers = 'ChooseGroupMembers',
  SetGroupMetadata = 'SetGroupMetadata',
}

export enum OneTimeModalState {
  NeverShown,
  Showing,
  Shown,
}
