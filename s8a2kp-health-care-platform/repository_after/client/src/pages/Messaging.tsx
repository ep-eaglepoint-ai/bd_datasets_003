
import { useState, useEffect } from 'react';
import { gqlRequest } from '../api/client';

const Messaging = () => {
    const [messages, setMessages] = useState<any[]>([]);
    const [input, setInput] = useState('');

    useEffect(() => {
        const fetchMessages = async () => {
            try {
                const query = `
                    query {
                        messages {
                            id
                            senderId
                            content
                            # time - might be created_at
                        }
                    }
                `;
                const data = await gqlRequest(query);
                setMessages(data.messages.map((m: any) => ({
                    ...m,
                    sender: m.senderId === '1' ? 'Dr. Smith' : 'Me', // Simple mock mapping
                    time: 'Now'
                })));
            } catch (err) {
                console.error(err);
            }
        };
        fetchMessages();
    }, []);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const mutation = `
                mutation {
                    sendMessage(content: "${input}", senderId: "2") {
                        id
                    }
                }
            `;
            // Assuming current user is "2" for demo
            await gqlRequest(mutation);
            setMessages([...messages, { id: Date.now(), sender: 'Me', content: input, time: 'Now' }]);
            setInput('');
        } catch (err) {
            console.error(err);
        }
    };

  return (
    <div className="container">
      <h2>Messages</h2>
      <div className="card" style={{ height: '400px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '1rem' }}>
            {messages.map(msg => (
                <div key={msg.id} style={{ 
                    textAlign: msg.sender === 'Me' ? 'right' : 'left',
                    margin: '0.5rem 0'
                }}>
                    <div style={{ 
                        display: 'inline-block',
                        padding: '0.5rem 1rem',
                        backgroundColor: msg.sender === 'Me' ? '#2563eb' : '#f1f5f9',
                        color: msg.sender === 'Me' ? '#fff' : '#000',
                        borderRadius: '1rem'
                    }}>
                        {msg.content}
                    </div>
                </div>
            ))}
        </div>
        <form onSubmit={handleSend} style={{ display: 'flex', gap: '0.5rem' }}>
            <input 
                className="input" 
                style={{ marginBottom: 0 }}
                value={input} 
                onChange={e => setInput(e.target.value)}
                placeholder="Type a message..."
            />
            <button className="btn btn-primary">Send</button>
        </form>
      </div>
    </div>
  );
};

export default Messaging;
