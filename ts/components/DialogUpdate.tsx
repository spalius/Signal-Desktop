// Copyright 2020-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import React from 'react';
import formatFileSize from 'filesize';

import { DialogType } from '../types/Dialogs';
import type { LocalizerType } from '../types/Util';
import { Intl } from './Intl';
import { LeftPaneDialog } from './LeftPaneDialog';
import type { WidthBreakpoint } from './_util';

export type PropsType = {
  containerWidthBreakpoint: WidthBreakpoint;
  dialogType: DialogType;
  didSnooze: boolean;
  dismissDialog: () => void;
  downloadSize?: number;
  downloadedSize?: number;
  hasNetworkDialog: boolean;
  i18n: LocalizerType;
  showEventsCount: number;
  snoozeUpdate: () => void;
  startUpdate: () => void;
  version?: string;
};

export const DialogUpdate = ({
  containerWidthBreakpoint,
  dialogType,
  didSnooze,
  dismissDialog,
  downloadSize,
  downloadedSize,
  hasNetworkDialog,
  i18n,
  snoozeUpdate,
  startUpdate,
  version,
}: PropsType): JSX.Element | null => {
  if (hasNetworkDialog) {
    return null;
  }

  if (dialogType === DialogType.None) {
    return null;
  }

  if (didSnooze) {
    return null;
  }

  if (dialogType === DialogType.Cannot_Update) {
    return (
      <LeftPaneDialog
        containerWidthBreakpoint={containerWidthBreakpoint}
        type="warning"
        title={i18n('cannotUpdate')}
      >
        <span>
          <Intl
            components={[
              <a
                key="signal-download"
                href="https://signal.org/download/"
                rel="noreferrer"
                target="_blank"
              >
                https://signal.org/download/
              </a>,
            ]}
            i18n={i18n}
            id="cannotUpdateDetail"
          />
        </span>
      </LeftPaneDialog>
    );
  }

  if (dialogType === DialogType.MacOS_Read_Only) {
    return (
      <LeftPaneDialog
        containerWidthBreakpoint={containerWidthBreakpoint}
        type="warning"
        title={i18n('cannotUpdate')}
        hasXButton
        closeLabel={i18n('close')}
        onClose={dismissDialog}
      >
        <span>
          <Intl
            components={{
              app: <strong key="app">Signal.app</strong>,
              folder: <strong key="folder">/Applications</strong>,
            }}
            i18n={i18n}
            id="readOnlyVolume"
          />
        </span>
      </LeftPaneDialog>
    );
  }

  let title = i18n('autoUpdateNewVersionTitle');

  if (
    downloadSize &&
    (dialogType === DialogType.DownloadReady ||
      dialogType === DialogType.Downloading)
  ) {
    title += ` (${formatFileSize(downloadSize, { round: 0 })})`;
  }

  const versionTitle = version
    ? i18n('DialogUpdate--version-available', [version])
    : undefined;

  if (dialogType === DialogType.Downloading) {
    const width = Math.ceil(
      ((downloadedSize || 1) / (downloadSize || 1)) * 100
    );

    return (
      <LeftPaneDialog
        containerWidthBreakpoint={containerWidthBreakpoint}
        icon="update"
        title={title}
        hoverText={versionTitle}
      >
        <div className="LeftPaneDialog__progress--container">
          <div
            className="LeftPaneDialog__progress--bar"
            style={{ width: `${width}%` }}
          />
        </div>
      </LeftPaneDialog>
    );
  }

  let clickLabel: string;
  if (dialogType === DialogType.DownloadReady) {
    clickLabel = i18n('downloadNewVersionMessage');
  } else {
    clickLabel = i18n('autoUpdateNewVersionMessage');
  }

  return (
    <LeftPaneDialog
      containerWidthBreakpoint={containerWidthBreakpoint}
      icon="update"
      title={title}
      hoverText={versionTitle}
      hasAction
      onClick={startUpdate}
      clickLabel={clickLabel}
      hasXButton
      onClose={snoozeUpdate}
      closeLabel={i18n('autoUpdateIgnoreButtonLabel')}
    />
  );
};
