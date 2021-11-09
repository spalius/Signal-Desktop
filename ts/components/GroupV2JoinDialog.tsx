// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import * as React from 'react';
import classNames from 'classnames';
import type { LocalizerType } from '../types/Util';
import { Avatar, AvatarBlur } from './Avatar';
import { Spinner } from './Spinner';
import { Button, ButtonVariant } from './Button';
import { GroupDescription } from './conversation/GroupDescription';

import type { PreJoinConversationType } from '../state/ducks/conversations';

type CallbackType = () => unknown;

export type DataPropsType = PreJoinConversationType & {
  readonly join: CallbackType;
  readonly onClose: CallbackType;
};

export type HousekeepingPropsType = {
  readonly i18n: LocalizerType;
};

export type PropsType = DataPropsType & HousekeepingPropsType;

function focusRef(el: HTMLElement | null) {
  if (el) {
    el.focus();
  }
}

export const GroupV2JoinDialog = React.memo((props: PropsType) => {
  const [isWorking, setIsWorking] = React.useState(false);
  const [isJoining, setIsJoining] = React.useState(false);
  const {
    approvalRequired,
    avatar,
    groupDescription,
    i18n,
    join,
    memberCount,
    onClose,
    title,
  } = props;

  const joinString = approvalRequired
    ? i18n('GroupV2--join--request-to-join-button')
    : i18n('GroupV2--join--join-button');
  const memberString =
    memberCount === 1
      ? i18n('GroupV2--join--member-count--single')
      : i18n('GroupV2--join--member-count--multiple', {
          count: memberCount.toString(),
        });

  const wrappedJoin = React.useCallback(() => {
    setIsWorking(true);
    setIsJoining(true);
    join();
  }, [join, setIsJoining, setIsWorking]);

  const wrappedClose = React.useCallback(() => {
    setIsWorking(true);
    onClose();
  }, [onClose, setIsWorking]);

  return (
    <div className="module-group-v2-join-dialog">
      <button
        aria-label={i18n('close')}
        type="button"
        disabled={isWorking}
        className="module-group-v2-join-dialog__close-button"
        onClick={wrappedClose}
      />
      <div className="module-group-v2-join-dialog__avatar">
        <Avatar
          acceptedMessageRequest={false}
          avatarPath={avatar ? avatar.url : undefined}
          blur={AvatarBlur.NoBlur}
          loading={avatar && !avatar.url}
          conversationType="group"
          title={title}
          isMe={false}
          sharedGroupNames={[]}
          size={80}
          i18n={i18n}
        />
      </div>
      <div className="module-group-v2-join-dialog__title">{title}</div>
      <div className="module-group-v2-join-dialog__metadata">
        {i18n('GroupV2--join--group-metadata', [memberString])}
      </div>
      {groupDescription && (
        <div className="module-group-v2-join-dialog__description">
          <GroupDescription i18n={i18n} title={title} text={groupDescription} />
        </div>
      )}
      {approvalRequired ? (
        <div className="module-group-v2-join-dialog__prompt--approval">
          {i18n('GroupV2--join--prompt-with-approval')}
        </div>
      ) : (
        <div className="module-group-v2-join-dialog__prompt">
          {i18n('GroupV2--join--prompt')}
        </div>
      )}
      <div className="module-group-v2-join-dialog__buttons">
        <Button
          className={classNames(
            'module-group-v2-join-dialog__button',
            'module-group-v2-join-dialog__button--secondary'
          )}
          disabled={isWorking}
          onClick={wrappedClose}
          variant={ButtonVariant.Secondary}
        >
          {i18n('cancel')}
        </Button>
        <Button
          className="module-group-v2-join-dialog__button"
          disabled={isWorking}
          ref={focusRef}
          onClick={wrappedJoin}
          variant={ButtonVariant.Primary}
        >
          {isJoining ? (
            <Spinner size="20px" svgSize="small" direction="on-avatar" />
          ) : (
            joinString
          )}
        </Button>
      </div>
    </div>
  );
});
