
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Video from 'twilio-video';
import { gqlRequest } from '../api/client';

const VideoRoom = () => {
    const { roomName } = useParams();
    const [room, setRoom] = useState<Video.Room | null>(null);
    const [participants, setParticipants] = useState<Video.RemoteParticipant[]>([]);

    useEffect(() => {
        const joinRoom = async () => {
            try {
                // Get Token
                const query = `
                    mutation {
                        joinVideoRoom(roomName: "${roomName}", identity: "GuestUser") 
                    }
                `;
                // Note: Identity would normally come from auth user
                const data = await gqlRequest(query);
                const token = data.joinVideoRoom;

                if (token.startsWith('mock_token_')) {
                    console.log('Using mock video token');
                    // Simulate room connection
                    const mockRoom: any = {
                        name: roomName,
                        localParticipant: { identity: 'GuestUser' },
                        disconnect: () => console.log('Mock disconnect'),
                        on: (event: string, callback: any) => {
                            if (event === 'participantConnected') {
                                setTimeout(() => callback({ identity: 'RemoteUser' }), 2000);
                            }
                        }
                    };
                    setRoom(mockRoom);
                } else {
                    const connectedRoom = await Video.connect(token, {
                        name: roomName,
                        audio: true,
                        video: true
                    });
                    setRoom(connectedRoom);
                    console.log(`Connected to Room: ${connectedRoom.name}`);
                    
                    connectedRoom.on('participantConnected', participant => {
                        setParticipants(prev => [...prev, participant]);
                    });

                    connectedRoom.on('participantDisconnected', participant => {
                        setParticipants(prev => prev.filter(p => p !== participant));
                    });
                }

            } catch (err) {
                console.error(err);
                alert("Failed to join video room. Ensure backend is running and Twilio credentials are set (or mocked).");
            }
        };

        joinRoom();

        return () => {
            if (room) {
                room.disconnect();
            }
        };
    }, [roomName]);

    return (
        <div className="container">
            <h2>Video Consultation: {roomName}</h2>
            <Link to="/patient" className="btn" style={{ marginBottom: '1rem', display: 'inline-block' }}>Back</Link>
            
            <div className="card" style={{ height: '400px', backgroundColor: '#000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {room ? (
                    <div>
                        <p>Connected as {room.localParticipant.identity}</p>
                        <p>Remote Participants: {participants.length}</p>
                        {/* Render video tracks here */}
                    </div>
                ) : (
                    <p>Connecting to secure room...</p>
                )}
            </div>
        </div>
    );
};

export default VideoRoom;
