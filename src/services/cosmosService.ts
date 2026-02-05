// Cosmos DB Service for cloud sync
// Uses the official Azure Cosmos DB JavaScript SDK with CORS support

import { CosmosClient, Container, Database } from '@azure/cosmos';

const COSMOS_CONNECTION_STRING = import.meta.env.VITE_COSMOS_CONNECTION_STRING || '';
const DATABASE_NAME = 'SessionCopilotDB';
const CONTAINER_NAME = 'Sessions';

let cosmosClient: CosmosClient | null = null;
let database: Database | null = null;
let container: Container | null = null;

export interface SyncableDocument {
    id: string;
    sessionId: number;
    entityType: 'behavior' | 'skillTrial' | 'incident' | 'note';
    data: Record<string, unknown>;
    syncedAt: string;
    clientId?: string;
}

function initializeClient(): { client: CosmosClient; db: Database; container: Container } | null {
    if (!COSMOS_CONNECTION_STRING) {
        console.warn('[CosmosService] No connection string configured');
        return null;
    }

    if (cosmosClient && database && container) {
        return { client: cosmosClient, db: database, container };
    }

    try {
        // Create client with endpoint discovery disabled for browser CORS compatibility
        cosmosClient = new CosmosClient({
            connectionString: COSMOS_CONNECTION_STRING,
            connectionPolicy: {
                enableEndpointDiscovery: false
            }
        });

        database = cosmosClient.database(DATABASE_NAME);
        container = database.container(CONTAINER_NAME);

        console.log('[CosmosService] Client initialized successfully');
        return { client: cosmosClient, db: database, container };
    } catch (error) {
        console.error('[CosmosService] Failed to initialize client:', error);
        return null;
    }
}

export async function isCosmosConfigured(): Promise<boolean> {
    return COSMOS_CONNECTION_STRING.length > 0;
}

export async function upsertDocument(document: SyncableDocument): Promise<boolean> {
    const cosmos = initializeClient();
    if (!cosmos) {
        return false;
    }

    try {
        const { resource } = await cosmos.container.items.upsert(document);
        console.log('[CosmosService] Upserted document:', document.id);
        return !!resource;
    } catch (error) {
        console.error('[CosmosService] Upsert error:', error);
        return false;
    }
}

export async function batchUpsert(documents: SyncableDocument[]): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    // Process in batches of 10 to avoid rate limiting
    const batchSize = 10;
    for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize);
        const results = await Promise.all(batch.map(doc => upsertDocument(doc)));

        for (const result of results) {
            if (result) success++;
            else failed++;
        }

        // Small delay between batches
        if (i + batchSize < documents.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    return { success, failed };
}

export async function queryDocuments(
    sessionId: number,
    entityType?: string
): Promise<SyncableDocument[]> {
    const cosmos = initializeClient();
    if (!cosmos) {
        return [];
    }

    try {
        let querySpec: { query: string; parameters: { name: string; value: string | number }[] } = {
            query: 'SELECT * FROM c WHERE c.sessionId = @sessionId',
            parameters: [{ name: '@sessionId', value: sessionId }]
        };

        if (entityType) {
            querySpec = {
                query: 'SELECT * FROM c WHERE c.sessionId = @sessionId AND c.entityType = @entityType',
                parameters: [
                    { name: '@sessionId', value: sessionId },
                    { name: '@entityType', value: entityType }
                ]
            };
        }

        const { resources } = await cosmos.container.items
            .query<SyncableDocument>(querySpec, {
                partitionKey: sessionId
            })
            .fetchAll();

        return resources || [];
    } catch (error) {
        console.error('[CosmosService] Query error:', error);
        return [];
    }
}
