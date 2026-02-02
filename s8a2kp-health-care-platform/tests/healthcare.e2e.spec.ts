
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../repository_after/server/src/app.module';

describe('Healthcare Platform (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  let patientId: string;
  let providerId: string;

  it('Create Patient', async () => {
    const random = Math.floor(Math.random() * 100000);
    const query = `
      mutation {
        createPatient(createPatientInput: {
          firstName: "John",
          lastName: "Doe",
          email: "john${random}@example.com",
          docScanUrl: "http://mock.com/id.jpg",
          insuranceData: "BlueCross"
        }) {
          id
          firstName
          status: isVerified
        }
      }
    `;
    return request(app.getHttpServer())
      .post('/graphql')
      .send({ query })
      .expect(200)
      .then((res) => {
        expect(res.body.data.createPatient.id).toBeDefined();
        patientId = res.body.data.createPatient.id;        expect(res.body.data.createPatient.status).toBe(true);
      });
  });

  it('Link Family Member (Dependent)', async () => {
       // 1. Create Dependent
       let dependentId: string;
       const random = Math.floor(Math.random() * 100000);
       const createQuery = `
        mutation {
            createPatient(createPatientInput: {
                firstName: "Baby",
                lastName: "Doe",
                email: "baby${random}@example.com"
            }) {
                id
            }
        }
       `;
       await request(app.getHttpServer())
       .post('/graphql')
       .send({ query: createQuery })
       .expect(200)
       .then(res => {
           dependentId = res.body.data.createPatient.id;
       });

       // 2. Link to Guardian (patientId from previous test)
       const linkQuery = `
        mutation {
            addDependent(guardianId: "${patientId}", dependentId: "${dependentId}") {
                id
                email
                dependents {
                    id
                    firstName
                }
            }
        }
       `;
       return request(app.getHttpServer())
       .post('/graphql')
       .send({ query: linkQuery })
       .expect(200)
       .expect(res => {
           expect(res.body.data.addDependent.dependents.length).toBeGreaterThan(0);
           expect(res.body.data.addDependent.dependents[0].firstName).toBe("Baby");
       });
  });

  it('Sign Consent Form', async () => {
      const query = `
        mutation {
            signConsent(patientId: "${patientId}", signature: "Agreed_By_John_Doe") {
                id
                consentSignature
            }
        }
      `;
      return request(app.getHttpServer())
      .post('/graphql')
      .send({ query })
      .expect(200)
      .expect(res => {
          expect(res.body.data.signConsent.consentSignature).toBe("Agreed_By_John_Doe");
      });
  });

  it('Create Provider', async () => {
      const random = Math.floor(Math.random() * 100000);
      const query = `
        mutation {
            createProvider(createProviderInput: {
                name: "Dr. Smith ${random}",
                specialty: "Cardiology"
            }) {
                id
                name
            }
        }
      `;
      return request(app.getHttpServer())
      .post('/graphql')
      .send({ query })
      .expect(200)
      .then((res) => {
          providerId = res.body.data.createProvider.id;
          expect(providerId).toBeDefined();
      });
  });

  it('Add Schedule', async () => {
      const query = `
        mutation {
            addSchedule(addScheduleInput: {
                providerId: "${providerId}",
                dayOfWeek: 1,
                startTime: "09:00",
                endTime: "17:00",
                maxOverBooking: 2
            }) {
                id
                startTime
            }
        }
      `;
      return request(app.getHttpServer())
      .post('/graphql')
      .send({ query })
      .expect(200)
      .expect(res => {
          expect(res.body.data.addSchedule.startTime).toBe("09:00");
      });
  });

  it('Book Appointment - Success', async () => {
      const startTime = new Date(); 
      startTime.setDate(startTime.getDate() + (1 + 7 - startTime.getDay()) % 7); // Next Monday
      startTime.setHours(10, 0, 0, 0);
      const endTime = new Date(startTime);
      endTime.setHours(10, 30, 0, 0);

      const query = `
        mutation {
            createAppointment(createAppointmentInput: {
                providerId: "${providerId}",
                patientId: "${patientId}",
                startTime: "${startTime.toISOString()}",
                endTime: "${endTime.toISOString()}",
                type: IN_PERSON
            }) {
                id
                status
            }
        }
      `;
      return request(app.getHttpServer())
      .post('/graphql')
      .send({ query })
      .expect(200)
      .expect(res => {
          expect(res.body.data.createAppointment.status).toBe("BOOKED");
      });
  });

  it('Book Appointment - Conflict (Allowed by Overbooking)', async () => {
      // 1st Overlap (Should be allowed, Total 2)
      const startTime = new Date(); 
      startTime.setDate(startTime.getDate() + (1 + 7 - startTime.getDay()) % 7);
      startTime.setHours(10, 0, 0, 0);
      const endTime = new Date(startTime);
      endTime.setHours(10, 30, 0, 0);

      const query = `
        mutation {
            createAppointment(createAppointmentInput: {
                providerId: "${providerId}",
                patientId: "${patientId}",
                startTime: "${startTime.toISOString()}",
                endTime: "${endTime.toISOString()}",
                type: TELEHEALTH
            }) {
                id
                status
            }
        }
      `;
      return request(app.getHttpServer())
      .post('/graphql')
      .send({ query })
      .expect(200)
      .expect(res => {
          expect(res.body.data.createAppointment.status).toBe("BOOKED");
      });
  });

  it('Trigger Waitlist (2nd Overbooking Blocked)', async () => {
      // 2nd Overlap (Should fail, Total 3)
      const startTime = new Date(); 
      startTime.setDate(startTime.getDate() + (1 + 7 - startTime.getDay()) % 7);
      startTime.setHours(10, 0, 0, 0);
      const endTime = new Date(startTime);
      endTime.setHours(10, 30, 0, 0);

      const query = `
        mutation {
            createAppointment(createAppointmentInput: {
                providerId: "${providerId}",
                patientId: "${patientId}",
                startTime: "${startTime.toISOString()}",
                endTime: "${endTime.toISOString()}",
                type: IN_PERSON
            }) {
                id
                status
            }
        }
      `;
      return request(app.getHttpServer())
      .post('/graphql')
      .send({ query })
      .expect(200)
      .expect(res => {
          // Expect Errors
          expect(res.body.errors).toBeDefined();
          expect(res.body.errors[0].message).toContain('waitlist');
      });
  });

  it('Generate Video Token', async () => {
      const query = `
        mutation {
            joinVideoRoom(roomName: "Room1", identity: "PatientJohn")
        }
      `;
      return request(app.getHttpServer())
      .post('/graphql')
      .send({ query })
      .expect(200)
      .expect(res => {
          expect(res.body.data.joinVideoRoom).toContain("mock_token");
      });
  });

  it('Create Prescription (with DEA Mock)', async () => {
      const query = `
        mutation {
            createPrescription(
                medicationName: "Amoxicillin",
                dosage: "500mg",
                isControlledSubstance: false
            ) {
                id
                status
            }
        }
      `;
      return request(app.getHttpServer())
      .post('/graphql')
      .send({ query })
      .expect(200)
      .expect(res => {
          expect(res.body.data.createPrescription.status).toBe("PENDING");
      });
  });

  it('Create Invoice (with Mock Claims Engine)', async () => {
      const query = `
        mutation {
            createInvoice(
                patientId: "${patientId}",
                amount: 150.00,
                description: "Consultation"
            ) {
                id
                status
                insuranceClaimId
            }
        }
      `;
      return request(app.getHttpServer())
      .post('/graphql')
      .send({ query })
      .expect(200)
      .expect(res => {
          expect(res.body.data.createInvoice.status).toBe("SUBMITTED");
          expect(res.body.data.createInvoice.insuranceClaimId).toBeDefined();
      });
  });
  it('Send Secure Message', async () => {
      const query = `
        mutation {
            sendMessage(
                content: "Hello Dr. Smith",
                senderId: "${patientId}"
            ) {
                id
                content
                category
            }
        }
      `;
      return request(app.getHttpServer())
      .post('/graphql')
      .send({ query })
      .expect(200)
      .expect(res => {
          expect(res.body.data.sendMessage.content).toBe("Hello Dr. Smith");
          expect(res.body.data.sendMessage.category).toBe("GENERAL"); // Default
      });
  });

  it('Fetch Admin Dashboard Stats', async () => {
      const query = `
        query {
            adminStats {
                activePatients
                upcomingAppointments
                revenue
            }
        }
      `;
      return request(app.getHttpServer())
      .post('/graphql')
      .send({ query })
      .expect(200)
      .expect(res => {
          expect(res.body.data.adminStats.revenue).toBeGreaterThanOrEqual(0);
      });
  });

  it('Fetch Medical Records (Viewer)', async () => {
      const query = `
        query {
            medicalRecords {
                id
                recordType
                data
            }
        }
      `;
      return request(app.getHttpServer())
      .post('/graphql')
      .send({ query })
      .expect(200)
      .expect(res => {
          expect(Array.isArray(res.body.data.medicalRecords)).toBe(true);
      });
  });
});
