// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { isString } from 'lodash';
import { join, normalize } from 'path';
import fse from 'fs-extra';

import { isPathInside } from './isPathInside';

const PATH = 'attachments.noindex';
const AVATAR_PATH = 'avatars.noindex';
const BADGES_PATH = 'badges.noindex';
const STICKER_PATH = 'stickers.noindex';
const TEMP_PATH = 'temp';
const DRAFT_PATH = 'drafts.noindex';

const createPathGetter = (subpath: string) => (
  userDataPath: string
): string => {
  if (!isString(userDataPath)) {
    throw new TypeError("'userDataPath' must be a string");
  }
  return join(userDataPath, subpath);
};

export const getAvatarsPath = createPathGetter(AVATAR_PATH);
export const getBadgesPath = createPathGetter(BADGES_PATH);
export const getDraftPath = createPathGetter(DRAFT_PATH);
export const getPath = createPathGetter(PATH);
export const getStickersPath = createPathGetter(STICKER_PATH);
export const getTempPath = createPathGetter(TEMP_PATH);

export const createDeleter = (
  root: string
): ((relativePath: string) => Promise<void>) => {
  if (!isString(root)) {
    throw new TypeError("'root' must be a path");
  }

  return async (relativePath: string): Promise<void> => {
    if (!isString(relativePath)) {
      throw new TypeError("'relativePath' must be a string");
    }

    const absolutePath = join(root, relativePath);
    const normalized = normalize(absolutePath);
    if (!isPathInside(normalized, root)) {
      throw new Error('Invalid relative path');
    }
    await fse.remove(absolutePath);
  };
};
