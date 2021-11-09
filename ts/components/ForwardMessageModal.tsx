// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import type { FunctionComponent } from 'react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { MeasuredComponentProps } from 'react-measure';
import Measure from 'react-measure';
import { noop } from 'lodash';
import { animated } from '@react-spring/web';

import classNames from 'classnames';
import { AttachmentList } from './conversation/AttachmentList';
import type { AttachmentType } from '../types/Attachment';
import { Button } from './Button';
import type { InputApi } from './CompositionInput';
import { CompositionInput } from './CompositionInput';
import { ConfirmationDialog } from './ConfirmationDialog';
import { ContactCheckboxDisabledReason } from './conversationList/ContactCheckbox';
import type { Row } from './ConversationList';
import { ConversationList, RowType } from './ConversationList';
import type { ConversationType } from '../state/ducks/conversations';
import type { Props as EmojiButtonProps } from './emoji/EmojiButton';
import { EmojiButton } from './emoji/EmojiButton';
import type { EmojiPickDataType } from './emoji/EmojiPicker';
import type { LinkPreviewType } from '../types/message/LinkPreviews';
import type { BodyRangeType, LocalizerType, ThemeType } from '../types/Util';
import { ModalHost } from './ModalHost';
import { SearchInput } from './SearchInput';
import { StagedLinkPreview } from './conversation/StagedLinkPreview';
import { assert } from '../util/assert';
import { filterAndSortConversationsByRecent } from '../util/filterAndSortConversations';
import { useAnimated } from '../hooks/useAnimated';

export type DataPropsType = {
  attachments?: Array<AttachmentType>;
  candidateConversations: ReadonlyArray<ConversationType>;
  conversationId: string;
  doForwardMessage: (
    selectedContacts: Array<string>,
    messageBody?: string,
    attachments?: Array<AttachmentType>,
    linkPreview?: LinkPreviewType
  ) => void;
  i18n: LocalizerType;
  isSticker: boolean;
  linkPreview?: LinkPreviewType;
  messageBody?: string;
  onClose: () => void;
  onEditorStateChange: (
    messageText: string,
    bodyRanges: Array<BodyRangeType>,
    caretLocation?: number
  ) => unknown;
  onTextTooLong: () => void;
  theme: ThemeType;
} & Pick<EmojiButtonProps, 'recentEmojis' | 'skinTone'>;

type ActionPropsType = Pick<
  EmojiButtonProps,
  'onPickEmoji' | 'onSetSkinTone'
> & {
  removeLinkPreview: () => void;
};

export type PropsType = DataPropsType & ActionPropsType;

const MAX_FORWARD = 5;

export const ForwardMessageModal: FunctionComponent<PropsType> = ({
  attachments,
  candidateConversations,
  conversationId,
  doForwardMessage,
  i18n,
  isSticker,
  linkPreview,
  messageBody,
  onClose,
  onEditorStateChange,
  onPickEmoji,
  onSetSkinTone,
  onTextTooLong,
  recentEmojis,
  removeLinkPreview,
  skinTone,
  theme,
}) => {
  const inputRef = useRef<null | HTMLInputElement>(null);
  const inputApiRef = React.useRef<InputApi | undefined>();
  const [selectedContacts, setSelectedContacts] = useState<
    Array<ConversationType>
  >([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredConversations, setFilteredConversations] = useState(
    filterAndSortConversationsByRecent(candidateConversations, '')
  );
  const [attachmentsToForward, setAttachmentsToForward] = useState(attachments);
  const [isEditingMessage, setIsEditingMessage] = useState(false);
  const [messageBodyText, setMessageBodyText] = useState(messageBody || '');
  const [cannotMessage, setCannotMessage] = useState(false);

  const isMessageEditable = !isSticker;

  const hasSelectedMaximumNumberOfContacts =
    selectedContacts.length >= MAX_FORWARD;

  const selectedConversationIdsSet: Set<string> = useMemo(
    () => new Set(selectedContacts.map(contact => contact.id)),
    [selectedContacts]
  );

  const focusTextEditInput = React.useCallback(() => {
    if (inputApiRef.current) {
      inputApiRef.current.focus();
    }
  }, [inputApiRef]);

  const insertEmoji = React.useCallback(
    (e: EmojiPickDataType) => {
      if (inputApiRef.current) {
        inputApiRef.current.insertEmoji(e);
        onPickEmoji(e);
      }
    },
    [inputApiRef, onPickEmoji]
  );

  const hasContactsSelected = Boolean(selectedContacts.length);

  const canForwardMessage =
    hasContactsSelected &&
    (Boolean(messageBodyText) ||
      isSticker ||
      (attachmentsToForward && attachmentsToForward.length));

  const forwardMessage = React.useCallback(() => {
    if (!canForwardMessage) {
      return;
    }

    doForwardMessage(
      selectedContacts.map(contact => contact.id),
      messageBodyText,
      attachmentsToForward,
      linkPreview
    );
  }, [
    attachmentsToForward,
    canForwardMessage,
    doForwardMessage,
    linkPreview,
    messageBodyText,
    selectedContacts,
  ]);

  const normalizedSearchTerm = searchTerm.trim();
  useEffect(() => {
    const timeout = setTimeout(() => {
      setFilteredConversations(
        filterAndSortConversationsByRecent(
          candidateConversations,
          normalizedSearchTerm
        )
      );
    }, 200);
    return () => {
      clearTimeout(timeout);
    };
  }, [candidateConversations, normalizedSearchTerm, setFilteredConversations]);

  const contactLookup = useMemo(() => {
    const map = new Map();
    candidateConversations.forEach(contact => {
      map.set(contact.id, contact);
    });
    return map;
  }, [candidateConversations]);

  const toggleSelectedConversation = useCallback(
    (selectedConversationId: string) => {
      let removeContact = false;
      const nextSelectedContacts = selectedContacts.filter(contact => {
        if (contact.id === selectedConversationId) {
          removeContact = true;
          return false;
        }
        return true;
      });
      if (removeContact) {
        setSelectedContacts(nextSelectedContacts);
        return;
      }
      const selectedContact = contactLookup.get(selectedConversationId);
      if (selectedContact) {
        if (selectedContact.announcementsOnly && !selectedContact.areWeAdmin) {
          setCannotMessage(true);
        } else {
          setSelectedContacts([...nextSelectedContacts, selectedContact]);
        }
      }
    },
    [contactLookup, selectedContacts, setSelectedContacts]
  );

  const { close, modalStyles, overlayStyles } = useAnimated(onClose, {
    getFrom: () => ({ opacity: 0, transform: 'translateY(48px)' }),
    getTo: isOpen =>
      isOpen
        ? { opacity: 1, transform: 'translateY(0px)' }
        : {
            opacity: 0,
            transform: 'translateY(48px)',
          },
  });

  const handleBackOrClose = useCallback(() => {
    if (isEditingMessage) {
      setIsEditingMessage(false);
    } else {
      close();
    }
  }, [isEditingMessage, close, setIsEditingMessage]);

  const rowCount = filteredConversations.length;
  const getRow = (index: number): undefined | Row => {
    const contact = filteredConversations[index];
    if (!contact) {
      return undefined;
    }

    const isSelected = selectedConversationIdsSet.has(contact.id);

    let disabledReason: undefined | ContactCheckboxDisabledReason;
    if (hasSelectedMaximumNumberOfContacts && !isSelected) {
      disabledReason = ContactCheckboxDisabledReason.MaximumContactsSelected;
    }

    return {
      type: RowType.ContactCheckbox,
      contact,
      isChecked: isSelected,
      disabledReason,
    };
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);

    return () => {
      clearTimeout(timeout);
    };
  }, []);

  return (
    <>
      {cannotMessage && (
        <ConfirmationDialog
          cancelText={i18n('Confirmation--confirm')}
          i18n={i18n}
          onClose={() => setCannotMessage(false)}
        >
          {i18n('GroupV2--cannot-send')}
        </ConfirmationDialog>
      )}
      <ModalHost
        onEscape={handleBackOrClose}
        onClose={close}
        overlayStyles={overlayStyles}
      >
        <animated.div
          className="module-ForwardMessageModal"
          style={modalStyles}
        >
          <div
            className={classNames('module-ForwardMessageModal__header', {
              'module-ForwardMessageModal__header--edit': isEditingMessage,
            })}
          >
            {isEditingMessage ? (
              <button
                aria-label={i18n('back')}
                className="module-ForwardMessageModal__header--back"
                onClick={() => setIsEditingMessage(false)}
                type="button"
              >
                &nbsp;
              </button>
            ) : (
              <button
                aria-label={i18n('close')}
                className="module-ForwardMessageModal__header--close"
                onClick={close}
                type="button"
              />
            )}
            <h1>{i18n('forwardMessage')}</h1>
          </div>
          {isEditingMessage ? (
            <div className="module-ForwardMessageModal__main-body">
              {linkPreview ? (
                <div className="module-ForwardMessageModal--link-preview">
                  <StagedLinkPreview
                    date={linkPreview.date || null}
                    description={linkPreview.description || ''}
                    domain={linkPreview.url}
                    i18n={i18n}
                    image={linkPreview.image}
                    onClose={() => removeLinkPreview()}
                    title={linkPreview.title}
                  />
                </div>
              ) : null}
              {attachmentsToForward && attachmentsToForward.length ? (
                <AttachmentList
                  attachments={attachmentsToForward}
                  i18n={i18n}
                  onCloseAttachment={(attachment: AttachmentType) => {
                    const newAttachments = attachmentsToForward.filter(
                      currentAttachment => currentAttachment !== attachment
                    );
                    setAttachmentsToForward(newAttachments);
                  }}
                />
              ) : null}
              <div className="module-ForwardMessageModal__text-edit-area">
                <CompositionInput
                  conversationId={conversationId}
                  clearQuotedMessage={shouldNeverBeCalled}
                  draftText={messageBodyText}
                  getQuotedMessage={noop}
                  i18n={i18n}
                  inputApi={inputApiRef}
                  large
                  moduleClassName="module-ForwardMessageModal__input"
                  scrollToBottom={noop}
                  onEditorStateChange={(
                    messageText,
                    bodyRanges,
                    caretLocation
                  ) => {
                    setMessageBodyText(messageText);
                    onEditorStateChange(messageText, bodyRanges, caretLocation);
                  }}
                  onPickEmoji={onPickEmoji}
                  onSubmit={forwardMessage}
                  onTextTooLong={onTextTooLong}
                />
                <div className="module-ForwardMessageModal__emoji">
                  <EmojiButton
                    i18n={i18n}
                    onClose={focusTextEditInput}
                    onPickEmoji={insertEmoji}
                    onSetSkinTone={onSetSkinTone}
                    recentEmojis={recentEmojis}
                    skinTone={skinTone}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="module-ForwardMessageModal__main-body">
              <SearchInput
                disabled={candidateConversations.length === 0}
                placeholder={i18n('contactSearchPlaceholder')}
                onChange={event => {
                  setSearchTerm(event.target.value);
                }}
                ref={inputRef}
                value={searchTerm}
              />
              {candidateConversations.length ? (
                <Measure bounds>
                  {({ contentRect, measureRef }: MeasuredComponentProps) => {
                    // We disable this ESLint rule because we're capturing a bubbled
                    // keydown event. See [this note in the jsx-a11y docs][0].
                    //
                    // [0]: https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/c275964f52c35775208bd00cb612c6f82e42e34f/docs/rules/no-static-element-interactions.md#case-the-event-handler-is-only-being-used-to-capture-bubbled-events
                    /* eslint-disable jsx-a11y/no-static-element-interactions */
                    return (
                      <div
                        className="module-ForwardMessageModal__list-wrapper"
                        ref={measureRef}
                      >
                        <ConversationList
                          dimensions={contentRect.bounds}
                          getRow={getRow}
                          i18n={i18n}
                          onClickArchiveButton={shouldNeverBeCalled}
                          onClickContactCheckbox={(
                            selectedConversationId: string,
                            disabledReason:
                              | undefined
                              | ContactCheckboxDisabledReason
                          ) => {
                            if (
                              disabledReason !==
                              ContactCheckboxDisabledReason.MaximumContactsSelected
                            ) {
                              toggleSelectedConversation(
                                selectedConversationId
                              );
                            }
                          }}
                          onSelectConversation={shouldNeverBeCalled}
                          renderMessageSearchResult={() => {
                            shouldNeverBeCalled();
                            return <div />;
                          }}
                          rowCount={rowCount}
                          shouldRecomputeRowHeights={false}
                          showChooseGroupMembers={shouldNeverBeCalled}
                          startNewConversationFromPhoneNumber={
                            shouldNeverBeCalled
                          }
                          theme={theme}
                        />
                      </div>
                    );
                    /* eslint-enable jsx-a11y/no-static-element-interactions */
                  }}
                </Measure>
              ) : (
                <div className="module-ForwardMessageModal__no-candidate-contacts">
                  {i18n('noContactsFound')}
                </div>
              )}
            </div>
          )}
          <div className="module-ForwardMessageModal__footer">
            <div>
              {Boolean(selectedContacts.length) &&
                selectedContacts.map(contact => contact.title).join(', ')}
            </div>
            <div>
              {isEditingMessage || !isMessageEditable ? (
                <Button
                  aria-label={i18n('ForwardMessageModal--continue')}
                  className="module-ForwardMessageModal__send-button module-ForwardMessageModal__send-button--forward"
                  disabled={!canForwardMessage}
                  onClick={forwardMessage}
                />
              ) : (
                <Button
                  aria-label={i18n('forwardMessage')}
                  className="module-ForwardMessageModal__send-button module-ForwardMessageModal__send-button--continue"
                  disabled={!hasContactsSelected}
                  onClick={() => setIsEditingMessage(true)}
                />
              )}
            </div>
          </div>
        </animated.div>
      </ModalHost>
    </>
  );
};

function shouldNeverBeCalled(..._args: ReadonlyArray<unknown>): void {
  assert(false, 'This should never be called. Doing nothing');
}
