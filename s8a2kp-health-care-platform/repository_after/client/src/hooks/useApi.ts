
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { gqlRequest } from '../api/client';

// Types matching backend schema
export interface Patient {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isVerified: boolean;
  docScanUrl?: string;
  insuranceProvider?: string;
  medicalHistory?: string;
  consentSignature?: string;
}

export interface Prescription {
  id: string;
  medicationName: string;
  dosage: string;
  status: string;
}

export interface MedicalRecord {
  id: string;
  patientId: string;
  recordType: string;
  data: string;
  date: string;
}

export interface Appointment {
  id: string;
  providerId: string;
  patientId: string;
  startTime: string;
  endTime: string;
  status: string;
  type: string;
}

export interface Message {
  id: string;
  senderId: string;
  recipientId: string;
  content: string;
  category: string;
  sentAt?: string;
}

// React Query Client
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

// Prescriptions Hooks
export const usePrescriptions = () => {
  return useQuery({
    queryKey: ['prescriptions'],
    queryFn: async () => {
      const query = `
        query {
          prescriptions {
            id
            medicationName
            dosage
            status
          }
        }
      `;
      const data = await gqlRequest(query);
      return data.prescriptions as Prescription[];
    },
  });
};

// Medical Records Hooks
export const useMedicalRecords = () => {
  return useQuery({
    queryKey: ['medicalRecords'],
    queryFn: async () => {
      const query = `
        query {
          medicalRecords {
            id
            patientId
            recordType
            date
          }
        }
      `;
      const data = await gqlRequest(query);
      return data.medicalRecords as MedicalRecord[];
    },
  });
};

// Appointments Hooks
export const useAppointments = () => {
  return useQuery({
    queryKey: ['appointments'],
    queryFn: async () => {
      const query = `
        query {
          appointments {
            id
            providerId
            patientId
            startTime
            endTime
            status
            type
          }
        }
      `;
      const data = await gqlRequest(query);
      return data.appointments as Appointment[];
    },
  });
};

export const useCreateAppointment = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: { providerId: string; patientId: string; startTime: string; endTime: string; type: string }) => {
      const mutation = `
        mutation CreateAppointment($providerId: String!, $patientId: String!, $startTime: DateTime!, $endTime: DateTime!, $type: AppointmentType!) {
          createAppointment(createAppointmentInput: { providerId: $providerId, patientId: $patientId, startTime: $startTime, endTime: $endTime, type: $type }) {
            id
            status
          }
        }
      `;
      const data = await gqlRequest(mutation, input);
      return data.createAppointment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
  });
};

// Messages Hooks
export const useMessages = () => {
  return useQuery({
    queryKey: ['messages'],
    queryFn: async () => {
      const query = `
        query {
          messages {
            id
            senderId
            recipientId
            content
            category
          }
        }
      `;
      const data = await gqlRequest(query);
      return data.messages as Message[];
    },
  });
};

export const useSendMessage = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: { senderId: string; recipientId: string; content: string; category?: string }) => {
      const mutation = `
        mutation SendMessage($senderId: String!, $recipientId: String!, $content: String!, $category: MessageCategory) {
          sendMessage(senderId: $senderId, recipientId: $recipientId, content: $content, category: $category) {
            id
            content
          }
        }
      `;
      const data = await gqlRequest(mutation, input);
      return data.sendMessage;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
  });
};

// Admin Stats Hook
export const useAdminStats = () => {
  return useQuery({
    queryKey: ['adminStats'],
    queryFn: async () => {
      const query = `
        query {
          adminStats {
            activePatients
            upcomingAppointments
            revenue
          }
        }
      `;
      const data = await gqlRequest(query);
      return data.adminStats;
    },
  });
};
