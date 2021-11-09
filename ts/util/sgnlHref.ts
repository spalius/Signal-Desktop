// Copyright 2020-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { LoggerType } from '../types/Logging';
import { maybeParseUrl } from './url';
import { isValidE164 } from './isValidE164';

const SIGNAL_DOT_ME_HASH_PREFIX = 'p/';

function parseUrl(value: string | URL, logger: LoggerType): undefined | URL {
  if (value instanceof URL) {
    return value;
  }

  if (typeof value === 'string') {
    return maybeParseUrl(value);
  }

  logger.warn('Tried to parse a sgnl:// URL but got an unexpected type');
  return undefined;
}

export function isSgnlHref(value: string | URL, logger: LoggerType): boolean {
  const url = parseUrl(value, logger);
  return Boolean(url?.protocol === 'sgnl:');
}

export function isCaptchaHref(
  value: string | URL,
  logger: LoggerType
): boolean {
  const url = parseUrl(value, logger);
  return Boolean(url?.protocol === 'signalcaptcha:');
}

export function isSignalHttpsLink(
  value: string | URL,
  logger: LoggerType
): boolean {
  const url = parseUrl(value, logger);
  return Boolean(
    url &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.protocol === 'https:' &&
      (url.host === 'signal.group' ||
        url.host === 'signal.art' ||
        url.host === 'signal.me')
  );
}

type ParsedSgnlHref =
  | { command: null; args: Map<never, never>; hash: undefined }
  | { command: string; args: Map<string, string>; hash: string | undefined };
export function parseSgnlHref(
  href: string,
  logger: LoggerType
): ParsedSgnlHref {
  const url = parseUrl(href, logger);
  if (!url || !isSgnlHref(url, logger)) {
    return { command: null, args: new Map<never, never>(), hash: undefined };
  }

  const args = new Map<string, string>();
  url.searchParams.forEach((value, key) => {
    if (!args.has(key)) {
      args.set(key, value);
    }
  });

  return {
    command: url.host,
    args,
    hash: url.hash ? url.hash.slice(1) : undefined,
  };
}

type ParsedCaptchaHref = {
  readonly captcha: string;
};
export function parseCaptchaHref(
  href: URL | string,
  logger: LoggerType
): ParsedCaptchaHref {
  const url = parseUrl(href, logger);
  if (!url || !isCaptchaHref(url, logger)) {
    throw new Error('Not a captcha href');
  }

  return {
    captcha: url.host,
  };
}

export function parseSignalHttpsLink(
  href: string,
  logger: LoggerType
): ParsedSgnlHref {
  const url = parseUrl(href, logger);
  if (!url || !isSignalHttpsLink(url, logger)) {
    return { command: null, args: new Map<never, never>(), hash: undefined };
  }

  if (url.host === 'signal.art') {
    const hash = url.hash.slice(1);
    const hashParams = new URLSearchParams(hash);

    const args = new Map<string, string>();
    hashParams.forEach((value, key) => {
      if (!args.has(key)) {
        args.set(key, value);
      }
    });

    if (!args.get('pack_id') || !args.get('pack_key')) {
      return { command: null, args: new Map<never, never>(), hash: undefined };
    }

    return {
      command: url.pathname.replace(/\//g, ''),
      args,
      hash: url.hash ? url.hash.slice(1) : undefined,
    };
  }

  if (url.host === 'signal.group' || url.host === 'signal.me') {
    return {
      command: url.host,
      args: new Map<string, string>(),
      hash: url.hash ? url.hash.slice(1) : undefined,
    };
  }

  return { command: null, args: new Map<never, never>(), hash: undefined };
}

export function parseE164FromSignalDotMeHash(hash: string): undefined | string {
  if (!hash.startsWith(SIGNAL_DOT_ME_HASH_PREFIX)) {
    return;
  }

  const maybeE164 = hash.slice(SIGNAL_DOT_ME_HASH_PREFIX.length);
  return isValidE164(maybeE164, true) ? maybeE164 : undefined;
}
