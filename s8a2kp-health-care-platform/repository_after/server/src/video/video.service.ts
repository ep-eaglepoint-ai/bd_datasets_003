
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export enum RoomStatus {
  WAITING = 'WAITING',
  ADMITTED = 'ADMITTED',
  IN_CALL = 'IN_CALL',
  ENDED = 'ENDED',
}

export interface VideoSession {
  roomName: string;
  patientId: string;
  providerId: string;
  status: RoomStatus;
  createdAt: Date;
  admittedAt?: Date;
  recordingEnabled: boolean;
  screenShareEnabled: boolean;
}

@Injectable()
export class VideoService {
  private waitingRoom: Map<string, VideoSession> = new Map();

  constructor(private configService: ConfigService) {}

  /**
   * Generate access token for video room.
   * In production, this would use Twilio JWT AccessToken.
   */
  generateToken(roomName: string, identity: string): string {
    // Real implementation would be:
    // const AccessToken = Twilio.jwt.AccessToken;
    // const VideoGrant = AccessToken.VideoGrant;
    // const videoGrant = new VideoGrant({ room: roomName });
    // const token = new AccessToken(accountSid, apiKey, apiSecret, { identity });
    // token.addGrant(videoGrant);
    // return token.toJwt();
    
    console.log(`[VideoService] Generating token for ${identity} in room ${roomName}`);
    return `mock_token_for_${identity}_in_${roomName}_${Date.now()}`;
  }

  /**
   * Create a video room and put patient in waiting room.
   */
  async createRoom(roomName: string, patientId: string, providerId: string): Promise<VideoSession> {
    console.log(`[VideoService] Creating room: ${roomName}`);
    
    // In real implementation, call Twilio API:
    // const room = await client.video.rooms.create({
    //   uniqueName: roomName,
    //   type: 'group',
    //   recordParticipantsOnConnect: true,
    //   statusCallback: 'https://mysite.com/video/webhook'
    // });

    const session: VideoSession = {
      roomName,
      patientId,
      providerId,
      status: RoomStatus.WAITING, // Patient starts in waiting room
      createdAt: new Date(),
      recordingEnabled: false, // Requires consent
      screenShareEnabled: true,
    };

    this.waitingRoom.set(roomName, session);
    console.log(`[WaitingRoom] Patient ${patientId} is now waiting in room ${roomName}`);
    
    return session;
  }

  /**
   * Provider admits patient from waiting room.
   */
  async admitPatient(roomName: string): Promise<VideoSession> {
    const session = this.waitingRoom.get(roomName);
    if (!session) {
      throw new Error('Room not found');
    }

    session.status = RoomStatus.ADMITTED;
    session.admittedAt = new Date();
    console.log(`[WaitingRoom] Provider admitted patient ${session.patientId} to call`);
    
    return session;
  }

  /**
   * Enable recording with consent.
   */
  async enableRecording(roomName: string, hasConsent: boolean): Promise<boolean> {
    const session = this.waitingRoom.get(roomName);
    if (!session) {
      throw new Error('Room not found');
    }

    if (!hasConsent) {
      console.log('[Recording] Cannot enable recording without patient consent');
      return false;
    }

    session.recordingEnabled = true;
    console.log(`[Recording] Recording enabled for room ${roomName} with patient consent`);
    
    // In real implementation:
    // await client.video.rooms(roomSid).recordings.create(...);
    
    return true;
  }

  /**
   * Fallback to phone call if video quality degrades.
   */
  async initiatePhoneFallback(roomName: string, phoneNumber: string): Promise<string> {
    console.log(`[Fallback] Video quality degraded. Initiating phone call to ${phoneNumber}`);
    
    // In real implementation:
    // const call = await twilioClient.calls.create({
    //   twiml: '<Response><Dial>...</Dial></Response>',
    //   to: phoneNumber,
    //   from: twilioNumber
    // });
    
    return `fallback_call_${Date.now()}`;
  }

  /**
   * Get waiting room status.
   */
  getWaitingRoomPatients(providerId: string): VideoSession[] {
    return Array.from(this.waitingRoom.values())
      .filter(s => s.providerId === providerId && s.status === RoomStatus.WAITING);
  }

  /**
   * End video session.
   */
  async endSession(roomName: string): Promise<void> {
    const session = this.waitingRoom.get(roomName);
    if (session) {
      session.status = RoomStatus.ENDED;
      console.log(`[VideoService] Session ${roomName} ended`);
      
      // Generate session notes (mock auto-generation)
      this.generateSessionNotes(session);
    }
  }

  /**
   * Auto-generate session notes after call ends.
   */
  private generateSessionNotes(session: VideoSession): void {
    const duration = session.admittedAt 
      ? Math.round((Date.now() - session.admittedAt.getTime()) / 60000)
      : 0;
    
    console.log(`[AutoNotes] Generating session notes for room ${session.roomName}:`);
    console.log(`[AutoNotes] - Duration: ${duration} minutes`);
    console.log(`[AutoNotes] - Recording: ${session.recordingEnabled ? 'Yes' : 'No'}`);
    console.log(`[AutoNotes] - Patient ID: ${session.patientId}`);
    console.log(`[AutoNotes] - Provider ID: ${session.providerId}`);
    
    // In real implementation, this would use AI transcription and summarization
  }
}
