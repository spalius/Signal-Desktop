// Copyright 2018-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { ipcRenderer } from 'electron';
import { isString, isTypedArray } from 'lodash';
import { join, normalize, basename } from 'path';
import fse from 'fs-extra';
import getGuid from 'uuid/v4';

import { getRandomBytes } from '../Crypto';
import * as Bytes from '../Bytes';

import { isPathInside } from '../util/isPathInside';
import { writeWindowsZoneIdentifier } from '../util/windowsZoneIdentifier';
import { isWindows } from '../OS';

export * from '../util/attachments';

type FSAttrType = {
  set: (path: string, attribute: string, value: string) => Promise<void>;
};

let xattr: FSAttrType | undefined;

try {
  // eslint-disable-next-line max-len
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies, import/no-unresolved
  xattr = require('fs-xattr');
} catch (e) {
  window.SignalContext.log?.info('x-attr dependency did not load successfully');
}

export const createReader = (
  root: string
): ((relativePath: string) => Promise<Uint8Array>) => {
  if (!isString(root)) {
    throw new TypeError("'root' must be a path");
  }

  return async (relativePath: string): Promise<Uint8Array> => {
    if (!isString(relativePath)) {
      throw new TypeError("'relativePath' must be a string");
    }

    const absolutePath = join(root, relativePath);
    const normalized = normalize(absolutePath);
    if (!isPathInside(normalized, root)) {
      throw new Error('Invalid relative path');
    }
    return fse.readFile(normalized);
  };
};

export const getRelativePath = (name: string): string => {
  if (!isString(name)) {
    throw new TypeError("'name' must be a string");
  }

  const prefix = name.slice(0, 2);
  return join(prefix, name);
};

export const createName = (suffix = ''): string =>
  `${Bytes.toHex(getRandomBytes(32))}${suffix}`;

export const copyIntoAttachmentsDirectory = (
  root: string
): ((sourcePath: string) => Promise<{ path: string; size: number }>) => {
  if (!isString(root)) {
    throw new TypeError("'root' must be a path");
  }

  const userDataPath = window.SignalContext.getPath('userData');

  return async (
    sourcePath: string
  ): Promise<{ path: string; size: number }> => {
    if (!isString(sourcePath)) {
      throw new TypeError('sourcePath must be a string');
    }

    if (!isPathInside(sourcePath, userDataPath)) {
      throw new Error(
        "'sourcePath' must be relative to the user config directory"
      );
    }

    const name = createName();
    const relativePath = getRelativePath(name);
    const absolutePath = join(root, relativePath);
    const normalized = normalize(absolutePath);
    if (!isPathInside(normalized, root)) {
      throw new Error('Invalid relative path');
    }

    await fse.ensureFile(normalized);
    await fse.copy(sourcePath, normalized);
    const { size } = await fse.stat(normalized);

    return {
      path: relativePath,
      size,
    };
  };
};

export const createWriterForNew = (
  root: string,
  suffix?: string
): ((bytes: Uint8Array) => Promise<string>) => {
  if (!isString(root)) {
    throw new TypeError("'root' must be a path");
  }

  return async (bytes: Uint8Array) => {
    if (!isTypedArray(bytes)) {
      throw new TypeError("'bytes' must be a typed array");
    }

    const name = createName(suffix);
    const relativePath = getRelativePath(name);
    return createWriterForExisting(root)({
      data: bytes,
      path: relativePath,
    });
  };
};

export const createWriterForExisting = (
  root: string
): ((options: { data: Uint8Array; path: string }) => Promise<string>) => {
  if (!isString(root)) {
    throw new TypeError("'root' must be a path");
  }

  return async ({
    data: bytes,
    path: relativePath,
  }: {
    data: Uint8Array;
    path: string;
  }): Promise<string> => {
    if (!isString(relativePath)) {
      throw new TypeError("'relativePath' must be a path");
    }

    if (!isTypedArray(bytes)) {
      throw new TypeError("'arrayBuffer' must be an array buffer");
    }

    const buffer = Buffer.from(bytes);
    const absolutePath = join(root, relativePath);
    const normalized = normalize(absolutePath);
    if (!isPathInside(normalized, root)) {
      throw new Error('Invalid relative path');
    }

    await fse.ensureFile(normalized);
    await fse.writeFile(normalized, buffer);
    return relativePath;
  };
};

export const createAbsolutePathGetter = (rootPath: string) => (
  relativePath: string
): string => {
  const absolutePath = join(rootPath, relativePath);
  const normalized = normalize(absolutePath);
  if (!isPathInside(normalized, rootPath)) {
    throw new Error('Invalid relative path');
  }
  return normalized;
};

export const createDoesExist = (
  root: string
): ((relativePath: string) => Promise<boolean>) => {
  if (!isString(root)) {
    throw new TypeError("'root' must be a path");
  }

  return async (relativePath: string): Promise<boolean> => {
    if (!isString(relativePath)) {
      throw new TypeError("'relativePath' must be a string");
    }

    const absolutePath = join(root, relativePath);
    const normalized = normalize(absolutePath);
    if (!isPathInside(normalized, root)) {
      throw new Error('Invalid relative path');
    }
    try {
      await fse.access(normalized, fse.constants.F_OK);
      return true;
    } catch (error) {
      return false;
    }
  };
};

export const openFileInFolder = async (target: string): Promise<void> => {
  ipcRenderer.send('show-item-in-folder', target);
};

const showSaveDialog = (
  defaultPath: string
): Promise<{
  canceled: boolean;
  filePath?: string;
}> => {
  return ipcRenderer.invoke('show-save-dialog', { defaultPath });
};

async function writeWithAttributes(
  target: string,
  data: Uint8Array
): Promise<void> {
  await fse.writeFile(target, Buffer.from(data));

  if (process.platform === 'darwin' && xattr) {
    // kLSQuarantineTypeInstantMessageAttachment
    const type = '0003';

    // Hexadecimal seconds since epoch
    const timestamp = Math.trunc(Date.now() / 1000).toString(16);

    const appName = 'Signal';
    const guid = getGuid();

    // https://ilostmynotes.blogspot.com/2012/06/gatekeeper-xprotect-and-quarantine.html
    const attrValue = `${type};${timestamp};${appName};${guid}`;

    await xattr.set(target, 'com.apple.quarantine', attrValue);
  } else if (isWindows()) {
    // This operation may fail (see the function's comments), which is not a show-stopper.
    try {
      await writeWindowsZoneIdentifier(target);
    } catch (err) {
      window.SignalContext.log?.warn(
        'Failed to write Windows Zone.Identifier file; continuing'
      );
    }
  }
}

export const saveAttachmentToDisk = async ({
  data,
  name,
}: {
  data: Uint8Array;
  name: string;
}): Promise<null | { fullPath: string; name: string }> => {
  const { canceled, filePath } = await showSaveDialog(name);

  if (canceled || !filePath) {
    return null;
  }

  await writeWithAttributes(filePath, data);

  const fileBasename = basename(filePath);

  return {
    fullPath: filePath,
    name: fileBasename,
  };
};
