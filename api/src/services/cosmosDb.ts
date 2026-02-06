import { CosmosClient, Database, Container } from '@azure/cosmos';
import crypto from 'crypto';

let client: CosmosClient | null = null;
let database: Database | null = null;

const COSMOS_CONNECTION_STRING = process.env.COSMOS_CONNECTION_STRING || '';
const DATABASE_NAME = 'SessionCopilotDB';

// Container names
export const CONTAINERS = {
    USERS: 'Users',
    ORGANIZATIONS: 'Organizations',
    LEARNERS: 'Learners',
    SESSIONS: 'Sessions',
    AUDIT_LOG: 'AuditLog'
} as const;

function getClient(): CosmosClient {
    if (!client) {
        if (!COSMOS_CONNECTION_STRING) {
            throw new Error('COSMOS_CONNECTION_STRING not configured');
        }
        client = new CosmosClient(COSMOS_CONNECTION_STRING);
    }
    return client;
}

function getDatabase(): Database {
    if (!database) {
        database = getClient().database(DATABASE_NAME);
    }
    return database;
}

export function getContainer(containerName: string): Container {
    return getDatabase().container(containerName);
}

// User types
export interface User {
    id: string;
    email: string;
    passwordHash: string;
    userType: 'org' | 'parent';
    orgId: string | null;
    role: 'manager' | 'bcba' | 'rbt' | null;
    name: string;
    assignedLearnerIds: string[];
    permissions: string[];
    createdAt: string;
    lastLogin: string | null;
    isActive: boolean;
    encryptionSalt: string;
}

export interface Organization {
    id: string;
    name: string;
    settings: {
        defaultSessionDuration: number;
        requireSupervisorApproval: boolean;
    };
    createdAt: string;

    // Subscription & Billing (Stripe integration)
    subscription: {
        stripeCustomerId: string | null;
        stripeSubscriptionId: string | null;
        plan: 'starter' | 'growth' | 'scale' | 'enterprise' | 'trial' | null;
        status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'paused';
        billingPeriod: 'monthly' | 'annual' | null;
        currentPeriodStart: string | null;
        currentPeriodEnd: string | null;
        trialEndsAt: string | null;
        cancelAtPeriodEnd: boolean;
        canceledAt: string | null;
        activeLearnerCount: number;
        maxActiveLearners: number;
        lastCountedAt: string | null;
    };
    billing: {
        billingEmail: string;
        billingName: string;
        lastPaymentDate: string | null;
        lastPaymentAmount: number | null;
        nextBillingDate: string | null;
        alertSentAt90Percent: string | null;
    };
}

export interface Learner {
    id: string;
    orgId: string;
    name: string;
    dob: string;
    parentUserIds: string[];
    primaryBcbaId: string | null;
    assignedRbtIds: string[];
    status: 'active' | 'inactive' | 'discharged';
    createdAt: string;
}

export interface AuditLogEntry {
    id: string;
    userId: string;
    userEmail: string;
    action: string;           // 'read', 'create', 'update', 'delete', 'login', 'logout', etc.
    entityType: string;       // 'session', 'behavior', 'incident', 'user', 'learner', 'auth'
    entityId: string;
    orgId: string | null;     // Organization for multi-tenant isolation
    ipAddress: string;        // Required for HIPAA compliance
    userAgent: string;        // Required for HIPAA compliance
    success: boolean;         // Whether the action succeeded
    failureReason?: string;   // If failed, why?
    details: Record<string, unknown>;  // Additional context
    timestamp: string;
}

// CRUD operations
export async function findUserByEmail(email: string): Promise<User | null> {
    const container = getContainer(CONTAINERS.USERS);
    const { resources } = await container.items
        .query({
            query: 'SELECT * FROM c WHERE c.email = @email',
            parameters: [{ name: '@email', value: email.toLowerCase() }]
        })
        .fetchAll();
    return resources[0] || null;
}

export async function findUserById(userId: string): Promise<User | null> {
    const container = getContainer(CONTAINERS.USERS);
    try {
        const { resource } = await container.item(userId, userId).read<User>();
        return resource || null;
    } catch {
        return null;
    }
}

export async function findUsersByOrg(orgId: string): Promise<User[]> {
    const container = getContainer(CONTAINERS.USERS);
    const { resources } = await container.items
        .query({
            query: 'SELECT * FROM c WHERE c.orgId = @orgId',
            parameters: [{ name: '@orgId', value: orgId }]
        })
        .fetchAll();
    return resources;
}

export async function createUser(user: Omit<User, 'id'>): Promise<User> {
    const container = getContainer(CONTAINERS.USERS);
    const id = crypto.randomUUID();
    const newUser: User = { ...user, id };
    await container.items.create(newUser);
    return newUser;
}

export async function updateUser(userId: string, updates: Partial<User>): Promise<User | null> {
    const container = getContainer(CONTAINERS.USERS);
    const existing = await findUserById(userId);
    if (!existing) return null;

    const updated = { ...existing, ...updates };
    await container.item(userId, userId).replace(updated);
    return updated;
}

export async function createOrganization(org: Omit<Organization, 'id'>): Promise<Organization> {
    const container = getContainer(CONTAINERS.ORGANIZATIONS);
    const id = crypto.randomUUID();
    const newOrg: Organization = { ...org, id };
    await container.items.create(newOrg);
    return newOrg;
}

export async function findOrganizationById(orgId: string): Promise<Organization | null> {
    const container = getContainer(CONTAINERS.ORGANIZATIONS);
    try {
        const { resource } = await container.item(orgId, orgId).read<Organization>();
        return resource || null;
    } catch {
        return null;
    }
}

export async function createLearner(learner: Omit<Learner, 'id'>): Promise<Learner> {
    const container = getContainer(CONTAINERS.LEARNERS);
    const id = crypto.randomUUID();
    const newLearner: Learner = { ...learner, id };
    await container.items.create(newLearner);
    return newLearner;
}

export async function findLearnersByOrg(orgId: string): Promise<Learner[]> {
    const container = getContainer(CONTAINERS.LEARNERS);
    const { resources } = await container.items
        .query({
            query: 'SELECT * FROM c WHERE c.orgId = @orgId',
            parameters: [{ name: '@orgId', value: orgId }]
        })
        .fetchAll();
    return resources;
}

export async function findLearnersByIds(learnerIds: string[]): Promise<Learner[]> {
    if (learnerIds.length === 0) return [];
    const container = getContainer(CONTAINERS.LEARNERS);
    const { resources } = await container.items
        .query({
            query: `SELECT * FROM c WHERE ARRAY_CONTAINS(@ids, c.id)`,
            parameters: [{ name: '@ids', value: learnerIds }]
        })
        .fetchAll();
    return resources;
}

export async function updateLearner(learnerId: string, updates: Partial<Learner>): Promise<Learner | null> {
    const container = getContainer(CONTAINERS.LEARNERS);
    try {
        const { resource: existing } = await container.item(learnerId, learnerId).read<Learner>();
        if (!existing) {
            return null;
        }
        const updated: Learner = { ...existing, ...updates, id: existing.id, orgId: existing.orgId };
        await container.item(learnerId, learnerId).replace(updated);
        return updated;
    } catch {
        return null;
    }
}

export async function logAuditEvent(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<void> {
    const container = getContainer(CONTAINERS.AUDIT_LOG);
    await container.items.create({
        id: crypto.randomUUID(),
        ...entry,
        orgId: entry.orgId ?? 'none',
        timestamp: new Date().toISOString()
    });
}

export async function findAuditLogsByOrg(orgId: string, limit = 100): Promise<AuditLogEntry[]> {
    const container = getContainer(CONTAINERS.AUDIT_LOG);
    const { resources } = await container.items
        .query({
            query: 'SELECT TOP @limit * FROM c WHERE c.orgId = @orgId ORDER BY c.timestamp DESC',
            parameters: [
                { name: '@orgId', value: orgId },
                { name: '@limit', value: limit }
            ]
        })
        .fetchAll();
    return resources;
}

export async function updateOrganization(orgId: string, updates: Partial<Organization>): Promise<Organization | null> {
    const container = getContainer(CONTAINERS.ORGANIZATIONS);
    try {
        const { resource: existing } = await container.item(orgId, orgId).read<Organization>();
        if (!existing) {
            return null;
        }
        const updated: Organization = { ...existing, ...updates, id: existing.id };
        await container.item(orgId, orgId).replace(updated);
        return updated;
    } catch {
        return null;
    }
}

export async function countActiveLearnersByOrg(orgId: string): Promise<number> {
    const container = getContainer(CONTAINERS.LEARNERS);
    const { resources } = await container.items
        .query({
            query: 'SELECT VALUE COUNT(1) FROM c WHERE c.orgId = @orgId AND c.status = @status',
            parameters: [
                { name: '@orgId', value: orgId },
                { name: '@status', value: 'active' }
            ]
        })
        .fetchAll();
    return resources[0] || 0;
}
