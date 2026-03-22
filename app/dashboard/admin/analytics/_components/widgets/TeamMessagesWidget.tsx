'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { WidgetProps } from '../types';
import { LoadingSkeleton } from './LoadingSkeleton';

interface Message {
  id: string;
  author_name: string;
  author_role: string;
  content: string;
  channel: string;
  created_at: string;
}

const CHANNELS = ['all', 'general', 'ops', 'sales', 'urgent'] as const;

const ROLE_AVATAR_COLORS: Record<string, string> = {
  super_admin: 'from-purple-400 to-purple-600',
  admin: 'from-blue-400 to-blue-600',
  operations_manager: 'from-indigo-400 to-indigo-600',
  salesman: 'from-green-400 to-green-600',
  operator: 'from-orange-400 to-orange-600',
};

function getInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export default function TeamMessagesWidget({ isLoading }: WidgetProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeChannel, setActiveChannel] = useState<string>('all');
  const [newMessage, setNewMessage] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const getToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? '';
  }, []);

  const fetchMessages = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/team-messages', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setMessages(json.data ?? json ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 15000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activeChannel]);

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    try {
      const token = await getToken();
      await fetch('/api/admin/team-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: newMessage, channel: activeChannel === 'all' ? 'general' : activeChannel }),
      });
      setNewMessage('');
      fetchMessages();
    } catch {
      // silent
    }
  };

  if (isLoading || loading) return <LoadingSkeleton className="h-full" />;

  const filtered = activeChannel === 'all'
    ? messages
    : messages.filter((m) => m.channel === activeChannel);

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Channel tabs */}
      <div className="flex gap-3 border-b border-gray-100 pb-1">
        {CHANNELS.map((ch) => (
          <button
            key={ch}
            onClick={() => setActiveChannel(ch)}
            className={`text-[10px] uppercase tracking-wider pb-1 font-medium transition-colors ${
              activeChannel === ch
                ? 'text-blue-600 border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {ch}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2.5 min-h-0">
        {filtered.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-xs">No messages yet</div>
        )}
        {filtered.map((msg) => (
          <div key={msg.id} className="flex gap-2">
            <div
              className={`w-7 h-7 rounded-full bg-gradient-to-br ${ROLE_AVATAR_COLORS[msg.author_role] ?? 'from-gray-400 to-gray-600'} flex items-center justify-center flex-shrink-0`}
            >
              <span className="text-[9px] font-bold text-white">{getInitials(msg.author_name)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-gray-800 truncate">{msg.author_name}</span>
                <span className="text-[9px] px-1.5 rounded-full bg-gray-100 text-gray-500 flex-shrink-0">
                  {msg.author_role?.replace('_', ' ')}
                </span>
                <span className="text-[10px] text-gray-400 flex-shrink-0">{relativeTime(msg.created_at)}</span>
              </div>
              <p className="text-sm text-gray-700 break-words">{msg.content}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="flex gap-2 pt-1 border-t border-gray-100">
        <input
          type="text"
          placeholder="Type a message..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }}
          className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <button
          onClick={sendMessage}
          className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex-shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
