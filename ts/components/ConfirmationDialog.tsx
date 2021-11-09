// Copyright 2019-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { MouseEvent } from 'react';
import React, { useCallback } from 'react';
import { animated } from '@react-spring/web';
import { Button, ButtonVariant } from './Button';
import type { LocalizerType } from '../types/Util';
import { ModalHost } from './ModalHost';
import { Modal, ModalWindow } from './Modal';
import type { Theme } from '../util/theme';
import { useAnimated } from '../hooks/useAnimated';

export type ActionSpec = {
  text: string;
  action: () => unknown;
  style?: 'affirmative' | 'negative';
};

export type OwnProps = {
  readonly moduleClassName?: string;
  readonly actions?: Array<ActionSpec>;
  readonly cancelText?: string;
  readonly children?: React.ReactNode;
  readonly i18n: LocalizerType;
  readonly onCancel?: () => unknown;
  readonly onClose: () => unknown;
  readonly title?: string | React.ReactNode;
  readonly theme?: Theme;
  readonly hasXButton?: boolean;
  readonly cancelButtonVariant?: ButtonVariant;
};

export type Props = OwnProps;

function focusRef(el: HTMLElement | null) {
  if (el) {
    el.focus();
  }
}

function getButtonVariant(
  buttonStyle?: 'affirmative' | 'negative'
): ButtonVariant {
  if (buttonStyle === 'affirmative') {
    return ButtonVariant.Primary;
  }

  if (buttonStyle === 'negative') {
    return ButtonVariant.Destructive;
  }

  return ButtonVariant.Secondary;
}

export const ConfirmationDialog = React.memo(
  ({
    moduleClassName,
    actions = [],
    cancelText,
    children,
    i18n,
    onCancel,
    onClose,
    theme,
    title,
    hasXButton,
    cancelButtonVariant,
  }: Props) => {
    const { close, overlayStyles, modalStyles } = useAnimated(onClose, {
      getFrom: () => ({ opacity: 0, transform: 'scale(0.25)' }),
      getTo: isOpen => ({ opacity: isOpen ? 1 : 0, transform: 'scale(1)' }),
    });

    const cancelAndClose = useCallback(() => {
      if (onCancel) {
        onCancel();
      }
      close();
    }, [close, onCancel]);

    const handleCancel = useCallback(
      (e: MouseEvent) => {
        if (e.target === e.currentTarget) {
          cancelAndClose();
        }
      },
      [cancelAndClose]
    );

    const hasActions = Boolean(actions.length);

    return (
      <ModalHost onClose={close} theme={theme} overlayStyles={overlayStyles}>
        <animated.div style={modalStyles}>
          <ModalWindow
            hasXButton={hasXButton}
            i18n={i18n}
            moduleClassName={moduleClassName}
            onClose={cancelAndClose}
            title={title}
          >
            {children}
            <Modal.ButtonFooter>
              <Button
                onClick={handleCancel}
                ref={focusRef}
                variant={
                  cancelButtonVariant ||
                  (hasActions ? ButtonVariant.Secondary : ButtonVariant.Primary)
                }
              >
                {cancelText || i18n('confirmation-dialog--Cancel')}
              </Button>
              {actions.map((action, i) => (
                <Button
                  key={action.text}
                  onClick={() => {
                    action.action();
                    close();
                  }}
                  data-action={i}
                  variant={getButtonVariant(action.style)}
                >
                  {action.text}
                </Button>
              ))}
            </Modal.ButtonFooter>
          </ModalWindow>
        </animated.div>
      </ModalHost>
    );
  }
);
