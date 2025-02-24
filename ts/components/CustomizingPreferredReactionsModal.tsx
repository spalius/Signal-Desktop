// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useEffect, useState } from 'react';
import { usePopper } from 'react-popper';
import { isEqual, noop } from 'lodash';

import type { LocalizerType } from '../types/Util';
import { Modal } from './Modal';
import { Button, ButtonVariant } from './Button';
import {
  ReactionPickerPicker,
  ReactionPickerPickerEmojiButton,
  ReactionPickerPickerStyle,
} from './ReactionPickerPicker';
import { EmojiPicker } from './emoji/EmojiPicker';
import { DEFAULT_PREFERRED_REACTION_EMOJI_SHORT_NAMES } from '../reactions/constants';
import { convertShortName } from './emoji/lib';
import { offsetDistanceModifier } from '../util/popperUtil';

type PropsType = {
  draftPreferredReactions: Array<string>;
  hadSaveError: boolean;
  i18n: LocalizerType;
  isSaving: boolean;
  originalPreferredReactions: Array<string>;
  recentEmojis: Array<string>;
  selectedDraftEmojiIndex: undefined | number;
  skinTone: number;

  cancelCustomizePreferredReactionsModal(): unknown;
  deselectDraftEmoji(): unknown;
  onSetSkinTone(tone: number): unknown;
  replaceSelectedDraftEmoji(newEmoji: string): unknown;
  resetDraftEmoji(): unknown;
  savePreferredReactions(): unknown;
  selectDraftEmojiToBeReplaced(index: number): unknown;
};

export function CustomizingPreferredReactionsModal({
  cancelCustomizePreferredReactionsModal,
  deselectDraftEmoji,
  draftPreferredReactions,
  hadSaveError,
  i18n,
  isSaving,
  onSetSkinTone,
  originalPreferredReactions,
  recentEmojis,
  replaceSelectedDraftEmoji,
  resetDraftEmoji,
  savePreferredReactions,
  selectDraftEmojiToBeReplaced,
  selectedDraftEmojiIndex,
  skinTone,
}: Readonly<PropsType>): JSX.Element {
  const [
    referenceElement,
    setReferenceElement,
  ] = useState<null | HTMLDivElement>(null);
  const [popperElement, setPopperElement] = useState<null | HTMLDivElement>(
    null
  );
  const emojiPickerPopper = usePopper(referenceElement, popperElement, {
    placement: 'bottom',
    modifiers: [
      offsetDistanceModifier(8),
      {
        name: 'preventOverflow',
        options: { altAxis: true },
      },
    ],
  });

  const isSomethingSelected = selectedDraftEmojiIndex !== undefined;

  useEffect(() => {
    if (!isSomethingSelected) {
      return noop;
    }

    const onBodyClick = (event: MouseEvent) => {
      const { target } = event;
      if (!(target instanceof HTMLElement) || !popperElement) {
        return;
      }

      const isClickOutsidePicker = !popperElement.contains(target);
      if (isClickOutsidePicker) {
        deselectDraftEmoji();
      }
    };

    document.body.addEventListener('click', onBodyClick);
    return () => {
      document.body.removeEventListener('click', onBodyClick);
    };
  }, [isSomethingSelected, popperElement, deselectDraftEmoji]);

  const hasChanged = !isEqual(
    originalPreferredReactions,
    draftPreferredReactions
  );
  const canReset =
    !isSaving &&
    !isEqual(
      DEFAULT_PREFERRED_REACTION_EMOJI_SHORT_NAMES.map(shortName =>
        convertShortName(shortName, skinTone)
      ),
      draftPreferredReactions
    );
  const canSave = !isSaving && hasChanged;

  return (
    <Modal
      hasXButton
      i18n={i18n}
      onClose={() => {
        cancelCustomizePreferredReactionsModal();
      }}
      title={i18n('CustomizingPreferredReactions__title')}
    >
      <div className="module-CustomizingPreferredReactionsModal__small-emoji-picker-wrapper">
        <ReactionPickerPicker
          isSomethingSelected={isSomethingSelected}
          pickerStyle={ReactionPickerPickerStyle.Menu}
          ref={setReferenceElement}
        >
          {draftPreferredReactions.map((emoji, index) => (
            <ReactionPickerPickerEmojiButton
              emoji={emoji}
              // The index is the only thing that uniquely identifies the emoji, because
              //   there can be duplicates in the list.
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              onClick={() => {
                selectDraftEmojiToBeReplaced(index);
              }}
              isSelected={index === selectedDraftEmojiIndex}
            />
          ))}
        </ReactionPickerPicker>
        {hadSaveError
          ? i18n('CustomizingPreferredReactions__had-save-error')
          : i18n('CustomizingPreferredReactions__subtitle')}
      </div>
      {isSomethingSelected && (
        <div
          ref={setPopperElement}
          style={emojiPickerPopper.styles.popper}
          {...emojiPickerPopper.attributes.popper}
        >
          <EmojiPicker
            i18n={i18n}
            onPickEmoji={pickedEmoji => {
              const emoji = convertShortName(
                pickedEmoji.shortName,
                pickedEmoji.skinTone
              );
              replaceSelectedDraftEmoji(emoji);
            }}
            recentEmojis={recentEmojis}
            skinTone={skinTone}
            onSetSkinTone={onSetSkinTone}
            onClose={() => {
              deselectDraftEmoji();
            }}
          />
        </div>
      )}
      <Modal.ButtonFooter>
        <Button
          disabled={!canReset}
          onClick={() => {
            resetDraftEmoji();
          }}
          variant={ButtonVariant.SecondaryAffirmative}
        >
          {i18n('reset')}
        </Button>
        <Button
          disabled={!canSave}
          onClick={() => {
            savePreferredReactions();
          }}
        >
          {i18n('save')}
        </Button>
      </Modal.ButtonFooter>
    </Modal>
  );
}
