// Copyright 2020 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type Parchment from 'parchment';
import Quill from 'quill';

import { emojiToImage } from '../../components/emoji/lib';

const Embed: typeof Parchment.Embed = Quill.import('blots/embed');

// the DOM structure of this EmojiBlot should match the other emoji implementations:
// ts/components/conversation/Emojify.tsx
// ts/components/emoji/Emoji.tsx

export class EmojiBlot extends Embed {
  static blotName = 'emoji';

  static tagName = 'img';

  static className = 'emoji-blot';

  static create(emoji: string): Node {
    const node = super.create(undefined) as HTMLElement;
    node.dataset.emoji = emoji;

    const image = emojiToImage(emoji);

    node.setAttribute('src', image || '');
    node.setAttribute('data-emoji', emoji);
    node.setAttribute('title', emoji);
    node.setAttribute('aria-label', emoji);

    return node;
  }

  static value(node: HTMLElement): string | undefined {
    return node.dataset.emoji;
  }
}
