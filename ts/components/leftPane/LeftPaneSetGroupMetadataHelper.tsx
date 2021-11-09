// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { ReactChild } from 'react';
import React from 'react';

import { LeftPaneHelper } from './LeftPaneHelper';
import type { Row } from '../ConversationList';
import { RowType } from '../ConversationList';
import type { PropsDataType as ContactListItemPropsType } from '../conversationList/ContactListItem';
import { DisappearingTimerSelect } from '../DisappearingTimerSelect';
import type { LocalizerType } from '../../types/Util';
import { Alert } from '../Alert';
import { AvatarEditor } from '../AvatarEditor';
import { AvatarPreview } from '../AvatarPreview';
import { Spinner } from '../Spinner';
import { Button } from '../Button';
import { Modal } from '../Modal';
import { GroupTitleInput } from '../GroupTitleInput';
import type {
  AvatarDataType,
  DeleteAvatarFromDiskActionType,
  ReplaceAvatarActionType,
  SaveAvatarToDiskActionType,
} from '../../types/Avatar';
import { AvatarColors } from '../../types/Colors';

export type LeftPaneSetGroupMetadataPropsType = {
  groupAvatar: undefined | Uint8Array;
  groupName: string;
  groupExpireTimer: number;
  hasError: boolean;
  isCreating: boolean;
  isEditingAvatar: boolean;
  selectedContacts: ReadonlyArray<ContactListItemPropsType>;
  userAvatarData: ReadonlyArray<AvatarDataType>;
};

/* eslint-disable class-methods-use-this */

export class LeftPaneSetGroupMetadataHelper extends LeftPaneHelper<LeftPaneSetGroupMetadataPropsType> {
  private readonly groupAvatar: undefined | Uint8Array;

  private readonly groupName: string;

  private readonly groupExpireTimer: number;

  private readonly hasError: boolean;

  private readonly isCreating: boolean;

  private readonly isEditingAvatar: boolean;

  private readonly selectedContacts: ReadonlyArray<ContactListItemPropsType>;

  private readonly userAvatarData: ReadonlyArray<AvatarDataType>;

  constructor({
    groupAvatar,
    groupName,
    groupExpireTimer,
    hasError,
    isCreating,
    isEditingAvatar,
    selectedContacts,
    userAvatarData,
  }: Readonly<LeftPaneSetGroupMetadataPropsType>) {
    super();

    this.groupAvatar = groupAvatar;
    this.groupName = groupName;
    this.groupExpireTimer = groupExpireTimer;
    this.hasError = hasError;
    this.isCreating = isCreating;
    this.isEditingAvatar = isEditingAvatar;
    this.selectedContacts = selectedContacts;
    this.userAvatarData = userAvatarData;
  }

  getHeaderContents({
    i18n,
    showChooseGroupMembers,
  }: Readonly<{
    i18n: LocalizerType;
    showChooseGroupMembers: () => void;
  }>): ReactChild {
    const backButtonLabel = i18n('setGroupMetadata__back-button');

    return (
      <div className="module-left-pane__header__contents">
        <button
          aria-label={backButtonLabel}
          className="module-left-pane__header__contents__back-button"
          disabled={this.isCreating}
          onClick={this.getBackAction({ showChooseGroupMembers })}
          title={backButtonLabel}
          type="button"
        />
        <div className="module-left-pane__header__contents__text">
          {i18n('setGroupMetadata__title')}
        </div>
      </div>
    );
  }

  getBackAction({
    showChooseGroupMembers,
  }: {
    showChooseGroupMembers: () => void;
  }): undefined | (() => void) {
    return this.isCreating ? undefined : showChooseGroupMembers;
  }

  getPreRowsNode({
    clearGroupCreationError,
    composeDeleteAvatarFromDisk,
    composeReplaceAvatar,
    composeSaveAvatarToDisk,
    createGroup,
    i18n,
    setComposeGroupAvatar,
    setComposeGroupExpireTimer,
    setComposeGroupName,
    toggleComposeEditingAvatar,
  }: Readonly<{
    clearGroupCreationError: () => unknown;
    composeDeleteAvatarFromDisk: DeleteAvatarFromDiskActionType;
    composeReplaceAvatar: ReplaceAvatarActionType;
    composeSaveAvatarToDisk: SaveAvatarToDiskActionType;
    createGroup: () => unknown;
    i18n: LocalizerType;
    setComposeGroupAvatar: (_: undefined | Uint8Array) => unknown;
    setComposeGroupExpireTimer: (_: number) => void;
    setComposeGroupName: (_: string) => unknown;
    toggleComposeEditingAvatar: () => unknown;
  }>): ReactChild {
    const [avatarColor] = AvatarColors;
    const disabled = this.isCreating;

    return (
      <form
        className="module-left-pane__header__form"
        onSubmit={event => {
          event.preventDefault();
          event.stopPropagation();

          if (!this.canCreateGroup()) {
            return;
          }

          createGroup();
        }}
      >
        {this.isEditingAvatar && (
          <Modal
            hasStickyButtons
            hasXButton
            i18n={i18n}
            onClose={toggleComposeEditingAvatar}
            title={i18n('LeftPaneSetGroupMetadataHelper__avatar-modal-title')}
          >
            <AvatarEditor
              avatarColor={avatarColor}
              avatarValue={this.groupAvatar}
              deleteAvatarFromDisk={composeDeleteAvatarFromDisk}
              i18n={i18n}
              isGroup
              onCancel={toggleComposeEditingAvatar}
              onSave={newAvatar => {
                setComposeGroupAvatar(newAvatar);
                toggleComposeEditingAvatar();
              }}
              userAvatarData={this.userAvatarData}
              replaceAvatar={composeReplaceAvatar}
              saveAvatarToDisk={composeSaveAvatarToDisk}
            />
          </Modal>
        )}
        <AvatarPreview
          avatarColor={avatarColor}
          avatarValue={this.groupAvatar}
          i18n={i18n}
          isEditable
          isGroup
          onClick={toggleComposeEditingAvatar}
          style={{
            height: 96,
            margin: 0,
            width: 96,
          }}
        />
        <div className="module-GroupInput--container">
          <GroupTitleInput
            disabled={disabled}
            i18n={i18n}
            onChangeValue={setComposeGroupName}
            ref={focusRef}
            value={this.groupName}
          />
        </div>

        <section className="module-left-pane__header__form__expire-timer">
          <div className="module-left-pane__header__form__expire-timer__label">
            {i18n('disappearingMessages')}
          </div>
          <DisappearingTimerSelect
            i18n={i18n}
            value={this.groupExpireTimer}
            onChange={setComposeGroupExpireTimer}
          />
        </section>

        {this.hasError && (
          <Alert
            body={i18n('setGroupMetadata__error-message')}
            i18n={i18n}
            onClose={clearGroupCreationError}
          />
        )}
      </form>
    );
  }

  getFooterContents({
    createGroup,
    i18n,
  }: Readonly<{
    createGroup: () => unknown;
    i18n: LocalizerType;
  }>): ReactChild {
    return (
      <Button disabled={!this.canCreateGroup()} onClick={createGroup}>
        {this.isCreating ? (
          <Spinner size="20px" svgSize="small" direction="on-avatar" />
        ) : (
          i18n('setGroupMetadata__create-group')
        )}
      </Button>
    );
  }

  getRowCount(): number {
    if (!this.selectedContacts.length) {
      return 0;
    }
    return this.selectedContacts.length + 2;
  }

  getRow(rowIndex: number): undefined | Row {
    if (!this.selectedContacts.length) {
      return undefined;
    }

    if (rowIndex === 0) {
      return {
        type: RowType.Header,
        i18nKey: 'setGroupMetadata__members-header',
      };
    }

    // This puts a blank row for the footer.
    if (rowIndex === this.selectedContacts.length + 1) {
      return { type: RowType.Blank };
    }

    const contact = this.selectedContacts[rowIndex - 1];
    return contact
      ? {
          type: RowType.Contact,
          contact,
          isClickable: false,
        }
      : undefined;
  }

  // This is deliberately unimplemented because these keyboard shortcuts shouldn't work in
  //   the composer. The same is true for the "in direction" function below.
  getConversationAndMessageAtIndex(
    ..._args: ReadonlyArray<unknown>
  ): undefined {
    return undefined;
  }

  getConversationAndMessageInDirection(
    ..._args: ReadonlyArray<unknown>
  ): undefined {
    return undefined;
  }

  shouldRecomputeRowHeights(_old: unknown): boolean {
    return false;
  }

  private canCreateGroup(): boolean {
    return !this.isCreating && Boolean(this.groupName.trim());
  }
}

function focusRef(el: HTMLElement | null) {
  if (el) {
    el.focus();
  }
}
