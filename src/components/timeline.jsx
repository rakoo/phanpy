import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useHotkeys } from 'react-hotkeys-hook';
import { InView } from 'react-intersection-observer';
import { useDebouncedCallback } from 'use-debounce';
import { useSnapshot } from 'valtio';

import FilterContext from '../utils/filter-context';
import { isFiltered } from '../utils/filters';
import states, { statusKey } from '../utils/states';
import statusPeek from '../utils/status-peek';
import { groupBoosts, groupContext } from '../utils/timeline-utils';
import useInterval from '../utils/useInterval';
import usePageVisibility from '../utils/usePageVisibility';
import useScroll from '../utils/useScroll';

import Icon from './icon';
import Link from './link';
import MediaPost from './media-post';
import NavMenu from './nav-menu';
import Status from './status';

const scrollIntoViewOptions = {
  block: 'nearest',
  inline: 'center',
  behavior: 'smooth',
};

function Timeline({
  title,
  titleComponent,
  id,
  instance,
  emptyText,
  errorText,
  useItemID, // use statusID instead of status object, assuming it's already in states
  boostsCarousel,
  fetchItems = () => {},
  checkForUpdates = () => {},
  checkForUpdatesInterval = 15_000, // 15 seconds
  headerStart,
  headerEnd,
  timelineStart,
  // allowFilters,
  refresh,
  view,
  filterContext,
}) {
  const snapStates = useSnapshot(states);
  const [items, setItems] = useState([]);
  const [uiState, setUIState] = useState('default');
  const [showMore, setShowMore] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [visible, setVisible] = useState(true);
  const scrollableRef = useRef();

  console.debug('RENDER Timeline', id, refresh);

  const allowGrouping = view !== 'media';
  const loadItems = useDebouncedCallback(
    (firstLoad) => {
      setShowNew(false);
      if (uiState === 'loading') return;
      setUIState('loading');
      (async () => {
        try {
          let { done, value } = await fetchItems(firstLoad);
          if (Array.isArray(value)) {
            // Avoid grouping for pinned posts
            const [pinnedPosts, otherPosts] = value.reduce(
              (acc, item) => {
                if (item._pinned) {
                  acc[0].push(item);
                } else {
                  acc[1].push(item);
                }
                return acc;
              },
              [[], []],
            );
            value = otherPosts;
            if (allowGrouping) {
              if (boostsCarousel) {
                value = groupBoosts(value);
              }
              value = groupContext(value);
            }
            if (pinnedPosts.length) {
              value = pinnedPosts.concat(value);
            }
            console.log(value);
            if (firstLoad) {
              setItems(value);
            } else {
              setItems((items) => [...items, ...value]);
            }
            if (!value.length) done = true;
            setShowMore(!done);
          } else {
            setShowMore(false);
          }
          setUIState('default');
        } catch (e) {
          console.error(e);
          setUIState('error');
        } finally {
          loadItems.cancel();
        }
      })();
    },
    1500,
    {
      leading: true,
      trailing: false,
    },
  );

  const itemsSelector = '.timeline-item, .timeline-item-alt';

  const jRef = useHotkeys('j, shift+j', (_, handler) => {
    // focus on next status after active item
    const activeItem = document.activeElement.closest(itemsSelector);
    const activeItemRect = activeItem?.getBoundingClientRect();
    const allItems = Array.from(
      scrollableRef.current.querySelectorAll(itemsSelector),
    );
    if (
      activeItem &&
      activeItemRect.top < scrollableRef.current.clientHeight &&
      activeItemRect.bottom > 0
    ) {
      const activeItemIndex = allItems.indexOf(activeItem);
      let nextItem = allItems[activeItemIndex + 1];
      if (handler.shift) {
        // get next status that's not .timeline-item-alt
        nextItem = allItems.find(
          (item, index) =>
            index > activeItemIndex &&
            !item.classList.contains('timeline-item-alt'),
        );
      }
      if (nextItem) {
        nextItem.focus();
        nextItem.scrollIntoView(scrollIntoViewOptions);
      }
    } else {
      // If active status is not in viewport, get the topmost status-link in viewport
      const topmostItem = allItems.find((item) => {
        const itemRect = item.getBoundingClientRect();
        return itemRect.top >= 44 && itemRect.left >= 0; // 44 is the magic number for header height, not real
      });
      if (topmostItem) {
        topmostItem.focus();
        topmostItem.scrollIntoView(scrollIntoViewOptions);
      }
    }
  });

  const kRef = useHotkeys('k, shift+k', (_, handler) => {
    // focus on previous status after active item
    const activeItem = document.activeElement.closest(itemsSelector);
    const activeItemRect = activeItem?.getBoundingClientRect();
    const allItems = Array.from(
      scrollableRef.current.querySelectorAll(itemsSelector),
    );
    if (
      activeItem &&
      activeItemRect.top < scrollableRef.current.clientHeight &&
      activeItemRect.bottom > 0
    ) {
      const activeItemIndex = allItems.indexOf(activeItem);
      let prevItem = allItems[activeItemIndex - 1];
      if (handler.shift) {
        // get prev status that's not .timeline-item-alt
        prevItem = allItems.findLast(
          (item, index) =>
            index < activeItemIndex &&
            !item.classList.contains('timeline-item-alt'),
        );
      }
      if (prevItem) {
        prevItem.focus();
        prevItem.scrollIntoView(scrollIntoViewOptions);
      }
    } else {
      // If active status is not in viewport, get the topmost status-link in viewport
      const topmostItem = allItems.find((item) => {
        const itemRect = item.getBoundingClientRect();
        return itemRect.top >= 44 && itemRect.left >= 0; // 44 is the magic number for header height, not real
      });
      if (topmostItem) {
        topmostItem.focus();
        topmostItem.scrollIntoView(scrollIntoViewOptions);
      }
    }
  });

  const oRef = useHotkeys(['enter', 'o'], () => {
    // open active status
    const activeItem = document.activeElement.closest(itemsSelector);
    if (activeItem) {
      activeItem.click();
    }
  });

  const {
    scrollDirection,
    nearReachStart,
    nearReachEnd,
    reachStart,
    reachEnd,
  } = useScroll({
    scrollableRef,
    distanceFromEnd: 2,
    scrollThresholdStart: 44,
  });

  useEffect(() => {
    scrollableRef.current?.scrollTo({ top: 0 });
    loadItems(true);
  }, []);
  useEffect(() => {
    loadItems(true);
  }, [refresh]);

  useEffect(() => {
    if (reachStart) {
      loadItems(true);
    }
  }, [reachStart]);

  useEffect(() => {
    if (nearReachEnd || (reachEnd && showMore)) {
      loadItems();
    }
  }, [nearReachEnd, showMore]);

  const prevView = useRef(view);
  useEffect(() => {
    if (prevView.current !== view) {
      prevView.current = view;
      setItems([]);
    }
  }, [view]);

  const loadOrCheckUpdates = useCallback(
    async ({ disableIdleCheck = false } = {}) => {
      const noPointers = scrollableRef.current
        ? getComputedStyle(scrollableRef.current).pointerEvents === 'none'
        : false;
      console.log('✨ Load or check updates', id, {
        autoRefresh: snapStates.settings.autoRefresh,
        scrollTop: scrollableRef.current.scrollTop,
        disableIdleCheck,
        idle: window.__IDLE__,
        inBackground: inBackground(),
        noPointers,
      });
      if (
        snapStates.settings.autoRefresh &&
        scrollableRef.current.scrollTop < 16 &&
        (disableIdleCheck || window.__IDLE__) &&
        !inBackground() &&
        !noPointers
      ) {
        console.log('✨ Load updates', id, snapStates.settings.autoRefresh);
        loadItems(true);
      } else {
        console.log('✨ Check updates', id, snapStates.settings.autoRefresh);
        const hasUpdate = await checkForUpdates();
        if (hasUpdate) {
          console.log('✨ Has new updates', id);
          setShowNew(true);
        }
      }
    },
    [id, loadItems, checkForUpdates, snapStates.settings.autoRefresh],
  );

  const lastHiddenTime = useRef();
  usePageVisibility(
    (visible) => {
      if (visible) {
        const timeDiff = Date.now() - lastHiddenTime.current;
        if (!lastHiddenTime.current || timeDiff > 1000 * 3) {
          // 3 seconds
          loadOrCheckUpdates({
            disableIdleCheck: true,
          });
        }
      } else {
        lastHiddenTime.current = Date.now();
      }
      setVisible(visible);
    },
    [checkForUpdates, loadOrCheckUpdates, snapStates.settings.autoRefresh],
  );

  // checkForUpdates interval
  useInterval(
    loadOrCheckUpdates,
    visible && !showNew
      ? checkForUpdatesInterval * (nearReachStart ? 1 : 2)
      : null,
  );

  const hiddenUI = scrollDirection === 'end' && !nearReachStart;

  return (
    <FilterContext.Provider value={filterContext}>
      <div
        id={`${id}-page`}
        class="deck-container"
        ref={(node) => {
          scrollableRef.current = node;
          jRef.current = node;
          kRef.current = node;
          oRef.current = node;
        }}
        tabIndex="-1"
      >
        <div class="timeline-deck deck">
          <header
            hidden={hiddenUI}
            onClick={(e) => {
              if (!e.target.closest('a, button')) {
                scrollableRef.current?.scrollTo({
                  top: 0,
                  behavior: 'smooth',
                });
              }
            }}
            onDblClick={(e) => {
              if (!e.target.closest('a, button')) {
                loadItems(true);
              }
            }}
            class={uiState === 'loading' ? 'loading' : ''}
          >
            <div class="header-grid">
              <div class="header-side">
                <NavMenu />
                {headerStart !== null && headerStart !== undefined ? (
                  headerStart
                ) : (
                  <Link to="/" class="button plain home-button">
                    <Icon icon="home" size="l" />
                  </Link>
                )}
              </div>
              {title && (titleComponent ? titleComponent : <h1>{title}</h1>)}
              <div class="header-side">
                {/* <Loader hidden={uiState !== 'loading'} /> */}
                {!!headerEnd && headerEnd}
              </div>
            </div>
            {items.length > 0 &&
              uiState !== 'loading' &&
              !hiddenUI &&
              showNew && (
                <button
                  class="updates-button shiny-pill"
                  type="button"
                  onClick={() => {
                    loadItems(true);
                    scrollableRef.current?.scrollTo({
                      top: 0,
                      behavior: 'smooth',
                    });
                  }}
                >
                  <Icon icon="arrow-up" /> New posts
                </button>
              )}
          </header>
          {!!timelineStart && (
            <div
              class={`timeline-start ${uiState === 'loading' ? 'loading' : ''}`}
            >
              {timelineStart}
            </div>
          )}
          {!!items.length ? (
            <>
              <ul class={`timeline ${view ? `timeline-${view}` : ''}`}>
                {items.map((status) => (
                  <TimelineItem
                    status={status}
                    instance={instance}
                    useItemID={useItemID}
                    // allowFilters={allowFilters}
                    filterContext={filterContext}
                    key={status.id + status?._pinned + view}
                    view={view}
                  />
                ))}
                {showMore &&
                  uiState === 'loading' &&
                  (view === 'media' ? null : (
                    <>
                      <li
                        style={{
                          height: '20vh',
                        }}
                      >
                        <Status skeleton />
                      </li>
                      <li
                        style={{
                          height: '25vh',
                        }}
                      >
                        <Status skeleton />
                      </li>
                    </>
                  ))}
              </ul>
              {uiState === 'default' &&
                (showMore ? (
                  <InView
                    onChange={(inView) => {
                      if (inView) {
                        loadItems();
                      }
                    }}
                  >
                    <button
                      type="button"
                      class="plain block"
                      onClick={() => loadItems()}
                      style={{ marginBlockEnd: '6em' }}
                    >
                      Show more&hellip;
                    </button>
                  </InView>
                ) : (
                  <p class="ui-state insignificant">The end.</p>
                ))}
            </>
          ) : uiState === 'loading' ? (
            <ul class="timeline">
              {Array.from({ length: 5 }).map((_, i) =>
                view === 'media' ? (
                  <div
                    style={{
                      height: '50vh',
                    }}
                  />
                ) : (
                  <li key={i}>
                    <Status skeleton />
                  </li>
                ),
              )}
            </ul>
          ) : (
            uiState !== 'error' && <p class="ui-state">{emptyText}</p>
          )}
          {uiState === 'error' && (
            <p class="ui-state">
              {errorText}
              <br />
              <br />
              <button type="button" onClick={() => loadItems(!items.length)}>
                Try again
              </button>
            </p>
          )}
        </div>
      </div>
    </FilterContext.Provider>
  );
}

function TimelineItem({
  status,
  instance,
  useItemID,
  // allowFilters,
  filterContext,
  view,
}) {
  const { id: statusID, reblog, items, type, _pinned } = status;
  if (_pinned) useItemID = false;
  const actualStatusID = reblog?.id || statusID;
  const url = instance
    ? `/${instance}/s/${actualStatusID}`
    : `/s/${actualStatusID}`;
  let title = '';
  if (type === 'boosts') {
    title = `${items.length} Boosts`;
  } else if (type === 'pinned') {
    title = 'Pinned posts';
  }
  const isCarousel = type === 'boosts' || type === 'pinned';
  if (items) {
    if (isCarousel) {
      // Here, we don't hide filtered posts, but we sort them last
      items.sort((a, b) => {
        // if (a._filtered && !b._filtered) {
        //   return 1;
        // }
        // if (!a._filtered && b._filtered) {
        //   return -1;
        // }
        const aFiltered = isFiltered(a.filtered, filterContext);
        const bFiltered = isFiltered(b.filtered, filterContext);
        if (aFiltered && !bFiltered) {
          return 1;
        }
        if (!aFiltered && bFiltered) {
          return -1;
        }
        return 0;
      });
      return (
        <li key={`timeline-${statusID}`} class="timeline-item-carousel">
          <StatusCarousel title={title} class={`${type}-carousel`}>
            {items.map((item) => {
              const { id: statusID, reblog, _pinned } = item;
              const actualStatusID = reblog?.id || statusID;
              const url = instance
                ? `/${instance}/s/${actualStatusID}`
                : `/s/${actualStatusID}`;
              if (_pinned) useItemID = false;
              return (
                <li key={statusID}>
                  <Link class="status-carousel-link timeline-item-alt" to={url}>
                    {useItemID ? (
                      <Status
                        statusID={statusID}
                        instance={instance}
                        size="s"
                        contentTextWeight
                        enableCommentHint
                        // allowFilters={allowFilters}
                      />
                    ) : (
                      <Status
                        status={item}
                        instance={instance}
                        size="s"
                        contentTextWeight
                        enableCommentHint
                        // allowFilters={allowFilters}
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </StatusCarousel>
        </li>
      );
    }
    const manyItems = items.length > 3;
    return items.map((item, i) => {
      const { id: statusID, _differentAuthor } = item;
      const url = instance ? `/${instance}/s/${statusID}` : `/s/${statusID}`;
      const isMiddle = i > 0 && i < items.length - 1;
      const isSpoiler = item.sensitive && !!item.spoilerText;
      const showCompact =
        (!_differentAuthor && isSpoiler && i > 0) ||
        (manyItems &&
          isMiddle &&
          (type === 'thread' ||
            (type === 'conversation' &&
              !_differentAuthor &&
              !items[i - 1]._differentAuthor &&
              !items[i + 1]._differentAuthor)));
      const isEnd = i === items.length - 1;
      return (
        <li
          key={`timeline-${statusID}`}
          class={`timeline-item-container timeline-item-container-type-${type} timeline-item-container-${
            i === 0 ? 'start' : isEnd ? 'end' : 'middle'
          } ${_differentAuthor ? 'timeline-item-diff-author' : ''}`}
        >
          <Link class="status-link timeline-item" to={url}>
            {showCompact ? (
              <TimelineStatusCompact status={item} instance={instance} />
            ) : useItemID ? (
              <Status
                statusID={statusID}
                instance={instance}
                enableCommentHint={isEnd}
                // allowFilters={allowFilters}
              />
            ) : (
              <Status
                status={item}
                instance={instance}
                enableCommentHint={isEnd}
                // allowFilters={allowFilters}
              />
            )}
          </Link>
        </li>
      );
    });
  }

  const itemKey = `timeline-${statusID + _pinned}`;

  if (view === 'media') {
    return useItemID ? (
      <MediaPost
        class="timeline-item"
        parent="li"
        key={itemKey}
        statusID={statusID}
        instance={instance}
        // allowFilters={allowFilters}
      />
    ) : (
      <MediaPost
        class="timeline-item"
        parent="li"
        key={itemKey}
        status={status}
        instance={instance}
        // allowFilters={allowFilters}
      />
    );
  }

  return (
    <li key={itemKey}>
      <Link class="status-link timeline-item" to={url}>
        {useItemID ? (
          <Status
            statusID={statusID}
            instance={instance}
            enableCommentHint
            // allowFilters={allowFilters}
          />
        ) : (
          <Status
            status={status}
            instance={instance}
            enableCommentHint
            // allowFilters={allowFilters}
          />
        )}
      </Link>
    </li>
  );
}

function StatusCarousel({ title, class: className, children }) {
  const carouselRef = useRef();
  const { reachStart, reachEnd, init } = useScroll({
    scrollableRef: carouselRef,
    direction: 'horizontal',
  });
  useEffect(() => {
    init?.();
  }, []);

  return (
    <div class={`status-carousel ${className}`}>
      <header>
        <h3>{title}</h3>
        <span>
          <button
            type="button"
            class="small plain2"
            disabled={reachStart}
            onClick={() => {
              carouselRef.current?.scrollBy({
                left: -Math.min(320, carouselRef.current?.offsetWidth),
                behavior: 'smooth',
              });
            }}
          >
            <Icon icon="chevron-left" />
          </button>{' '}
          <button
            type="button"
            class="small plain2"
            disabled={reachEnd}
            onClick={() => {
              carouselRef.current?.scrollBy({
                left: Math.min(320, carouselRef.current?.offsetWidth),
                behavior: 'smooth',
              });
            }}
          >
            <Icon icon="chevron-right" />
          </button>
        </span>
      </header>
      <ul ref={carouselRef}>{children}</ul>
    </div>
  );
}

function TimelineStatusCompact({ status, instance }) {
  const snapStates = useSnapshot(states);
  const { id, visibility } = status;
  const statusPeekText = statusPeek(status);
  const sKey = statusKey(id, instance);
  return (
    <article
      class={`status compact-thread ${
        visibility === 'direct' ? 'visibility-direct' : ''
      }`}
      tabindex="-1"
    >
      {!!snapStates.statusThreadNumber[sKey] ? (
        <div class="status-thread-badge">
          <Icon icon="thread" size="s" />
          {snapStates.statusThreadNumber[sKey]
            ? ` ${snapStates.statusThreadNumber[sKey]}/X`
            : ''}
        </div>
      ) : (
        <div class="status-thread-badge">
          <Icon icon="thread" size="s" />
        </div>
      )}
      <div class="content-compact" title={statusPeekText}>
        {statusPeekText}
        {status.sensitive && status.spoilerText && (
          <>
            {' '}
            <span class="spoiler-badge">
              <Icon icon="eye-close" size="s" />
            </span>
          </>
        )}
      </div>
    </article>
  );
}

function inBackground() {
  return !!document.querySelector('.deck-backdrop, #modal-container > *');
}

export default Timeline;
