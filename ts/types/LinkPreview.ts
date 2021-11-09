// Copyright 2019-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { isNumber, compact, isEmpty, range } from 'lodash';
import nodeUrl from 'url';
import LinkifyIt from 'linkify-it';

import { maybeParseUrl } from '../util/url';
import { replaceEmojiWithSpaces } from '../util/emoji';

import type { AttachmentType } from './Attachment';

export type LinkPreviewImage = AttachmentType & {
  data: Uint8Array;
};

export type LinkPreviewResult = {
  title: string;
  url: string;
  image?: LinkPreviewImage;
  description: string | null;
  date: number | null;
};

export type LinkPreviewWithDomain = {
  domain: string;
} & LinkPreviewResult;

const linkify = LinkifyIt();

export function isLinkSafeToPreview(href: string): boolean {
  const url = maybeParseUrl(href);
  return Boolean(url && url.protocol === 'https:' && !isLinkSneaky(href));
}

export function isStickerPack(link = ''): boolean {
  return link.startsWith('https://signal.art/addstickers/');
}

export function isGroupLink(link = ''): boolean {
  return link.startsWith('https://signal.group/');
}

export function findLinks(text: string, caretLocation?: number): Array<string> {
  const haveCaretLocation = isNumber(caretLocation);
  const textLength = text ? text.length : 0;

  const matches = linkify.match(text ? replaceEmojiWithSpaces(text) : '') || [];
  return compact(
    matches.map(match => {
      if (!haveCaretLocation) {
        return match.text;
      }

      if (caretLocation === undefined) {
        return null;
      }

      if (match.lastIndex === textLength && caretLocation === textLength) {
        return match.text;
      }

      if (match.index > caretLocation || match.lastIndex < caretLocation) {
        return match.text;
      }

      return null;
    })
  );
}

export function getDomain(href: string): string {
  const url = maybeParseUrl(href);
  if (!url || !url.hostname) {
    throw new Error('getDomain: Unable to extract hostname from href');
  }

  return url.hostname;
}

// See <https://tools.ietf.org/html/rfc3986>.
const VALID_URI_CHARACTERS = new Set([
  '%',
  // "gen-delims"
  ':',
  '/',
  '?',
  '#',
  '[',
  ']',
  '@',
  // "sub-delims"
  '!',
  '$',
  '&',
  "'",
  '(',
  ')',
  '*',
  '+',
  ',',
  ';',
  '=',
  // unreserved
  ...String.fromCharCode(...range(65, 91), ...range(97, 123)),
  ...range(10).map(String),
  '-',
  '.',
  '_',
  '~',
]);
const ASCII_PATTERN = new RegExp('[\\u0020-\\u007F]', 'g');
const MAX_HREF_LENGTH = 2 ** 12;

export function isLinkSneaky(href: string): boolean {
  // This helps users avoid extremely long links (which could be hiding something
  //   sketchy) and also sidesteps the performance implications of extremely long hrefs.
  if (href.length > MAX_HREF_LENGTH) {
    return true;
  }

  const url = maybeParseUrl(href);

  // If we can't parse it, it's sneaky.
  if (!url) {
    return true;
  }

  // Any links which contain auth are considered sneaky
  if (url.username || url.password) {
    return true;
  }

  // If the domain is falsy, something fishy is going on
  if (!url.hostname) {
    return true;
  }

  // To quote [RFC 1034][0]: "the total number of octets that represent a
  //   domain name [...] is limited to 255." To be extra careful, we set a
  //   maximum of 2048. (This also uses the string's `.length` property,
  //   which isn't exactly the same thing as the number of octets.)
  // [0]: https://tools.ietf.org/html/rfc1034
  if (url.hostname.length > 2048) {
    return true;
  }

  // Domains cannot contain encoded characters
  if (url.hostname.includes('%')) {
    return true;
  }

  // There must be at least 2 domain labels, and none of them can be empty.
  const labels = url.hostname.split('.');
  if (labels.length < 2 || labels.some(isEmpty)) {
    return true;
  }

  // This is necesary because getDomain returns domains in punycode form.
  const unicodeDomain = nodeUrl.domainToUnicode
    ? nodeUrl.domainToUnicode(url.hostname)
    : url.hostname;

  const withoutPeriods = unicodeDomain.replace(/\./g, '');

  const hasASCII = ASCII_PATTERN.test(withoutPeriods);
  const withoutASCII = withoutPeriods.replace(ASCII_PATTERN, '');

  const isMixed = hasASCII && withoutASCII.length > 0;
  if (isMixed) {
    return true;
  }

  // We can't use `url.pathname` (and so on) because it automatically encodes strings.
  //   For example, it turns `/aquí` into `/aqu%C3%AD`.
  const startOfPathAndHash = href.indexOf('/', url.protocol.length + 4);
  const pathAndHash =
    startOfPathAndHash === -1 ? '' : href.substr(startOfPathAndHash);
  return [...pathAndHash].some(
    character => !VALID_URI_CHARACTERS.has(character)
  );
}
