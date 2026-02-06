
const input = "Tried tying shoes, they needed a verbal prompt but got it right";
const lowerInput = input.toLowerCase();

const skillKeywords = ['trial', 'skill', 'target', 'dtt', 'matching', 'imitation', 'labeling', 'mand', 'tact', 'tried', 'practiced', 'worked on'];

const specificSkill = skillKeywords.find(k =>
    lowerInput.includes(k) && !['trial', 'skill', 'target', 'tried', 'practiced', 'worked on'].includes(k)
);

console.log("Specific Skill:", specificSkill);

if (specificSkill) {
    console.log("Matched specific skill logic");
} else if (lowerInput.includes('trial')) {
    console.log("Matched generic trial logic");
} else {
    console.log("Entering heuristic logic");
    const regex = /\b(tried|practiced|worked on)\s+([a-z0-9\s]+?)(?=\s*(,|$|they|he|she|needed|but|with))/i;
    const match = input.match(regex);
    console.log("Regex Match:", match);
    if (match) {
        console.log("Extracted Skill:", match[2].trim());
    } else {
        console.log("No match found.");
    }
}
