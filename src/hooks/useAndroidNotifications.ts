import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
import { useNavigate } from 'react-router-dom';
import { Event, nip19 } from 'nostr-tools';
import { useNostrNotifications } from '../contexts/nostr-notification-context';
import { Conversation } from '../contexts/dm-context';
import { useDMContext } from './useDMContext';
import { useUserContext } from './useUserContext';
import { useRelays } from './useRelays';
import { initLocalNotifications, fireNotification, NotifExtra } from '../services/localNotificationService';

const NOTIF_ID_DMS = 1002;

/** Derive a stable integer notification ID from an event ID (hex string). */
function eventIdToNotifId(eventId: string): number {
  return (parseInt(eventId.slice(0, 8), 16) & 0x7fffffff) || 1;
}

function buildEventNotification(
  ev: Event,
  pollMap: Map<string, Event>
): { title: string; body: string; extra: NotifExtra } {
  if (ev.kind === 1018) {
    const pollId = ev.tags.find((t) => t[0] === 'e')?.[1];
    const pollContent = pollId ? pollMap.get(pollId)?.content : undefined;
    const nevent = pollId ? (() => { try { return nip19.neventEncode({ id: pollId }); } catch { return undefined; } })() : undefined;
    return {
      title: 'New poll response',
      body: pollContent ? `"${pollContent.slice(0, 80)}"` : 'Someone responded to your poll',
      extra: nevent ? { target: 'respond', nevent } : { target: 'notifications' },
    };
  }

  if (ev.kind === 1) {
    const nevent = (() => { try { return nip19.neventEncode({ id: ev.id }); } catch { return undefined; } })();
    return {
      title: 'New mention',
      body: ev.content ? `"${ev.content.slice(0, 80)}"` : '',
      extra: nevent ? { target: 'note', nevent } : { target: 'notifications' },
    };
  }

  if (ev.kind === 7) {
    const postId = ev.tags.find((t) => t[0] === 'e')?.[1];
    const nevent = postId ? (() => { try { return nip19.neventEncode({ id: postId }); } catch { return undefined; } })() : undefined;
    return {
      title: `New reaction ${ev.content || ''}`.trim(),
      body: '',
      extra: nevent ? { target: 'note', nevent } : { target: 'notifications' },
    };
  }

  if (ev.kind === 9735) {
    return {
      title: 'New zap ⚡',
      body: '',
      extra: { target: 'notifications' },
    };
  }

  return {
    title: 'New notification',
    body: '',
    extra: { target: 'notifications' },
  };
}

function buildDMBody(conversations: Map<string, Conversation>, userPubkey: string | undefined): string {
  const unreadConvs = Array.from(conversations.values()).filter(c => c.unreadCount > 0);
  if (unreadConvs.length === 0) return 'New message';

  const total = unreadConvs.reduce((s, c) => s + c.unreadCount, 0);

  if (unreadConvs.length === 1) {
    const conv = unreadConvs[0];
    const otherPubkey = conv.participants.find(p => p !== userPubkey) ?? '';
    const shortKey = otherPubkey ? `${otherPubkey.slice(0, 8)}…` : 'someone';
    return `${total} new message${total > 1 ? 's' : ''} from ${shortKey}`;
  }

  return `${total} new messages from ${unreadConvs.length} people`;
}

/** Resolve the npub of the other participant if there's exactly one unread DM conversation */
function getSingleDMNpub(conversations: Map<string, Conversation>, userPubkey: string | undefined): string | undefined {
  const unreadConvs = Array.from(conversations.values()).filter(c => c.unreadCount > 0);
  if (unreadConvs.length !== 1) return undefined;
  const otherPubkey = unreadConvs[0].participants.find(p => p !== userPubkey);
  if (!otherPubkey) return undefined;
  try { return nip19.npubEncode(otherPubkey); } catch { return undefined; }
}

function handleDeepLink(url: string, navigate: ReturnType<typeof useNavigate>) {
  console.log('[AndroidNotif] handleDeepLink:', url);
  if (url.includes('/messages/')) {
    const npub = url.split('/messages/')[1];
    navigate(`/messages/${npub}`);
  } else if (url.includes('/messages')) {
    navigate('/messages');
  } else if (url.includes('/respond/')) {
    const nevent = url.split('/respond/')[1];
    navigate(`/respond/${nevent}`);
  } else if (url.includes('/note/')) {
    const nevent = url.split('/note/')[1];
    navigate(`/note/${nevent}`);
  } else if (url.includes('/notifications')) {
    navigate('/notifications');
  }
}

export function useAndroidNotifications() {
  const navigate = useNavigate();
  const { unreadCount, notifications, lastSeen, pollMap } = useNostrNotifications();
  const { unreadTotal: dmUnread, conversations } = useDMContext();
  const { user } = useUserContext();
  const { relays } = useRelays();
  const permitted = useRef(false);
  const prevDMs    = useRef(0);
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  // Track which event IDs we've already fired a notification for (per session)
  const firedEventIds = useRef(new Set<string>());

  // Request permission + register listeners once
  useEffect(() => {
    console.log('[AndroidNotif] hook mounted, requesting permission');
    initLocalNotifications().then(ok => {
      console.log('[AndroidNotif] permission granted:', ok);
      permitted.current = ok;
    });

    // Handle taps on JS-side local notifications (app alive/backgrounded)
    const tapSub = LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      const extra = action.notification.extra as NotifExtra | undefined;
      console.log('[AndroidNotif] notification tapped, extra:', extra);
      if (!extra) return;
      if (extra.target === 'messages') {
        navigateRef.current('npub' in extra && extra.npub ? `/messages/${extra.npub}` : '/messages');
      } else if (extra.target === 'notifications') {
        navigateRef.current('/notifications');
      } else if (extra.target === 'respond') {
        navigateRef.current(`/respond/${extra.nevent}`);
      } else if (extra.target === 'note') {
        navigateRef.current(`/note/${extra.nevent}`);
      }
    });

    // Handle WorkManager deep links (app was killed, custom URL scheme)
    App.getLaunchUrl().then(result => {
      if (result?.url) handleDeepLink(result.url, navigateRef.current);
    });
    const urlSub = App.addListener('appUrlOpen', ({ url }) => {
      handleDeepLink(url, navigateRef.current);
    });

    return () => {
      tapSub.then(h => h.remove());
      urlSub.then(h => h.remove());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Bridge: save pubkey for WorkManager Worker
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (!user?.pubkey) return;
    console.log('[AndroidNotif] saving worker_pubkey');
    Preferences.set({ key: 'worker_pubkey', value: user.pubkey });
  }, [user?.pubkey]);

  // Bridge: save first relay for WorkManager Worker
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (!relays?.length) return;
    console.log('[AndroidNotif] saving worker_relay:', relays[0]);
    Preferences.set({ key: 'worker_relay', value: relays[0] });
  }, [relays]);

  // Fire one notification per new unread event while the app is backgrounded
  useEffect(() => {
    if (!permitted.current) return;

    const unread = Array.from(notifications.values())
      .filter(ev => lastSeen === null || ev.created_at > lastSeen)
      .filter(ev => !firedEventIds.current.has(ev.id));

    for (const ev of unread) {
      // Always mark as seen so we never re-fire even if foregrounded
      firedEventIds.current.add(ev.id);

      // Only push the OS notification when the app is in the background
      if (!document.hidden) continue;

      const notifId = eventIdToNotifId(ev.id);
      const { title, body, extra } = buildEventNotification(ev, pollMap);
      console.log('[AndroidNotif] firing per-event notification:', notifId, title);
      fireNotification(notifId, title, body, extra);
    }
  }, [unreadCount, notifications, lastSeen, pollMap]);

  // Fire when new DMs arrive while backgrounded
  useEffect(() => {
    console.log('[AndroidNotif] dmUnread changed:', dmUnread,
      '| prev:', prevDMs.current, '| permitted:', permitted.current, '| hidden:', document.hidden);
    if (!permitted.current) { prevDMs.current = dmUnread; return; }
    if (dmUnread > prevDMs.current && document.hidden) {
      const npub = getSingleDMNpub(conversations, user?.pubkey);
      const extra: NotifExtra = npub ? { target: 'messages', npub } : { target: 'messages' };
      fireNotification(NOTIF_ID_DMS, 'Pollerama', buildDMBody(conversations, user?.pubkey), extra);
    }
    prevDMs.current = dmUnread;
  }, [dmUnread, conversations, user?.pubkey]);
}
