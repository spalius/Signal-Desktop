// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { ThunkAction } from 'redux-thunk';
import { mapValues } from 'lodash';
import type { StateType as RootStateType } from '../reducer';
import type { BadgeType, BadgeImageType } from '../../badges/types';
import { getOwn } from '../../util/getOwn';
import { badgeImageFileDownloader } from '../../badges/badgeImageFileDownloader';

/**
 * This duck deals with badge data. Some assumptions it makes:
 *
 * - It should always be "behind" what's in the database. For example, the state should
 *   never contain badges that aren't on disk.
 *
 * - There are under 100 unique badges. (As of today, there are ~5.) The performance
 *   should be okay if there are more than 100, but it's not optimized for that. This
 *   means we load all badges into memory, download image files as soon as we learn about
 *   them, etc.
 */

// State

export type BadgesStateType = {
  byId: Record<string, BadgeType>;
};

// Actions

const IMAGE_FILE_DOWNLOADED = 'badges/IMAGE_FILE_DOWNLOADED';
const UPDATE_OR_CREATE = 'badges/UPDATE_OR_CREATE';

type ImageFileDownloadedActionType = {
  type: typeof IMAGE_FILE_DOWNLOADED;
  payload: {
    url: string;
    localPath: string;
  };
};

type UpdateOrCreateActionType = {
  type: typeof UPDATE_OR_CREATE;
  payload: ReadonlyArray<BadgeType>;
};

// Action creators

export const actions = {
  badgeImageFileDownloaded,
  updateOrCreate,
};

function badgeImageFileDownloaded(
  url: string,
  localPath: string
): ImageFileDownloadedActionType {
  return {
    type: IMAGE_FILE_DOWNLOADED,
    payload: { url, localPath },
  };
}

function updateOrCreate(
  badges: ReadonlyArray<BadgeType>
): ThunkAction<void, RootStateType, unknown, UpdateOrCreateActionType> {
  return async dispatch => {
    // There is a race condition here: if we save the badges but we fail to kick off a
    //   check (e.g., due to a crash), we won't download its image files. In the unlikely
    //   event that this happens, we'll repair it the next time we check for undownloaded
    //   image files.
    await window.Signal.Data.updateOrCreateBadges(badges);

    dispatch({
      type: UPDATE_OR_CREATE,
      payload: badges,
    });

    badgeImageFileDownloader.checkForFilesToDownload();
  };
}

// Reducer

export function getInitialState(): BadgesStateType {
  return { byId: {} };
}

export function reducer(
  state: Readonly<BadgesStateType> = getInitialState(),
  action: Readonly<ImageFileDownloadedActionType | UpdateOrCreateActionType>
): BadgesStateType {
  switch (action.type) {
    // This should match the database logic.
    case IMAGE_FILE_DOWNLOADED: {
      const { url, localPath } = action.payload;
      return {
        ...state,
        byId: mapValues(state.byId, badge => ({
          ...badge,
          images: badge.images.map(image =>
            mapValues(image, imageFile =>
              imageFile.url === url
                ? {
                    ...imageFile,
                    localPath,
                  }
                : imageFile
            )
          ),
        })),
      };
    }
    // This should match the database logic.
    case UPDATE_OR_CREATE: {
      const newById = { ...state.byId };
      action.payload.forEach(badge => {
        const existingBadge = getOwn(newById, badge.id);

        const oldLocalPaths = new Map<string, string>();
        existingBadge?.images.forEach(image => {
          Object.values(image).forEach(({ localPath, url }) => {
            if (localPath) {
              oldLocalPaths.set(url, localPath);
            }
          });
        });

        const images: ReadonlyArray<BadgeImageType> = badge.images.map(image =>
          mapValues(image, imageFile => ({
            ...imageFile,
            localPath: imageFile.localPath || oldLocalPaths.get(imageFile.url),
          }))
        );

        if (existingBadge) {
          newById[badge.id] = {
            ...existingBadge,
            category: badge.category,
            name: badge.name,
            descriptionTemplate: badge.descriptionTemplate,
            images,
          };
        } else {
          newById[badge.id] = { ...badge, images };
        }
      });

      return {
        ...state,
        byId: newById,
      };
    }
    default:
      return state;
  }
}
