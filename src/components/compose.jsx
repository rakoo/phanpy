import './compose.css';

import '@github/text-expander-element';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import stringLength from 'string-length';

import supportedLanguages from '../data/status-supported-languages';
import urlRegex from '../data/url-regex';
import emojifyText from '../utils/emojify-text';
import openCompose from '../utils/open-compose';
import store from '../utils/store';
import visibilityIconsMap from '../utils/visibility-icons-map';

import Avatar from './avatar';
import Icon from './icon';
import Loader from './loader';
import Status from './status';

const supportedLanguagesMap = supportedLanguages.reduce((acc, l) => {
  const [code, common, native] = l;
  acc[code] = {
    common,
    native,
  };
  return acc;
}, {});

/* NOTES:
  - Max character limit includes BOTH status text and Content Warning text
*/

const expiryOptions = {
  '5 minutes': 5 * 60,
  '30 minutes': 30 * 60,
  '1 hour': 60 * 60,
  '6 hours': 6 * 60 * 60,
  '1 day': 24 * 60 * 60,
  '3 days': 3 * 24 * 60 * 60,
  '7 days': 7 * 24 * 60 * 60,
};
const expirySeconds = Object.values(expiryOptions);
const oneDay = 24 * 60 * 60;

const expiresInFromExpiresAt = (expiresAt) => {
  if (!expiresAt) return oneDay;
  const delta = (new Date(expiresAt).getTime() - Date.now()) / 1000;
  return expirySeconds.find((s) => s >= delta) || oneDay;
};

const menu = document.createElement('ul');
menu.role = 'listbox';
menu.className = 'text-expander-menu';

const DEFAULT_LANG = 'en';

function Compose({
  onClose,
  replyToStatus,
  editStatus,
  draftStatus,
  standalone,
  hasOpener,
}) {
  const [uiState, setUIState] = useState('default');

  const accounts = store.local.getJSON('accounts');
  const currentAccount = store.session.get('currentAccount');
  const currentAccountInfo = accounts.find(
    (a) => a.info.id === currentAccount,
  ).info;

  const configuration = useMemo(() => {
    try {
      const instances = store.local.getJSON('instances');
      const currentInstance = accounts.find(
        (a) => a.info.id === currentAccount,
      ).instanceURL;
      const config = instances[currentInstance].configuration;
      console.log(config);
      return config;
    } catch (e) {
      console.error(e);
      alert('Failed to load instance configuration. Please try again.');
      // Temporary fix for corrupted data
      store.local.del('instances');
      location.reload();
      return {};
    }
  }, []);

  const {
    statuses: { maxCharacters, maxMediaAttachments, charactersReservedPerUrl },
    mediaAttachments: {
      supportedMimeTypes,
      imageSizeLimit,
      imageMatrixLimit,
      videoSizeLimit,
      videoMatrixLimit,
      videoFrameRateLimit,
    },
    polls: { maxOptions, maxCharactersPerOption, maxExpiration, minExpiration },
  } = configuration;

  const textareaRef = useRef();
  const spoilerTextRef = useRef();
  const [visibility, setVisibility] = useState('public');
  const [sensitive, setSensitive] = useState(false);
  const [language, setLanguage] = useState(
    store.session.get('currentLanguage') || DEFAULT_LANG,
  );
  const [mediaAttachments, setMediaAttachments] = useState([]);
  const [poll, setPoll] = useState(null);

  const customEmojis = useRef();
  useEffect(() => {
    (async () => {
      try {
        const emojis = await masto.v1.customEmojis.list();
        console.log({ emojis });
        customEmojis.current = emojis;
      } catch (e) {
        // silent fail
        console.error(e);
      }
    })();
  }, []);

  const oninputTextarea = () => {
    if (!textareaRef.current) return;
    textareaRef.current.dispatchEvent(new Event('input'));
  };
  const focusTextarea = () => {
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 100);
  };

  useEffect(() => {
    if (replyToStatus) {
      const { spoilerText, visibility, language, sensitive } = replyToStatus;
      if (spoilerText && spoilerTextRef.current) {
        spoilerTextRef.current.value = spoilerText;
      }
      const mentions = new Set([
        replyToStatus.account.acct,
        ...replyToStatus.mentions.map((m) => m.acct),
      ]);
      const allMentions = [...mentions].filter(
        (m) => m !== currentAccountInfo.acct,
      );
      if (allMentions.length > 0) {
        textareaRef.current.value = `${allMentions
          .map((m) => `@${m}`)
          .join(' ')} `;
        oninputTextarea();
      }
      focusTextarea();
      setVisibility(visibility);
      setLanguage(language || DEFAULT_LANG);
      setSensitive(sensitive);
    }
    if (draftStatus) {
      const {
        status,
        spoilerText,
        visibility,
        language,
        sensitive,
        poll,
        mediaAttachments,
      } = draftStatus;
      const composablePoll = !!poll?.options && {
        ...poll,
        options: poll.options.map((o) => o?.title || o),
        expiresIn: poll?.expiresIn || expiresInFromExpiresAt(poll.expiresAt),
      };
      textareaRef.current.value = status;
      oninputTextarea();
      focusTextarea();
      spoilerTextRef.current.value = spoilerText;
      setVisibility(visibility);
      setLanguage(language || DEFAULT_LANG);
      setSensitive(sensitive);
      setPoll(composablePoll);
      setMediaAttachments(mediaAttachments);
    } else if (editStatus) {
      const { visibility, language, sensitive, poll, mediaAttachments } =
        editStatus;
      const composablePoll = !!poll?.options && {
        ...poll,
        options: poll.options.map((o) => o?.title || o),
        expiresIn: poll?.expiresIn || expiresInFromExpiresAt(poll.expiresAt),
      };
      setUIState('loading');
      (async () => {
        try {
          const statusSource = await masto.v1.statuses.fetchSource(
            editStatus.id,
          );
          console.log({ statusSource });
          const { text, spoilerText } = statusSource;
          textareaRef.current.value = text;
          textareaRef.current.dataset.source = text;
          oninputTextarea();
          focusTextarea();
          spoilerTextRef.current.value = spoilerText;
          setVisibility(visibility);
          setLanguage(language || DEFAULT_LANG);
          setSensitive(sensitive);
          setPoll(composablePoll);
          setMediaAttachments(mediaAttachments);
          setUIState('default');
        } catch (e) {
          console.error(e);
          alert(e?.reason || e);
          setUIState('error');
        }
      })();
    } else {
      focusTextarea();
    }
  }, [draftStatus, editStatus, replyToStatus]);

  const textExpanderRef = useRef();
  const textExpanderTextRef = useRef('');
  useEffect(() => {
    if (textExpanderRef.current) {
      const handleChange = (e) => {
        // console.log('text-expander-change', e);
        const { key, provide, text } = e.detail;
        textExpanderTextRef.current = text;

        if (text === '') {
          provide(
            Promise.resolve({
              matched: false,
            }),
          );
          return;
        }

        if (key === ':') {
          // const emojis = customEmojis.current.filter((emoji) =>
          //   emoji.shortcode.startsWith(text),
          // );
          const emojis = filterShortcodes(customEmojis.current, text);
          let html = '';
          emojis.forEach((emoji) => {
            const { shortcode, url } = emoji;
            html += `
                <li role="option" data-value="${encodeHTML(shortcode)}">
                <img src="${encodeHTML(
                  url,
                )}" width="16" height="16" alt="" loading="lazy" /> 
                :${encodeHTML(shortcode)}:
              </li>`;
          });
          // console.log({ emojis, html });
          menu.innerHTML = html;
          provide(
            Promise.resolve({
              matched: emojis.length > 0,
              fragment: menu,
            }),
          );
          return;
        }

        const type = {
          '@': 'accounts',
          '#': 'hashtags',
        }[key];
        provide(
          new Promise((resolve) => {
            const searchResults = masto.v2.search({
              type,
              q: text,
              limit: 5,
            });
            searchResults.then((value) => {
              if (text !== textExpanderTextRef.current) {
                return;
              }
              console.log({ value, type, v: value[type] });
              const results = value[type];
              console.log('RESULTS', value, results);
              let html = '';
              results.forEach((result) => {
                const {
                  name,
                  avatarStatic,
                  displayName,
                  username,
                  acct,
                  emojis,
                } = result;
                const displayNameWithEmoji = emojifyText(displayName, emojis);
                // const item = menuItem.cloneNode();
                if (acct) {
                  html += `
                    <li role="option" data-value="${encodeHTML(acct)}">
                      <span class="avatar">
                        <img src="${encodeHTML(
                          avatarStatic,
                        )}" width="16" height="16" alt="" loading="lazy" />
                      </span>
                      <span>
                        <b>${displayNameWithEmoji || username}</b>
                        <br>@${encodeHTML(acct)}
                      </span>
                    </li>
                  `;
                } else {
                  html += `
                    <li role="option" data-value="${encodeHTML(name)}">
                      <span>#<b>${encodeHTML(name)}</b></span>
                    </li>
                  `;
                }
                menu.innerHTML = html;
              });
              console.log('MENU', results, menu);
              resolve({
                matched: results.length > 0,
                fragment: menu,
              });
            });
          }),
        );
      };

      textExpanderRef.current.addEventListener(
        'text-expander-change',
        handleChange,
      );

      textExpanderRef.current.addEventListener('text-expander-value', (e) => {
        const { key, item } = e.detail;
        if (key === ':') {
          e.detail.value = `:${item.dataset.value}:`;
        } else {
          e.detail.value = `${key}${item.dataset.value}`;
        }
      });
    }
  }, []);

  const formRef = useRef();

  const beforeUnloadCopy =
    'You have unsaved changes. Are you sure you want to discard this post?';
  const canClose = () => {
    const { value, dataset } = textareaRef.current;

    // check if loading
    if (uiState === 'loading') {
      console.log('canClose', { uiState });
      return false;
    }

    // check for status and media attachments
    const hasMediaAttachments = mediaAttachments.length > 0;
    if (!value && !hasMediaAttachments) {
      console.log('canClose', { value, mediaAttachments });
      return true;
    }

    // check if all media attachments have IDs
    const hasIDMediaAttachments =
      mediaAttachments.length > 0 &&
      mediaAttachments.every((media) => media.id);
    if (hasIDMediaAttachments) {
      console.log('canClose', { hasIDMediaAttachments });
      return true;
    }

    // check if status contains only "@acct", if replying
    const isSelf = replyToStatus?.account.id === currentAccount;
    const hasOnlyAcct =
      replyToStatus && value.trim() === `@${replyToStatus.account.acct}`;
    // TODO: check for mentions, or maybe just generic "@username<space>", including multiple mentions like "@username1<space>@username2<space>"
    if (!isSelf && hasOnlyAcct) {
      console.log('canClose', { isSelf, hasOnlyAcct });
      return true;
    }

    // check if status is same with source
    const sameWithSource = value === dataset?.source;
    if (sameWithSource) {
      console.log('canClose', { sameWithSource });
      return true;
    }

    console.log('canClose', {
      value,
      hasMediaAttachments,
      hasIDMediaAttachments,
      poll,
      isSelf,
      hasOnlyAcct,
      sameWithSource,
      uiState,
    });

    return false;
  };

  const confirmClose = () => {
    if (!canClose()) {
      const yes = confirm(beforeUnloadCopy);
      return yes;
    }
    return true;
  };

  useEffect(() => {
    // Show warning if user tries to close window with unsaved changes
    const handleBeforeUnload = (e) => {
      if (!canClose()) {
        e.preventDefault();
        e.returnValue = beforeUnloadCopy;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload, {
      capture: true,
    });
    return () =>
      window.removeEventListener('beforeunload', handleBeforeUnload, {
        capture: true,
      });
  }, []);

  const [charCount, setCharCount] = useState(
    textareaRef.current?.value?.length +
      spoilerTextRef.current?.value?.length || 0,
  );
  const leftChars = maxCharacters - charCount;
  const getCharCount = () => {
    const { value } = textareaRef.current;
    const { value: spoilerText } = spoilerTextRef.current;
    return stringLength(countableText(value)) + stringLength(spoilerText);
  };
  const updateCharCount = () => {
    setCharCount(getCharCount());
  };

  return (
    <div id="compose-container" class={standalone ? 'standalone' : ''}>
      <div class="compose-top">
        {currentAccountInfo?.avatarStatic && (
          <Avatar
            url={currentAccountInfo.avatarStatic}
            size="l"
            alt={currentAccountInfo.username}
          />
        )}
        {!standalone ? (
          <span>
            <button
              type="button"
              class="light pop-button"
              disabled={uiState === 'loading'}
              onClick={() => {
                // If there are non-ID media attachments (not yet uploaded), show confirmation dialog because they are not going to be passed to the new window
                const containNonIDMediaAttachments =
                  mediaAttachments.length > 0 &&
                  mediaAttachments.some((media) => !media.id);
                if (containNonIDMediaAttachments) {
                  const yes = confirm(
                    'You have media attachments that are not yet uploaded. Opening a new window will discard them and you will need to re-attach them. Are you sure you want to continue?',
                  );
                  if (!yes) {
                    return;
                  }
                }

                const mediaAttachmentsWithIDs = mediaAttachments.filter(
                  (media) => media.id,
                );

                const newWin = openCompose({
                  editStatus,
                  replyToStatus,
                  draftStatus: {
                    status: textareaRef.current.value,
                    spoilerText: spoilerTextRef.current.value,
                    visibility,
                    language,
                    sensitive,
                    poll,
                    mediaAttachments: mediaAttachmentsWithIDs,
                  },
                });

                if (!newWin) {
                  alert('Looks like your browser is blocking popups.');
                  return;
                }

                onClose();
              }}
            >
              <Icon icon="popout" alt="Pop out" />
            </button>{' '}
            <button
              type="button"
              class="light close-button"
              disabled={uiState === 'loading'}
              onClick={() => {
                if (confirmClose()) {
                  onClose();
                }
              }}
            >
              <Icon icon="x" />
            </button>
          </span>
        ) : (
          hasOpener && (
            <button
              type="button"
              class="light pop-button"
              disabled={uiState === 'loading'}
              onClick={() => {
                // If there are non-ID media attachments (not yet uploaded), show confirmation dialog because they are not going to be passed to the new window
                const containNonIDMediaAttachments =
                  mediaAttachments.length > 0 &&
                  mediaAttachments.some((media) => !media.id);
                if (containNonIDMediaAttachments) {
                  const yes = confirm(
                    'You have media attachments that are not yet uploaded. Opening a new window will discard them and you will need to re-attach them. Are you sure you want to continue?',
                  );
                  if (!yes) {
                    return;
                  }
                }

                if (!window.opener) {
                  alert('Looks like you closed the parent window.');
                  return;
                }

                if (window.opener.__STATES__.showCompose) {
                  const yes = confirm(
                    'Looks like you already have a compose field open in the parent window. Popping in this window will discard the changes you made in the parent window. Continue?',
                  );
                  if (!yes) return;
                }

                const mediaAttachmentsWithIDs = mediaAttachments.filter(
                  (media) => media.id,
                );

                onClose({
                  fn: () => {
                    window.opener.__STATES__.showCompose = {
                      editStatus,
                      replyToStatus,
                      draftStatus: {
                        status: textareaRef.current.value,
                        spoilerText: spoilerTextRef.current.value,
                        visibility,
                        language,
                        sensitive,
                        poll,
                        mediaAttachments: mediaAttachmentsWithIDs,
                      },
                    };
                  },
                });
              }}
            >
              <Icon icon="popin" alt="Pop in" />
            </button>
          )
        )}
      </div>
      {!!replyToStatus && (
        <div class="status-preview">
          <Status status={replyToStatus} size="s" />
          <div class="status-preview-legend reply-to">
            Replying to @
            {replyToStatus.account.acct || replyToStatus.account.username}
            &rsquo;s status
          </div>
        </div>
      )}
      {!!editStatus && (
        <div class="status-preview">
          <Status status={editStatus} size="s" />
          <div class="status-preview-legend">Editing source status</div>
        </div>
      )}
      <form
        ref={formRef}
        style={{
          pointerEvents: uiState === 'loading' ? 'none' : 'auto',
          opacity: uiState === 'loading' ? 0.5 : 1,
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            formRef.current.dispatchEvent(
              new Event('submit', { cancelable: true }),
            );
          }
        }}
        onSubmit={(e) => {
          e.preventDefault();

          const formData = new FormData(e.target);
          const entries = Object.fromEntries(formData.entries());
          console.log('ENTRIES', entries);
          let { status, visibility, sensitive, spoilerText } = entries;

          // Pre-cleanup
          sensitive = sensitive === 'on'; // checkboxes return "on" if checked

          // Validation
          /* Let the backend validate this
          if (stringLength(status) > maxCharacters) {
            alert(`Status is too long! Max characters: ${maxCharacters}`);
            return;
          }
          if (
            sensitive &&
            stringLength(status) + stringLength(spoilerText) > maxCharacters
          ) {
            alert(
              `Status and content warning is too long! Max characters: ${maxCharacters}`,
            );
            return;
          }
          */
          if (poll) {
            if (poll.options.length < 2) {
              alert('Poll must have at least 2 options');
              return;
            }
            if (poll.options.some((option) => option === '')) {
              alert('Some poll choices are empty');
              return;
            }
          }
          // TODO: check for URLs and use `charactersReservedPerUrl` to calculate max characters

          // Post-cleanup
          spoilerText = (sensitive && spoilerText) || undefined;
          status = status === '' ? undefined : status;

          setUIState('loading');
          (async () => {
            try {
              console.log('MEDIA ATTACHMENTS', mediaAttachments);
              if (mediaAttachments.length > 0) {
                // Upload media attachments first
                const mediaPromises = mediaAttachments.map((attachment) => {
                  const { file, description, id } = attachment;
                  console.log('UPLOADING', attachment);
                  if (id) {
                    // If already uploaded
                    return attachment;
                  } else {
                    const params = removeNullUndefined({
                      file,
                      description,
                    });
                    return masto.v2.mediaAttachments
                      .create(params)
                      .then((res) => {
                        if (res.id) {
                          attachment.id = res.id;
                        }
                        return res;
                      });
                  }
                });
                const results = await Promise.allSettled(mediaPromises);

                // If any failed, return
                if (
                  results.some((result) => {
                    return result.status === 'rejected' || !result.value?.id;
                  })
                ) {
                  setUIState('error');
                  // Alert all the reasons
                  results.forEach((result) => {
                    if (result.status === 'rejected') {
                      console.error(result);
                      alert(result.reason || `Attachment #${i} failed`);
                    }
                  });
                  return;
                }

                console.log({ results, mediaAttachments });
              }

              /* NOTE:
                Using snakecase here because masto.js's `isObject` returns false for `params`, ONLY happens when opening in pop-out window. This is maybe due to `window.masto` variable being passed from the parent window. The check that failed is `x.constructor === Object`, so maybe the `Object` in new window is different than parent window's?
                Code: https://github.com/neet/masto.js/blob/dd0d649067b6a2b6e60fbb0a96597c373a255b00/src/serializers/is-object.ts#L2
              */
              let params = {
                status,
                // spoilerText,
                spoiler_text: spoilerText,
                language,
                sensitive,
                poll,
                // mediaIds: mediaAttachments.map((attachment) => attachment.id),
                media_ids: mediaAttachments.map((attachment) => attachment.id),
              };
              if (!editStatus) {
                params.visibility = visibility;
                // params.inReplyToId = replyToStatus?.id || undefined;
                params.in_reply_to_id = replyToStatus?.id || undefined;
              }
              params = removeNullUndefined(params);
              console.log('POST', params);

              let newStatus;
              if (editStatus) {
                newStatus = await masto.v1.statuses.update(
                  editStatus.id,
                  params,
                );
              } else {
                newStatus = await masto.v1.statuses.create(params);
              }
              setUIState('default');

              // Close
              onClose({
                newStatus,
              });
            } catch (e) {
              console.error(e);
              alert(e?.reason || e);
              setUIState('error');
            }
          })();
        }}
      >
        <div class="toolbar stretch">
          <input
            ref={spoilerTextRef}
            type="text"
            name="spoilerText"
            placeholder="Spoiler text"
            disabled={uiState === 'loading'}
            class="spoiler-text-field"
            style={{
              opacity: sensitive ? 1 : 0,
              pointerEvents: sensitive ? 'auto' : 'none',
            }}
            onInput={() => {
              updateCharCount();
            }}
          />
          <label
            class="toolbar-button"
            title="Content warning or sensitive media"
          >
            <input
              name="sensitive"
              type="checkbox"
              checked={sensitive}
              disabled={uiState === 'loading' || !!editStatus}
              onChange={(e) => {
                const sensitive = e.target.checked;
                setSensitive(sensitive);
                if (sensitive) {
                  spoilerTextRef.current?.focus();
                } else {
                  textareaRef.current?.focus();
                }
              }}
            />
            <Icon icon={`eye-${sensitive ? 'close' : 'open'}`} />
          </label>{' '}
          <label
            class={`toolbar-button ${
              visibility !== 'public' && !sensitive ? 'show-field' : ''
            }`}
            title={`Visibility: ${visibility}`}
          >
            <Icon icon={visibilityIconsMap[visibility]} alt={visibility} />
            <select
              name="visibility"
              value={visibility}
              onChange={(e) => {
                setVisibility(e.target.value);
              }}
              disabled={uiState === 'loading' || !!editStatus}
            >
              <option value="public">
                Public <Icon icon="earth" />
              </option>
              <option value="unlisted">Unlisted</option>
              <option value="private">Followers only</option>
              <option value="direct">Direct</option>
            </select>
          </label>{' '}
        </div>
        <text-expander ref={textExpanderRef} keys="@ # :">
          <textarea
            ref={textareaRef}
            placeholder={
              replyToStatus
                ? 'Post your reply'
                : editStatus
                ? 'Edit your status'
                : 'What are you doing?'
            }
            required={mediaAttachments.length === 0}
            autoCapitalize="sentences"
            autoComplete="on"
            autoCorrect="on"
            spellCheck="true"
            dir="auto"
            rows="6"
            cols="50"
            name="status"
            disabled={uiState === 'loading'}
            onInput={(e) => {
              const { scrollHeight, offsetHeight, clientHeight, value } =
                e.target;
              const offset = offsetHeight - clientHeight;
              e.target.style.height = value
                ? scrollHeight + offset + 'px'
                : null;
              updateCharCount();
            }}
            style={{
              maxHeight: `${maxCharacters / 50}em`,
              '--text-weight': (1 + charCount / 140).toFixed(1) || 1,
            }}
          ></textarea>
        </text-expander>
        {mediaAttachments.length > 0 && (
          <div class="media-attachments">
            {mediaAttachments.map((attachment, i) => {
              const { id } = attachment;
              return (
                <MediaAttachment
                  key={i + id}
                  attachment={attachment}
                  disabled={uiState === 'loading'}
                  onDescriptionChange={(value) => {
                    setMediaAttachments((attachments) => {
                      const newAttachments = [...attachments];
                      newAttachments[i].description = value;
                      return newAttachments;
                    });
                  }}
                  onRemove={() => {
                    setMediaAttachments((attachments) => {
                      return attachments.filter((_, j) => j !== i);
                    });
                  }}
                />
              );
            })}
          </div>
        )}
        {!!poll && (
          <Poll
            maxOptions={maxOptions}
            maxExpiration={maxExpiration}
            minExpiration={minExpiration}
            maxCharactersPerOption={maxCharactersPerOption}
            poll={poll}
            disabled={uiState === 'loading'}
            onInput={(poll) => {
              if (poll) {
                const newPoll = { ...poll };
                setPoll(newPoll);
              } else {
                setPoll(null);
              }
            }}
          />
        )}
        <div class="toolbar">
          <label class="toolbar-button">
            <input
              type="file"
              accept={supportedMimeTypes.join(',')}
              multiple={mediaAttachments.length < maxMediaAttachments - 1}
              disabled={
                uiState === 'loading' ||
                mediaAttachments.length >= maxMediaAttachments ||
                !!poll
              }
              onChange={(e) => {
                const files = e.target.files;
                if (!files) return;

                const mediaFiles = Array.from(files).map((file) => ({
                  file,
                  type: file.type,
                  size: file.size,
                  url: URL.createObjectURL(file),
                  id: null, // indicate uploaded state
                  description: null,
                }));
                console.log('MEDIA ATTACHMENTS', files, mediaFiles);

                // Validate max media attachments
                if (
                  mediaAttachments.length + mediaFiles.length >
                  maxMediaAttachments
                ) {
                  alert(
                    `You can only attach up to ${maxMediaAttachments} files.`,
                  );
                } else {
                  setMediaAttachments((attachments) => {
                    return attachments.concat(mediaFiles);
                  });
                }
              }}
            />
            <Icon icon="attachment" />
          </label>{' '}
          <button
            type="button"
            class="toolbar-button"
            disabled={
              uiState === 'loading' || !!poll || !!mediaAttachments.length
            }
            onClick={() => {
              setPoll({
                options: ['', ''],
                expiresIn: 24 * 60 * 60, // 1 day
                multiple: false,
              });
            }}
          >
            <Icon icon="poll" alt="Add poll" />
          </button>{' '}
          <div class="spacer" />
          {uiState === 'loading' && <Loader abrupt />}{' '}
          {uiState !== 'loading' && charCount > maxCharacters / 2 && (
            <>
              <meter
                class={`donut ${
                  leftChars <= -10
                    ? 'explode'
                    : leftChars <= 0
                    ? 'danger'
                    : leftChars <= 20
                    ? 'warning'
                    : ''
                }`}
                value={charCount}
                max={maxCharacters}
                data-left={leftChars}
                style={{
                  '--percentage': (charCount / maxCharacters) * 100,
                }}
              />{' '}
            </>
          )}
          <label class="toolbar-button">
            <span class="icon-text">
              {supportedLanguagesMap[language]?.native}
            </span>
            <select
              name="language"
              value={language}
              onChange={(e) => {
                const { value } = e.target;
                setLanguage(value || DEFAULT_LANG);
                store.session.set('language', value);
              }}
              disabled={uiState === 'loading'}
            >
              {supportedLanguages
                .sort(([, commonA], [, commonB]) => {
                  return commonA.localeCompare(commonB);
                })
                .map(([code, common, native]) => (
                  <option value={code}>
                    {common} ({native})
                  </option>
                ))}
            </select>
          </label>{' '}
          <button type="submit" class="large" disabled={uiState === 'loading'}>
            {replyToStatus ? 'Reply' : editStatus ? 'Update' : 'Post'}
          </button>
        </div>
      </form>
    </div>
  );
}

function MediaAttachment({
  attachment,
  disabled,
  onDescriptionChange = () => {},
  onRemove = () => {},
}) {
  const { url, type, id, description } = attachment;
  const suffixType = type.split('/')[0];
  return (
    <div class="media-attachment">
      <div class="media-preview">
        {suffixType === 'image' ? (
          <img src={url} alt="" />
        ) : suffixType === 'video' || suffixType === 'gifv' ? (
          <video src={url} playsinline muted />
        ) : suffixType === 'audio' ? (
          <audio src={url} controls />
        ) : null}
      </div>
      {!!id ? (
        <div class="media-desc">
          <span class="tag">Uploaded</span>
          <p title={description}>{description || <i>No description</i>}</p>
        </div>
      ) : (
        <textarea
          value={description || ''}
          placeholder={
            {
              image: 'Image description',
              video: 'Video description',
              audio: 'Audio description',
            }[suffixType]
          }
          autoCapitalize="sentences"
          autoComplete="on"
          autoCorrect="on"
          spellCheck="true"
          dir="auto"
          disabled={disabled}
          maxlength="1500" // Not unicode-aware :(
          // TODO: Un-hard-code this maxlength, ref: https://github.com/mastodon/mastodon/blob/b59fb28e90bc21d6fd1a6bafd13cfbd81ab5be54/app/models/media_attachment.rb#L39
          onInput={(e) => {
            const { value } = e.target;
            onDescriptionChange(value);
          }}
        ></textarea>
      )}
      <div class="media-aside">
        <button
          type="button"
          class="plain close-button"
          disabled={disabled}
          onClick={onRemove}
        >
          <Icon icon="x" />
        </button>
      </div>
    </div>
  );
}

function Poll({
  poll,
  disabled,
  onInput = () => {},
  maxOptions,
  maxExpiration,
  minExpiration,
  maxCharactersPerOption,
}) {
  const { options, expiresIn, multiple } = poll;

  return (
    <div class={`poll ${multiple ? 'multiple' : ''}`}>
      <div class="poll-choices">
        {options.map((option, i) => (
          <div class="poll-choice" key={i}>
            <input
              required
              type="text"
              value={option}
              disabled={disabled}
              maxlength={maxCharactersPerOption}
              placeholder={`Choice ${i + 1}`}
              onInput={(e) => {
                const { value } = e.target;
                options[i] = value;
                onInput(poll);
              }}
            />
            <button
              type="button"
              class="plain2 poll-button"
              disabled={disabled || options.length <= 1}
              onClick={() => {
                options.splice(i, 1);
                onInput(poll);
              }}
            >
              <Icon icon="x" size="s" />
            </button>
          </div>
        ))}
      </div>
      <div class="poll-toolbar">
        <button
          type="button"
          class="plain2 poll-button"
          disabled={disabled || options.length >= maxOptions}
          onClick={() => {
            options.push('');
            onInput(poll);
          }}
        >
          +
        </button>{' '}
        <label class="multiple-choices">
          <input
            type="checkbox"
            checked={multiple}
            disabled={disabled}
            onChange={(e) => {
              const { checked } = e.target;
              poll.multiple = checked;
              onInput(poll);
            }}
          />{' '}
          Multiple choices
        </label>
        <label class="expires-in">
          Duration{' '}
          <select
            value={expiresIn}
            disabled={disabled}
            onChange={(e) => {
              const { value } = e.target;
              poll.expiresIn = value;
              onInput(poll);
            }}
          >
            {Object.entries(expiryOptions)
              .filter(([label, value]) => {
                return value >= minExpiration && value <= maxExpiration;
              })
              .map(([label, value]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
          </select>
        </label>
      </div>
      <div class="poll-toolbar">
        <button
          type="button"
          class="plain remove-poll-button"
          disabled={disabled}
          onClick={() => {
            onInput(null);
          }}
        >
          Remove poll
        </button>
      </div>
    </div>
  );
}

function filterShortcodes(emojis, searchTerm) {
  searchTerm = searchTerm.toLowerCase();

  // Return an array of shortcodes that start with or contain the search term, sorted by relevance and limited to the first 5
  return emojis
    .sort((a, b) => {
      let aLower = a.shortcode.toLowerCase();
      let bLower = b.shortcode.toLowerCase();

      let aStartsWith = aLower.startsWith(searchTerm);
      let bStartsWith = bLower.startsWith(searchTerm);
      let aContains = aLower.includes(searchTerm);
      let bContains = bLower.includes(searchTerm);
      let bothStartWith = aStartsWith && bStartsWith;
      let bothContain = aContains && bContains;

      return bothStartWith
        ? a.length - b.length
        : aStartsWith
        ? -1
        : bStartsWith
        ? 1
        : bothContain
        ? a.length - b.length
        : aContains
        ? -1
        : bContains
        ? 1
        : 0;
    })
    .slice(0, 5);
}

function encodeHTML(str) {
  return str.replace(/[&<>"']/g, function (char) {
    return '&#' + char.charCodeAt(0) + ';';
  });
}

// https://github.com/mastodon/mastodon/blob/c4a429ed47e85a6bbf0d470a41cc2f64cf120c19/app/javascript/mastodon/features/compose/util/counter.js
const urlRegexObj = new RegExp(urlRegex.source, urlRegex.flags);
const usernameRegex = /(^|[^\/\w])@(([a-z0-9_]+)@[a-z0-9\.\-]+[a-z0-9]+)/gi;
const urlPlaceholder = '$2xxxxxxxxxxxxxxxxxxxxxxx';
function countableText(inputText) {
  return inputText
    .replace(urlRegexObj, urlPlaceholder)
    .replace(usernameRegex, '$1@$3');
}

function removeNullUndefined(obj) {
  for (let key in obj) {
    if (obj[key] === null || obj[key] === undefined) {
      delete obj[key];
    }
  }
  return obj;
}

export default Compose;
