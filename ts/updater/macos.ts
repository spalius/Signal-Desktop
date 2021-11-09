// Copyright 2019-2020 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { createReadStream, statSync } from 'fs';
import type { IncomingMessage, Server, ServerResponse } from 'http';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { dirname } from 'path';

import { v4 as getGuid } from 'uuid';
import type { BrowserWindow } from 'electron';
import { app, autoUpdater } from 'electron';
import config from 'config';
import { gt } from 'semver';
import got from 'got';

import type { UpdaterInterface } from './common';
import {
  checkForUpdates,
  deleteTempDir,
  downloadUpdate,
  getAutoDownloadUpdateSetting,
  getPrintableError,
  setUpdateListener,
} from './common';
import * as durations from '../util/durations';
import type { LoggerType } from '../types/Logging';
import { hexToBinary, verifySignature } from './signature';
import { markShouldQuit } from '../../app/window_state';
import { DialogType } from '../types/Dialogs';

const INTERVAL = 30 * durations.MINUTE;

export async function start(
  getMainWindow: () => BrowserWindow | undefined,
  logger: LoggerType
): Promise<UpdaterInterface> {
  logger.info('macos/start: starting checks...');

  loggerForQuitHandler = logger;
  app.once('quit', quitHandler);

  setInterval(async () => {
    try {
      await checkForUpdatesMaybeInstall(getMainWindow, logger);
    } catch (error) {
      logger.error(`macos/start: ${getPrintableError(error)}`);
    }
  }, INTERVAL);

  await checkForUpdatesMaybeInstall(getMainWindow, logger);

  return {
    async force(): Promise<void> {
      return checkForUpdatesMaybeInstall(getMainWindow, logger, true);
    },
  };
}

let fileName: string;
let version: string;
let updateFilePath: string;
let loggerForQuitHandler: LoggerType;

async function checkForUpdatesMaybeInstall(
  getMainWindow: () => BrowserWindow | undefined,
  logger: LoggerType,
  force = false
) {
  logger.info('checkForUpdatesMaybeInstall: checking for update...');
  const result = await checkForUpdates(logger, force);
  if (!result) {
    return;
  }

  const { fileName: newFileName, version: newVersion } = result;

  if (
    force ||
    fileName !== newFileName ||
    !version ||
    gt(newVersion, version)
  ) {
    const autoDownloadUpdates = await getAutoDownloadUpdateSetting(
      getMainWindow(),
      logger
    );
    if (!autoDownloadUpdates) {
      setUpdateListener(async () => {
        logger.info(
          'checkForUpdatesMaybeInstall: have not downloaded update, going to download'
        );
        await downloadAndInstall(
          newFileName,
          newVersion,
          getMainWindow,
          logger,
          true
        );
      });
      const mainWindow = getMainWindow();

      if (mainWindow) {
        mainWindow.webContents.send(
          'show-update-dialog',
          DialogType.DownloadReady,
          {
            downloadSize: result.size,
            version: result.version,
          }
        );
      } else {
        logger.warn(
          'checkForUpdatesMaybeInstall: no mainWindow, cannot show update dialog'
        );
      }
      return;
    }
    await downloadAndInstall(newFileName, newVersion, getMainWindow, logger);
  }
}

async function downloadAndInstall(
  newFileName: string,
  newVersion: string,
  getMainWindow: () => BrowserWindow | undefined,
  logger: LoggerType,
  updateOnProgress?: boolean
) {
  try {
    const oldFileName = fileName;
    const oldVersion = version;

    deleteCache(updateFilePath, logger);
    fileName = newFileName;
    version = newVersion;
    try {
      updateFilePath = await downloadUpdate(
        fileName,
        logger,
        updateOnProgress ? getMainWindow() : undefined
      );
    } catch (error) {
      // Restore state in case of download error
      fileName = oldFileName;
      version = oldVersion;
      throw error;
    }

    if (!updateFilePath) {
      logger.info('downloadAndInstall: no update file path. Skipping!');
      return;
    }

    const publicKey = hexToBinary(config.get('updatesPublicKey'));
    const verified = await verifySignature(updateFilePath, version, publicKey);
    if (!verified) {
      // Note: We don't delete the cache here, because we don't want to continually
      //   re-download the broken release. We will download it only once per launch.
      throw new Error(
        `downloadAndInstall: Downloaded update did not pass signature verification (version: '${version}'; fileName: '${fileName}')`
      );
    }

    try {
      await handToAutoUpdate(updateFilePath, logger);
    } catch (error) {
      const readOnly = 'Cannot update while running on a read-only volume';
      const message: string = error.message || '';
      const mainWindow = getMainWindow();
      if (mainWindow && message.includes(readOnly)) {
        logger.info('downloadAndInstall: showing read-only dialog...');
        mainWindow.webContents.send(
          'show-update-dialog',
          DialogType.MacOS_Read_Only
        );
      } else if (mainWindow) {
        logger.info(
          'downloadAndInstall: showing general update failure dialog...'
        );
        mainWindow.webContents.send(
          'show-update-dialog',
          DialogType.Cannot_Update
        );
      } else {
        logger.warn(
          'downloadAndInstall: no mainWindow, cannot show update dialog'
        );
      }

      throw error;
    }

    // At this point, closing the app will cause the update to be installed automatically
    //   because Squirrel has cached the update file and will do the right thing.
    logger.info('downloadAndInstall: showing update dialog...');

    setUpdateListener(() => {
      logger.info('performUpdate: calling quitAndInstall...');
      markShouldQuit();
      autoUpdater.quitAndInstall();
    });
    const mainWindow = getMainWindow();

    if (mainWindow) {
      mainWindow.webContents.send('show-update-dialog', DialogType.Update, {
        version,
      });
    } else {
      logger.warn(
        'checkForUpdatesMaybeInstall: no mainWindow, cannot show update dialog'
      );
    }
  } catch (error) {
    logger.error(`downloadAndInstall: ${getPrintableError(error)}`);
  }
}

function quitHandler() {
  deleteCache(updateFilePath, loggerForQuitHandler);
}

// Helpers

function deleteCache(filePath: string | null, logger: LoggerType) {
  if (filePath) {
    const tempDir = dirname(filePath);
    deleteTempDir(tempDir).catch(error => {
      logger.error(`quitHandler: ${getPrintableError(error)}`);
    });
  }
}

async function handToAutoUpdate(
  filePath: string,
  logger: LoggerType
): Promise<void> {
  return new Promise((resolve, reject) => {
    const token = getGuid();
    const updateFileUrl = generateFileUrl();
    const server = createServer();
    let serverUrl: string;

    server.on('error', (error: Error) => {
      logger.error(`handToAutoUpdate: ${getPrintableError(error)}`);
      shutdown(server, logger);
      reject(error);
    });

    server.on(
      'request',
      (request: IncomingMessage, response: ServerResponse) => {
        const { url } = request;

        if (url === '/') {
          const absoluteUrl = `${serverUrl}${updateFileUrl}`;
          writeJSONResponse(absoluteUrl, response);

          return;
        }

        if (url === '/token') {
          writeTokenResponse(token, response);

          return;
        }

        if (!url || !url.startsWith(updateFileUrl)) {
          write404(url, response, logger);

          return;
        }

        pipeUpdateToSquirrel(filePath, server, response, logger, reject);
      }
    );

    server.listen(0, '127.0.0.1', async () => {
      try {
        serverUrl = getServerUrl(server);

        autoUpdater.on('error', (...args) => {
          logger.error('autoUpdater: error', ...args.map(getPrintableError));

          const [error] = args;
          reject(error);
        });
        autoUpdater.on('update-downloaded', () => {
          logger.info('autoUpdater: update-downloaded event fired');
          shutdown(server, logger);
          resolve();
        });

        const response = await got.get(`${serverUrl}/token`);
        if (JSON.parse(response.body).token !== token) {
          throw new Error(
            'autoUpdater: did not receive token back from updates server'
          );
        }

        autoUpdater.setFeedURL({
          url: serverUrl,
          headers: { 'Cache-Control': 'no-cache' },
        });
        autoUpdater.checkForUpdates();
      } catch (error) {
        reject(error);
      }
    });
  });
}

function pipeUpdateToSquirrel(
  filePath: string,
  server: Server,
  response: ServerResponse,
  logger: LoggerType,
  reject: (error: Error) => void
) {
  const updateFileSize = getFileSize(filePath);
  const readStream = createReadStream(filePath);

  response.on('error', (error: Error) => {
    logger.error(
      `pipeUpdateToSquirrel: update file download request had an error ${getPrintableError(
        error
      )}`
    );
    shutdown(server, logger);
    reject(error);
  });

  readStream.on('error', (error: Error) => {
    logger.error(
      `pipeUpdateToSquirrel: read stream error response: ${getPrintableError(
        error
      )}`
    );
    shutdown(server, logger, response);
    reject(error);
  });

  response.writeHead(200, {
    'Content-Type': 'application/zip',
    'Content-Length': updateFileSize,
  });

  readStream.pipe(response);
}

function writeJSONResponse(url: string, response: ServerResponse) {
  const data = Buffer.from(
    JSON.stringify({
      url,
    })
  );
  response.writeHead(200, {
    'Content-Type': 'application/json',
    'Content-Length': data.byteLength,
  });
  response.end(data);
}

function writeTokenResponse(token: string, response: ServerResponse) {
  const data = Buffer.from(
    JSON.stringify({
      token,
    })
  );
  response.writeHead(200, {
    'Content-Type': 'application/json',
    'Content-Length': data.byteLength,
  });
  response.end(data);
}

function write404(
  url: string | undefined,
  response: ServerResponse,
  logger: LoggerType
) {
  logger.error(`write404: Squirrel requested unexpected url '${url}'`);
  response.writeHead(404);
  response.end();
}

function getServerUrl(server: Server) {
  const address = server.address() as AddressInfo;

  return `http://127.0.0.1:${address.port}`;
}
function generateFileUrl(): string {
  return `/${getGuid()}.zip`;
}

function getFileSize(targetPath: string): number {
  const { size } = statSync(targetPath);

  return size;
}

function shutdown(
  server: Server,
  logger: LoggerType,
  response?: ServerResponse
) {
  try {
    if (server) {
      server.close();
    }
  } catch (error) {
    logger.error(`shutdown: Error closing server ${getPrintableError(error)}`);
  }

  try {
    if (response) {
      response.end();
    }
  } catch (endError) {
    logger.error(
      `shutdown: couldn't end response ${getPrintableError(endError)}`
    );
  }
}
