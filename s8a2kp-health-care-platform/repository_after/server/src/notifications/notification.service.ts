
import { Injectable } from '@nestjs/common';

export enum NotificationChannel {
  SMS = 'SMS',
  EMAIL = 'EMAIL',
  PUSH = 'PUSH',
}

export interface NotificationPayload {
  recipientId: string;
  channel: NotificationChannel;
  subject?: string;
  message: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class NotificationService {
  
  /**
   * Send a notification via the specified channel.
   * In production, this would integrate with Twilio (SMS), SendGrid (Email), Firebase (Push).
   */
  async send(payload: NotificationPayload): Promise<boolean> {
    const { recipientId, channel, subject, message } = payload;
    
    switch (channel) {
      case NotificationChannel.SMS:
        console.log(`[MockSMS] Sending to ${recipientId}: ${message}`);
        // await twilioClient.messages.create({ to: phone, body: message });
        break;
      case NotificationChannel.EMAIL:
        console.log(`[MockEmail] Sending to ${recipientId}: Subject="${subject}" Body="${message}"`);
        // await sendgridMail.send({ to: email, subject, text: message });
        break;
      case NotificationChannel.PUSH:
        console.log(`[MockPush] Sending to ${recipientId}: ${message}`);
        // await firebase.messaging().send({ token, notification: { title: subject, body: message } });
        break;
    }
    
    return true; // Success mock
  }

  /**
   * Send appointment reminder via all configured channels.
   */
  async sendAppointmentReminder(patientId: string, appointmentTime: Date, providerName: string): Promise<void> {
    const message = `Reminder: You have an appointment with ${providerName} on ${appointmentTime.toLocaleString()}.`;
    
    // Send via all channels
    await this.send({ recipientId: patientId, channel: NotificationChannel.SMS, message });
    await this.send({ recipientId: patientId, channel: NotificationChannel.EMAIL, subject: 'Appointment Reminder', message });
    await this.send({ recipientId: patientId, channel: NotificationChannel.PUSH, subject: 'Appointment Reminder', message });
  }

  /**
   * Notify patient when a waitlist slot opens up.
   */
  async sendWaitlistNotification(patientId: string, slotTime: Date): Promise<void> {
    const message = `Good news! A slot has opened up on ${slotTime.toLocaleString()}. Log in to book it now!`;
    await this.send({ recipientId: patientId, channel: NotificationChannel.SMS, message });
    await this.send({ recipientId: patientId, channel: NotificationChannel.EMAIL, subject: 'Waitlist Slot Available', message });
  }

  /**
   * Send secure message notification.
   */
  async sendSecureMessageNotification(recipientId: string, senderName: string): Promise<void> {
    const message = `You have a new secure message from ${senderName}. Log in to view it.`;
    await this.send({ recipientId, channel: NotificationChannel.PUSH, subject: 'New Secure Message', message });
  }
}
