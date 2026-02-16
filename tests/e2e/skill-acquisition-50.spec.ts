import { test, expect, type BrowserContext, type Page } from '@playwright/test';

const DB_NAME = 'SessionCoPilotDB';

type Opportunity = {
  input: string;
  expectedSkill: string;
  expectedTarget: string;
  expectedResponse: 'Correct' | 'Incorrect';
  expectedPromptLevel?: string;
};

async function acceptTermsIfPresent(page: Page): Promise<void> {
  const accept = page.getByTestId('terms-accept-button');
  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
    await expect(page.locator('.terms-overlay')).toBeHidden();
  }
}

async function setOffline(context: BrowserContext, page: Page): Promise<void> {
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
}

async function idbStoreCount(page: Page, storeName: string): Promise<number> {
  return await page.evaluate(
    async ({ dbName, storeName }) => {
      return await new Promise<number>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(storeName, 'readonly');
          const store = tx.objectStore(storeName);
          const countReq = store.count();
          countReq.onerror = () => reject(countReq.error);
          countReq.onsuccess = () => resolve(countReq.result);
        };
      });
    },
    { dbName: DB_NAME, storeName }
  );
}

type EncryptedEntityRow = {
  id?: number;
  sessionId: number;
  timestamp: unknown;
  createdAt: unknown;
  synced: boolean;
  encryptedData: { ciphertext: string; iv: string; algorithm?: string; version?: number };
  signature?: string;
};

async function idbGetAllRows<T>(page: Page, storeName: string): Promise<T[]> {
  return await page.evaluate(
    async ({ dbName, storeName }) => {
      return await new Promise<unknown[]>((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(storeName, 'readonly');
          const store = tx.objectStore(storeName);
          const allReq = store.getAll();
          allReq.onerror = () => reject(allReq.error);
          allReq.onsuccess = () => resolve(allReq.result as unknown[]);
        };
      });
    },
    { dbName: DB_NAME, storeName }
  ) as T[];
}

async function sendChat(page: Page, message: string): Promise<void> {
  const input = page.locator('.input-field');
  await expect(input).toBeVisible();
  await input.fill(message);
  await input.press('Enter');
}

async function clickLastMessageButton(page: Page, role: 'assistant' | 'system', name: string): Promise<void> {
  const msg = page.locator(`.message.${role}`).filter({ has: page.getByRole('button', { name }) }).last();
  await expect(msg).toBeVisible();
  await msg.getByRole('button', { name }).click();
}

type OpportunityTemplate = (target: string, index: number, style: number) => Opportunity;

const responseMarker = (response: 'Correct' | 'Incorrect', index: number): string => {
  if (response === 'Correct') {
    return ['correct', 'c', 'right'][index % 3];
  }
  return ['incorrect', 'inc', 'wrong'][index % 3];
};

const responseFromIndex = (index: number): 'Correct' | 'Incorrect' => (index % 2 === 0 ? 'Correct' : 'Incorrect');

const expectedResponseFromPhrase = (phrase: string, marker: 'Correct' | 'Incorrect'): 'Correct' | 'Incorrect' => {
  const lowerInput = phrase.toLowerCase();
  const markerIsCorrect =
    /\b(correct|right|c\b|accurate)\b/i.test(marker === 'Correct' ? 'correct' : 'incorrect') ||
    marker === 'Correct';

  if (!markerIsCorrect) {
    return 'Incorrect';
  }

  if (
    /\b(incorrect|wrong|error|inc|prompted|assisted|helped|not\s+ind|not\s+independent)\b/i.test(lowerInput) ||
    lowerInput.includes('prompt') ||
    lowerInput.includes('help') ||
    lowerInput.includes('assisted') ||
    lowerInput.includes('physical') ||
    lowerInput.includes('gestural') ||
    lowerInput.includes('model') ||
    lowerInput.includes('verbal')
  ) {
    return 'Incorrect';
  }

  return 'Correct';
};

const OPPORTUNITY_TEMPLATES: OpportunityTemplate[] = [
  (target, index, style) => {
    const response = responseFromIndex(index);
    const marker = responseMarker(response, style);
    const styles = [
      `Matching target ${target} ${marker} independent`,
      `Matching: ${target} ${marker} ind`,
      `RBT ran matching trial on ${target} ${marker} with verbal prompt`,
      `Matching "${target}" ${marker} after gestural`,
      `Matching ${target} ${marker} full-physical`,
      `BCBA cue: matching ${target} ${marker}`,
    ];
    const promptLevel = marker === 'ind' || marker === 'c' || marker === 'correct' || marker === 'right' ? 'independent' : undefined;
    const message = styles[style % styles.length];
    const input = message;
    return {
      input: message,
      expectedSkill: 'Matching',
      expectedTarget: target,
      expectedResponse: expectedResponseFromPhrase(input, response),
      expectedPromptLevel: marker === 'ind' ? 'independent' : promptLevel ?? undefined,
    };
  },
  (target, index, style) => {
    const response = responseFromIndex(index);
    const marker = responseMarker(response, style);
    const styles = [
      `Dtt target ${target} ${marker} verbal`,
      `DTT "${target}" ${marker}`,
      `Dtt: ${target} ${marker} with model`,
      `Dtt target ${target} ${marker} partial phys`,
      `DTT ${target} ${marker} ind`,
      `Dtt: ${target} ${marker}`,
    ];
    const input = styles[style % styles.length];
    return {
      input,
      expectedSkill: 'Dtt',
      expectedTarget: target,
      expectedResponse: expectedResponseFromPhrase(input, response),
      expectedPromptLevel: /partial phys|model|verbal/i.test(styles[style % styles.length]) ? styles[style % styles.length].match(/(partial|model|verbal|independent)/i)?.[0]?.toLowerCase() : undefined,
    };
  },
  (target, index, style) => {
    const response = responseFromIndex(index);
    const marker = responseMarker(response, style);
    const styles = [
      `Imitation target ${target} ${marker} gestural`,
      `Imitation "${target}" ${marker}`,
      `Imitation "${target}" ${marker} with partial physical`,
      `RBT used imitation on ${target} ${marker}`,
      `Imitation ${target} ${marker} ind`,
      `Imitation target ${target} ${marker} verbal`,
    ];
    const text = styles[style % styles.length];
    return {
      input: text,
      expectedSkill: 'Imitation',
      expectedTarget: target,
      expectedResponse: expectedResponseFromPhrase(text, response),
      expectedPromptLevel: /gestural|partial physical|verbal|ind/i.test(text) ? text.match(/(gestural|partial physical|verbal|independent)/i)?.[0]?.toLowerCase() : undefined,
    };
  },
  (target, index, style) => {
    const response = responseFromIndex(index);
    const marker = responseMarker(response, style);
    const styles = [
      `Labeling target ${target} ${marker} model`,
      `Labeling "${target}" ${marker} independent`,
      `Labeling ${target} ${marker} with gestural`,
      `Client labeled ${target} ${marker}`,
      `Labeling target ${target} ${marker} verbal`,
      `Labeling "${target}" ${marker} with full phys`,
    ];
    const text = styles[style % styles.length];
    return {
      input: text,
      expectedSkill: 'Labeling',
      expectedTarget: target,
      expectedResponse: expectedResponseFromPhrase(text, response),
      expectedPromptLevel: /gestural|model|verbal|full/gi.test(text) ? text.match(/(gestural|model|verbal|full)/i)?.[0]?.toLowerCase() : undefined,
    };
  },
  (target, index, style) => {
    const response = responseFromIndex(index);
    const marker = responseMarker(response, style);
    const styles = [
      `Mand target ${target} ${marker} independent`,
      `Mand: "${target}" ${marker} ind`,
      `Mand "${target}" ${marker} with partial physical`,
      `RBT had mand trial on ${target} ${marker} verbal`,
      `Mand trial ${target} ${marker} full-phys`,
      `Mand target ${target} ${marker}`,
    ];
    const text = styles[style % styles.length];
    return {
      input: text,
      expectedSkill: 'Mand',
      expectedTarget: target,
      expectedResponse: expectedResponseFromPhrase(text, response),
      expectedPromptLevel: /partial physical|verbal|full|ind/i.test(text) ? text.match(/(partial physical|verbal|full|independent)/i)?.[0]?.toLowerCase() : undefined,
    };
  },
  (target, index, style) => {
    const response = responseFromIndex(index);
    const marker = responseMarker(response, style);
    const styles = [
      `Tact target ${target} ${marker} full physical`,
      `Tact "${target}" ${marker} independent`,
      `Tact ${target} ${marker} with verbal`,
      `Tact trial for ${target} ${marker} gestural`,
      `Tact target ${target} ${marker} model`,
      `Tact "${target}" ${marker}`,
    ];
    const text = styles[style % styles.length];
    return {
      input: text,
      expectedSkill: 'Tact',
      expectedTarget: target,
      expectedResponse: expectedResponseFromPhrase(text, response),
      expectedPromptLevel: /gestural|verbal|model|partial|full|ind/i.test(text) ? text.match(/(gestural|verbal|model|full|independent)/i)?.[0]?.toLowerCase() : undefined,
    };
  },
  (target, index, style) => {
    const response = responseFromIndex(index);
    const marker = responseMarker(response, style);
    const styles = [
      `Trial ${target} ${marker} ind`,
      `skill - ${target} ${marker} independent`,
      `tr ${target} ${marker} ${index % 2 === 0 ? 'v' : 'gest'} c`,
      `Trial ${target} ${marker} partial physical`,
      `Generic trial ${target} ${marker}`,
      `skill: ${target} ${marker} with model`,
    ];
    const text = styles[style % styles.length];
    return {
      input: text,
      expectedSkill: 'Generic Trial',
      expectedTarget: target,
      expectedResponse: expectedResponseFromPhrase(text, response),
      expectedPromptLevel: /partial physical|gestural|model|verbal|ind/i.test(text) ? text.match(/(partial physical|gestural|model|verbal|independent)/i)?.[0]?.toLowerCase() : undefined,
    };
  },
];

function buildOpportunity(index: number): Opportunity {
  const target = `trial${index}`;
  if (index === 2) {
    return {
      input: 'skill - put on hat correct independent',
      expectedSkill: 'Generic Trial',
      expectedTarget: 'put on hat',
      expectedResponse: 'Correct',
      expectedPromptLevel: 'independent',
    };
  }
  const template = OPPORTUNITY_TEMPLATES[(index - 1) % OPPORTUNITY_TEMPLATES.length];
  return template(target, index, (index - 1) % 6);
}

test.describe('Skill acquisition throughput', () => {
  test('captures 50 diverse skill trials offline with parser + encrypted row validation', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Uses offline emulation and chat assertions.');
    test.setTimeout(180_000);

    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'demo-user-id',
            email: 'demo2@agentsofaba.com',
            name: 'Demo User',
            role: 'bcba',
            permissions: [],
            encryptionSalt: 'mock-salt',
            assignedLearnerIds: ['demo'],
          },
          organization: { id: 'demo-org', name: 'Demo Org' },
          learners: [{ id: 'demo', name: 'Alex B.', orgId: 'demo-org', status: 'active' }],
        }),
      });
    });

    await page.goto('/demo');
    await acceptTermsIfPresent(page);
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('.action-buttons')).toBeVisible();
    await expect(page.locator('.input-field')).toBeVisible();

    await expect.poll(() => idbStoreCount(page, 'skillTrials')).toBe(0);

    await setOffline(context, page);
    await expect(page.locator('.sync-badge')).toContainText(/offline/i);

    await page.getByRole('button', { name: 'Log Skill Trial' }).click();
    await expect(page.locator('.message.assistant').last()).toContainText('What skill trial would you like to log?');

    for (let i = 1; i <= 50; i++) {
      const opportunity = buildOpportunity(i);
      await sendChat(page, opportunity.input);
      await expect(page.locator('.message.assistant').last()).toContainText(
        `${opportunity.expectedSkill} (${opportunity.expectedTarget}): ${opportunity.expectedResponse}`
      );
      await clickLastMessageButton(page, 'assistant', 'Yes');
      await expect(page.locator('.message.assistant').last()).toContainText('✓ Data logged successfully!');
      await expect.poll(() => idbStoreCount(page, 'skillTrials')).toBe(i);
      await expect(page.locator('.desktop-summary')).toBeVisible();
    }

    await expect.poll(() => idbStoreCount(page, 'skillTrials')).toBe(50);
    const rows = await idbGetAllRows<EncryptedEntityRow>(page, 'skillTrials');
    expect(rows).toHaveLength(50);
    expect(rows.every((row) => typeof row.id === 'number')).toBe(true);
    expect(rows.every((row) => row.sessionId === 1)).toBe(true);
    expect(rows.every((row) => row.synced === false)).toBe(true);
    expect(rows.every((row) => !!row.timestamp)).toBe(true);
    expect(rows.every((row) => !!row.createdAt)).toBe(true);
    expect(rows.every((row) => typeof row.encryptedData?.ciphertext === 'string' && row.encryptedData.ciphertext.length > 0)).toBe(true);
    expect(rows.every((row) => typeof row.encryptedData?.iv === 'string' && row.encryptedData.iv.length > 0)).toBe(true);
    expect(rows.every((row) => row.encryptedData?.algorithm === 'AES-GCM')).toBe(true);
    expect(rows.every((row) => row.encryptedData?.version === 1)).toBe(true);
    expect(rows.every((row) => typeof row.signature === 'string' && row.signature.length > 0)).toBe(true);

    const summary = page.locator('.desktop-summary');
    const first = buildOpportunity(1);
    const last = buildOpportunity(50);
    await expect(summary.getByText(`${first.expectedSkill} (${first.expectedTarget})`)).toBeVisible();
    await expect(summary.getByText(`${last.expectedSkill} (${last.expectedTarget})`)).toBeVisible();
    await expect(summary.getByText(/Response:\s*(Correct|Incorrect)/i).first()).toBeVisible();
  });
});
