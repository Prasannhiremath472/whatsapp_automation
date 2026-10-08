import { useEffect, useRef, useState } from "react";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

interface InboxMessage {
  id: string;
  direction: "inbound" | "outbound";
  senderType: string;
  messageType: string;
  content: Record<string, unknown>;
  createdAt: string;
}

interface ListRow {
  id: string;
  title: string;
  description?: string;
}

interface ListSection {
  title?: string;
  rows: ListRow[];
}

function messageText(m: InboxMessage): string {
  const c = m.content;
  if (typeof c.body === "string") return c.body;
  if (typeof c.bodyText === "string") return c.bodyText;
  return "";
}

function messageOptions(m: InboxMessage): { id: string; title: string; description?: string }[] {
  const c = m.content;
  if (m.messageType === "interactive_list" && Array.isArray(c.sections)) {
    return (c.sections as ListSection[]).flatMap((s) => s.rows);
  }
  if (m.messageType === "interactive_button" && Array.isArray(c.buttons)) {
    return c.buttons as { id: string; title: string }[];
  }
  return [];
}

/**
 * Dev-only WhatsApp chat simulator. Lets you type/tap replies like a real
 * customer instead of running curl commands with row ids, without needing
 * real Meta credentials — everything still goes through the same
 * webhook -> queue -> processor -> commerce bot pipeline via
 * /dev/simulate-inbound-message. Never routed to in production (only linked
 * from local dev).
 */
export function BotTesterPage() {
  const [tenantSlug, setTenantSlug] = useState("xyz-machines");
  const [adminEmail, setAdminEmail] = useState("admin@xyzmachines.dev.local");
  const [adminPassword, setAdminPassword] = useState("DevPassword123!");
  const [waId, setWaId] = useState("918390500747");
  const [profileName, setProfileName] = useState("Test Customer");
  const [connected, setConnected] = useState(false);
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [token, setToken] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function handleConnect() {
    setError("");
    try {
      const loginRes = await axios.post(`${API_URL}/auth/login`, { email: adminEmail, password: adminPassword });
      const accessToken = loginRes.data.accessToken as string;
      setToken(accessToken);

      const meRes = await axios.get(`${API_URL}/whatsapp-connections/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setPhoneNumberId(meRes.data.phoneNumberId as string);
      setConnected(true);
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.message ?? err.message : String(err));
    }
  }

  async function refreshMessages(currentToken: string) {
    try {
      const convRes = await axios.get(`${API_URL}/conversations`, { headers: { Authorization: `Bearer ${currentToken}` } });
      const conv = (convRes.data as { id: string; contact: { waId: string } }[]).find((c) => c.contact.waId === waId);
      if (!conv) {
        setMessages([]);
        return;
      }
      setConversationId(conv.id);
      const msgRes = await axios.get(`${API_URL}/conversations/${conv.id}/messages?limit=100`, {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      const sorted = [...(msgRes.data as InboxMessage[])].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      setMessages(sorted);
    } catch {
      // Polling errors are transient (e.g. token not ready yet) — ignore.
    }
  }

  useEffect(() => {
    if (!connected || !token) return;
    void refreshMessages(token);
    pollRef.current = setInterval(() => void refreshMessages(token), 1500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, token]);

  async function sendReply(kind: "text" | "list_reply" | "button_reply", value: string, title?: string) {
    setError("");
    const body: Record<string, unknown> = {
      phoneNumberId,
      fromWaId: waId,
      fromProfileName: profileName,
    };
    if (kind === "text") {
      body.messageType = "text";
      body.text = value;
    } else {
      body.messageType = kind;
      body.replyId = value;
      body.replyTitle = title ?? value;
    }
    try {
      await axios.post(`${API_URL}/dev/simulate-inbound-message`, body);
      setDraft("");
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.message ?? err.message : String(err));
    }
  }

  if (!connected) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="mb-1 text-lg font-semibold text-gray-900">WhatsApp Bot Tester</h1>
          <p className="mb-4 text-xs text-gray-500">Dev-only — simulates a customer chatting with the commerce bot.</p>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Tenant admin email</label>
              <input
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Password</label>
              <input
                type="password"
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Your WhatsApp number (with country code, no +)</label>
              <input
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                value={waId}
                onChange={(e) => setWaId(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Your name</label>
              <input
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
              />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              onClick={handleConnect}
              className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Start chat
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[#e5ddd5]">
      <header className="flex items-center justify-between bg-emerald-700 px-4 py-3 text-white shadow">
        <div>
          <div className="text-sm font-semibold">{tenantSlug}</div>
          <div className="text-xs opacity-80">Simulated as {profileName} ({waId})</div>
        </div>
        <button onClick={() => setConnected(false)} className="text-xs underline">
          Change
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="text-center text-xs text-gray-500">
            Send "Hi" below to start the conversation.
          </div>
        )}
        {messages.map((m) => {
          const isOutbound = m.direction === "outbound";
          const options = messageOptions(m);
          return (
            <div key={m.id} className={`flex ${isOutbound ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                  isOutbound ? "bg-white text-gray-900" : "bg-emerald-100 text-gray-900"
                }`}
              >
                <div className="whitespace-pre-wrap break-words">{messageText(m)}</div>
                {options.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1.5 border-t border-gray-200 pt-2">
                    {options.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() =>
                          sendReply(m.messageType === "interactive_list" ? "list_reply" : "button_reply", opt.id, opt.title)
                        }
                        className="rounded-md border border-emerald-600 px-2 py-1 text-left text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                      >
                        {opt.title}
                        {opt.description && <span className="block text-[10px] text-gray-500">{opt.description}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && <div className="bg-red-50 px-4 py-1 text-xs text-red-600">{error}</div>}

      <div className="flex gap-2 bg-gray-100 p-3">
        <input
          className="flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          placeholder="Type a message… (e.g. Hi, or a quantity number)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              void sendReply("text", draft.trim());
            }
          }}
        />
        <button
          onClick={() => draft.trim() && sendReply("text", draft.trim())}
          className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Send
        </button>
      </div>
    </div>
  );
}
