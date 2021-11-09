// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { FunctionComponent, ReactNode } from 'react';
import React from 'react';

import type { LocalizerType } from '../../../../types/Util';
import { assert } from '../../../../util/assert';
import { ModalHost } from '../../../ModalHost';
import { Button, ButtonVariant } from '../../../Button';
import { Spinner } from '../../../Spinner';
import type { ConversationType } from '../../../../state/ducks/conversations';
import { RequestState } from '../util';
import { Intl } from '../../../Intl';
import { Emojify } from '../../Emojify';
import { ContactName } from '../../ContactName';

type PropsType = {
  groupTitle: string;
  i18n: LocalizerType;
  makeRequest: () => void;
  onClose: () => void;
  requestState: RequestState;
  selectedContacts: ReadonlyArray<ConversationType>;
};

export const ConfirmAdditionsModal: FunctionComponent<PropsType> = ({
  groupTitle,
  i18n,
  makeRequest,
  onClose,
  requestState,
  selectedContacts,
}) => {
  const firstContact = selectedContacts[0];
  assert(
    firstContact,
    'Expected at least one conversation to be selected but none were picked'
  );

  const groupTitleNode: JSX.Element = <Emojify text={groupTitle} />;

  let headerText: ReactNode;
  if (selectedContacts.length === 1) {
    headerText = (
      <Intl
        i18n={i18n}
        id="AddGroupMembersModal--confirm-title--one"
        components={{
          person: <ContactName title={firstContact.title} />,
          group: groupTitleNode,
        }}
      />
    );
  } else {
    headerText = (
      <Intl
        i18n={i18n}
        id="AddGroupMembersModal--confirm-title--many"
        components={{
          count: selectedContacts.length.toString(),
          group: groupTitleNode,
        }}
      />
    );
  }

  let buttonContents: ReactNode;
  if (requestState === RequestState.Active) {
    buttonContents = (
      <Spinner size="20px" svgSize="small" direction="on-avatar" />
    );
  } else if (selectedContacts.length === 1) {
    buttonContents = i18n('AddGroupMembersModal--confirm-button--one');
  } else {
    buttonContents = i18n('AddGroupMembersModal--confirm-button--many');
  }

  return (
    <ModalHost onClose={onClose}>
      <div className="module-AddGroupMembersModal module-AddGroupMembersModal--confirm-adds">
        <h1 className="module-AddGroupMembersModal__header">{headerText}</h1>
        {requestState === RequestState.InactiveWithError && (
          <div className="module-AddGroupMembersModal__error-message">
            {i18n('updateGroupAttributes__error-message')}
          </div>
        )}
        <div className="module-AddGroupMembersModal__button-container">
          <Button onClick={onClose} variant={ButtonVariant.Secondary}>
            {i18n('cancel')}
          </Button>

          <Button
            disabled={requestState === RequestState.Active}
            onClick={makeRequest}
            variant={ButtonVariant.Primary}
          >
            {buttonContents}
          </Button>
        </div>
      </div>
    </ModalHost>
  );
};
