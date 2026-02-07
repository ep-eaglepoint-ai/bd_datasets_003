import { Prisma } from "@prisma/client"
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: string;
  String: string;
  Boolean: boolean;
  Int: number;
  Float: number;
  BigInt: number;
  Date: string;
  DateTime: string;
  JSON: Prisma.JsonValue;
  JSONObject: Prisma.JsonObject;
  Time: string;
};

export type Booking = {
  __typename?: 'Booking';
  canceledAt?: Maybe<Scalars['DateTime']>;
  createdAt: Scalars['DateTime'];
  customerEmail: Scalars['String'];
  endUtc: Scalars['DateTime'];
  id: Scalars['Int'];
  notes?: Maybe<Scalars['String']>;
  penaltyFeeCents?: Maybe<Scalars['Int']>;
  providerId: Scalars['Int'];
  reference: Scalars['String'];
  serviceId: Scalars['Int'];
  startUtc: Scalars['DateTime'];
  status: Scalars['String'];
  updatedAt: Scalars['DateTime'];
};

export type CreateBookingInput = {
  customerEmail: Scalars['String'];
  endUtcISO: Scalars['String'];
  providerId: Scalars['Int'];
  serviceId: Scalars['Int'];
  startUtcISO: Scalars['String'];
};

export type CreateProviderProfileInput = {
  bio?: InputMaybe<Scalars['String']>;
  name: Scalars['String'];
};

export type CreateServiceInput = {
  bufferAfterMinutes?: InputMaybe<Scalars['Int']>;
  bufferBeforeMinutes?: InputMaybe<Scalars['Int']>;
  capacity?: InputMaybe<Scalars['Int']>;
  durationMinutes: Scalars['Int'];
  name: Scalars['String'];
};

export type CustomDayAvailability = {
  __typename?: 'CustomDayAvailability';
  date: Scalars['DateTime'];
  endUtc: Scalars['DateTime'];
  id: Scalars['Int'];
  providerId: Scalars['Int'];
  startUtc: Scalars['DateTime'];
  tz: Scalars['String'];
};

export type CustomDayAvailabilityInput = {
  date: Scalars['String'];
  endLocal: Scalars['String'];
  startLocal: Scalars['String'];
};

export type ManualBlock = {
  __typename?: 'ManualBlock';
  endUtc: Scalars['DateTime'];
  id: Scalars['Int'];
  providerId: Scalars['Int'];
  reason?: Maybe<Scalars['String']>;
  startUtc: Scalars['DateTime'];
};

export type ManualBlockInput = {
  endUtcISO: Scalars['String'];
  reason?: InputMaybe<Scalars['String']>;
  startUtcISO: Scalars['String'];
};

export type Mutation = {
  __typename?: 'Mutation';
  cancelBooking: Booking;
  createBooking: Booking;
  createCustomDayAvailability: CustomDayAvailability;
  createManualBlock: ManualBlock;
  createProviderProfile: ProviderProfile;
  createRecurringAvailability: RecurringAvailability;
  createService: Service;
  deleteManualBlock: ManualBlock;
  rescheduleBooking: Booking;
  updateBooking: Booking;
};


export type MutationcancelBookingArgs = {
  id: Scalars['Int'];
};


export type MutationcreateBookingArgs = {
  input: CreateBookingInput;
};


export type MutationcreateCustomDayAvailabilityArgs = {
  input: CustomDayAvailabilityInput;
};


export type MutationcreateManualBlockArgs = {
  input: ManualBlockInput;
};


export type MutationcreateProviderProfileArgs = {
  input: CreateProviderProfileInput;
};


export type MutationcreateRecurringAvailabilityArgs = {
  input: RecurringAvailabilityInput;
};


export type MutationcreateServiceArgs = {
  input: CreateServiceInput;
};


export type MutationdeleteManualBlockArgs = {
  id: Scalars['Int'];
};


export type MutationrescheduleBookingArgs = {
  id: Scalars['Int'];
  newEndUtcISO: Scalars['String'];
  newStartUtcISO: Scalars['String'];
};


export type MutationupdateBookingArgs = {
  id: Scalars['Int'];
  input: UpdateBookingInput;
};

export type ProviderProfile = {
  __typename?: 'ProviderProfile';
  bio?: Maybe<Scalars['String']>;
  id: Scalars['Int'];
  name: Scalars['String'];
  userId: Scalars['Int'];
};

/** About the Redwood queries. */
export type Query = {
  __typename?: 'Query';
  booking?: Maybe<Booking>;
  bookings: Array<Booking>;
  currentUser?: Maybe<User>;
  /** Fetches the Redwood root schema. */
  redwood?: Maybe<Redwood>;
  searchAvailability: Array<Slot>;
  service?: Maybe<Service>;
  services: Array<Service>;
  solveCube: Array<Scalars['String']>;
};


/** About the Redwood queries. */
export type QuerybookingArgs = {
  id: Scalars['Int'];
};


/** About the Redwood queries. */
export type QuerybookingsArgs = {
  endISO?: InputMaybe<Scalars['String']>;
  providerId?: InputMaybe<Scalars['Int']>;
  startISO?: InputMaybe<Scalars['String']>;
};


/** About the Redwood queries. */
export type QuerysearchAvailabilityArgs = {
  input: SearchAvailabilityInput;
};


/** About the Redwood queries. */
export type QueryserviceArgs = {
  id: Scalars['Int'];
};


/** About the Redwood queries. */
export type QueryservicesArgs = {
  providerId?: InputMaybe<Scalars['Int']>;
};


/** About the Redwood queries. */
export type QuerysolveCubeArgs = {
  scramble: Scalars['String'];
};

export type RecurringAvailability = {
  __typename?: 'RecurringAvailability';
  endLocal: Scalars['String'];
  id: Scalars['Int'];
  providerId: Scalars['Int'];
  startLocal: Scalars['String'];
  tz: Scalars['String'];
  weekday: Scalars['Int'];
};

export type RecurringAvailabilityInput = {
  endLocal: Scalars['String'];
  startLocal: Scalars['String'];
  weekday: Scalars['Int'];
};

/**
 * The RedwoodJS Root Schema
 *
 * Defines details about RedwoodJS such as the current user and version information.
 */
export type Redwood = {
  __typename?: 'Redwood';
  /** The current user. */
  currentUser?: Maybe<Scalars['JSON']>;
  /** The version of Prisma. */
  prismaVersion?: Maybe<Scalars['String']>;
  /** The version of Redwood. */
  version?: Maybe<Scalars['String']>;
};

export type Role =
  | 'ADMIN'
  | 'CUSTOMER'
  | 'PROVIDER';

export type SearchAvailabilityInput = {
  customerTz: Scalars['String'];
  endISO: Scalars['String'];
  providerId: Scalars['Int'];
  serviceId?: InputMaybe<Scalars['Int']>;
  startISO: Scalars['String'];
};

export type Service = {
  __typename?: 'Service';
  bufferAfterMinutes: Scalars['Int'];
  bufferBeforeMinutes: Scalars['Int'];
  capacity: Scalars['Int'];
  durationMinutes: Scalars['Int'];
  id: Scalars['Int'];
  name: Scalars['String'];
  providerId: Scalars['Int'];
};

export type Slot = {
  __typename?: 'Slot';
  endLocalISO: Scalars['String'];
  endUtcISO: Scalars['String'];
  startLocalISO: Scalars['String'];
  startUtcISO: Scalars['String'];
};

export type Subscription = {
  __typename?: 'Subscription';
  availabilityUpdated: Array<Slot>;
};


export type SubscriptionavailabilityUpdatedArgs = {
  providerId: Scalars['Int'];
};

export type UpdateBookingInput = {
  notes?: InputMaybe<Scalars['String']>;
  status?: InputMaybe<Scalars['String']>;
};

export type User = {
  __typename?: 'User';
  createdAt: Scalars['DateTime'];
  email: Scalars['String'];
  id: Scalars['Int'];
  name?: Maybe<Scalars['String']>;
  role: Scalars['String'];
  updatedAt: Scalars['DateTime'];
};

export type SearchAvailabilityQueryVariables = Exact<{
  input: SearchAvailabilityInput;
}>;


export type SearchAvailabilityQuery = { __typename?: 'Query', searchAvailability: Array<{ __typename?: 'Slot', startUtcISO: string, endUtcISO: string, startLocalISO: string, endLocalISO: string }> };

export type AvailabilitySubscriptionVariables = Exact<{
  providerId: Scalars['Int'];
}>;


export type AvailabilitySubscription = { __typename?: 'Subscription', availabilityUpdated: Array<{ __typename?: 'Slot', startUtcISO: string, endUtcISO: string, startLocalISO: string, endLocalISO: string }> };

export type BookingsQueryVariables = Exact<{
  providerId?: InputMaybe<Scalars['Int']>;
  startISO?: InputMaybe<Scalars['String']>;
  endISO?: InputMaybe<Scalars['String']>;
}>;


export type BookingsQuery = { __typename?: 'Query', bookings: Array<{ __typename?: 'Booking', id: number, startUtc: string, endUtc: string, customerEmail: string, reference: string, status: string, notes?: string | null }> };

export type CreateManualBlockMutationVariables = Exact<{
  input: ManualBlockInput;
}>;


export type CreateManualBlockMutation = { __typename?: 'Mutation', createManualBlock: { __typename?: 'ManualBlock', id: number } };

export type ServicesQueryVariables = Exact<{
  providerId?: InputMaybe<Scalars['Int']>;
}>;


export type ServicesQuery = { __typename?: 'Query', services: Array<{ __typename?: 'Service', id: number, providerId: number, name: string, durationMinutes: number }> };

export type CreateBookingVariables = Exact<{
  input: CreateBookingInput;
}>;


export type CreateBooking = { __typename?: 'Mutation', createBooking: { __typename?: 'Booking', id: number, reference: string, startUtc: string, endUtc: string, customerEmail: string } };
