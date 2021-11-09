// Copyright 2020 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { ipcRenderer } from 'electron';

export function startUpdate(): void {
  ipcRenderer.send('start-update');
}
