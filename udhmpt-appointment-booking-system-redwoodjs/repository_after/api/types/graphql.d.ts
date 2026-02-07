import { Prisma } from "@prisma/client"
import { MergePrismaWithSdlTypes, MakeRelationsOptional } from '@redwoodjs/api'
import { User as PrismaUser, ProviderProfile as PrismaProviderProfile, Service as PrismaService, RecurringAvailability as PrismaRecurringAvailability, CustomDayAvailability as PrismaCustomDayAvailability, AvailabilityException as PrismaAvailabilityException, ManualBlock as PrismaManualBlock, Booking as PrismaBooking } from '@prisma/client'
import { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
import { RedwoodGraphQLContext } from '@redwoodjs/graphql-server/dist/types';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type ResolverFn<TResult, TParent, TContext, TArgs> = (
      args: TArgs,
      obj?: { root: TParent; context: TContext; info: GraphQLResolveInfo }
    ) => TResult | Promise<TResult>
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
export type OptArgsResolverFn<TResult, TParent = {}, TContext = {}, TArgs = {}> = (
      args?: TArgs,
      obj?: { root: TParent; context: TContext; info: GraphQLResolveInfo }
    ) => TResult | Promise<TResult>

    export type RequiredResolverFn<TResult, TParent = {}, TContext = {}, TArgs = {}> = (
      args: TArgs,
      obj: { root: TParent; context: TContext; info: GraphQLResolveInfo }
    ) => TResult | Promise<TResult>
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: string;
  String: string;
  Boolean: boolean;
  Int: number;
  Float: number;
  BigInt: number;
  Date: Date | string;
  DateTime: Date | string;
  JSON: Prisma.JsonValue;
  JSONObject: Prisma.JsonObject;
  Time: Date | string;
};

export type AvailabilityException = {
  __typename?: 'AvailabilityException';
  endUtc: Scalars['DateTime'];
  id: Scalars['Int'];
  providerId: Scalars['Int'];
  reason?: Maybe<Scalars['String']>;
  startUtc: Scalars['DateTime'];
};

export type AvailabilityExceptionInput = {
  endUtcISO: Scalars['String'];
  reason?: InputMaybe<Scalars['String']>;
  startUtcISO: Scalars['String'];
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
  bookingLeadTimeHours?: InputMaybe<Scalars['Int']>;
  cancellationFeeCents?: InputMaybe<Scalars['Int']>;
  cancellationWindowHours?: InputMaybe<Scalars['Int']>;
  maxBookingsPerDay?: InputMaybe<Scalars['Int']>;
  name: Scalars['String'];
  penaltiesApplyForLateCancel?: InputMaybe<Scalars['Boolean']>;
  rescheduleFeeCents?: InputMaybe<Scalars['Int']>;
  rescheduleWindowHours?: InputMaybe<Scalars['Int']>;
  timezone?: InputMaybe<Scalars['String']>;
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
  createAvailabilityException: AvailabilityException;
  createBooking: Booking;
  createCustomDayAvailability: CustomDayAvailability;
  createManualBlock: ManualBlock;
  createProviderProfile: ProviderProfile;
  createRecurringAvailability: RecurringAvailability;
  createService: Service;
  deleteAvailabilityException: AvailabilityException;
  deleteManualBlock: ManualBlock;
  rescheduleBooking: Booking;
  updateBooking: Booking;
  updateProviderProfile: ProviderProfile;
};


export type MutationcancelBookingArgs = {
  id: Scalars['Int'];
};


export type MutationcreateAvailabilityExceptionArgs = {
  input: AvailabilityExceptionInput;
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


export type MutationdeleteAvailabilityExceptionArgs = {
  id: Scalars['Int'];
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


export type MutationupdateProviderProfileArgs = {
  input: UpdateProviderProfileInput;
};

export type ProviderProfile = {
  __typename?: 'ProviderProfile';
  bio?: Maybe<Scalars['String']>;
  bookingLeadTimeHours: Scalars['Int'];
  cancellationFeeCents?: Maybe<Scalars['Int']>;
  cancellationWindowHours: Scalars['Int'];
  id: Scalars['Int'];
  maxBookingsPerDay?: Maybe<Scalars['Int']>;
  name: Scalars['String'];
  penaltiesApplyForLateCancel: Scalars['Boolean'];
  rescheduleFeeCents?: Maybe<Scalars['Int']>;
  rescheduleWindowHours: Scalars['Int'];
  timezone: Scalars['String'];
  userId: Scalars['Int'];
};

/** About the Redwood queries. */
export type Query = {
  __typename?: 'Query';
  availabilityExceptions: Array<AvailabilityException>;
  booking?: Maybe<Booking>;
  bookings: Array<Booking>;
  currentUser?: Maybe<User>;
  customDayAvailabilities: Array<CustomDayAvailability>;
  myProviderProfile?: Maybe<ProviderProfile>;
  providerProfiles: Array<ProviderProfile>;
  recurringAvailabilities: Array<RecurringAvailability>;
  /** Fetches the Redwood root schema. */
  redwood?: Maybe<Redwood>;
  searchAvailability: Array<Slot>;
  service?: Maybe<Service>;
  services: Array<Service>;
  solveCube: Array<Scalars['String']>;
};


/** About the Redwood queries. */
export type QueryavailabilityExceptionsArgs = {
  providerId: Scalars['Int'];
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
export type QuerycustomDayAvailabilitiesArgs = {
  providerId: Scalars['Int'];
};


/** About the Redwood queries. */
export type QueryrecurringAvailabilitiesArgs = {
  providerId: Scalars['Int'];
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
  serviceId: Scalars['Int'];
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
  input: SearchAvailabilityInput;
};

export type UpdateBookingInput = {
  notes?: InputMaybe<Scalars['String']>;
  status?: InputMaybe<Scalars['String']>;
};

export type UpdateProviderProfileInput = {
  bio?: InputMaybe<Scalars['String']>;
  bookingLeadTimeHours?: InputMaybe<Scalars['Int']>;
  cancellationFeeCents?: InputMaybe<Scalars['Int']>;
  cancellationWindowHours?: InputMaybe<Scalars['Int']>;
  maxBookingsPerDay?: InputMaybe<Scalars['Int']>;
  name?: InputMaybe<Scalars['String']>;
  penaltiesApplyForLateCancel?: InputMaybe<Scalars['Boolean']>;
  rescheduleFeeCents?: InputMaybe<Scalars['Int']>;
  rescheduleWindowHours?: InputMaybe<Scalars['Int']>;
  timezone?: InputMaybe<Scalars['String']>;
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

type MaybeOrArrayOfMaybe<T> = T | Maybe<T> | Maybe<T>[];
type AllMappedModels = MaybeOrArrayOfMaybe<AvailabilityException | Booking | CustomDayAvailability | ManualBlock | ProviderProfile | RecurringAvailability | Service | User>


export type ResolverTypeWrapper<T> = Promise<T> | T;

export type Resolver<TResult, TParent = {}, TContext = {}, TArgs = {}> = ResolverFn<TResult, TParent, TContext, TArgs>;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<TResult, TKey extends string, TParent = {}, TContext = {}, TArgs = {}> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = {}, TContext = {}> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = {}, TContext = {}> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = {}, TParent = {}, TContext = {}, TArgs = {}> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;



/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  AvailabilityException: ResolverTypeWrapper<MergePrismaWithSdlTypes<PrismaAvailabilityException, MakeRelationsOptional<AvailabilityException, AllMappedModels>, AllMappedModels>>;
  AvailabilityExceptionInput: AvailabilityExceptionInput;
  BigInt: ResolverTypeWrapper<Scalars['BigInt']>;
  Booking: ResolverTypeWrapper<MergePrismaWithSdlTypes<PrismaBooking, MakeRelationsOptional<Booking, AllMappedModels>, AllMappedModels>>;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']>;
  CreateBookingInput: CreateBookingInput;
  CreateProviderProfileInput: CreateProviderProfileInput;
  CreateServiceInput: CreateServiceInput;
  CustomDayAvailability: ResolverTypeWrapper<MergePrismaWithSdlTypes<PrismaCustomDayAvailability, MakeRelationsOptional<CustomDayAvailability, AllMappedModels>, AllMappedModels>>;
  CustomDayAvailabilityInput: CustomDayAvailabilityInput;
  Date: ResolverTypeWrapper<Scalars['Date']>;
  DateTime: ResolverTypeWrapper<Scalars['DateTime']>;
  Int: ResolverTypeWrapper<Scalars['Int']>;
  JSON: ResolverTypeWrapper<Scalars['JSON']>;
  JSONObject: ResolverTypeWrapper<Scalars['JSONObject']>;
  ManualBlock: ResolverTypeWrapper<MergePrismaWithSdlTypes<PrismaManualBlock, MakeRelationsOptional<ManualBlock, AllMappedModels>, AllMappedModels>>;
  ManualBlockInput: ManualBlockInput;
  Mutation: ResolverTypeWrapper<{}>;
  ProviderProfile: ResolverTypeWrapper<MergePrismaWithSdlTypes<PrismaProviderProfile, MakeRelationsOptional<ProviderProfile, AllMappedModels>, AllMappedModels>>;
  Query: ResolverTypeWrapper<{}>;
  RecurringAvailability: ResolverTypeWrapper<MergePrismaWithSdlTypes<PrismaRecurringAvailability, MakeRelationsOptional<RecurringAvailability, AllMappedModels>, AllMappedModels>>;
  RecurringAvailabilityInput: RecurringAvailabilityInput;
  Redwood: ResolverTypeWrapper<Redwood>;
  Role: Role;
  SearchAvailabilityInput: SearchAvailabilityInput;
  Service: ResolverTypeWrapper<MergePrismaWithSdlTypes<PrismaService, MakeRelationsOptional<Service, AllMappedModels>, AllMappedModels>>;
  Slot: ResolverTypeWrapper<Slot>;
  String: ResolverTypeWrapper<Scalars['String']>;
  Subscription: ResolverTypeWrapper<{}>;
  Time: ResolverTypeWrapper<Scalars['Time']>;
  UpdateBookingInput: UpdateBookingInput;
  UpdateProviderProfileInput: UpdateProviderProfileInput;
  User: ResolverTypeWrapper<MergePrismaWithSdlTypes<PrismaUser, MakeRelationsOptional<User, AllMappedModels>, AllMappedModels>>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  AvailabilityException: MergePrismaWithSdlTypes<PrismaAvailabilityException, MakeRelationsOptional<AvailabilityException, AllMappedModels>, AllMappedModels>;
  AvailabilityExceptionInput: AvailabilityExceptionInput;
  BigInt: Scalars['BigInt'];
  Booking: MergePrismaWithSdlTypes<PrismaBooking, MakeRelationsOptional<Booking, AllMappedModels>, AllMappedModels>;
  Boolean: Scalars['Boolean'];
  CreateBookingInput: CreateBookingInput;
  CreateProviderProfileInput: CreateProviderProfileInput;
  CreateServiceInput: CreateServiceInput;
  CustomDayAvailability: MergePrismaWithSdlTypes<PrismaCustomDayAvailability, MakeRelationsOptional<CustomDayAvailability, AllMappedModels>, AllMappedModels>;
  CustomDayAvailabilityInput: CustomDayAvailabilityInput;
  Date: Scalars['Date'];
  DateTime: Scalars['DateTime'];
  Int: Scalars['Int'];
  JSON: Scalars['JSON'];
  JSONObject: Scalars['JSONObject'];
  ManualBlock: MergePrismaWithSdlTypes<PrismaManualBlock, MakeRelationsOptional<ManualBlock, AllMappedModels>, AllMappedModels>;
  ManualBlockInput: ManualBlockInput;
  Mutation: {};
  ProviderProfile: MergePrismaWithSdlTypes<PrismaProviderProfile, MakeRelationsOptional<ProviderProfile, AllMappedModels>, AllMappedModels>;
  Query: {};
  RecurringAvailability: MergePrismaWithSdlTypes<PrismaRecurringAvailability, MakeRelationsOptional<RecurringAvailability, AllMappedModels>, AllMappedModels>;
  RecurringAvailabilityInput: RecurringAvailabilityInput;
  Redwood: Redwood;
  SearchAvailabilityInput: SearchAvailabilityInput;
  Service: MergePrismaWithSdlTypes<PrismaService, MakeRelationsOptional<Service, AllMappedModels>, AllMappedModels>;
  Slot: Slot;
  String: Scalars['String'];
  Subscription: {};
  Time: Scalars['Time'];
  UpdateBookingInput: UpdateBookingInput;
  UpdateProviderProfileInput: UpdateProviderProfileInput;
  User: MergePrismaWithSdlTypes<PrismaUser, MakeRelationsOptional<User, AllMappedModels>, AllMappedModels>;
};

export type requireAuthDirectiveArgs = {
  roles?: Maybe<Array<Maybe<Scalars['String']>>>;
};

export type requireAuthDirectiveResolver<Result, Parent, ContextType = RedwoodGraphQLContext, Args = requireAuthDirectiveArgs> = DirectiveResolverFn<Result, Parent, ContextType, Args>;

export type skipAuthDirectiveArgs = { };

export type skipAuthDirectiveResolver<Result, Parent, ContextType = RedwoodGraphQLContext, Args = skipAuthDirectiveArgs> = DirectiveResolverFn<Result, Parent, ContextType, Args>;

export type AvailabilityExceptionResolvers<ContextType = RedwoodGraphQLContext, ParentType extends ResolversParentTypes['AvailabilityException'] = ResolversParentTypes['AvailabilityException']> = {
  endUtc: OptArgsResolverFn<ResolversTypes['DateTime'], ParentType, ContextType>;
  id: OptArgsResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  providerId: OptArgsResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  reason: OptArgsResolverFn<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  startUtc: OptArgsResolverFn<ResolversTypes['DateTime'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AvailabilityExceptionRelationResolvers<ContextType = RedwoodGraphQLContext, ParentType extends ResolversParentTypes['AvailabilityException'] = ResolversParentTypes['AvailabilityException']> = {
  endUtc?: RequiredResolverFn<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: RequiredResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  providerId?: RequiredResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  reason?: RequiredResolverFn<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  startUtc?: RequiredResolverFn<ResolversTypes['DateTime'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export interface BigIntScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['BigInt'], any> {
  name: 'BigInt';
}

export type BookingResolvers<ContextType = RedwoodGraphQLContext, ParentType extends ResolversParentTypes['Booking'] = ResolversParentTypes['Booking']> = {
  canceledAt: OptArgsResolverFn<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  createdAt: OptArgsResolverFn<ResolversTypes['DateTime'], ParentType, ContextType>;
  customerEmail: OptArgsResolverFn<ResolversTypes['String'], ParentType, ContextType>;
  endUtc: OptArgsResolverFn<ResolversTypes['DateTime'], ParentType, ContextType>;
  id: OptArgsResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  notes: OptArgsResolverFn<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  penaltyFeeCents: OptArgsResolverFn<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  providerId: OptArgsResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  reference: OptArgsResolverFn<ResolversTypes['String'], ParentType, ContextType>;
  serviceId: OptArgsResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  startUtc: OptArgsResolverFn<ResolversTypes['DateTime'], ParentType, ContextType>;
  status: OptArgsResolverFn<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt: OptArgsResolverFn<ResolversTypes['DateTime'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type BookingRelationResolvers<ContextType = RedwoodGraphQLContext, ParentType extends ResolversParentTypes['Booking'] = ResolversParentTypes['Booking']> = {
  canceledAt?: RequiredResolverFn<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  createdAt?: RequiredResolverFn<ResolversTypes['DateTime'], ParentType, ContextType>;
  customerEmail?: RequiredResolverFn<ResolversTypes['String'], ParentType, ContextType>;
  endUtc?: RequiredResolverFn<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: RequiredResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  notes?: RequiredResolverFn<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  penaltyFeeCents?: RequiredResolverFn<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  providerId?: RequiredResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  reference?: RequiredResolverFn<ResolversTypes['String'], ParentType, ContextType>;
  serviceId?: RequiredResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  startUtc?: RequiredResolverFn<ResolversTypes['DateTime'], ParentType, ContextType>;
  status?: RequiredResolverFn<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: RequiredResolverFn<ResolversTypes['DateTime'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type CustomDayAvailabilityResolvers<ContextType = RedwoodGraphQLContext, ParentType extends ResolversParentTypes['CustomDayAvailability'] = ResolversParentTypes['CustomDayAvailability']> = {
  date: OptArgsResolverFn<ResolversTypes['DateTime'], ParentType, ContextType>;
  endUtc: OptArgsResolverFn<ResolversTypes['DateTime'], ParentType, ContextType>;
  id: OptArgsResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  providerId: OptArgsResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  startUtc: OptArgsResolverFn<ResolversTypes['DateTime'], ParentType, ContextType>;
  tz: OptArgsResolverFn<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type CustomDayAvailabilityRelationResolvers<ContextType = RedwoodGraphQLContext, ParentType extends ResolversParentTypes['CustomDayAvailability'] = ResolversParentTypes['CustomDayAvailability']> = {
  date?: RequiredResolverFn<ResolversTypes['DateTime'], ParentType, ContextType>;
  endUtc?: RequiredResolverFn<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: RequiredResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  providerId?: RequiredResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  startUtc?: RequiredResolverFn<ResolversTypes['DateTime'], ParentType, ContextType>;
  tz?: RequiredResolverFn<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export interface DateScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['Date'], any> {
  name: 'Date';
}

export interface DateTimeScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['DateTime'], any> {
  name: 'DateTime';
}

export interface JSONScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['JSON'], any> {
  name: 'JSON';
}

export interface JSONObjectScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['JSONObject'], any> {
  name: 'JSONObject';
}

export type ManualBlockResolvers<ContextType = RedwoodGraphQLContext, ParentType extends ResolversParentTypes['ManualBlock'] = ResolversParentTypes['ManualBlock']> = {
  endUtc: OptArgsResolverFn<ResolversTypes['DateTime'], ParentType, ContextType>;
  id: OptArgsResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  providerId: OptArgsResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  reason: OptArgsResolverFn<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  startUtc: OptArgsResolverFn<ResolversTypes['DateTime'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ManualBlockRelationResolvers<ContextType = RedwoodGraphQLContext, ParentType extends ResolversParentTypes['ManualBlock'] = ResolversParentTypes['ManualBlock']> = {
  endUtc?: RequiredResolverFn<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: RequiredResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  providerId?: RequiredResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  reason?: RequiredResolverFn<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  startUtc?: RequiredResolverFn<ResolversTypes['DateTime'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type MutationResolvers<ContextType = RedwoodGraphQLContext, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  cancelBooking: Resolver<ResolversTypes['Booking'], ParentType, ContextType, RequireFields<MutationcancelBookingArgs, 'id'>>;
  createAvailabilityException: Resolver<ResolversTypes['AvailabilityException'], ParentType, ContextType, RequireFields<MutationcreateAvailabilityExceptionArgs, 'input'>>;
  createBooking: Resolver<ResolversTypes['Booking'], ParentType, ContextType, RequireFields<MutationcreateBookingArgs, 'input'>>;
  createCustomDayAvailability: Resolver<ResolversTypes['CustomDayAvailability'], ParentType, ContextType, RequireFields<MutationcreateCustomDayAvailabilityArgs, 'input'>>;
  createManualBlock: Resolver<ResolversTypes['ManualBlock'], ParentType, ContextType, RequireFields<MutationcreateManualBlockArgs, 'input'>>;
  createProviderProfile: Resolver<ResolversTypes['ProviderProfile'], ParentType, ContextType, RequireFields<MutationcreateProviderProfileArgs, 'input'>>;
  createRecurringAvailability: Resolver<ResolversTypes['RecurringAvailability'], ParentType, ContextType, RequireFields<MutationcreateRecurringAvailabilityArgs, 'input'>>;
  createService: Resolver<ResolversTypes['Service'], ParentType, ContextType, RequireFields<MutationcreateServiceArgs, 'input'>>;
  deleteAvailabilityException: Resolver<ResolversTypes['AvailabilityException'], ParentType, ContextType, RequireFields<MutationdeleteAvailabilityExceptionArgs, 'id'>>;
  deleteManualBlock: Resolver<ResolversTypes['ManualBlock'], ParentType, ContextType, RequireFields<MutationdeleteManualBlockArgs, 'id'>>;
  rescheduleBooking: Resolver<ResolversTypes['Booking'], ParentType, ContextType, RequireFields<MutationrescheduleBookingArgs, 'id' | 'newEndUtcISO' | 'newStartUtcISO'>>;
  updateBooking: Resolver<ResolversTypes['Booking'], ParentType, ContextType, RequireFields<MutationupdateBookingArgs, 'id' | 'input'>>;
  updateProviderProfile: Resolver<ResolversTypes['ProviderProfile'], ParentType, ContextType, RequireFields<MutationupdateProviderProfileArgs, 'input'>>;
};

export type MutationRelationResolvers<ContextType = RedwoodGraphQLContext, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  cancelBooking?: RequiredResolverFn<ResolversTypes['Booking'], ParentType, ContextType, RequireFields<MutationcancelBookingArgs, 'id'>>;
  createAvailabilityException?: RequiredResolverFn<ResolversTypes['AvailabilityException'], ParentType, ContextType, RequireFields<MutationcreateAvailabilityExceptionArgs, 'input'>>;
  createBooking?: RequiredResolverFn<ResolversTypes['Booking'], ParentType, ContextType, RequireFields<MutationcreateBookingArgs, 'input'>>;
  createCustomDayAvailability?: RequiredResolverFn<ResolversTypes['CustomDayAvailability'], ParentType, ContextType, RequireFields<MutationcreateCustomDayAvailabilityArgs, 'input'>>;
  createManualBlock?: RequiredResolverFn<ResolversTypes['ManualBlock'], ParentType, ContextType, RequireFields<MutationcreateManualBlockArgs, 'input'>>;
  createProviderProfile?: RequiredResolverFn<ResolversTypes['ProviderProfile'], ParentType, ContextType, RequireFields<MutationcreateProviderProfileArgs, 'input'>>;
  createRecurringAvailability?: RequiredResolverFn<ResolversTypes['RecurringAvailability'], ParentType, ContextType, RequireFields<MutationcreateRecurringAvailabilityArgs, 'input'>>;
  createService?: RequiredResolverFn<ResolversTypes['Service'], ParentType, ContextType, RequireFields<MutationcreateServiceArgs, 'input'>>;
  deleteAvailabilityException?: RequiredResolverFn<ResolversTypes['AvailabilityException'], ParentType, ContextType, RequireFields<MutationdeleteAvailabilityExceptionArgs, 'id'>>;
  deleteManualBlock?: RequiredResolverFn<ResolversTypes['ManualBlock'], ParentType, ContextType, RequireFields<MutationdeleteManualBlockArgs, 'id'>>;
  rescheduleBooking?: RequiredResolverFn<ResolversTypes['Booking'], ParentType, ContextType, RequireFields<MutationrescheduleBookingArgs, 'id' | 'newEndUtcISO' | 'newStartUtcISO'>>;
  updateBooking?: RequiredResolverFn<ResolversTypes['Booking'], ParentType, ContextType, RequireFields<MutationupdateBookingArgs, 'id' | 'input'>>;
  updateProviderProfile?: RequiredResolverFn<ResolversTypes['ProviderProfile'], ParentType, ContextType, RequireFields<MutationupdateProviderProfileArgs, 'input'>>;
};

export type ProviderProfileResolvers<ContextType = RedwoodGraphQLContext, ParentType extends ResolversParentTypes['ProviderProfile'] = ResolversParentTypes['ProviderProfile']> = {
  bio: OptArgsResolverFn<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  bookingLeadTimeHours: OptArgsResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  cancellationFeeCents: OptArgsResolverFn<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  cancellationWindowHours: OptArgsResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  id: OptArgsResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  maxBookingsPerDay: OptArgsResolverFn<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  name: OptArgsResolverFn<ResolversTypes['String'], ParentType, ContextType>;
  penaltiesApplyForLateCancel: OptArgsResolverFn<ResolversTypes['Boolean'], ParentType, ContextType>;
  rescheduleFeeCents: OptArgsResolverFn<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  rescheduleWindowHours: OptArgsResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  timezone: OptArgsResolverFn<ResolversTypes['String'], ParentType, ContextType>;
  userId: OptArgsResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ProviderProfileRelationResolvers<ContextType = RedwoodGraphQLContext, ParentType extends ResolversParentTypes['ProviderProfile'] = ResolversParentTypes['ProviderProfile']> = {
  bio?: RequiredResolverFn<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  bookingLeadTimeHours?: RequiredResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  cancellationFeeCents?: RequiredResolverFn<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  cancellationWindowHours?: RequiredResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  id?: RequiredResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  maxBookingsPerDay?: RequiredResolverFn<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  name?: RequiredResolverFn<ResolversTypes['String'], ParentType, ContextType>;
  penaltiesApplyForLateCancel?: RequiredResolverFn<ResolversTypes['Boolean'], ParentType, ContextType>;
  rescheduleFeeCents?: RequiredResolverFn<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  rescheduleWindowHours?: RequiredResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  timezone?: RequiredResolverFn<ResolversTypes['String'], ParentType, ContextType>;
  userId?: RequiredResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type QueryResolvers<ContextType = RedwoodGraphQLContext, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  availabilityExceptions: Resolver<Array<ResolversTypes['AvailabilityException']>, ParentType, ContextType, RequireFields<QueryavailabilityExceptionsArgs, 'providerId'>>;
  booking: Resolver<Maybe<ResolversTypes['Booking']>, ParentType, ContextType, RequireFields<QuerybookingArgs, 'id'>>;
  bookings: Resolver<Array<ResolversTypes['Booking']>, ParentType, ContextType, Partial<QuerybookingsArgs>>;
  currentUser: OptArgsResolverFn<Maybe<ResolversTypes['User']>, ParentType, ContextType>;
  customDayAvailabilities: Resolver<Array<ResolversTypes['CustomDayAvailability']>, ParentType, ContextType, RequireFields<QuerycustomDayAvailabilitiesArgs, 'providerId'>>;
  myProviderProfile: OptArgsResolverFn<Maybe<ResolversTypes['ProviderProfile']>, ParentType, ContextType>;
  providerProfiles: OptArgsResolverFn<Array<ResolversTypes['ProviderProfile']>, ParentType, ContextType>;
  recurringAvailabilities: Resolver<Array<ResolversTypes['RecurringAvailability']>, ParentType, ContextType, RequireFields<QueryrecurringAvailabilitiesArgs, 'providerId'>>;
  redwood: OptArgsResolverFn<Maybe<ResolversTypes['Redwood']>, ParentType, ContextType>;
  searchAvailability: Resolver<Array<ResolversTypes['Slot']>, ParentType, ContextType, RequireFields<QuerysearchAvailabilityArgs, 'input'>>;
  service: Resolver<Maybe<ResolversTypes['Service']>, ParentType, ContextType, RequireFields<QueryserviceArgs, 'id'>>;
  services: Resolver<Array<ResolversTypes['Service']>, ParentType, ContextType, Partial<QueryservicesArgs>>;
  solveCube: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType, RequireFields<QuerysolveCubeArgs, 'scramble'>>;
};

export type QueryRelationResolvers<ContextType = RedwoodGraphQLContext, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  availabilityExceptions?: RequiredResolverFn<Array<ResolversTypes['AvailabilityException']>, ParentType, ContextType, RequireFields<QueryavailabilityExceptionsArgs, 'providerId'>>;
  booking?: RequiredResolverFn<Maybe<ResolversTypes['Booking']>, ParentType, ContextType, RequireFields<QuerybookingArgs, 'id'>>;
  bookings?: RequiredResolverFn<Array<ResolversTypes['Booking']>, ParentType, ContextType, Partial<QuerybookingsArgs>>;
  currentUser?: RequiredResolverFn<Maybe<ResolversTypes['User']>, ParentType, ContextType>;
  customDayAvailabilities?: RequiredResolverFn<Array<ResolversTypes['CustomDayAvailability']>, ParentType, ContextType, RequireFields<QuerycustomDayAvailabilitiesArgs, 'providerId'>>;
  myProviderProfile?: RequiredResolverFn<Maybe<ResolversTypes['ProviderProfile']>, ParentType, ContextType>;
  providerProfiles?: RequiredResolverFn<Array<ResolversTypes['ProviderProfile']>, ParentType, ContextType>;
  recurringAvailabilities?: RequiredResolverFn<Array<ResolversTypes['RecurringAvailability']>, ParentType, ContextType, RequireFields<QueryrecurringAvailabilitiesArgs, 'providerId'>>;
  redwood?: RequiredResolverFn<Maybe<ResolversTypes['Redwood']>, ParentType, ContextType>;
  searchAvailability?: RequiredResolverFn<Array<ResolversTypes['Slot']>, ParentType, ContextType, RequireFields<QuerysearchAvailabilityArgs, 'input'>>;
  service?: RequiredResolverFn<Maybe<ResolversTypes['Service']>, ParentType, ContextType, RequireFields<QueryserviceArgs, 'id'>>;
  services?: RequiredResolverFn<Array<ResolversTypes['Service']>, ParentType, ContextType, Partial<QueryservicesArgs>>;
  solveCube?: RequiredResolverFn<Array<ResolversTypes['String']>, ParentType, ContextType, RequireFields<QuerysolveCubeArgs, 'scramble'>>;
};

export type RecurringAvailabilityResolvers<ContextType = RedwoodGraphQLContext, ParentType extends ResolversParentTypes['RecurringAvailability'] = ResolversParentTypes['RecurringAvailability']> = {
  endLocal: OptArgsResolverFn<ResolversTypes['String'], ParentType, ContextType>;
  id: OptArgsResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  providerId: OptArgsResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  startLocal: OptArgsResolverFn<ResolversTypes['String'], ParentType, ContextType>;
  tz: OptArgsResolverFn<ResolversTypes['String'], ParentType, ContextType>;
  weekday: OptArgsResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type RecurringAvailabilityRelationResolvers<ContextType = RedwoodGraphQLContext, ParentType extends ResolversParentTypes['RecurringAvailability'] = ResolversParentTypes['RecurringAvailability']> = {
  endLocal?: RequiredResolverFn<ResolversTypes['String'], ParentType, ContextType>;
  id?: RequiredResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  providerId?: RequiredResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  startLocal?: RequiredResolverFn<ResolversTypes['String'], ParentType, ContextType>;
  tz?: RequiredResolverFn<ResolversTypes['String'], ParentType, ContextType>;
  weekday?: RequiredResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type RedwoodResolvers<ContextType = RedwoodGraphQLContext, ParentType extends ResolversParentTypes['Redwood'] = ResolversParentTypes['Redwood']> = {
  currentUser: OptArgsResolverFn<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  prismaVersion: OptArgsResolverFn<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  version: OptArgsResolverFn<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type RedwoodRelationResolvers<ContextType = RedwoodGraphQLContext, ParentType extends ResolversParentTypes['Redwood'] = ResolversParentTypes['Redwood']> = {
  currentUser?: RequiredResolverFn<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  prismaVersion?: RequiredResolverFn<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  version?: RequiredResolverFn<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ServiceResolvers<ContextType = RedwoodGraphQLContext, ParentType extends ResolversParentTypes['Service'] = ResolversParentTypes['Service']> = {
  bufferAfterMinutes: OptArgsResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  bufferBeforeMinutes: OptArgsResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  capacity: OptArgsResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  durationMinutes: OptArgsResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  id: OptArgsResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  name: OptArgsResolverFn<ResolversTypes['String'], ParentType, ContextType>;
  providerId: OptArgsResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ServiceRelationResolvers<ContextType = RedwoodGraphQLContext, ParentType extends ResolversParentTypes['Service'] = ResolversParentTypes['Service']> = {
  bufferAfterMinutes?: RequiredResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  bufferBeforeMinutes?: RequiredResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  capacity?: RequiredResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  durationMinutes?: RequiredResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  id?: RequiredResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  name?: RequiredResolverFn<ResolversTypes['String'], ParentType, ContextType>;
  providerId?: RequiredResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type SlotResolvers<ContextType = RedwoodGraphQLContext, ParentType extends ResolversParentTypes['Slot'] = ResolversParentTypes['Slot']> = {
  endLocalISO: OptArgsResolverFn<ResolversTypes['String'], ParentType, ContextType>;
  endUtcISO: OptArgsResolverFn<ResolversTypes['String'], ParentType, ContextType>;
  startLocalISO: OptArgsResolverFn<ResolversTypes['String'], ParentType, ContextType>;
  startUtcISO: OptArgsResolverFn<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type SlotRelationResolvers<ContextType = RedwoodGraphQLContext, ParentType extends ResolversParentTypes['Slot'] = ResolversParentTypes['Slot']> = {
  endLocalISO?: RequiredResolverFn<ResolversTypes['String'], ParentType, ContextType>;
  endUtcISO?: RequiredResolverFn<ResolversTypes['String'], ParentType, ContextType>;
  startLocalISO?: RequiredResolverFn<ResolversTypes['String'], ParentType, ContextType>;
  startUtcISO?: RequiredResolverFn<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type SubscriptionResolvers<ContextType = RedwoodGraphQLContext, ParentType extends ResolversParentTypes['Subscription'] = ResolversParentTypes['Subscription']> = {
  availabilityUpdated: SubscriptionResolver<Array<ResolversTypes['Slot']>, "availabilityUpdated", ParentType, ContextType, RequireFields<SubscriptionavailabilityUpdatedArgs, 'input'>>;
};

export type SubscriptionRelationResolvers<ContextType = RedwoodGraphQLContext, ParentType extends ResolversParentTypes['Subscription'] = ResolversParentTypes['Subscription']> = {
  availabilityUpdated: SubscriptionResolver<Array<ResolversTypes['Slot']>, "availabilityUpdated", ParentType, ContextType, RequireFields<SubscriptionavailabilityUpdatedArgs, 'input'>>;
};

export interface TimeScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['Time'], any> {
  name: 'Time';
}

export type UserResolvers<ContextType = RedwoodGraphQLContext, ParentType extends ResolversParentTypes['User'] = ResolversParentTypes['User']> = {
  createdAt: OptArgsResolverFn<ResolversTypes['DateTime'], ParentType, ContextType>;
  email: OptArgsResolverFn<ResolversTypes['String'], ParentType, ContextType>;
  id: OptArgsResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  name: OptArgsResolverFn<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  role: OptArgsResolverFn<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt: OptArgsResolverFn<ResolversTypes['DateTime'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type UserRelationResolvers<ContextType = RedwoodGraphQLContext, ParentType extends ResolversParentTypes['User'] = ResolversParentTypes['User']> = {
  createdAt?: RequiredResolverFn<ResolversTypes['DateTime'], ParentType, ContextType>;
  email?: RequiredResolverFn<ResolversTypes['String'], ParentType, ContextType>;
  id?: RequiredResolverFn<ResolversTypes['Int'], ParentType, ContextType>;
  name?: RequiredResolverFn<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  role?: RequiredResolverFn<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: RequiredResolverFn<ResolversTypes['DateTime'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type Resolvers<ContextType = RedwoodGraphQLContext> = {
  AvailabilityException: AvailabilityExceptionResolvers<ContextType>;
  BigInt: GraphQLScalarType;
  Booking: BookingResolvers<ContextType>;
  CustomDayAvailability: CustomDayAvailabilityResolvers<ContextType>;
  Date: GraphQLScalarType;
  DateTime: GraphQLScalarType;
  JSON: GraphQLScalarType;
  JSONObject: GraphQLScalarType;
  ManualBlock: ManualBlockResolvers<ContextType>;
  Mutation: MutationResolvers<ContextType>;
  ProviderProfile: ProviderProfileResolvers<ContextType>;
  Query: QueryResolvers<ContextType>;
  RecurringAvailability: RecurringAvailabilityResolvers<ContextType>;
  Redwood: RedwoodResolvers<ContextType>;
  Service: ServiceResolvers<ContextType>;
  Slot: SlotResolvers<ContextType>;
  Subscription: SubscriptionResolvers<ContextType>;
  Time: GraphQLScalarType;
  User: UserResolvers<ContextType>;
};

export type DirectiveResolvers<ContextType = RedwoodGraphQLContext> = {
  requireAuth: requireAuthDirectiveResolver<any, any, ContextType>;
  skipAuth: skipAuthDirectiveResolver<any, any, ContextType>;
};
