
import { useState, useEffect, useRef } from 'react';
import { gqlRequest } from '../api/client';

interface Message {
  id: string;
  senderId: string;
  recipientId: string;
  content: string;
  category: string;
  sentAt: string;
  respondedAt?: string;
  responseTimeMinutes?: number;
  attachmentUrl?: string;
  attachmentType?: string;
  isRead: boolean;
  parentMessageId?: string;
}

const CATEGORIES = [
  { value: 'GENERAL', label: '💬 General', color: '#757575' },
  { value: 'MEDICAL_QUESTION', label: '🩺 Medical Question', color: '#2196F3' },
  { value: 'APPOINTMENT_REQUEST', label: '📅 Appointment Request', color: '#4CAF50' },
  { value: 'PRESCRIPTION_REFILL', label: '💊 Prescription Refill', color: '#9C27B0' },
  { value: 'LAB_RESULTS', label: '🔬 Lab Results', color: '#FF9800' },
  { value: 'BILLING', label: '💳 Billing', color: '#F44336' },
];

const Messaging = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [category, setCategory] = useState('GENERAL');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ avgResponseTime: 0, responseRate: 0 });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const userId = 'patient-1';

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch messages
  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const query = `
          query {
            messages {
              id
              senderId
              recipientId
              content
              category
              sentAt
              respondedAt
              responseTimeMinutes
              attachmentUrl
              attachmentType
              isRead
              parentMessageId
            }
          }
        `;
        const data = await gqlRequest(query);
        setMessages(data.messages || []);
      } catch (err) {
        console.error(err);
        // Mock messages for demo
        setMessages([
          { id: '1', senderId: 'care-team', recipientId: userId, content: 'Your lab results are ready. Everything looks normal!', category: 'LAB_RESULTS', sentAt: new Date(Date.now() - 3600000).toISOString(), isRead: true, responseTimeMinutes: 45 },
          { id: '2', senderId: userId, recipientId: 'care-team', content: 'Thank you for letting me know!', category: 'GENERAL', sentAt: new Date(Date.now() - 1800000).toISOString(), isRead: true },
          { id: '3', senderId: 'care-team', recipientId: userId, content: 'Your prescription refill has been approved and sent to your pharmacy.', category: 'PRESCRIPTION_REFILL', sentAt: new Date(Date.now() - 900000).toISOString(), isRead: false, attachmentUrl: '/rx-confirmation.pdf', attachmentType: 'application/pdf' },
        ]);
      }
    };
    fetchMessages();
  }, []);

  // Calculate stats
  useEffect(() => {
    const responseTimes = messages.filter(m => m.responseTimeMinutes).map(m => m.responseTimeMinutes!);
    const avgTime = responseTimes.length ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;
    const responseRate = messages.length > 0 ? (responseTimes.length / messages.length) * 100 : 0;
    setStats({ avgResponseTime: Math.round(avgTime), responseRate: Math.round(responseRate) });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    setLoading(true);
    try {
      const mutation = `
        mutation {
          sendMessage(
            content: "${input.replace(/"/g, '\\"')}",
            senderId: "${userId}",
            recipientId: "care-team",
            category: ${category}
          ) {
            id
            sentAt
          }
        }
      `;
      const data = await gqlRequest(mutation);
      
      const newMessage: Message = {
        id: data.sendMessage?.id || Date.now().toString(),
        senderId: userId,
        recipientId: 'care-team',
        content: input,
        category,
        sentAt: new Date().toISOString(),
        isRead: false,
        attachmentUrl: attachment ? URL.createObjectURL(attachment) : undefined,
        attachmentType: attachment?.type,
      };
      
      setMessages([...messages, newMessage]);
      setInput('');
      setAttachment(null);
    } catch (err) {
      console.error(err);
      // Add locally for demo
      setMessages([...messages, {
        id: Date.now().toString(),
        senderId: userId,
        recipientId: 'care-team',
        content: input,
        category,
        sentAt: new Date().toISOString(),
        isRead: false,
      }]);
      setInput('');
    } finally {
      setLoading(false);
    }
  };

  const getCategoryInfo = (cat: string) => CATEGORIES.find(c => c.value === cat) || CATEGORIES[0];

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '16px', color: '#1a73e8' }}>💬 Secure Messages</h2>

      {/* Stats Bar */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
        <div style={{ background: '#e3f2fd', padding: '12px 20px', borderRadius: '8px', flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1976D2' }}>{stats.avgResponseTime}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>Avg Response (min)</div>
        </div>
        <div style={{ background: '#e8f5e9', padding: '12px 20px', borderRadius: '8px', flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#388E3C' }}>{stats.responseRate}%</div>
          <div style={{ fontSize: '12px', color: '#666' }}>Response Rate</div>
        </div>
        <div style={{ background: '#fff3e0', padding: '12px 20px', borderRadius: '8px', flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#F57C00' }}>{messages.filter(m => !m.isRead).length}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>Unread</div>
        </div>
      </div>

      {/* Message Thread */}
      <div style={{ 
        background: 'white', 
        borderRadius: '12px', 
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column',
        height: '500px',
      }}>
        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {messages.map(msg => {
            const isMe = msg.senderId === userId;
            const catInfo = getCategoryInfo(msg.category);
            
            return (
              <div key={msg.id} style={{ 
                marginBottom: '16px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: isMe ? 'flex-end' : 'flex-start',
              }}>
                {/* Category tag */}
                <span style={{ 
                  fontSize: '11px', 
                  color: catInfo.color, 
                  marginBottom: '4px',
                  fontWeight: 'bold',
                }}>
                  {catInfo.label}
                </span>
                
                {/* Message bubble */}
                <div style={{
                  maxWidth: '70%',
                  padding: '12px 16px',
                  borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  background: isMe ? '#1a73e8' : '#f1f3f5',
                  color: isMe ? 'white' : '#333',
                }}>
                  {msg.content}
                  
                  {/* Attachment */}
                  {msg.attachmentUrl && (
                    <div style={{ 
                      marginTop: '8px', 
                      padding: '8px', 
                      background: isMe ? 'rgba(255,255,255,0.2)' : '#e0e0e0',
                      borderRadius: '6px',
                      fontSize: '12px',
                    }}>
                      📎 <a href={msg.attachmentUrl} target="_blank" rel="noreferrer" style={{ color: isMe ? 'white' : '#1a73e8' }}>
                        {msg.attachmentType?.includes('pdf') ? 'PDF Document' : 'Attachment'}
                      </a>
                    </div>
                  )}
                </div>
                
                {/* Time and response info */}
                <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
                  {formatTime(msg.sentAt)}
                  {msg.responseTimeMinutes && (
                    <span style={{ marginLeft: '8px', color: '#4CAF50' }}>
                      ✓ Responded in {msg.responseTimeMinutes}m
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div style={{ borderTop: '1px solid #e0e0e0', padding: '16px' }}>
          {/* Category Selector */}
          <div style={{ marginBottom: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat.value}
                onClick={() => setCategory(cat.value)}
                style={{
                  padding: '4px 12px',
                  borderRadius: '16px',
                  border: category === cat.value ? `2px solid ${cat.color}` : '1px solid #ddd',
                  background: category === cat.value ? cat.color + '20' : 'white',
                  color: cat.color,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>
          
          {/* Attachment Preview */}
          {attachment && (
            <div style={{ marginBottom: '8px', padding: '8px', background: '#f5f5f5', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>📎 {attachment.name}</span>
              <button onClick={() => setAttachment(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999' }}>✕</button>
            </div>
          )}
          
          <form onSubmit={handleSend} style={{ display: 'flex', gap: '8px' }}>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={e => setAttachment(e.target.files?.[0] || null)}
            />
            <button 
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{ padding: '10px', background: '#f5f5f5', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer' }}
            >
              📎
            </button>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Type your message..."
              style={{ flex: 1, padding: '10px 16px', border: '1px solid #ddd', borderRadius: '24px', outline: 'none' }}
            />
            <button 
              type="submit"
              disabled={loading || !input.trim()}
              style={{ 
                padding: '10px 24px', 
                background: '#1a73e8', 
                color: 'white', 
                border: 'none', 
                borderRadius: '24px', 
                cursor: loading ? 'wait' : 'pointer',
                opacity: !input.trim() ? 0.5 : 1,
              }}
            >
              {loading ? '...' : 'Send'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Messaging;
