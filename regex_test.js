// Test script for regex logic
// This effectively mocks the `mockParseInput` environment to test it
const input = "He blocked the door for 2 minutes";
const lowerInput = input.toLowerCase();

// Regex Logic Replication
const behaviorPatterns = [
    { type: 'elopement', keywords: ['elopement', 'ran away', 'bolted', 'left room'] },
    { type: 'tantrum', keywords: ['tantrum', 'scream', 'cry', 'flop', 'drop to floor'] },
    { type: 'aggression', keywords: ['aggression', 'hit', 'kick', 'bite', 'scratch', 'pinch'] },
    { type: 'SIB', keywords: ['sib', 'self-injur', 'head bang', 'bit hand', 'bit self'] },
    { type: 'property_destruction', keywords: ['property destruction', 'threw', 'broke', 'ripped'] },
    { type: 'refusal', keywords: ['refusal', 'non-compliance', 'no', 'refused', 'blocked'] },
    { type: 'stereotypy', keywords: ['stereotypy', 'stimming', 'hand flap', 'rocking'] }
];

const found = [];
behaviorPatterns.forEach(pattern => {
    if (pattern.keywords.some(k => lowerInput.includes(k))) {
        let duration = 0;
        const secMatch = input.match(/(\d+)\s*sec/i);
        const minMatch = input.match(/(\d+)\s*min/i);
        if (secMatch) duration += parseInt(secMatch[1]);
        if (minMatch) duration += parseInt(minMatch[1]) * 60;

        found.push({ type: pattern.type, duration });
    }
});

console.log('Test "He blocked the door for 2 minutes":', JSON.stringify(found));

// Test 2: Multi-behavior
const input2 = "He screamed and kicked the wall";
const lowerInput2 = input2.toLowerCase();
const found2 = [];
behaviorPatterns.forEach(pattern => {
    if (pattern.keywords.some(k => lowerInput2.includes(k))) {
        found2.push({ type: pattern.type });
    }
});
console.log('Test "He screamed and kicked the wall":', JSON.stringify(found2));
