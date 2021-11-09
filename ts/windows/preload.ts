// Copyright 2017-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { ipcRenderer as ipc } from 'electron';

import { installCallback, installSetting } from '../util/preload';

// ChatColorPicker redux hookups
installCallback('getCustomColors');
installCallback('getConversationsWithCustomColor');
installCallback('addCustomColor');
installCallback('editCustomColor');
installCallback('removeCustomColor');
installCallback('removeCustomColorOnConversations');
installCallback('resetAllChatColors');
installCallback('resetDefaultChatColor');
installCallback('setGlobalDefaultConversationColor');
installCallback('getDefaultConversationColor');
installCallback('persistZoomFactor');
installCallback('closeDB');

// Getters only. These are set by the primary device
installSetting('blockedCount', {
  setter: false,
});
installSetting('linkPreviewSetting', {
  setter: false,
});
installSetting('phoneNumberDiscoverabilitySetting', {
  setter: false,
});
installSetting('phoneNumberSharingSetting', {
  setter: false,
});
installSetting('readReceiptSetting', {
  setter: false,
});
installSetting('typingIndicatorSetting', {
  setter: false,
});

installSetting('alwaysRelayCalls');
installSetting('audioNotification');
installSetting('autoDownloadUpdate');
installSetting('autoLaunch');
installSetting('countMutedConversations');
installSetting('callRingtoneNotification');
installSetting('callSystemNotification');
installSetting('deviceName');
installSetting('hideMenuBar');
installSetting('incomingCallNotification');
installCallback('isPhoneNumberSharingEnabled');
installCallback('isPrimary');
installCallback('syncRequest');
installSetting('notificationDrawAttention');
installSetting('notificationSetting');
installSetting('spellCheck');
installSetting('lastSyncTime');
installSetting('systemTraySetting');
installSetting('themeSetting');
installSetting('universalExpireTimer');
installSetting('zoomFactor');

// Media Settings
installCallback('getAvailableIODevices');
installSetting('preferredAudioInputDevice');
installSetting('preferredAudioOutputDevice');
installSetting('preferredVideoInputDevice');

window.getMediaPermissions = () =>
  new Promise((resolve, reject) => {
    ipc.once(
      'settings:get-success:mediaPermissions',
      (_event, error, value) => {
        if (error) {
          return reject(new Error(error));
        }

        return resolve(value);
      }
    );
    ipc.send('settings:get:mediaPermissions');
  });

window.getMediaCameraPermissions = () =>
  new Promise((resolve, reject) => {
    ipc.once(
      'settings:get-success:mediaCameraPermissions',
      (_event, error, value) => {
        if (error) {
          return reject(new Error(error));
        }

        return resolve(value);
      }
    );
    ipc.send('settings:get:mediaCameraPermissions');
  });
