// Copyright 2018-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

export type MIMEType = string & { _mimeTypeBrand: never };

export const stringToMIMEType = (value: string): MIMEType => {
  return value as MIMEType;
};
export const MIMETypeToString = (value: MIMEType): string => {
  return value as string;
};

export const APPLICATION_OCTET_STREAM = stringToMIMEType(
  'application/octet-stream'
);
export const APPLICATION_JSON = stringToMIMEType('application/json');
export const AUDIO_AAC = stringToMIMEType('audio/aac');
export const AUDIO_MP3 = stringToMIMEType('audio/mp3');
export const IMAGE_GIF = stringToMIMEType('image/gif');
export const IMAGE_JPEG = stringToMIMEType('image/jpeg');
export const IMAGE_PNG = stringToMIMEType('image/png');
export const IMAGE_WEBP = stringToMIMEType('image/webp');
export const IMAGE_ICO = stringToMIMEType('image/x-icon');
export const IMAGE_BMP = stringToMIMEType('image/bmp');
export const VIDEO_MP4 = stringToMIMEType('video/mp4');
export const VIDEO_QUICKTIME = stringToMIMEType('video/quicktime');
export const LONG_MESSAGE = stringToMIMEType('text/x-signal-plain');

export const isHeic = (value: string): boolean =>
  value === 'image/heic' || value === 'image/heif';
export const isGif = (value: string): value is MIMEType =>
  value === 'image/gif';
export const isJPEG = (value: string): value is MIMEType =>
  value === 'image/jpeg';
export const isImage = (value: string): value is MIMEType =>
  Boolean(value) && value.startsWith('image/');
export const isVideo = (value: string): value is MIMEType =>
  Boolean(value) && value.startsWith('video/');
// As of 2020-04-16 aif files do not play in Electron nor Chrome. We should only
// recognize them as file attachments.
export const isAudio = (value: string): value is MIMEType =>
  Boolean(value) && value.startsWith('audio/') && !value.endsWith('aiff');
export const isLongMessage = (value: unknown): value is MIMEType =>
  value === LONG_MESSAGE;
