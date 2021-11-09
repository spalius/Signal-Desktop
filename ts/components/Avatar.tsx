// Copyright 2018-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type {
  FunctionComponent,
  MouseEvent,
  ReactChild,
  ReactNode,
} from 'react';
import React, { useEffect, useState } from 'react';
import classNames from 'classnames';
import { noop } from 'lodash';

import { Spinner } from './Spinner';

import { getInitials } from '../util/getInitials';
import type { LocalizerType } from '../types/Util';
import { ThemeType } from '../types/Util';
import type { AvatarColorType } from '../types/Colors';
import type { BadgeType } from '../badges/types';
import * as log from '../logging/log';
import { assert } from '../util/assert';
import { shouldBlurAvatar } from '../util/shouldBlurAvatar';
import { getBadgeImageFileLocalPath } from '../badges/getBadgeImageFileLocalPath';
import { BadgeImageTheme } from '../badges/BadgeImageTheme';

export enum AvatarBlur {
  NoBlur,
  BlurPicture,
  BlurPictureWithClickToView,
}

export enum AvatarSize {
  SIXTEEN = 16,
  TWENTY_EIGHT = 28,
  THIRTY_TWO = 32,
  THIRTY_SIX = 36,
  FORTY_EIGHT = 48,
  FIFTY_TWO = 52,
  EIGHTY = 80,
  NINETY_SIX = 96,
  ONE_HUNDRED_TWELVE = 112,
}

export type Props = {
  avatarPath?: string;
  badge?: BadgeType;
  blur?: AvatarBlur;
  color?: AvatarColorType;
  loading?: boolean;

  acceptedMessageRequest: boolean;
  conversationType: 'group' | 'direct';
  isMe: boolean;
  name?: string;
  noteToSelf?: boolean;
  phoneNumber?: string;
  profileName?: string;
  sharedGroupNames: Array<string>;
  size: AvatarSize;
  theme?: ThemeType;
  title: string;
  unblurredAvatarPath?: string;

  onClick?: (event: MouseEvent<HTMLButtonElement>) => unknown;

  // Matches Popper's RefHandler type
  innerRef?: React.Ref<HTMLDivElement>;

  i18n: LocalizerType;
} & Pick<React.HTMLProps<HTMLDivElement>, 'className'>;

const getDefaultBlur = (
  ...args: Parameters<typeof shouldBlurAvatar>
): AvatarBlur =>
  shouldBlurAvatar(...args) ? AvatarBlur.BlurPicture : AvatarBlur.NoBlur;

export const Avatar: FunctionComponent<Props> = ({
  acceptedMessageRequest,
  avatarPath,
  badge,
  className,
  color = 'A200',
  conversationType,
  i18n,
  isMe,
  innerRef,
  loading,
  noteToSelf,
  onClick,
  sharedGroupNames,
  size,
  theme,
  title,
  unblurredAvatarPath,
  blur = getDefaultBlur({
    acceptedMessageRequest,
    avatarPath,
    isMe,
    sharedGroupNames,
    unblurredAvatarPath,
  }),
}) => {
  const [imageBroken, setImageBroken] = useState(false);

  useEffect(() => {
    setImageBroken(false);
  }, [avatarPath]);

  useEffect(() => {
    if (!avatarPath) {
      return noop;
    }

    const image = new Image();
    image.src = avatarPath;
    image.onerror = () => {
      log.warn('Avatar: Image failed to load; failing over to placeholder');
      setImageBroken(true);
    };

    return () => {
      image.onerror = noop;
    };
  }, [avatarPath]);

  const initials = getInitials(title);
  const hasImage = !noteToSelf && avatarPath && !imageBroken;
  const shouldUseInitials =
    !hasImage && conversationType === 'direct' && Boolean(initials);

  let contentsChildren: ReactNode;
  if (loading) {
    const svgSize = size < 40 ? 'small' : 'normal';
    contentsChildren = (
      <div className="module-Avatar__spinner-container">
        <Spinner
          size={`${size - 8}px`}
          svgSize={svgSize}
          direction="on-avatar"
        />
      </div>
    );
  } else if (hasImage) {
    assert(avatarPath, 'avatarPath should be defined here');

    assert(
      blur !== AvatarBlur.BlurPictureWithClickToView || size >= 100,
      'Rendering "click to view" for a small avatar. This may not render correctly'
    );

    const isBlurred =
      blur === AvatarBlur.BlurPicture ||
      blur === AvatarBlur.BlurPictureWithClickToView;
    contentsChildren = (
      <>
        <div
          className="module-Avatar__image"
          style={{
            backgroundImage: `url('${encodeURI(avatarPath)}')`,
            ...(isBlurred ? { filter: `blur(${Math.ceil(size / 2)}px)` } : {}),
          }}
        />
        {blur === AvatarBlur.BlurPictureWithClickToView && (
          <div className="module-Avatar__click-to-view">{i18n('view')}</div>
        )}
      </>
    );
  } else if (noteToSelf) {
    contentsChildren = (
      <div
        className={classNames(
          'module-Avatar__icon',
          'module-Avatar__icon--note-to-self'
        )}
      />
    );
  } else if (shouldUseInitials) {
    contentsChildren = (
      <div
        aria-hidden="true"
        className="module-Avatar__label"
        style={{ fontSize: Math.ceil(size * 0.45) }}
      >
        {initials}
      </div>
    );
  } else {
    contentsChildren = (
      <div
        className={classNames(
          'module-Avatar__icon',
          `module-Avatar__icon--${conversationType}`
        )}
      />
    );
  }

  let contents: ReactChild;
  const contentsClassName = classNames(
    'module-Avatar__contents',
    `module-Avatar__contents--${color}`
  );
  if (onClick) {
    contents = (
      <button className={contentsClassName} type="button" onClick={onClick}>
        {contentsChildren}
      </button>
    );
  } else {
    contents = <div className={contentsClassName}>{contentsChildren}</div>;
  }

  let badgeNode: ReactNode;
  if (badge && theme && !isMe) {
    const badgeSize = Math.ceil(size * 0.425);
    const badgeTheme =
      theme === ThemeType.light ? BadgeImageTheme.Light : BadgeImageTheme.Dark;
    const badgeImagePath = getBadgeImageFileLocalPath(
      badge,
      badgeSize,
      badgeTheme
    );
    if (badgeImagePath) {
      badgeNode = (
        <img
          alt={badge.name}
          className="module-Avatar__badge"
          src={badgeImagePath}
          style={{
            width: badgeSize,
            height: badgeSize,
          }}
        />
      );
    }
  } else if (badge && !theme) {
    log.error('<Avatar> requires a theme if a badge is provided');
  }

  return (
    <div
      aria-label={i18n('contactAvatarAlt', [title])}
      className={classNames(
        'module-Avatar',
        hasImage ? 'module-Avatar--with-image' : 'module-Avatar--no-image',
        className
      )}
      style={{
        minWidth: size,
        width: size,
        height: size,
      }}
      ref={innerRef}
    >
      {contents}
      {badgeNode}
    </div>
  );
};
