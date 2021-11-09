// Copyright 2020-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/* eslint-disable camelcase */

import { batch as batchDispatch } from 'react-redux';
import { debounce, flatten, omit, throttle } from 'lodash';
import { render } from 'mustache';

import type { AttachmentDraftType, AttachmentType } from '../types/Attachment';
import { isGIF } from '../types/Attachment';
import * as Attachment from '../types/Attachment';
import type { StickerPackType as StickerPackDBType } from '../sql/Interface';
import * as Stickers from '../types/Stickers';
import type { BodyRangeType, BodyRangesType } from '../types/Util';
import type { MIMEType } from '../types/MIME';
import { IMAGE_JPEG, IMAGE_WEBP, stringToMIMEType } from '../types/MIME';
import { sniffImageMimeType } from '../util/sniffImageMimeType';
import type { ConversationModel } from '../models/conversations';
import type {
  GroupV2PendingMemberType,
  MessageModelCollectionType,
  MessageAttributesType,
  ConversationModelCollectionType,
  QuotedMessageType,
} from '../model-types.d';
import type { LinkPreviewType } from '../types/message/LinkPreviews';
import type {
  MediaItemType,
  MessageAttributesType as MediaItemMessageType,
} from '../types/MediaItem';
import type { MessageModel } from '../models/messages';
import { strictAssert } from '../util/assert';
import { maybeParseUrl } from '../util/url';
import { enqueueReactionForSend } from '../reactions/enqueueReactionForSend';
import { addReportSpamJob } from '../jobs/helpers/addReportSpamJob';
import { reportSpamJobQueue } from '../jobs/reportSpamJobQueue';
import type { GroupNameCollisionsWithIdsByTitle } from '../util/groupMemberNameCollisions';
import {
  isDirectConversation,
  isGroupV1,
} from '../util/whatTypeOfConversation';
import { findAndFormatContact } from '../util/findAndFormatContact';
import * as Bytes from '../Bytes';
import {
  canReply,
  getAttachmentsForMessage,
  isIncoming,
  isOutgoing,
  isTapToView,
} from '../state/selectors/message';
import { isMessageUnread } from '../util/isMessageUnread';
import {
  getConversationSelector,
  getMessagesByConversation,
} from '../state/selectors/conversations';
import { ConversationDetailsMembershipList } from '../components/conversation/conversation-details/ConversationDetailsMembershipList';
import { showSafetyNumberChangeDialog } from '../shims/showSafetyNumberChangeDialog';
import type {
  LinkPreviewResult,
  LinkPreviewImage,
  LinkPreviewWithDomain,
} from '../types/LinkPreview';
import * as LinkPreview from '../types/LinkPreview';
import * as VisualAttachment from '../types/VisualAttachment';
import * as log from '../logging/log';
import type { AnyViewClass, BasicReactWrapperViewClass } from '../window.d';
import type { EmbeddedContactType } from '../types/EmbeddedContact';
import { createConversationView } from '../state/roots/createConversationView';
import { AttachmentToastType } from '../types/AttachmentToastType';
import type { CompositionAPIType } from '../components/CompositionArea';
import { ReadStatus } from '../messages/MessageReadStatus';
import { SignalService as Proto } from '../protobuf';
import { ToastBlocked } from '../components/ToastBlocked';
import { ToastBlockedGroup } from '../components/ToastBlockedGroup';
import { ToastCannotMixImageAndNonImageAttachments } from '../components/ToastCannotMixImageAndNonImageAttachments';
import { ToastCannotStartGroupCall } from '../components/ToastCannotStartGroupCall';
import { ToastConversationArchived } from '../components/ToastConversationArchived';
import { ToastConversationMarkedUnread } from '../components/ToastConversationMarkedUnread';
import { ToastConversationUnarchived } from '../components/ToastConversationUnarchived';
import { ToastDangerousFileType } from '../components/ToastDangerousFileType';
import { ToastDeleteForEveryoneFailed } from '../components/ToastDeleteForEveryoneFailed';
import { ToastExpired } from '../components/ToastExpired';
import { ToastFileSaved } from '../components/ToastFileSaved';
import { ToastFileSize } from '../components/ToastFileSize';
import { ToastInvalidConversation } from '../components/ToastInvalidConversation';
import { ToastLeftGroup } from '../components/ToastLeftGroup';
import { ToastMaxAttachments } from '../components/ToastMaxAttachments';
import { ToastMessageBodyTooLong } from '../components/ToastMessageBodyTooLong';
import { ToastOneNonImageAtATime } from '../components/ToastOneNonImageAtATime';
import { ToastOriginalMessageNotFound } from '../components/ToastOriginalMessageNotFound';
import { ToastPinnedConversationsFull } from '../components/ToastPinnedConversationsFull';
import { ToastReactionFailed } from '../components/ToastReactionFailed';
import { ToastReportedSpamAndBlocked } from '../components/ToastReportedSpamAndBlocked';
import { ToastTapToViewExpiredIncoming } from '../components/ToastTapToViewExpiredIncoming';
import { ToastTapToViewExpiredOutgoing } from '../components/ToastTapToViewExpiredOutgoing';
import { ToastUnableToLoadAttachment } from '../components/ToastUnableToLoadAttachment';
import { autoScale } from '../util/handleImageAttachment';
import { copyGroupLink } from '../util/copyGroupLink';
import { deleteDraftAttachment } from '../util/deleteDraftAttachment';
import { markAllAsApproved } from '../util/markAllAsApproved';
import { markAllAsVerifiedDefault } from '../util/markAllAsVerifiedDefault';
import { retryMessageSend } from '../util/retryMessageSend';
import { dropNull } from '../util/dropNull';
import { fileToBytes } from '../util/fileToBytes';
import { isNotNil } from '../util/isNotNil';
import { markViewed } from '../services/MessageUpdater';
import { openLinkInWebBrowser } from '../util/openLinkInWebBrowser';
import { resolveAttachmentDraftData } from '../util/resolveAttachmentDraftData';
import { showToast } from '../util/showToast';
import { viewSyncJobQueue } from '../jobs/viewSyncJobQueue';
import { viewedReceiptsJobQueue } from '../jobs/viewedReceiptsJobQueue';

type AttachmentOptions = {
  messageId: string;
  attachment: AttachmentType;
};

const FIVE_MINUTES = 1000 * 60 * 5;
const LINK_PREVIEW_TIMEOUT = 60 * 1000;

window.Whisper = window.Whisper || {};

const { Whisper } = window;
const { Message } = window.Signal.Types;

const {
  copyIntoTempDirectory,
  deleteTempFile,
  getAbsoluteAttachmentPath,
  getAbsoluteTempPath,
  loadAttachmentData,
  loadPreviewData,
  loadStickerData,
  openFileInFolder,
  readAttachmentData,
  saveAttachmentToDisk,
  upgradeMessageSchema,
} = window.Signal.Migrations;

const {
  getOlderMessagesByConversation,
  getMessageMetricsForConversation,
  getMessageById,
  getMessagesBySentAt,
  getNewerMessagesByConversation,
} = window.Signal.Data;

type MessageActionsType = {
  deleteMessage: (messageId: string) => unknown;
  deleteMessageForEveryone: (messageId: string) => unknown;
  displayTapToViewMessage: (messageId: string) => unknown;
  downloadAttachment: (options: {
    attachment: AttachmentType;
    timestamp: number;
    isDangerous: boolean;
  }) => unknown;
  downloadNewVersion: () => unknown;
  kickOffAttachmentDownload: (
    options: Readonly<{ messageId: string }>
  ) => unknown;
  markAttachmentAsCorrupted: (options: AttachmentOptions) => unknown;
  markViewed: (messageId: string) => unknown;
  openConversation: (conversationId: string, messageId?: string) => unknown;
  openLink: (url: string) => unknown;
  reactToMessage: (
    messageId: string,
    reaction: { emoji: string; remove: boolean }
  ) => unknown;
  replyToMessage: (messageId: string) => unknown;
  retrySend: (messageId: string) => unknown;
  showContactDetail: (options: {
    contact: EmbeddedContactType;
    signalAccount?: string;
  }) => unknown;
  showContactModal: (contactId: string) => unknown;
  showSafetyNumber: (contactId: string) => unknown;
  showExpiredIncomingTapToViewToast: () => unknown;
  showExpiredOutgoingTapToViewToast: () => unknown;
  showForwardMessageModal: (messageId: string) => unknown;
  showIdentity: (conversationId: string) => unknown;
  showMessageDetail: (messageId: string) => unknown;
  showVisualAttachment: (options: {
    attachment: AttachmentType;
    messageId: string;
    showSingle?: boolean;
  }) => unknown;
};

type MediaType = {
  path: string;
  objectURL: string;
  thumbnailObjectUrl?: string;
  contentType: MIMEType;
  index: number;
  attachment: AttachmentType;
  message: {
    attachments: Array<AttachmentType>;
    conversationId: string;
    id: string;
    // eslint-disable-next-line camelcase
    received_at: number;
    // eslint-disable-next-line camelcase
    received_at_ms: number;
    // eslint-disable-next-line camelcase
    sent_at: number;
  };
};

const MAX_MESSAGE_BODY_LENGTH = 64 * 1024;

export class ConversationView extends window.Backbone.View<ConversationModel> {
  // Debounced functions
  private debouncedMaybeGrabLinkPreview: (
    message: string,
    caretLocation?: number
  ) => void;
  private debouncedSaveDraft: (
    messageText: string,
    bodyRanges: Array<BodyRangeType>
  ) => Promise<void>;
  private lazyUpdateVerified: () => void;

  // Composing messages
  private compositionApi: {
    current: CompositionAPIType;
  } = { current: undefined };
  private sendStart?: number;

  // Quotes
  private quote?: QuotedMessageType;
  private quotedMessage?: MessageModel;

  // Previews
  private currentlyMatchedLink?: string;
  private disableLinkPreviews?: boolean;
  private excludedPreviewUrls: Array<string> = [];
  private linkPreviewAbortController?: AbortController;
  private preview?: Array<LinkPreviewResult>;

  // Sub-views
  private captionEditorView?: Backbone.View;
  private contactModalView?: Backbone.View;
  private conversationView?: BasicReactWrapperViewClass;
  private forwardMessageModal?: Backbone.View;
  private lightboxView?: BasicReactWrapperViewClass;
  private migrationDialog?: Backbone.View;
  private stickerPreviewModalView?: Backbone.View;

  // Panel support
  private panels: Array<AnyViewClass> = [];
  private previousFocus?: HTMLElement;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(...args: Array<any>) {
    super(...args);

    this.lazyUpdateVerified = debounce(
      this.model.updateVerified.bind(this.model),
      1000 // one second
    );
    this.model.throttledGetProfiles =
      this.model.throttledGetProfiles ||
      throttle(this.model.getProfiles.bind(this.model), FIVE_MINUTES);

    this.debouncedMaybeGrabLinkPreview = debounce(
      this.maybeGrabLinkPreview.bind(this),
      200
    );
    this.debouncedSaveDraft = debounce(this.saveDraft.bind(this), 200);

    // Events on Conversation model
    this.listenTo(this.model, 'destroy', this.stopListening);
    this.listenTo(this.model, 'newmessage', this.lazyUpdateVerified);

    // These are triggered by InboxView
    this.listenTo(this.model, 'opened', this.onOpened);
    this.listenTo(this.model, 'scroll-to-message', this.scrollToMessage);
    this.listenTo(this.model, 'unload', (reason: string) =>
      this.unload(`model trigger - ${reason}`)
    );

    // These are triggered by background.ts for keyboard handling
    this.listenTo(this.model, 'focus-composer', this.focusMessageField);
    this.listenTo(this.model, 'open-all-media', this.showAllMedia);
    this.listenTo(this.model, 'escape-pressed', this.resetPanel);
    this.listenTo(this.model, 'show-message-details', this.showMessageDetail);
    this.listenTo(this.model, 'show-contact-modal', this.showContactModal);
    this.listenTo(
      this.model,
      'toggle-reply',
      (messageId: string | undefined) => {
        const target = this.quote || !messageId ? null : messageId;
        this.setQuoteMessage(target);
      }
    );
    this.listenTo(
      this.model,
      'save-attachment',
      this.downloadAttachmentWrapper
    );
    this.listenTo(this.model, 'delete-message', this.deleteMessage);
    this.listenTo(this.model, 'remove-link-review', this.removeLinkPreview);
    this.listenTo(
      this.model,
      'remove-all-draft-attachments',
      this.clearAttachments
    );

    this.render();

    this.setupConversationView();
    this.updateAttachmentsView();
  }

  // eslint-disable-next-line class-methods-use-this
  events(): Record<string, string> {
    return {
      drop: 'onDrop',
      paste: 'onPaste',
    };
  }

  // We need this ignore because the backbone types really want this to be a string
  //   property, but the property isn't set until after super() is run, meaning that this
  //   classname wouldn't be applied when Backbone creates our el.
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  // eslint-disable-next-line class-methods-use-this
  className(): string {
    return 'conversation';
  }

  // Same situation as className().
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  // eslint-disable-next-line class-methods-use-this
  id(): string {
    return `conversation-${this.model.cid}`;
  }

  // Backbone.View<ConversationModel> is demanded as the return type here, and we can't
  //   satisfy it because of the above difference in signature: className is a function
  //   when it should be a plain string property.
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  render(): ConversationView {
    const template = $('#conversation').html();
    this.$el.html(render(template, {}));
    return this;
  }

  setMuteExpiration(ms = 0): void {
    this.model.setMuteExpiration(
      ms >= Number.MAX_SAFE_INTEGER ? ms : Date.now() + ms
    );
  }

  setPin(value: boolean): void {
    if (value) {
      const pinnedConversationIds = window.storage.get(
        'pinnedConversationIds',
        new Array<string>()
      );

      if (pinnedConversationIds.length >= 4) {
        showToast(ToastPinnedConversationsFull);
        return;
      }
      this.model.pin();
    } else {
      this.model.unpin();
    }
  }

  setupConversationView(): void {
    // setupHeader
    const conversationHeaderProps = {
      id: this.model.id,

      onSetDisappearingMessages: (seconds: number) =>
        this.setDisappearingMessages(seconds),
      onDeleteMessages: () => this.destroyMessages(),
      onSearchInConversation: () => {
        const { searchInConversation } = window.reduxActions.search;
        searchInConversation(this.model.id);
      },
      onSetMuteNotifications: this.setMuteExpiration.bind(this),
      onSetPin: this.setPin.bind(this),
      // These are view only and don't update the Conversation model, so they
      //   need a manual update call.
      onOutgoingAudioCallInConversation: this.onOutgoingAudioCallInConversation.bind(
        this
      ),
      onOutgoingVideoCallInConversation: this.onOutgoingVideoCallInConversation.bind(
        this
      ),

      onShowConversationDetails: () => {
        this.showConversationDetails();
      },
      onShowAllMedia: () => {
        this.showAllMedia();
      },
      onShowGroupMembers: () => {
        this.showGV1Members();
      },
      onGoBack: () => {
        this.resetPanel();
      },

      onArchive: () => {
        this.model.setArchived(true);
        this.model.trigger('unload', 'archive');

        showToast(ToastConversationArchived, {
          undo: () => {
            this.model.setArchived(false);
            this.openConversation(this.model.get('id'));
          },
        });
      },
      onMarkUnread: () => {
        this.model.setMarkedUnread(true);

        showToast(ToastConversationMarkedUnread);
      },
      onMoveToInbox: () => {
        this.model.setArchived(false);

        showToast(ToastConversationUnarchived);
      },
    };
    window.reduxActions.conversations.setSelectedConversationHeaderTitle();

    // setupTimeline
    const messageRequestEnum = Proto.SyncMessage.MessageRequestResponse.Type;

    const contactSupport = () => {
      const baseUrl =
        'https://support.signal.org/hc/LOCALE/requests/new?desktop&chat_refreshed';
      const locale = window.getLocale();
      const supportLocale = window.Signal.Util.mapToSupportLocale(locale);
      const url = baseUrl.replace('LOCALE', supportLocale);

      openLinkInWebBrowser(url);
    };

    const learnMoreAboutDeliveryIssue = () => {
      openLinkInWebBrowser(
        'https://support.signal.org/hc/articles/4404859745690'
      );
    };

    const scrollToQuotedMessage = async (
      options: Readonly<{
        authorId: string;
        sentAt: number;
      }>
    ) => {
      const { authorId, sentAt } = options;

      const conversationId = this.model.id;
      const messages = await getMessagesBySentAt(sentAt, {
        MessageCollection: Whisper.MessageCollection,
      });
      const message = messages.find(item =>
        Boolean(
          item.get('conversationId') === conversationId &&
            authorId &&
            item.getContactId() === authorId
        )
      );

      if (!message) {
        showToast(ToastOriginalMessageNotFound);
        return;
      }

      this.scrollToMessage(message.id);
    };

    const loadOlderMessages = async (oldestMessageId: string) => {
      const {
        messagesAdded,
        setMessagesLoading,
        repairOldestMessage,
      } = window.reduxActions.conversations;
      const conversationId = this.model.id;

      setMessagesLoading(conversationId, true);
      const finish = this.setInProgressFetch();

      try {
        const message = await getMessageById(oldestMessageId, {
          Message: Whisper.Message,
        });
        if (!message) {
          throw new Error(
            `loadOlderMessages: failed to load message ${oldestMessageId}`
          );
        }

        const receivedAt = message.get('received_at');
        const sentAt = message.get('sent_at');
        const models = await getOlderMessagesByConversation(conversationId, {
          receivedAt,
          sentAt,
          messageId: oldestMessageId,
          limit: 30,
          MessageCollection: Whisper.MessageCollection,
        });

        if (models.length < 1) {
          log.warn('loadOlderMessages: requested, but loaded no messages');
          repairOldestMessage(conversationId);
          return;
        }

        const cleaned = await this.cleanModels(models);
        const isNewMessage = false;
        messagesAdded(
          this.model.id,
          cleaned.map((messageModel: MessageModel) => ({
            ...messageModel.attributes,
          })),
          isNewMessage,
          window.isActive()
        );
      } catch (error) {
        setMessagesLoading(conversationId, true);
        throw error;
      } finally {
        finish();
      }
    };
    const loadNewerMessages = async (newestMessageId: string) => {
      const {
        messagesAdded,
        setMessagesLoading,
        repairNewestMessage,
      } = window.reduxActions.conversations;
      const conversationId = this.model.id;

      setMessagesLoading(conversationId, true);
      const finish = this.setInProgressFetch();

      try {
        const message = await getMessageById(newestMessageId, {
          Message: Whisper.Message,
        });
        if (!message) {
          throw new Error(
            `loadNewerMessages: failed to load message ${newestMessageId}`
          );
        }

        const receivedAt = message.get('received_at');
        const sentAt = message.get('sent_at');
        const models = await getNewerMessagesByConversation(conversationId, {
          receivedAt,
          sentAt,
          limit: 30,
          MessageCollection: Whisper.MessageCollection,
        });

        if (models.length < 1) {
          log.warn('loadNewerMessages: requested, but loaded no messages');
          repairNewestMessage(conversationId);
          return;
        }

        const cleaned = await this.cleanModels(models);
        const isNewMessage = false;
        messagesAdded(
          conversationId,
          cleaned.map((messageModel: MessageModel) => ({
            ...messageModel.attributes,
          })),
          isNewMessage,
          window.isActive()
        );
      } catch (error) {
        setMessagesLoading(conversationId, false);
        throw error;
      } finally {
        finish();
      }
    };
    const markMessageRead = async (messageId: string) => {
      if (!window.isActive()) {
        return;
      }

      const message = await getMessageById(messageId, {
        Message: Whisper.Message,
      });
      if (!message) {
        throw new Error(`markMessageRead: failed to load message ${messageId}`);
      }

      await this.model.markRead(message.get('received_at'));
    };

    const createMessageRequestResponseHandler = (
      name: string,
      enumValue: number
    ): ((conversationId: string) => void) => conversationId => {
      const conversation = window.ConversationController.get(conversationId);
      if (!conversation) {
        log.error(
          `createMessageRequestResponseHandler: Expected a conversation to be found in ${name}. Doing nothing`
        );
        return;
      }
      this.syncMessageRequestResponse(name, conversation, enumValue);
    };

    const timelineProps = {
      id: this.model.id,

      ...this.getMessageActions(),

      acknowledgeGroupMemberNameCollisions: (
        groupNameCollisions: Readonly<GroupNameCollisionsWithIdsByTitle>
      ): void => {
        this.model.acknowledgeGroupMemberNameCollisions(groupNameCollisions);
      },
      contactSupport,
      learnMoreAboutDeliveryIssue,
      loadNewerMessages,
      loadNewestMessages: this.loadNewestMessages.bind(this),
      loadAndScroll: this.loadAndScroll.bind(this),
      loadOlderMessages,
      markMessageRead,
      onBlock: createMessageRequestResponseHandler(
        'onBlock',
        messageRequestEnum.BLOCK
      ),
      onBlockAndReportSpam: (conversationId: string) => {
        const conversation = window.ConversationController.get(conversationId);
        if (!conversation) {
          log.error(
            `onBlockAndReportSpam: Expected a conversation to be found for ${conversationId}. Doing nothing.`
          );
          return;
        }
        this.blockAndReportSpam(conversation);
      },
      onDelete: createMessageRequestResponseHandler(
        'onDelete',
        messageRequestEnum.DELETE
      ),
      onUnblock: createMessageRequestResponseHandler(
        'onUnblock',
        messageRequestEnum.ACCEPT
      ),
      removeMember: (conversationId: string) => {
        this.longRunningTaskWrapper({
          name: 'removeMember',
          task: () => this.model.removeFromGroupV2(conversationId),
        });
      },
      scrollToQuotedMessage,
      unblurAvatar: () => {
        this.model.unblurAvatar();
      },
      updateSharedGroups: () => this.model.throttledUpdateSharedGroups?.(),
    };

    // setupCompositionArea
    window.reduxActions.composer.resetComposer();

    const compositionAreaProps = {
      id: this.model.id,
      compositionApi: this.compositionApi,
      onClickAddPack: () => this.showStickerManager(),
      onPickSticker: (packId: string, stickerId: number) =>
        this.sendStickerMessage({ packId, stickerId }),
      onEditorStateChange: (
        msg: string,
        bodyRanges: Array<BodyRangeType>,
        caretLocation?: number
      ) => this.onEditorStateChange(msg, bodyRanges, caretLocation),
      onTextTooLong: () => showToast(ToastMessageBodyTooLong),
      getQuotedMessage: () => this.model.get('quotedMessageId'),
      clearQuotedMessage: () => this.setQuoteMessage(null),
      onAccept: () => {
        this.syncMessageRequestResponse(
          'onAccept',
          this.model,
          messageRequestEnum.ACCEPT
        );
      },
      onBlock: () => {
        this.syncMessageRequestResponse(
          'onBlock',
          this.model,
          messageRequestEnum.BLOCK
        );
      },
      onUnblock: () => {
        this.syncMessageRequestResponse(
          'onUnblock',
          this.model,
          messageRequestEnum.ACCEPT
        );
      },
      onDelete: () => {
        this.syncMessageRequestResponse(
          'onDelete',
          this.model,
          messageRequestEnum.DELETE
        );
      },
      onBlockAndReportSpam: () => {
        this.blockAndReportSpam(this.model);
      },
      onStartGroupMigration: () => this.startMigrationToGV2(),
      onCancelJoinRequest: async () => {
        await window.showConfirmationDialog({
          message: window.i18n(
            'GroupV2--join--cancel-request-to-join--confirmation'
          ),
          okText: window.i18n('GroupV2--join--cancel-request-to-join--yes'),
          cancelText: window.i18n('GroupV2--join--cancel-request-to-join--no'),
          resolve: () => {
            this.longRunningTaskWrapper({
              name: 'onCancelJoinRequest',
              task: async () => this.model.cancelJoinRequest(),
            });
          },
        });
      },

      onClickAttachment: this.onClickAttachment.bind(this),
      onClearAttachments: this.clearAttachments.bind(this),
      onSelectMediaQuality: (isHQ: boolean) => {
        window.reduxActions.composer.setMediaQualitySetting(isHQ);
      },

      handleClickQuotedMessage: (id: string) => this.scrollToMessage(id),

      onCloseLinkPreview: () => {
        this.disableLinkPreviews = true;
        this.removeLinkPreview();
      },

      openConversation: this.openConversation.bind(this),

      onSendMessage: ({
        draftAttachments,
        mentions = [],
        message = '',
        timestamp,
        voiceNoteAttachment,
      }: {
        draftAttachments?: ReadonlyArray<AttachmentType>;
        mentions?: BodyRangesType;
        message?: string;
        timestamp?: number;
        voiceNoteAttachment?: AttachmentType;
      }): void => {
        this.sendMessage(message, mentions, {
          draftAttachments,
          timestamp,
          voiceNoteAttachment,
        });
      },
    };

    // createConversationView root

    const JSX = createConversationView(window.reduxStore, {
      compositionAreaProps,
      conversationHeaderProps,
      timelineProps,
    });

    this.conversationView = new Whisper.ReactWrapperView({ JSX });
    this.$('.ConversationView__template').append(this.conversationView.el);
  }

  async onOutgoingVideoCallInConversation(): Promise<void> {
    log.info('onOutgoingVideoCallInConversation: about to start a video call');
    const isVideoCall = true;

    if (this.model.get('announcementsOnly') && !this.model.areWeAdmin()) {
      showToast(ToastCannotStartGroupCall);
      return;
    }

    if (await this.isCallSafe()) {
      log.info(
        'onOutgoingVideoCallInConversation: call is deemed "safe". Making call'
      );
      await window.Signal.Services.calling.startCallingLobby(
        this.model.id,
        isVideoCall
      );
      log.info('onOutgoingVideoCallInConversation: started the call');
    } else {
      log.info(
        'onOutgoingVideoCallInConversation: call is deemed "unsafe". Stopping'
      );
    }
  }

  async onOutgoingAudioCallInConversation(): Promise<void> {
    log.info('onOutgoingAudioCallInConversation: about to start an audio call');

    const isVideoCall = false;

    if (await this.isCallSafe()) {
      log.info(
        'onOutgoingAudioCallInConversation: call is deemed "safe". Making call'
      );
      await window.Signal.Services.calling.startCallingLobby(
        this.model.id,
        isVideoCall
      );
      log.info('onOutgoingAudioCallInConversation: started the call');
    } else {
      log.info(
        'onOutgoingAudioCallInConversation: call is deemed "unsafe". Stopping'
      );
    }
  }

  async longRunningTaskWrapper<T>({
    name,
    task,
  }: {
    name: string;
    task: () => Promise<T>;
  }): Promise<T> {
    const idForLogging = this.model.idForLogging();
    return window.Signal.Util.longRunningTaskWrapper({
      name,
      idForLogging,
      task,
    });
  }

  getMessageActions(): MessageActionsType {
    const reactToMessage = async (
      messageId: string,
      reaction: { emoji: string; remove: boolean }
    ) => {
      const { emoji, remove } = reaction;
      try {
        await enqueueReactionForSend({
          messageId,
          emoji,
          remove,
        });
      } catch (error) {
        log.error('Error sending reaction', error, messageId, reaction);
        showToast(ToastReactionFailed);
      }
    };
    const replyToMessage = (messageId: string) => {
      this.setQuoteMessage(messageId);
    };
    const retrySend = retryMessageSend;
    const deleteMessage = (messageId: string) => {
      this.deleteMessage(messageId);
    };
    const deleteMessageForEveryone = (messageId: string) => {
      this.deleteMessageForEveryone(messageId);
    };
    const showMessageDetail = (messageId: string) => {
      this.showMessageDetail(messageId);
    };
    const showContactModal = (contactId: string) => {
      this.showContactModal(contactId);
    };
    const openConversation = (conversationId: string, messageId?: string) => {
      this.openConversation(conversationId, messageId);
    };
    const showContactDetail = (options: {
      contact: EmbeddedContactType;
      signalAccount?: string;
    }) => {
      this.showContactDetail(options);
    };
    const kickOffAttachmentDownload = async (
      options: Readonly<{ messageId: string }>
    ) => {
      const message = window.MessageController.getById(options.messageId);
      if (!message) {
        throw new Error(
          `kickOffAttachmentDownload: Message ${options.messageId} missing!`
        );
      }
      await message.queueAttachmentDownloads();
    };
    const markAttachmentAsCorrupted = (options: AttachmentOptions) => {
      const message = window.MessageController.getById(options.messageId);
      if (!message) {
        throw new Error(
          `markAttachmentAsCorrupted: Message ${options.messageId} missing!`
        );
      }
      message.markAttachmentAsCorrupted(options.attachment);
    };
    const onMarkViewed = (messageId: string): void => {
      const message = window.MessageController.getById(messageId);
      if (!message) {
        throw new Error(`onMarkViewed: Message ${messageId} missing!`);
      }

      if (message.get('readStatus') === ReadStatus.Viewed) {
        return;
      }

      const senderE164 = message.get('source');
      const senderUuid = message.get('sourceUuid');
      const timestamp = message.get('sent_at');

      message.set(markViewed(message.attributes, Date.now()));

      if (isIncoming(message.attributes)) {
        viewedReceiptsJobQueue.add({
          viewedReceipt: {
            messageId,
            senderE164,
            senderUuid,
            timestamp,
          },
        });
      }

      viewSyncJobQueue.add({
        viewSyncs: [
          {
            messageId,
            senderE164,
            senderUuid,
            timestamp,
          },
        ],
      });
    };
    const showVisualAttachment = (options: {
      attachment: AttachmentType;
      messageId: string;
      showSingle?: boolean;
    }) => {
      this.showLightbox(options);
    };
    const downloadAttachment = (options: {
      attachment: AttachmentType;
      timestamp: number;
      isDangerous: boolean;
    }) => {
      this.downloadAttachment(options);
    };
    const displayTapToViewMessage = (messageId: string) =>
      this.displayTapToViewMessage(messageId);
    const showIdentity = (conversationId: string) => {
      this.showSafetyNumber(conversationId);
    };
    const openLink = openLinkInWebBrowser;
    const downloadNewVersion = () => {
      openLinkInWebBrowser('https://signal.org/download');
    };
    const showSafetyNumber = (contactId: string) => {
      this.showSafetyNumber(contactId);
    };
    const showExpiredIncomingTapToViewToast = () => {
      log.info('Showing expired tap-to-view toast for an incoming message');
      showToast(ToastTapToViewExpiredIncoming);
    };
    const showExpiredOutgoingTapToViewToast = () => {
      log.info('Showing expired tap-to-view toast for an outgoing message');
      showToast(ToastTapToViewExpiredOutgoing);
    };

    const showForwardMessageModal = this.showForwardMessageModal.bind(this);

    return {
      deleteMessage,
      deleteMessageForEveryone,
      displayTapToViewMessage,
      downloadAttachment,
      downloadNewVersion,
      kickOffAttachmentDownload,
      markAttachmentAsCorrupted,
      markViewed: onMarkViewed,
      openConversation,
      openLink,
      reactToMessage,
      replyToMessage,
      retrySend,
      showContactDetail,
      showContactModal,
      showSafetyNumber,
      showExpiredIncomingTapToViewToast,
      showExpiredOutgoingTapToViewToast,
      showForwardMessageModal,
      showIdentity,
      showMessageDetail,
      showVisualAttachment,
    };
  }

  // eslint-disable-next-line class-methods-use-this
  async cleanModels(
    collection: MessageModelCollectionType | Array<MessageModel>
  ): Promise<Array<MessageModel>> {
    const result = collection
      .filter((message: MessageModel) => Boolean(message.id))
      .map((message: MessageModel) =>
        window.MessageController.register(message.id, message)
      );

    const eliminated = collection.length - result.length;
    if (eliminated > 0) {
      log.warn(`cleanModels: Eliminated ${eliminated} messages without an id`);
    }

    for (let max = result.length, i = 0; i < max; i += 1) {
      const message = result[i];
      const { attributes } = message;
      const { schemaVersion } = attributes;

      if (schemaVersion < Message.VERSION_NEEDED_FOR_DISPLAY) {
        // Yep, we really do want to wait for each of these
        // eslint-disable-next-line no-await-in-loop
        const upgradedMessage = await upgradeMessageSchema(attributes);
        message.set(upgradedMessage);
        // eslint-disable-next-line no-await-in-loop
        await window.Signal.Data.saveMessage(upgradedMessage);
      }
    }

    return result;
  }

  async scrollToMessage(messageId: string): Promise<void> {
    const message = await getMessageById(messageId, {
      Message: Whisper.Message,
    });
    if (!message) {
      throw new Error(`scrollToMessage: failed to load message ${messageId}`);
    }

    const state = window.reduxStore.getState();

    let isInMemory = true;

    if (!window.MessageController.getById(messageId)) {
      isInMemory = false;
    }

    // Message might be in memory, but not in the redux anymore because
    // we call `messageReset()` in `loadAndScroll()`.
    const messagesByConversation = getMessagesByConversation(state)[
      this.model.id
    ];
    if (!messagesByConversation?.messageIds.includes(messageId)) {
      isInMemory = false;
    }

    if (isInMemory) {
      const { scrollToMessage } = window.reduxActions.conversations;
      scrollToMessage(this.model.id, messageId);
      return;
    }

    this.loadAndScroll(messageId);
  }

  setInProgressFetch(): () => unknown {
    let resolvePromise: (value?: unknown) => void;
    this.model.inProgressFetch = new Promise(resolve => {
      resolvePromise = resolve;
    });

    const finish = () => {
      resolvePromise();
      this.model.inProgressFetch = undefined;
    };

    return finish;
  }

  async loadAndScroll(
    messageId: string,
    options?: { disableScroll?: boolean }
  ): Promise<void> {
    const {
      messagesReset,
      setMessagesLoading,
    } = window.reduxActions.conversations;
    const conversationId = this.model.id;

    setMessagesLoading(conversationId, true);
    const finish = this.setInProgressFetch();

    try {
      const message = await getMessageById(messageId, {
        Message: Whisper.Message,
      });
      if (!message) {
        throw new Error(
          `loadMoreAndScroll: failed to load message ${messageId}`
        );
      }

      const receivedAt = message.get('received_at');
      const sentAt = message.get('sent_at');
      const older = await getOlderMessagesByConversation(conversationId, {
        limit: 30,
        receivedAt,
        sentAt,
        messageId,
        MessageCollection: Whisper.MessageCollection,
      });
      const newer = await getNewerMessagesByConversation(conversationId, {
        limit: 30,
        receivedAt,
        sentAt,
        MessageCollection: Whisper.MessageCollection,
      });
      const metrics = await getMessageMetricsForConversation(conversationId);

      const all = [...older.models, message, ...newer.models];

      const cleaned: Array<MessageModel> = await this.cleanModels(all);
      const scrollToMessageId =
        options && options.disableScroll ? undefined : messageId;

      messagesReset(
        conversationId,
        cleaned.map((messageModel: MessageModel) => ({
          ...messageModel.attributes,
        })),
        metrics,
        scrollToMessageId
      );
    } catch (error) {
      setMessagesLoading(conversationId, false);
      throw error;
    } finally {
      finish();
    }
  }

  async loadNewestMessages(
    newestMessageId: string | undefined,
    setFocus: boolean | undefined
  ): Promise<void> {
    const {
      messagesReset,
      setMessagesLoading,
    } = window.reduxActions.conversations;
    const conversationId = this.model.id;

    setMessagesLoading(conversationId, true);
    const finish = this.setInProgressFetch();

    try {
      let scrollToLatestUnread = true;

      if (newestMessageId) {
        const newestInMemoryMessage = await getMessageById(newestMessageId, {
          Message: Whisper.Message,
        });
        if (newestInMemoryMessage) {
          // If newest in-memory message is unread, scrolling down would mean going to
          //   the very bottom, not the oldest unread.
          if (isMessageUnread(newestInMemoryMessage.attributes)) {
            scrollToLatestUnread = false;
          }
        } else {
          log.warn(
            `loadNewestMessages: did not find message ${newestMessageId}`
          );
        }
      }

      const metrics = await getMessageMetricsForConversation(conversationId);

      // If this is a message request that has not yet been accepted, we always show the
      //   oldest messages, to ensure that the ConversationHero is shown. We don't want to
      //   scroll directly to the oldest message, because that could scroll the hero off
      //   the screen.
      if (!newestMessageId && !this.model.getAccepted() && metrics.oldest) {
        this.loadAndScroll(metrics.oldest.id, { disableScroll: true });
        return;
      }

      if (scrollToLatestUnread && metrics.oldestUnread) {
        this.loadAndScroll(metrics.oldestUnread.id, {
          disableScroll: !setFocus,
        });
        return;
      }

      const messages = await getOlderMessagesByConversation(conversationId, {
        limit: 30,
        MessageCollection: Whisper.MessageCollection,
      });

      const cleaned: Array<MessageModel> = await this.cleanModels(messages);
      const scrollToMessageId =
        setFocus && metrics.newest ? metrics.newest.id : undefined;

      // Because our `getOlderMessages` fetch above didn't specify a receivedAt, we got
      //   the most recent 30 messages in the conversation. If it has a conflict with
      //   metrics, fetched a bit before, that's likely a race condition. So we tell our
      //   reducer to trust the message set we just fetched for determining if we have
      //   the newest message loaded.
      const unboundedFetch = true;
      messagesReset(
        conversationId,
        cleaned.map((messageModel: MessageModel) => ({
          ...messageModel.attributes,
        })),
        metrics,
        scrollToMessageId,
        unboundedFetch
      );
    } catch (error) {
      setMessagesLoading(conversationId, false);
      throw error;
    } finally {
      finish();
    }
  }

  async startMigrationToGV2(): Promise<void> {
    const logId = this.model.idForLogging();

    if (!isGroupV1(this.model.attributes)) {
      throw new Error(
        `startMigrationToGV2/${logId}: Cannot start, not a GroupV1 group`
      );
    }

    const onClose = () => {
      if (this.migrationDialog) {
        this.migrationDialog.remove();
        this.migrationDialog = undefined;
      }
    };
    onClose();

    const migrate = () => {
      onClose();

      this.longRunningTaskWrapper({
        name: 'initiateMigrationToGroupV2',
        task: () => window.Signal.Groups.initiateMigrationToGroupV2(this.model),
      });
    };

    // Note: this call will throw if, after generating member lists, we are no longer a
    //   member or are in the pending member list.
    const {
      droppedGV2MemberIds,
      pendingMembersV2,
    } = await this.longRunningTaskWrapper({
      name: 'getGroupMigrationMembers',
      task: () => window.Signal.Groups.getGroupMigrationMembers(this.model),
    });

    const invitedMemberIds = pendingMembersV2.map(
      (item: GroupV2PendingMemberType) => item.uuid
    );

    this.migrationDialog = new Whisper.ReactWrapperView({
      className: 'group-v1-migration-wrapper',
      JSX: window.Signal.State.Roots.createGroupV1MigrationModal(
        window.reduxStore,
        {
          areWeInvited: false,
          droppedMemberIds: droppedGV2MemberIds,
          hasMigrated: false,
          invitedMemberIds,
          migrate,
          onClose,
        }
      ),
    });
  }

  // TODO DESKTOP-2426
  async processAttachments(files: Array<File>): Promise<void> {
    const {
      addAttachment,
      addPendingAttachment,
      processAttachments,
      removeAttachment,
    } = window.reduxActions.composer;

    await processAttachments({
      addAttachment,
      addPendingAttachment,
      conversationId: this.model.id,
      draftAttachments: this.model.get('draftAttachments') || [],
      files,
      onShowToast: (toastType: AttachmentToastType) => {
        if (toastType === AttachmentToastType.ToastFileSize) {
          showToast(ToastFileSize, {
            limit: 100,
            units: 'MB',
          });
        } else if (toastType === AttachmentToastType.ToastDangerousFileType) {
          showToast(ToastDangerousFileType);
        } else if (toastType === AttachmentToastType.ToastMaxAttachments) {
          showToast(ToastMaxAttachments);
        } else if (toastType === AttachmentToastType.ToastOneNonImageAtATime) {
          showToast(ToastOneNonImageAtATime);
        } else if (
          toastType ===
          AttachmentToastType.ToastCannotMixImageAndNonImageAttachments
        ) {
          showToast(ToastCannotMixImageAndNonImageAttachments);
        } else if (
          toastType === AttachmentToastType.ToastUnableToLoadAttachment
        ) {
          showToast(ToastUnableToLoadAttachment);
        }
      },
      removeAttachment,
    });
  }

  unload(reason: string): void {
    log.info(
      'unloading conversation',
      this.model.idForLogging(),
      'due to:',
      reason
    );

    const { conversationUnloaded } = window.reduxActions.conversations;
    if (conversationUnloaded) {
      conversationUnloaded(this.model.id);
    }

    if (this.model.get('draftChanged')) {
      if (this.model.hasDraft()) {
        const now = Date.now();
        const active_at = this.model.get('active_at') || now;

        this.model.set({
          active_at,
          draftChanged: false,
          draftTimestamp: now,
          timestamp: now,
        });
      } else {
        this.model.set({
          draftChanged: false,
          draftTimestamp: null,
        });
      }

      // We don't wait here; we need to take down the view
      this.saveModel();

      this.model.updateLastMessage();
    }

    this.conversationView?.remove();

    if (this.captionEditorView) {
      this.captionEditorView.remove();
    }
    if (this.contactModalView) {
      this.contactModalView.remove();
    }
    if (this.stickerPreviewModalView) {
      this.stickerPreviewModalView.remove();
    }
    if (this.lightboxView) {
      this.lightboxView.remove();
    }
    if (this.panels && this.panels.length) {
      for (let i = 0, max = this.panels.length; i < max; i += 1) {
        const panel = this.panels[i];
        panel.remove();
      }
      window.reduxActions.conversations.setSelectedConversationPanelDepth(0);
    }

    this.removeLinkPreview();
    this.disableLinkPreviews = true;

    this.remove();
  }

  async onDrop(e: JQuery.TriggeredEvent): Promise<void> {
    if (!e.originalEvent) {
      return;
    }
    const event = e.originalEvent as DragEvent;
    if (!event.dataTransfer) {
      return;
    }

    if (event.dataTransfer.types[0] !== 'Files') {
      return;
    }

    e.stopPropagation();
    e.preventDefault();

    const { files } = event.dataTransfer;
    this.processAttachments(Array.from(files));
  }

  onPaste(e: JQuery.TriggeredEvent): void {
    if (!e.originalEvent) {
      return;
    }
    const event = e.originalEvent as ClipboardEvent;
    if (!event.clipboardData) {
      return;
    }
    const { items } = event.clipboardData;

    const anyImages = [...items].some(
      item => item.type.split('/')[0] === 'image'
    );
    if (!anyImages) {
      return;
    }

    e.stopPropagation();
    e.preventDefault();

    const files: Array<File> = [];
    for (let i = 0; i < items.length; i += 1) {
      if (items[i].type.split('/')[0] === 'image') {
        const file = items[i].getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }

    this.processAttachments(files);
  }

  syncMessageRequestResponse(
    name: string,
    model: ConversationModel,
    messageRequestType: number
  ): Promise<void> {
    return this.longRunningTaskWrapper({
      name,
      task: model.syncMessageRequestResponse.bind(model, messageRequestType),
    });
  }

  blockAndReportSpam(model: ConversationModel): Promise<void> {
    const messageRequestEnum = Proto.SyncMessage.MessageRequestResponse.Type;

    return this.longRunningTaskWrapper({
      name: 'blockAndReportSpam',
      task: async () => {
        await Promise.all([
          model.syncMessageRequestResponse(messageRequestEnum.BLOCK),
          addReportSpamJob({
            conversation: model.format(),
            getMessageServerGuidsForSpam:
              window.Signal.Data.getMessageServerGuidsForSpam,
            jobQueue: reportSpamJobQueue,
          }),
        ]);
        showToast(ToastReportedSpamAndBlocked);
      },
    });
  }

  onClickAttachment(attachment: AttachmentDraftType): void {
    if (attachment.pending) {
      throw new Error(
        'onClickAttachment: Cannot click to edit pending attachment'
      );
    }

    const getProps = () => {
      if (attachment.pending) {
        throw new Error(
          'onClickAttachment/onSave: Cannot render pending attachment'
        );
      }

      return {
        url: attachment.url,
        caption: attachment.caption,
        attachment,
        onSave,
      };
    };

    const onSave = (caption?: string) => {
      const attachments = this.model.get('draftAttachments') || [];

      this.model.set({
        draftAttachments: attachments.map((item: AttachmentType) => {
          if (item.pending || attachment.pending) {
            return item;
          }

          if (
            (item.path && item.path === attachment.path) ||
            (item.screenshotPath &&
              item.screenshotPath === attachment.screenshotPath)
          ) {
            return {
              ...attachment,
              caption,
            };
          }

          return item;
        }),
        draftChanged: true,
      });

      if (this.captionEditorView) {
        this.captionEditorView.remove();
        this.captionEditorView = undefined;
      }
      window.Signal.Backbone.Views.Lightbox.hide();

      this.updateAttachmentsView();
      this.saveModel();
    };

    this.captionEditorView = new Whisper.ReactWrapperView({
      className: 'attachment-list-wrapper',
      Component: window.Signal.Components.CaptionEditor,
      props: getProps(),
      onClose: () => window.Signal.Backbone.Views.Lightbox.hide(),
    });
    window.Signal.Backbone.Views.Lightbox.show(this.captionEditorView.el);
  }

  async saveModel(): Promise<void> {
    window.Signal.Data.updateConversation(this.model.attributes);
  }

  async clearAttachments(): Promise<void> {
    const draftAttachments = this.model.get('draftAttachments') || [];
    this.model.set({
      draftAttachments: [],
      draftChanged: true,
    });

    this.updateAttachmentsView();

    // We're fine doing this all at once; at most it should be 32 attachments
    await Promise.all([
      this.saveModel(),
      Promise.all(
        draftAttachments.map(attachment => deleteDraftAttachment(attachment))
      ),
    ]);
  }

  hasFiles(options: { includePending: boolean }): boolean {
    const draftAttachments = this.model.get('draftAttachments') || [];
    if (options.includePending) {
      return draftAttachments.length > 0;
    }

    return draftAttachments.some(item => !item.pending);
  }

  updateAttachmentsView(): void {
    const draftAttachments = this.model.get('draftAttachments') || [];
    window.reduxActions.composer.replaceAttachments(
      this.model.get('id'),
      draftAttachments
    );
    if (this.hasFiles({ includePending: true })) {
      this.removeLinkPreview();
    }
  }

  async onOpened(messageId: string): Promise<void> {
    if (messageId) {
      const message = await getMessageById(messageId, {
        Message: Whisper.Message,
      });

      if (message) {
        this.loadAndScroll(messageId);
        return;
      }

      log.warn(`onOpened: Did not find message ${messageId}`);
    }

    const { retryPlaceholders } = window.Signal.Services;
    if (retryPlaceholders) {
      await retryPlaceholders.findByConversationAndMarkOpened(this.model.id);
    }

    this.loadNewestMessages(undefined, undefined);
    this.model.updateLastMessage();

    this.focusMessageField();

    const quotedMessageId = this.model.get('quotedMessageId');
    if (quotedMessageId) {
      this.setQuoteMessage(quotedMessageId);
    }

    this.model.fetchLatestGroupV2Data();
    strictAssert(
      this.model.throttledMaybeMigrateV1Group !== undefined,
      'Conversation model should be initialized'
    );
    this.model.throttledMaybeMigrateV1Group();
    strictAssert(
      this.model.throttledFetchSMSOnlyUUID !== undefined,
      'Conversation model should be initialized'
    );
    this.model.throttledFetchSMSOnlyUUID();

    strictAssert(
      this.model.throttledGetProfiles !== undefined,
      'Conversation model should be initialized'
    );
    await this.model.throttledGetProfiles();

    this.model.updateVerified();
  }

  async showForwardMessageModal(messageId: string): Promise<void> {
    const messageFromCache = window.MessageController.getById(messageId);
    if (!messageFromCache) {
      log.info('showForwardMessageModal: Fetching message from database');
    }
    const message =
      messageFromCache ||
      (await window.Signal.Data.getMessageById(messageId, {
        Message: window.Whisper.Message,
      }));

    if (!message) {
      throw new Error(`showForwardMessageModal: Message ${messageId} missing!`);
    }

    const attachments = getAttachmentsForMessage(message.attributes);
    this.forwardMessageModal = new Whisper.ReactWrapperView({
      JSX: window.Signal.State.Roots.createForwardMessageModal(
        window.reduxStore,
        {
          attachments,
          conversationId: this.model.id,
          doForwardMessage: async (
            conversationIds: Array<string>,
            messageBody?: string,
            includedAttachments?: Array<AttachmentType>,
            linkPreview?: LinkPreviewType
          ) => {
            try {
              const didForwardSuccessfully = await this.maybeForwardMessage(
                message,
                conversationIds,
                messageBody,
                includedAttachments,
                linkPreview
              );

              if (didForwardSuccessfully && this.forwardMessageModal) {
                this.forwardMessageModal.remove();
                this.forwardMessageModal = undefined;
              }
            } catch (err) {
              log.warn('doForwardMessage', err && err.stack ? err.stack : err);
            }
          },
          isSticker: Boolean(message.get('sticker')),
          messageBody: message.getRawText(),
          onClose: () => {
            if (this.forwardMessageModal) {
              this.forwardMessageModal.remove();
              this.forwardMessageModal = undefined;
            }
            this.resetLinkPreview();
          },
          onEditorStateChange: (
            messageText: string,
            _: Array<BodyRangeType>,
            caretLocation?: number
          ) => {
            if (!attachments.length) {
              this.debouncedMaybeGrabLinkPreview(messageText, caretLocation);
            }
          },
          onTextTooLong: () => showToast(ToastMessageBodyTooLong),
        }
      ),
    });
    this.forwardMessageModal.render();
  }

  async maybeForwardMessage(
    message: MessageModel,
    conversationIds: Array<string>,
    messageBody?: string,
    attachments?: Array<AttachmentType>,
    linkPreview?: LinkPreviewType
  ): Promise<boolean> {
    log.info(`maybeForwardMessage/${message.idForLogging()}: Starting...`);
    const attachmentLookup = new Set();
    if (attachments) {
      attachments.forEach(attachment => {
        attachmentLookup.add(
          `${attachment.fileName}/${attachment.contentType}`
        );
      });
    }

    const conversations = conversationIds.map(id =>
      window.ConversationController.get(id)
    );

    const cannotSend = conversations.some(
      conversation =>
        conversation?.get('announcementsOnly') && !conversation.areWeAdmin()
    );
    if (cannotSend) {
      throw new Error('Cannot send to group');
    }

    // Verify that all contacts that we're forwarding
    // to are verified and trusted
    const unverifiedContacts: Array<ConversationModel> = [];
    const untrustedContacts: Array<ConversationModel> = [];
    await Promise.all(
      conversations.map(async conversation => {
        if (conversation) {
          await conversation.updateVerified();
          const unverifieds = conversation.getUnverified();
          if (unverifieds.length) {
            unverifieds.forEach(unverifiedConversation =>
              unverifiedContacts.push(unverifiedConversation)
            );
          }

          const untrusted = conversation.getUntrusted();
          if (untrusted.length) {
            untrusted.forEach(untrustedConversation =>
              untrustedContacts.push(untrustedConversation)
            );
          }
        }
      })
    );

    // If there are any unverified or untrusted contacts, show the
    // SendAnywayDialog and if we're fine with sending then mark all as
    // verified and trusted and continue the send.
    const iffyConversations = [...unverifiedContacts, ...untrustedContacts];
    if (iffyConversations.length) {
      const forwardMessageModal = document.querySelector<HTMLElement>(
        '.module-ForwardMessageModal'
      );
      if (forwardMessageModal) {
        forwardMessageModal.style.display = 'none';
      }
      const sendAnyway = await this.showSendAnywayDialog(iffyConversations);

      if (!sendAnyway) {
        if (forwardMessageModal) {
          forwardMessageModal.style.display = 'block';
        }
        return false;
      }

      let verifyPromise: Promise<void> | undefined;
      let approvePromise: Promise<void> | undefined;
      if (unverifiedContacts.length) {
        verifyPromise = markAllAsVerifiedDefault(unverifiedContacts);
      }
      if (untrustedContacts.length) {
        approvePromise = markAllAsApproved(untrustedContacts);
      }
      await Promise.all([verifyPromise, approvePromise]);
    }

    const sendMessageOptions = { dontClearDraft: true };
    const baseTimestamp = Date.now();

    // Actually send the message
    // load any sticker data, attachments, or link previews that we need to
    // send along with the message and do the send to each conversation.
    await Promise.all(
      conversations.map(async (conversation, offset) => {
        const timestamp = baseTimestamp + offset;
        if (conversation) {
          const sticker = message.get('sticker');
          if (sticker) {
            const stickerWithData = await loadStickerData(sticker);
            const stickerNoPath = stickerWithData
              ? {
                  ...stickerWithData,
                  data: {
                    ...stickerWithData.data,
                    path: undefined,
                  },
                }
              : undefined;

            conversation.enqueueMessageForSend(
              undefined, // body
              [],
              undefined, // quote
              [],
              stickerNoPath,
              undefined, // BodyRanges
              { ...sendMessageOptions, timestamp }
            );
          } else {
            const preview = linkPreview
              ? await loadPreviewData([linkPreview])
              : [];
            const attachmentsWithData = await Promise.all(
              (attachments || []).map(async item => ({
                ...(await loadAttachmentData(item)),
                path: undefined,
              }))
            );
            const attachmentsToSend = attachmentsWithData.filter(
              (attachment: Partial<AttachmentType>) =>
                attachmentLookup.has(
                  `${attachment.fileName}/${attachment.contentType}`
                )
            );

            conversation.enqueueMessageForSend(
              messageBody || undefined,
              attachmentsToSend,
              undefined, // quote
              preview,
              undefined, // sticker
              undefined, // BodyRanges
              { ...sendMessageOptions, timestamp }
            );
          }
        }
      })
    );

    // Cancel any link still pending, even if it didn't make it into the message
    this.resetLinkPreview();

    return true;
  }

  showAllMedia(): void {
    if (document.querySelectorAll('.module-media-gallery').length) {
      return;
    }

    // We fetch more documents than media as they don’t require to be loaded
    // into memory right away. Revisit this once we have infinite scrolling:
    const DEFAULT_MEDIA_FETCH_COUNT = 50;
    const DEFAULT_DOCUMENTS_FETCH_COUNT = 150;

    const conversationId = this.model.get('id');

    const getProps = async () => {
      const rawMedia = await window.Signal.Data.getMessagesWithVisualMediaAttachments(
        conversationId,
        {
          limit: DEFAULT_MEDIA_FETCH_COUNT,
        }
      );
      const rawDocuments = await window.Signal.Data.getMessagesWithFileAttachments(
        conversationId,
        {
          limit: DEFAULT_DOCUMENTS_FETCH_COUNT,
        }
      );

      // First we upgrade these messages to ensure that they have thumbnails
      for (let max = rawMedia.length, i = 0; i < max; i += 1) {
        const message = rawMedia[i];
        const { schemaVersion } = message;

        if (
          schemaVersion &&
          schemaVersion < Message.VERSION_NEEDED_FOR_DISPLAY
        ) {
          // Yep, we really do want to wait for each of these
          // eslint-disable-next-line no-await-in-loop
          rawMedia[i] = await upgradeMessageSchema(message);
          // eslint-disable-next-line no-await-in-loop
          await window.Signal.Data.saveMessage(rawMedia[i]);
        }
      }

      const media: Array<MediaType> = flatten(
        rawMedia.map(message => {
          return (message.attachments || []).map(
            (
              attachment: AttachmentType,
              index: number
            ): MediaType | undefined => {
              if (
                !attachment.path ||
                !attachment.thumbnail ||
                attachment.pending ||
                attachment.error
              ) {
                return;
              }

              const { thumbnail } = attachment;
              return {
                path: attachment.path,
                objectURL: getAbsoluteAttachmentPath(attachment.path),
                thumbnailObjectUrl: thumbnail
                  ? getAbsoluteAttachmentPath(thumbnail.path)
                  : undefined,
                contentType: attachment.contentType,
                index,
                attachment,
                message: {
                  attachments: message.attachments || [],
                  conversationId:
                    window.ConversationController.get(
                      window.ConversationController.ensureContactIds({
                        uuid: message.sourceUuid,
                        e164: message.source,
                      })
                    )?.id || message.conversationId,
                  id: message.id,
                  received_at: message.received_at,
                  received_at_ms: Number(message.received_at_ms),
                  sent_at: message.sent_at,
                },
              };
            }
          );
        })
      ).filter(isNotNil);

      // Unlike visual media, only one non-image attachment is supported
      const documents = rawDocuments
        .filter(message =>
          Boolean(message.attachments && message.attachments.length)
        )
        .map(message => {
          const attachments = message.attachments || [];
          const attachment = attachments[0];
          return {
            contentType: attachment.contentType,
            index: 0,
            attachment,
            message,
          };
        });

      const saveAttachment = async ({
        attachment,
        message,
      }: {
        attachment: AttachmentType;
        message: Pick<MessageAttributesType, 'sent_at'>;
      }) => {
        const timestamp = message.sent_at;
        const fullPath = await Attachment.save({
          attachment,
          readAttachmentData,
          saveAttachmentToDisk,
          timestamp,
        });

        if (fullPath) {
          showToast(ToastFileSaved, {
            onOpenFile: () => {
              openFileInFolder(fullPath);
            },
          });
        }
      };

      const onItemClick = async ({
        message,
        attachment,
        type,
      }: {
        message: MessageAttributesType;
        attachment: AttachmentType;
        type: 'documents' | 'media';
      }) => {
        switch (type) {
          case 'documents': {
            saveAttachment({ message, attachment });
            break;
          }

          case 'media': {
            const selectedMedia =
              media.find(item => attachment.path === item.path) || media[0];
            this.showLightboxForMedia(selectedMedia, media);
            break;
          }

          default:
            throw new TypeError(`Unknown attachment type: '${type}'`);
        }
      };

      return {
        documents,
        media,
        onItemClick,
      };
    };

    function getMessageIds(): Array<string | undefined> | undefined {
      const state = window.reduxStore.getState();
      const byConversation = state?.conversations?.messagesByConversation;
      const messages = byConversation && byConversation[conversationId];
      if (!messages || !messages.messageIds) {
        return undefined;
      }

      return messages.messageIds;
    }

    // Detect message changes in the current conversation
    let previousMessageList: Array<string | undefined> | undefined;
    previousMessageList = getMessageIds();

    const unsubscribe = window.reduxStore.subscribe(() => {
      const currentMessageList = getMessageIds();
      if (currentMessageList !== previousMessageList) {
        update();
        previousMessageList = currentMessageList;
      }
    });

    const view = new Whisper.ReactWrapperView({
      className: 'panel',
      Component: window.Signal.Components.MediaGallery,
      onClose: () => {
        unsubscribe();
      },
    });
    view.headerTitle = window.i18n('allMedia');

    const update = async () => {
      view.update(await getProps());
    };

    this.listenBack(view);

    update();
  }

  focusMessageField(): void {
    if (this.panels && this.panels.length) {
      return;
    }

    this.compositionApi.current?.focusInput();
  }

  disableMessageField(): void {
    this.compositionApi.current?.setDisabled(true);
  }

  enableMessageField(): void {
    this.compositionApi.current?.setDisabled(false);
  }

  resetEmojiResults(): void {
    this.compositionApi.current?.resetEmojiResults();
  }

  showGV1Members(): void {
    const { contactCollection } = this.model;

    const memberships =
      contactCollection?.map((conversation: ConversationModel) => {
        return {
          isAdmin: false,
          member: conversation.format(),
        };
      }) || [];

    const view = new Whisper.ReactWrapperView({
      className: 'group-member-list panel',
      Component: ConversationDetailsMembershipList,
      props: {
        canAddNewMembers: false,
        i18n: window.i18n,
        maxShownMemberCount: 32,
        memberships,
        showContactModal: this.showContactModal.bind(this),
      },
    });

    this.listenBack(view);
    view.render();
  }

  showSafetyNumber(id?: string): void {
    let conversation: undefined | ConversationModel;

    if (!id && isDirectConversation(this.model.attributes)) {
      // eslint-disable-next-line prefer-destructuring
      conversation = this.model;
    } else {
      conversation = window.ConversationController.get(id);
    }
    if (conversation) {
      window.reduxActions.globalModals.toggleSafetyNumberModal(
        conversation.get('id')
      );
    }
  }

  downloadAttachmentWrapper(
    messageId: string,
    providedAttachment?: AttachmentType
  ): void {
    const message = window.MessageController.getById(messageId);
    if (!message) {
      throw new Error(
        `downloadAttachmentWrapper: Message ${messageId} missing!`
      );
    }

    const { attachments, sent_at: timestamp } = message.attributes;
    if (!attachments || attachments.length < 1) {
      return;
    }

    const attachment =
      providedAttachment && attachments.includes(providedAttachment)
        ? providedAttachment
        : attachments[0];
    const { fileName } = attachment;

    const isDangerous = window.Signal.Util.isFileDangerous(fileName || '');

    this.downloadAttachment({ attachment, timestamp, isDangerous });
  }

  // eslint-disable-next-line class-methods-use-this
  async downloadAttachment({
    attachment,
    timestamp,
    isDangerous,
  }: {
    attachment: AttachmentType;
    timestamp: number;
    isDangerous: boolean;
  }): Promise<void> {
    if (isDangerous) {
      showToast(ToastDangerousFileType);
      return;
    }

    const fullPath = await Attachment.save({
      attachment,
      readAttachmentData,
      saveAttachmentToDisk,
      timestamp,
    });

    if (fullPath) {
      showToast(ToastFileSaved, {
        onOpenFile: () => {
          openFileInFolder(fullPath);
        },
      });
    }
  }

  async displayTapToViewMessage(messageId: string): Promise<void> {
    log.info('displayTapToViewMessage: attempting to display message');

    const message = window.MessageController.getById(messageId);
    if (!message) {
      throw new Error(`displayTapToViewMessage: Message ${messageId} missing!`);
    }

    if (!isTapToView(message.attributes)) {
      throw new Error(
        `displayTapToViewMessage: Message ${message.idForLogging()} is not a tap to view message`
      );
    }

    if (message.isErased()) {
      throw new Error(
        `displayTapToViewMessage: Message ${message.idForLogging()} is already erased`
      );
    }

    const firstAttachment = (message.get('attachments') || [])[0];
    if (!firstAttachment || !firstAttachment.path) {
      throw new Error(
        `displayTapToViewMessage: Message ${message.idForLogging()} had no first attachment with path`
      );
    }

    const absolutePath = getAbsoluteAttachmentPath(firstAttachment.path);
    const { path: tempPath } = await copyIntoTempDirectory(absolutePath);
    const tempAttachment = {
      ...firstAttachment,
      path: tempPath,
    };

    await message.markViewOnceMessageViewed();

    const closeLightbox = async () => {
      log.info('displayTapToViewMessage: attempting to close lightbox');

      if (!this.lightboxView) {
        log.info('displayTapToViewMessage: lightbox was already closed');
        return;
      }

      const { lightboxView } = this;
      this.lightboxView = undefined;

      this.stopListening(message);
      window.Signal.Backbone.Views.Lightbox.hide();
      lightboxView.remove();

      await deleteTempFile(tempPath);
    };
    this.listenTo(message, 'expired', closeLightbox);
    this.listenTo(message, 'change', () => {
      if (this.lightboxView) {
        this.lightboxView.update(getProps());
      }
    });

    const getProps = () => {
      const { path, contentType } = tempAttachment;

      return {
        media: [
          {
            attachment: tempAttachment,
            objectURL: getAbsoluteTempPath(path),
            contentType,
            index: 0,
            message: {
              attachments: message.get('attachments'),
              id: message.get('id'),
              conversationId: message.get('conversationId'),
              received_at: message.get('received_at'),
              received_at_ms: Number(message.get('received_at_ms')),
              sent_at: message.get('sent_at'),
            },
          },
        ],
        isViewOnce: true,
      };
    };

    if (this.lightboxView) {
      this.lightboxView.remove();
      this.lightboxView = undefined;
    }

    this.lightboxView = new Whisper.ReactWrapperView({
      className: 'lightbox-wrapper',
      Component: window.Signal.Components.Lightbox,
      props: getProps(),
      onClose: closeLightbox,
    });

    window.Signal.Backbone.Views.Lightbox.show(this.lightboxView.el);

    log.info('displayTapToViewMessage: showed lightbox');
  }

  deleteMessage(messageId: string): void {
    const message = window.MessageController.getById(messageId);
    if (!message) {
      throw new Error(`deleteMessage: Message ${messageId} missing!`);
    }

    window.showConfirmationDialog({
      confirmStyle: 'negative',
      message: window.i18n('deleteWarning'),
      okText: window.i18n('delete'),
      resolve: () => {
        window.Signal.Data.removeMessage(message.id, {
          Message: Whisper.Message,
        });
        message.cleanup();
        if (isOutgoing(message.attributes)) {
          this.model.decrementSentMessageCount();
        } else {
          this.model.decrementMessageCount();
        }
        this.resetPanel();
      },
    });
  }

  deleteMessageForEveryone(messageId: string): void {
    const message = window.MessageController.getById(messageId);
    if (!message) {
      throw new Error(
        `deleteMessageForEveryone: Message ${messageId} missing!`
      );
    }

    window.showConfirmationDialog({
      confirmStyle: 'negative',
      message: window.i18n('deleteForEveryoneWarning'),
      okText: window.i18n('delete'),
      resolve: async () => {
        try {
          await this.model.sendDeleteForEveryoneMessage({
            id: message.id,
            timestamp: message.get('sent_at'),
          });
        } catch (error) {
          log.error(
            'Error sending delete-for-everyone',
            error && error.stack,
            messageId
          );
          showToast(ToastDeleteForEveryoneFailed);
        }
        this.resetPanel();
      },
    });
  }

  showStickerPackPreview(packId: string, packKey: string): void {
    Stickers.downloadEphemeralPack(packId, packKey);

    const props = {
      packId,
      onClose: async () => {
        if (this.stickerPreviewModalView) {
          this.stickerPreviewModalView.remove();
          this.stickerPreviewModalView = undefined;
        }
        await Stickers.removeEphemeralPack(packId);
      },
    };

    this.stickerPreviewModalView = new Whisper.ReactWrapperView({
      className: 'sticker-preview-modal-wrapper',
      JSX: window.Signal.State.Roots.createStickerPreviewModal(
        window.reduxStore,
        props
      ),
    });
  }

  showLightboxForMedia(
    selectedMediaItem: MediaItemType,
    media: Array<MediaItemType> = []
  ): void {
    const onSave = async ({
      attachment,
      message,
      index,
    }: {
      attachment: AttachmentType;
      message: MediaItemMessageType;
      index: number;
    }) => {
      const fullPath = await Attachment.save({
        attachment,
        index: index + 1,
        readAttachmentData,
        saveAttachmentToDisk,
        timestamp: message.sent_at,
      });

      if (fullPath) {
        showToast(ToastFileSaved, {
          onOpenFile: () => {
            openFileInFolder(fullPath);
          },
        });
      }
    };

    const selectedIndex = media.findIndex(
      mediaItem =>
        mediaItem.attachment.path === selectedMediaItem.attachment.path
    );

    if (this.lightboxView) {
      this.lightboxView.remove();
      this.lightboxView = undefined;
    }

    this.lightboxView = new Whisper.ReactWrapperView({
      className: 'lightbox-wrapper',
      Component: window.Signal.Components.Lightbox,
      props: {
        getConversation: getConversationSelector(window.reduxStore.getState()),
        media,
        onForward: this.showForwardMessageModal.bind(this),
        onSave,
        selectedIndex: selectedIndex >= 0 ? selectedIndex : 0,
      },
      onClose: () => window.Signal.Backbone.Views.Lightbox.hide(),
    });

    window.Signal.Backbone.Views.Lightbox.show(this.lightboxView.el);
  }

  showLightbox({
    attachment,
    messageId,
  }: {
    attachment: AttachmentType;
    messageId: string;
    showSingle?: boolean;
  }): void {
    const message = window.MessageController.getById(messageId);
    if (!message) {
      throw new Error(`showLightbox: Message ${messageId} missing!`);
    }
    const sticker = message.get('sticker');
    if (sticker) {
      const { packId, packKey } = sticker;
      this.showStickerPackPreview(packId, packKey);
      return;
    }

    const { contentType } = attachment;

    if (
      !window.Signal.Util.GoogleChrome.isImageTypeSupported(contentType) &&
      !window.Signal.Util.GoogleChrome.isVideoTypeSupported(contentType)
    ) {
      this.downloadAttachmentWrapper(messageId, attachment);
      return;
    }

    const attachments: Array<AttachmentType> = message.get('attachments') || [];

    const loop = isGIF(attachments);

    const media = attachments
      .filter(item => item.thumbnail && !item.pending && !item.error)
      .map((item, index) => ({
        objectURL: getAbsoluteAttachmentPath(item.path ?? ''),
        path: item.path,
        contentType: item.contentType,
        loop,
        index,
        message: {
          attachments: message.get('attachments') || [],
          id: message.get('id'),
          conversationId:
            window.ConversationController.get(
              window.ConversationController.ensureContactIds({
                uuid: message.get('sourceUuid'),
                e164: message.get('source'),
              })
            )?.id || message.get('conversationId'),
          received_at: message.get('received_at'),
          received_at_ms: Number(message.get('received_at_ms')),
          sent_at: message.get('sent_at'),
        },
        attachment: item,
        thumbnailObjectUrl:
          item.thumbnail?.objectUrl ||
          getAbsoluteAttachmentPath(item.thumbnail?.path ?? ''),
      }));

    const selectedMedia =
      media.find(item => attachment.path === item.path) || media[0];

    this.showLightboxForMedia(selectedMedia, media);
  }

  showContactModal(contactId: string): void {
    window.reduxActions.globalModals.showContactModal(contactId, this.model.id);
  }

  showGroupLinkManagement(): void {
    const view = new Whisper.ReactWrapperView({
      className: 'panel',
      JSX: window.Signal.State.Roots.createGroupLinkManagement(
        window.reduxStore,
        {
          changeHasGroupLink: this.changeHasGroupLink.bind(this),
          conversationId: this.model.id,
          copyGroupLink,
          generateNewGroupLink: this.generateNewGroupLink.bind(this),
          setAccessControlAddFromInviteLinkSetting: this.setAccessControlAddFromInviteLinkSetting.bind(
            this
          ),
        }
      ),
    });
    view.headerTitle = window.i18n('ConversationDetails--group-link');

    this.listenBack(view);
    view.render();
  }

  showGroupV2Permissions(): void {
    const view = new Whisper.ReactWrapperView({
      className: 'panel',
      JSX: window.Signal.State.Roots.createGroupV2Permissions(
        window.reduxStore,
        {
          conversationId: this.model.id,
          setAccessControlAttributesSetting: this.setAccessControlAttributesSetting.bind(
            this
          ),
          setAccessControlMembersSetting: this.setAccessControlMembersSetting.bind(
            this
          ),
          setAnnouncementsOnly: this.setAnnouncementsOnly.bind(this),
        }
      ),
    });
    view.headerTitle = window.i18n('permissions');

    this.listenBack(view);
    view.render();
  }

  showPendingInvites(): void {
    const view = new Whisper.ReactWrapperView({
      className: 'panel',
      JSX: window.Signal.State.Roots.createPendingInvites(window.reduxStore, {
        conversationId: this.model.id,
        ourConversationId: window.ConversationController.getOurConversationId(),
        approvePendingMembership: (conversationId: string) => {
          this.model.approvePendingMembershipFromGroupV2(conversationId);
        },
        revokePendingMemberships: conversationIds => {
          this.model.revokePendingMembershipsFromGroupV2(conversationIds);
        },
      }),
    });
    view.headerTitle = window.i18n('ConversationDetails--requests-and-invites');

    this.listenBack(view);
    view.render();
  }

  showConversationNotificationsSettings(): void {
    const view = new Whisper.ReactWrapperView({
      className: 'panel',
      JSX: window.Signal.State.Roots.createConversationNotificationsSettings(
        window.reduxStore,
        {
          conversationId: this.model.id,
          setDontNotifyForMentionsIfMuted: this.model.setDontNotifyForMentionsIfMuted.bind(
            this.model
          ),
          setMuteExpiration: this.setMuteExpiration.bind(this),
        }
      ),
    });
    view.headerTitle = window.i18n('ConversationDetails--notifications');

    this.listenBack(view);
    view.render();
  }

  showChatColorEditor(): void {
    const view = new Whisper.ReactWrapperView({
      className: 'panel',
      JSX: window.Signal.State.Roots.createChatColorPicker(window.reduxStore, {
        conversationId: this.model.get('id'),
      }),
    });

    view.headerTitle = window.i18n('ChatColorPicker__menu-title');

    this.listenBack(view);
    view.render();
  }

  showConversationDetails(): void {
    // Run a getProfiles in case member's capabilities have changed
    // Redux should cover us on the return here so no need to await this.
    if (this.model.throttledGetProfiles) {
      this.model.throttledGetProfiles();
    }

    const messageRequestEnum = Proto.SyncMessage.MessageRequestResponse.Type;

    // these methods are used in more than one place and should probably be
    // dried up and hoisted to methods on ConversationView

    const onLeave = () => {
      this.longRunningTaskWrapper({
        name: 'onLeave',
        task: () => this.model.leaveGroupV2(),
      });
    };

    const onBlock = () => {
      this.syncMessageRequestResponse(
        'onBlock',
        this.model,
        messageRequestEnum.BLOCK
      );
    };

    const props = {
      addMembers: this.model.addMembersV2.bind(this.model),
      conversationId: this.model.get('id'),
      loadRecentMediaItems: this.loadRecentMediaItems.bind(this),
      setDisappearingMessages: this.setDisappearingMessages.bind(this),
      showAllMedia: this.showAllMedia.bind(this),
      showContactModal: this.showContactModal.bind(this),
      showChatColorEditor: this.showChatColorEditor.bind(this),
      showGroupLinkManagement: this.showGroupLinkManagement.bind(this),
      showGroupV2Permissions: this.showGroupV2Permissions.bind(this),
      showConversationNotificationsSettings: this.showConversationNotificationsSettings.bind(
        this
      ),
      showPendingInvites: this.showPendingInvites.bind(this),
      showLightboxForMedia: this.showLightboxForMedia.bind(this),
      updateGroupAttributes: this.model.updateGroupAttributesV2.bind(
        this.model
      ),
      onLeave,
      onBlock,
      onUnblock: () => {
        this.syncMessageRequestResponse(
          'onUnblock',
          this.model,
          messageRequestEnum.ACCEPT
        );
      },
      setMuteExpiration: this.setMuteExpiration.bind(this),
      onOutgoingAudioCallInConversation: this.onOutgoingAudioCallInConversation.bind(
        this
      ),
      onOutgoingVideoCallInConversation: this.onOutgoingVideoCallInConversation.bind(
        this
      ),
    };

    const view = new Whisper.ReactWrapperView({
      className: 'conversation-details-pane panel',
      JSX: window.Signal.State.Roots.createConversationDetails(
        window.reduxStore,
        props
      ),
    });
    view.headerTitle = '';

    this.listenBack(view);
    view.render();
  }

  showMessageDetail(messageId: string): void {
    const message = window.MessageController.getById(messageId);
    if (!message) {
      throw new Error(`showMessageDetail: Message ${messageId} missing!`);
    }

    if (!message.isNormalBubble()) {
      return;
    }

    const getProps = () => ({
      ...message.getPropsForMessageDetail(
        window.ConversationController.getOurConversationIdOrThrow()
      ),
      ...this.getMessageActions(),
    });

    const onClose = () => {
      this.stopListening(message, 'change', update);
      this.resetPanel();
    };

    const view = new Whisper.ReactWrapperView({
      className: 'panel message-detail-wrapper',
      JSX: window.Signal.State.Roots.createMessageDetail(
        window.reduxStore,
        getProps()
      ),
      onClose,
    });

    const update = () =>
      view.update(
        window.Signal.State.Roots.createMessageDetail(
          window.reduxStore,
          getProps()
        )
      );
    this.listenTo(message, 'change', update);
    this.listenTo(message, 'expired', onClose);
    // We could listen to all involved contacts, but we'll call that overkill

    this.listenBack(view);
    view.render();
  }

  showStickerManager(): void {
    const view = new Whisper.ReactWrapperView({
      className: ['sticker-manager-wrapper', 'panel'].join(' '),
      JSX: window.Signal.State.Roots.createStickerManager(window.reduxStore),
      onClose: () => {
        this.resetPanel();
      },
    });

    this.listenBack(view);
    view.render();
  }

  showContactDetail({
    contact,
    signalAccount,
  }: {
    contact: EmbeddedContactType;
    signalAccount?: string;
  }): void {
    const view = new Whisper.ReactWrapperView({
      Component: window.Signal.Components.ContactDetail,
      className: 'contact-detail-pane panel',
      props: {
        contact,
        hasSignalAccount: Boolean(signalAccount),
        onSendMessage: () => {
          if (signalAccount) {
            this.openConversation(signalAccount);
          }
        },
      },
      onClose: () => {
        this.resetPanel();
      },
    });

    this.listenBack(view);
  }

  // eslint-disable-next-line class-methods-use-this
  async openConversation(
    conversationId: string,
    messageId?: string
  ): Promise<void> {
    window.Whisper.events.trigger(
      'showConversation',
      conversationId,
      messageId
    );
  }

  listenBack(view: AnyViewClass): void {
    this.panels = this.panels || [];

    if (this.panels.length === 0) {
      this.previousFocus = document.activeElement as HTMLElement;
    }

    this.panels.unshift(view);
    view.$el.insertAfter(this.$('.panel').last());
    view.$el.one('animationend', () => {
      view.$el.addClass('panel--static');
    });

    window.reduxActions.conversations.setSelectedConversationPanelDepth(
      this.panels.length
    );
    window.reduxActions.conversations.setSelectedConversationHeaderTitle(
      view.headerTitle
    );
  }
  resetPanel(): void {
    if (!this.panels || !this.panels.length) {
      return;
    }

    const view = this.panels.shift();

    if (
      this.panels.length === 0 &&
      this.previousFocus &&
      this.previousFocus.focus
    ) {
      this.previousFocus.focus();
      this.previousFocus = undefined;
    }

    if (this.panels.length > 0) {
      this.panels[0].$el.fadeIn(250);
    }

    if (view) {
      view.$el.addClass('panel--remove').one('transitionend', () => {
        view.remove();

        if (this.panels.length === 0) {
          // Make sure poppers are positioned properly
          window.dispatchEvent(new Event('resize'));
        }
      });
    }

    window.reduxActions.conversations.setSelectedConversationPanelDepth(
      this.panels.length
    );
    window.reduxActions.conversations.setSelectedConversationHeaderTitle(
      this.panels[0]?.headerTitle
    );
  }

  async loadRecentMediaItems(limit: number): Promise<void> {
    const { model }: { model: ConversationModel } = this;

    const messages: Array<MessageAttributesType> = await window.Signal.Data.getMessagesWithVisualMediaAttachments(
      model.id,
      {
        limit,
      }
    );

    const loadedRecentMediaItems = messages
      .filter(message => message.attachments !== undefined)
      .reduce(
        (acc, message) => [
          ...acc,
          ...(message.attachments || []).map(
            (attachment: AttachmentType, index: number): MediaItemType => {
              const { thumbnail } = attachment;

              return {
                objectURL: getAbsoluteAttachmentPath(attachment.path || ''),
                thumbnailObjectUrl: thumbnail
                  ? getAbsoluteAttachmentPath(thumbnail.path)
                  : '',
                contentType: attachment.contentType,
                index,
                attachment,
                message: {
                  attachments: message.attachments || [],
                  conversationId:
                    window.ConversationController.get(message.sourceUuid)?.id ||
                    message.conversationId,
                  id: message.id,
                  received_at: message.received_at,
                  received_at_ms: Number(message.received_at_ms),
                  sent_at: message.sent_at,
                },
              };
            }
          ),
        ],
        [] as Array<MediaItemType>
      );

    window.reduxActions.conversations.setRecentMediaItems(
      model.id,
      loadedRecentMediaItems
    );
  }

  async setDisappearingMessages(seconds: number): Promise<void> {
    const { model }: { model: ConversationModel } = this;

    const valueToSet = seconds > 0 ? seconds : undefined;

    await this.longRunningTaskWrapper({
      name: 'updateExpirationTimer',
      task: async () => model.updateExpirationTimer(valueToSet),
    });
  }

  async changeHasGroupLink(value: boolean): Promise<void> {
    const { model }: { model: ConversationModel } = this;

    await this.longRunningTaskWrapper({
      name: 'toggleGroupLink',
      task: async () => model.toggleGroupLink(value),
    });
  }

  async generateNewGroupLink(): Promise<void> {
    const { model }: { model: ConversationModel } = this;

    window.showConfirmationDialog({
      confirmStyle: 'negative',
      message: window.i18n('GroupLinkManagement--confirm-reset'),
      okText: window.i18n('GroupLinkManagement--reset'),
      resolve: async () => {
        await this.longRunningTaskWrapper({
          name: 'refreshGroupLink',
          task: async () => model.refreshGroupLink(),
        });
      },
    });
  }

  async setAccessControlAddFromInviteLinkSetting(
    value: boolean
  ): Promise<void> {
    const { model }: { model: ConversationModel } = this;

    await this.longRunningTaskWrapper({
      name: 'updateAccessControlAddFromInviteLink',
      task: async () => model.updateAccessControlAddFromInviteLink(value),
    });
  }

  async setAccessControlAttributesSetting(value: number): Promise<void> {
    const { model }: { model: ConversationModel } = this;

    await this.longRunningTaskWrapper({
      name: 'updateAccessControlAttributes',
      task: async () => model.updateAccessControlAttributes(value),
    });
  }

  async setAccessControlMembersSetting(value: number): Promise<void> {
    const { model }: { model: ConversationModel } = this;

    await this.longRunningTaskWrapper({
      name: 'updateAccessControlMembers',
      task: async () => model.updateAccessControlMembers(value),
    });
  }

  async setAnnouncementsOnly(value: boolean): Promise<void> {
    const { model }: { model: ConversationModel } = this;

    await this.longRunningTaskWrapper({
      name: 'updateAnnouncementsOnly',
      task: async () => model.updateAnnouncementsOnly(value),
    });
  }

  async destroyMessages(): Promise<void> {
    const { model }: { model: ConversationModel } = this;

    window.showConfirmationDialog({
      confirmStyle: 'negative',
      message: window.i18n('deleteConversationConfirmation'),
      okText: window.i18n('delete'),
      resolve: () => {
        this.longRunningTaskWrapper({
          name: 'destroymessages',
          task: async () => {
            model.trigger('unload', 'delete messages');
            await model.destroyMessages();
            model.updateLastMessage();
          },
        });
      },
      reject: () => {
        log.info('destroyMessages: User canceled delete');
      },
    });
  }

  async isCallSafe(): Promise<boolean> {
    const contacts = await this.getUntrustedContacts();
    if (contacts && contacts.length) {
      const callAnyway = await this.showSendAnywayDialog(
        contacts.models,
        window.i18n('callAnyway')
      );
      if (!callAnyway) {
        log.info(
          'Safety number change dialog not accepted, new call not allowed.'
        );
        return false;
      }
    }

    return true;
  }

  // eslint-disable-next-line class-methods-use-this
  showSendAnywayDialog(
    contacts: Array<ConversationModel>,
    confirmText?: string
  ): Promise<boolean> {
    return new Promise(resolve => {
      showSafetyNumberChangeDialog({
        confirmText,
        contacts,
        reject: () => {
          resolve(false);
        },
        resolve: () => {
          resolve(true);
        },
      });
    });
  }

  async sendStickerMessage(options: {
    packId: string;
    stickerId: number;
    force?: boolean;
  }): Promise<void> {
    const { model }: { model: ConversationModel } = this;

    try {
      const contacts = await this.getUntrustedContacts(options);

      if (contacts && contacts.length) {
        const sendAnyway = await this.showSendAnywayDialog(contacts.models);
        if (sendAnyway) {
          this.sendStickerMessage({ ...options, force: true });
        }

        return;
      }

      if (this.showInvalidMessageToast()) {
        return;
      }

      const { packId, stickerId } = options;
      model.sendStickerMessage(packId, stickerId);
    } catch (error) {
      log.error('clickSend error:', error && error.stack ? error.stack : error);
    }
  }

  async getUntrustedContacts(
    options: { force?: boolean } = {}
  ): Promise<null | ConversationModelCollectionType> {
    const { model }: { model: ConversationModel } = this;

    // This will go to the trust store for the latest identity key information,
    //   and may result in the display of a new banner for this conversation.
    await model.updateVerified();
    const unverifiedContacts = model.getUnverified();

    if (options.force) {
      if (unverifiedContacts.length) {
        await markAllAsVerifiedDefault(unverifiedContacts.models);
        // We only want force to break us through one layer of checks
        // eslint-disable-next-line no-param-reassign
        options.force = false;
      }
    } else if (unverifiedContacts.length) {
      return unverifiedContacts;
    }

    const untrustedContacts = model.getUntrusted();

    if (options.force) {
      if (untrustedContacts.length) {
        await markAllAsApproved(untrustedContacts.models);
      }
    } else if (untrustedContacts.length) {
      return untrustedContacts;
    }

    return null;
  }

  async setQuoteMessage(messageId: null | string): Promise<void> {
    const { model }: { model: ConversationModel } = this;

    const message: MessageModel | undefined = messageId
      ? await getMessageById(messageId, {
          Message: Whisper.Message,
        })
      : undefined;

    if (
      message &&
      !canReply(
        message.attributes,
        window.ConversationController.getOurConversationIdOrThrow(),
        findAndFormatContact
      )
    ) {
      return;
    }

    if (message && !message.isNormalBubble()) {
      return;
    }

    this.quote = undefined;
    this.quotedMessage = undefined;

    const existing = model.get('quotedMessageId');
    if (existing !== messageId) {
      const now = Date.now();
      let active_at = this.model.get('active_at');
      let timestamp = this.model.get('timestamp');

      if (!active_at && messageId) {
        active_at = now;
        timestamp = now;
      }

      this.model.set({
        active_at,
        draftChanged: true,
        quotedMessageId: messageId,
        timestamp,
      });

      await this.saveModel();
    }

    if (message) {
      const quotedMessage = window.MessageController.register(
        message.id,
        message
      );
      this.quotedMessage = quotedMessage;

      if (quotedMessage) {
        this.quote = await model.makeQuote(this.quotedMessage);

        this.enableMessageField();
        this.focusMessageField();
      }
    }

    this.renderQuotedMessage();
  }

  renderQuotedMessage(): void {
    const { model }: { model: ConversationModel } = this;

    if (!this.quotedMessage) {
      window.reduxActions.composer.setQuotedMessage(undefined);
      return;
    }

    window.reduxActions.composer.setQuotedMessage({
      conversationId: model.id,
      quote: this.quote,
    });
  }

  showInvalidMessageToast(messageText?: string): boolean {
    const { model }: { model: ConversationModel } = this;

    let toastView:
      | undefined
      | typeof ToastBlocked
      | typeof ToastBlockedGroup
      | typeof ToastExpired
      | typeof ToastInvalidConversation
      | typeof ToastLeftGroup
      | typeof ToastMessageBodyTooLong;

    if (window.reduxStore.getState().expiration.hasExpired) {
      toastView = ToastExpired;
    }
    if (!model.isValid()) {
      toastView = ToastInvalidConversation;
    }

    const e164 = this.model.get('e164');
    const uuid = this.model.get('uuid');
    if (
      isDirectConversation(this.model.attributes) &&
      ((e164 && window.storage.blocked.isBlocked(e164)) ||
        (uuid && window.storage.blocked.isUuidBlocked(uuid)))
    ) {
      toastView = ToastBlocked;
    }

    const groupId = this.model.get('groupId');
    if (
      !isDirectConversation(this.model.attributes) &&
      groupId &&
      window.storage.blocked.isGroupBlocked(groupId)
    ) {
      toastView = ToastBlockedGroup;
    }

    if (!isDirectConversation(model.attributes) && model.get('left')) {
      toastView = ToastLeftGroup;
    }
    if (messageText && messageText.length > MAX_MESSAGE_BODY_LENGTH) {
      toastView = ToastMessageBodyTooLong;
    }

    if (toastView) {
      showToast(toastView);
      return true;
    }

    return false;
  }

  async sendMessage(
    message = '',
    mentions: BodyRangesType = [],
    options: {
      draftAttachments?: ReadonlyArray<AttachmentType>;
      force?: boolean;
      timestamp?: number;
      voiceNoteAttachment?: AttachmentType;
    } = {}
  ): Promise<void> {
    const { model }: { model: ConversationModel } = this;
    const timestamp = options.timestamp || Date.now();

    this.sendStart = Date.now();

    try {
      const contacts = await this.getUntrustedContacts(options);
      this.disableMessageField();

      if (contacts && contacts.length) {
        const sendAnyway = await this.showSendAnywayDialog(contacts.models);
        if (sendAnyway) {
          this.sendMessage(message, mentions, { force: true, timestamp });
          return;
        }

        this.enableMessageField();
        return;
      }
    } catch (error) {
      this.enableMessageField();
      log.error(
        'sendMessage error:',
        error && error.stack ? error.stack : error
      );
      return;
    }

    model.clearTypingTimers();

    if (this.showInvalidMessageToast(message)) {
      this.enableMessageField();
      return;
    }

    try {
      if (
        !message.length &&
        !this.hasFiles({ includePending: false }) &&
        !options.voiceNoteAttachment
      ) {
        return;
      }

      let attachments: Array<AttachmentType> = [];
      if (options.voiceNoteAttachment) {
        attachments = [options.voiceNoteAttachment];
      } else if (options.draftAttachments) {
        attachments = (
          await Promise.all(
            options.draftAttachments.map(resolveAttachmentDraftData)
          )
        ).filter(isNotNil);
      }

      const sendHQImages =
        window.reduxStore &&
        window.reduxStore.getState().composer.shouldSendHighQualityAttachments;
      const sendDelta = Date.now() - this.sendStart;

      log.info('Send pre-checks took', sendDelta, 'milliseconds');

      model.enqueueMessageForSend(
        message,
        attachments,
        this.quote,
        this.getLinkPreviewForSend(message),
        undefined, // sticker
        mentions,
        {
          sendHQImages,
          timestamp,
        }
      );

      batchDispatch(() => {
        this.compositionApi.current?.reset();
        model.setMarkedUnread(false);
        this.setQuoteMessage(null);
        this.resetLinkPreview();
        this.clearAttachments();
        window.reduxActions.composer.resetComposer();
      });
    } catch (error) {
      log.error(
        'Error pulling attached files before send',
        error && error.stack ? error.stack : error
      );
    } finally {
      this.enableMessageField();
    }
  }

  onEditorStateChange(
    messageText: string,
    bodyRanges: Array<BodyRangeType>,
    caretLocation?: number
  ): void {
    this.maybeBumpTyping(messageText);
    this.debouncedSaveDraft(messageText, bodyRanges);
    this.debouncedMaybeGrabLinkPreview(messageText, caretLocation);
  }

  async saveDraft(
    messageText: string,
    bodyRanges: Array<BodyRangeType>
  ): Promise<void> {
    const { model }: { model: ConversationModel } = this;

    const trimmed =
      messageText && messageText.length > 0 ? messageText.trim() : '';

    if (model.get('draft') && (!messageText || trimmed.length === 0)) {
      this.model.set({
        draft: null,
        draftChanged: true,
        draftBodyRanges: [],
      });
      await this.saveModel();

      return;
    }

    if (messageText !== model.get('draft')) {
      const now = Date.now();
      let active_at = this.model.get('active_at');
      let timestamp = this.model.get('timestamp');

      if (!active_at) {
        active_at = now;
        timestamp = now;
      }

      this.model.set({
        active_at,
        draft: messageText,
        draftBodyRanges: bodyRanges,
        draftChanged: true,
        timestamp,
      });
      await this.saveModel();
    }
  }

  maybeGrabLinkPreview(message: string, caretLocation?: number): void {
    // Don't generate link previews if user has turned them off
    if (!window.Events.getLinkPreviewSetting()) {
      return;
    }
    // Do nothing if we're offline
    if (!window.textsecure.messaging) {
      return;
    }
    // If we have attachments, don't add link preview
    if (this.hasFiles({ includePending: true })) {
      return;
    }
    // If we're behind a user-configured proxy, we don't support link previews
    if (window.isBehindProxy()) {
      return;
    }

    if (!message) {
      this.resetLinkPreview();
      return;
    }
    if (this.disableLinkPreviews) {
      return;
    }

    const links = LinkPreview.findLinks(message, caretLocation);
    const { currentlyMatchedLink } = this;
    if (currentlyMatchedLink && links.includes(currentlyMatchedLink)) {
      return;
    }

    this.currentlyMatchedLink = undefined;
    this.excludedPreviewUrls = this.excludedPreviewUrls || [];

    const link = links.find(
      item =>
        LinkPreview.isLinkSafeToPreview(item) &&
        !this.excludedPreviewUrls.includes(item)
    );
    if (!link) {
      this.removeLinkPreview();
      return;
    }

    this.addLinkPreview(link);
  }

  resetLinkPreview(): void {
    this.disableLinkPreviews = false;
    this.excludedPreviewUrls = [];
    this.removeLinkPreview();
  }

  removeLinkPreview(): void {
    (this.preview || []).forEach((item: LinkPreviewResult) => {
      if (item.url) {
        URL.revokeObjectURL(item.url);
      }
    });
    this.preview = undefined;
    this.currentlyMatchedLink = undefined;
    this.linkPreviewAbortController?.abort();
    this.linkPreviewAbortController = undefined;

    window.reduxActions.linkPreviews.removeLinkPreview();
  }

  // eslint-disable-next-line class-methods-use-this
  async getStickerPackPreview(
    url: string,
    abortSignal: Readonly<AbortSignal>
  ): Promise<null | LinkPreviewResult> {
    const isPackDownloaded = (
      pack?: StickerPackDBType
    ): pack is StickerPackDBType => {
      if (!pack) {
        return false;
      }

      return pack.status === 'downloaded' || pack.status === 'installed';
    };
    const isPackValid = (
      pack?: StickerPackDBType
    ): pack is StickerPackDBType => {
      if (!pack) {
        return false;
      }
      return (
        pack.status === 'ephemeral' ||
        pack.status === 'downloaded' ||
        pack.status === 'installed'
      );
    };

    const dataFromLink = Stickers.getDataFromLink(url);
    if (!dataFromLink) {
      return null;
    }
    const { id, key } = dataFromLink;

    try {
      const keyBytes = Bytes.fromHex(key);
      const keyBase64 = Bytes.toBase64(keyBytes);

      const existing = Stickers.getStickerPack(id);
      if (!isPackDownloaded(existing)) {
        await Stickers.downloadEphemeralPack(id, keyBase64);
      }

      if (abortSignal.aborted) {
        return null;
      }

      const pack = Stickers.getStickerPack(id);

      if (!isPackValid(pack)) {
        return null;
      }
      if (pack.key !== keyBase64) {
        return null;
      }

      const { title, coverStickerId } = pack;
      const sticker = pack.stickers[coverStickerId];
      const data =
        pack.status === 'ephemeral'
          ? await window.Signal.Migrations.readTempData(sticker.path)
          : await window.Signal.Migrations.readStickerData(sticker.path);

      if (abortSignal.aborted) {
        return null;
      }

      let contentType: MIMEType;
      const sniffedMimeType = sniffImageMimeType(data);
      if (sniffedMimeType) {
        contentType = sniffedMimeType;
      } else {
        log.warn(
          'getStickerPackPreview: Unable to sniff sticker MIME type; falling back to WebP'
        );
        contentType = IMAGE_WEBP;
      }

      return {
        date: null,
        description: null,
        image: {
          ...sticker,
          data,
          size: data.byteLength,
          contentType,
        },
        title,
        url,
      };
    } catch (error) {
      log.error(
        'getStickerPackPreview error:',
        error && error.stack ? error.stack : error
      );
      return null;
    } finally {
      if (id) {
        await Stickers.removeEphemeralPack(id);
      }
    }
  }

  // eslint-disable-next-line class-methods-use-this
  async getGroupPreview(
    url: string,
    abortSignal: Readonly<AbortSignal>
  ): Promise<null | LinkPreviewResult> {
    const urlObject = maybeParseUrl(url);
    if (!urlObject) {
      return null;
    }

    const { hash } = urlObject;
    if (!hash) {
      return null;
    }
    const groupData = hash.slice(1);

    const {
      inviteLinkPassword,
      masterKey,
    } = window.Signal.Groups.parseGroupLink(groupData);

    const fields = window.Signal.Groups.deriveGroupFields(
      Bytes.fromBase64(masterKey)
    );
    const id = Bytes.toBase64(fields.id);
    const logId = `groupv2(${id})`;
    const secretParams = Bytes.toBase64(fields.secretParams);

    log.info(`getGroupPreview/${logId}: Fetching pre-join state`);
    const result = await window.Signal.Groups.getPreJoinGroupInfo(
      inviteLinkPassword,
      masterKey
    );

    if (abortSignal.aborted) {
      return null;
    }

    const title =
      window.Signal.Groups.decryptGroupTitle(result.title, secretParams) ||
      window.i18n('unknownGroup');
    const description =
      result.memberCount === 1 || result.memberCount === undefined
        ? window.i18n('GroupV2--join--member-count--single')
        : window.i18n('GroupV2--join--member-count--multiple', {
            count: result.memberCount.toString(),
          });
    let image: undefined | LinkPreviewImage;

    if (result.avatar) {
      try {
        const data = await window.Signal.Groups.decryptGroupAvatar(
          result.avatar,
          secretParams
        );
        image = {
          data,
          size: data.byteLength,
          contentType: IMAGE_JPEG,
          blurHash: await window.imageToBlurHash(
            new Blob([data], {
              type: IMAGE_JPEG,
            })
          ),
        };
      } catch (error) {
        const errorString = error && error.stack ? error.stack : error;
        log.error(
          `getGroupPreview/${logId}: Failed to fetch avatar ${errorString}`
        );
      }
    }

    if (abortSignal.aborted) {
      return null;
    }

    return {
      date: null,
      description,
      image,
      title,
      url,
    };
  }

  async getPreview(
    url: string,
    abortSignal: Readonly<AbortSignal>
  ): Promise<null | LinkPreviewResult> {
    if (LinkPreview.isStickerPack(url)) {
      return this.getStickerPackPreview(url, abortSignal);
    }
    if (LinkPreview.isGroupLink(url)) {
      return this.getGroupPreview(url, abortSignal);
    }

    // This is already checked elsewhere, but we want to be extra-careful.
    if (!LinkPreview.isLinkSafeToPreview(url)) {
      return null;
    }

    const linkPreviewMetadata = await window.textsecure.messaging.fetchLinkPreviewMetadata(
      url,
      abortSignal
    );
    if (!linkPreviewMetadata || abortSignal.aborted) {
      return null;
    }
    const { title, imageHref, description, date } = linkPreviewMetadata;

    let image;
    if (imageHref && LinkPreview.isLinkSafeToPreview(imageHref)) {
      let objectUrl: void | string;
      try {
        const fullSizeImage = await window.textsecure.messaging.fetchLinkPreviewImage(
          imageHref,
          abortSignal
        );
        if (abortSignal.aborted) {
          return null;
        }
        if (!fullSizeImage) {
          throw new Error('Failed to fetch link preview image');
        }

        // Ensure that this file is either small enough or is resized to meet our
        //   requirements for attachments
        const withBlob = await autoScale({
          contentType: fullSizeImage.contentType,
          file: new Blob([fullSizeImage.data], {
            type: fullSizeImage.contentType,
          }),
          fileName: title,
        });

        const data = await fileToBytes(withBlob.file);
        objectUrl = URL.createObjectURL(withBlob.file);

        const blurHash = await window.imageToBlurHash(withBlob.file);

        const dimensions = await VisualAttachment.getImageDimensions({
          objectUrl,
          logger: log,
        });

        image = {
          data,
          size: data.byteLength,
          ...dimensions,
          contentType: stringToMIMEType(withBlob.file.type),
          blurHash,
        };
      } catch (error) {
        // We still want to show the preview if we failed to get an image
        log.error(
          'getPreview failed to get image for link preview:',
          error.message
        );
      } finally {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
      }
    }

    if (abortSignal.aborted) {
      return null;
    }

    return {
      date: date || null,
      description: description || null,
      image,
      title,
      url,
    };
  }

  async addLinkPreview(url: string): Promise<void> {
    if (this.currentlyMatchedLink === url) {
      log.warn(
        'addLinkPreview should not be called with the same URL like this'
      );
      return;
    }

    (this.preview || []).forEach((item: LinkPreviewResult) => {
      if (item.url) {
        URL.revokeObjectURL(item.url);
      }
    });
    window.reduxActions.linkPreviews.removeLinkPreview();
    this.preview = undefined;

    // Cancel other in-flight link preview requests.
    if (this.linkPreviewAbortController) {
      log.info(
        'addLinkPreview: canceling another in-flight link preview request'
      );
      this.linkPreviewAbortController.abort();
    }

    const thisRequestAbortController = new AbortController();
    this.linkPreviewAbortController = thisRequestAbortController;

    const timeout = setTimeout(() => {
      thisRequestAbortController.abort();
    }, LINK_PREVIEW_TIMEOUT);

    this.currentlyMatchedLink = url;
    this.renderLinkPreview();

    try {
      const result = await this.getPreview(
        url,
        thisRequestAbortController.signal
      );

      if (!result) {
        log.info(
          'addLinkPreview: failed to load preview (not necessarily a problem)'
        );

        // This helps us disambiguate between two kinds of failure:
        //
        // 1. We failed to fetch the preview because of (1) a network failure (2) an
        //    invalid response (3) a timeout
        // 2. We failed to fetch the preview because we aborted the request because the
        //    user changed the link (e.g., by continuing to type the URL)
        const failedToFetch = this.currentlyMatchedLink === url;
        if (failedToFetch) {
          this.excludedPreviewUrls.push(url);
          this.removeLinkPreview();
        }
        return;
      }

      if (result.image && result.image.data) {
        const blob = new Blob([result.image.data], {
          type: result.image.contentType,
        });
        result.image.url = URL.createObjectURL(blob);
      } else if (!result.title) {
        // A link preview isn't worth showing unless we have either a title or an image
        this.removeLinkPreview();
        return;
      }

      window.reduxActions.linkPreviews.addLinkPreview({
        ...result,
        description: dropNull(result.description),
        date: dropNull(result.date),
        domain: LinkPreview.getDomain(result.url),
        isStickerPack: LinkPreview.isStickerPack(result.url),
      });
      this.preview = [result];
      this.renderLinkPreview();
    } catch (error) {
      log.error(
        'Problem loading link preview, disabling.',
        error && error.stack ? error.stack : error
      );
      this.disableLinkPreviews = true;
      this.removeLinkPreview();
    } finally {
      clearTimeout(timeout);
    }
  }

  renderLinkPreview(): void {
    if (this.forwardMessageModal) {
      return;
    }
    window.reduxActions.composer.setLinkPreviewResult(
      Boolean(this.currentlyMatchedLink),
      this.getLinkPreviewWithDomain()
    );
  }

  getLinkPreviewForSend(message: string): Array<LinkPreviewType> {
    // Don't generate link previews if user has turned them off
    if (!window.storage.get('linkPreviews', false)) {
      return [];
    }

    if (!this.preview) {
      return [];
    }

    const urlsInMessage = new Set<string>(LinkPreview.findLinks(message));

    return (
      this.preview
        // This bullet-proofs against sending link previews for URLs that are no longer in
        //   the message. This can happen if you have a link preview, then quickly delete
        //   the link and send the message.
        .filter(({ url }: Readonly<{ url: string }>) => urlsInMessage.has(url))
        .map((item: LinkPreviewResult) => {
          if (item.image) {
            // We eliminate the ObjectURL here, unneeded for send or save
            return {
              ...item,
              image: omit(item.image, 'url'),
              description: dropNull(item.description),
              date: dropNull(item.date),
              domain: LinkPreview.getDomain(item.url),
              isStickerPack: LinkPreview.isStickerPack(item.url),
            };
          }

          return {
            ...item,
            description: dropNull(item.description),
            date: dropNull(item.date),
            domain: LinkPreview.getDomain(item.url),
            isStickerPack: LinkPreview.isStickerPack(item.url),
          };
        })
    );
  }

  getLinkPreviewWithDomain(): LinkPreviewWithDomain | undefined {
    if (!this.preview || !this.preview.length) {
      return undefined;
    }

    const [preview] = this.preview;
    return {
      ...preview,
      domain: LinkPreview.getDomain(preview.url),
    };
  }

  // Called whenever the user changes the message composition field. But only
  //   fires if there's content in the message field after the change.
  maybeBumpTyping(messageText: string): void {
    if (messageText.length && this.model.throttledBumpTyping) {
      this.model.throttledBumpTyping();
    }
  }
}

window.Whisper.ConversationView = ConversationView;
