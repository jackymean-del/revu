// revU - Performance Intelligence Platform Core Application Logic
// Enhanced UI/UX Systems

// Global Error Boundary for UI diagnostic visibility
window.onerror = function(message, source, lineno, colno, error) {
    const errDiv = document.createElement("div");
    errDiv.style.position = "fixed";
    errDiv.style.bottom = "0";
    errDiv.style.left = "0";
    errDiv.style.right = "0";
    errDiv.style.background = "#ef4444";
    errDiv.style.color = "#ffffff";
    errDiv.style.padding = "16px";
    errDiv.style.zIndex = "999999";
    errDiv.style.fontFamily = "monospace";
    errDiv.style.fontSize = "13px";
    errDiv.style.maxHeight = "150px";
    errDiv.style.overflowY = "auto";
    errDiv.style.boxShadow = "0 -4px 20px rgba(0,0,0,0.5)";
    errDiv.innerText = `[revU Runtime Error] ${message} at ${source}:${lineno}:${colno}`;
    document.body.appendChild(errDiv);
    return false;
};

// =========================================================================
// 1. DATA MODELS & SEED DATA INJECTION
// =========================================================================

const makeScale1to10 = (prefix) => Array.from({length: 10}, (_, i) => ({
    id: `${prefix}-pts-${i+1}`,
    label: `${i+1}`,
    points: i+1
}));


const makeYesNoPartially = (prefix) => [
    { id: `${prefix}-ynp-yes`, label: "Yes", points: 10 },
    { id: `${prefix}-ynp-partial`, label: "Partially", points: 5 },
    { id: `${prefix}-ynp-no`, label: "No", points: 0 }
];

const makeStrongAdequateNeeds = (prefix) => [
    { id: `${prefix}-san-strong`, label: "Strong", points: 10 },
    { id: `${prefix}-san-adequate`, label: "Adequate", points: 5 },
    { id: `${prefix}-san-needs`, label: "Needs alignment", points: 0 }
];

const makeClearAverageWeak = (prefix) => [
    { id: `${prefix}-caw-clear`, label: "Clear", points: 10 },
    { id: `${prefix}-caw-average`, label: "Average", points: 5 },
    { id: `${prefix}-caw-weak`, label: "Weak", points: 0 }
];

const makeEvidentLimitedNotEvident = (prefix) => [
    { id: `${prefix}-elne-evident`, label: "Evident", points: 10 },
    { id: `${prefix}-elne-limited`, label: "Limited", points: 5 },
    { id: `${prefix}-elne-not`, label: "Not evident", points: 0 }
];

const makeAppropriateFastSlow = (prefix) => [
    { id: `${prefix}-afs-appropriate`, label: "Appropriate", points: 10 },
    { id: `${prefix}-afs-fast`, label: "Fast", points: 5 },
    { id: `${prefix}-afs-slow`, label: "Slow", points: 0 }
];

const makeAccurateMinorNeeds = (prefix) => [
    { id: `${prefix}-amn-accurate`, label: "Accurate", points: 10 },
    { id: `${prefix}-amn-minor`, label: "Minor gaps", points: 5 },
    { id: `${prefix}-amn-needs`, label: "Needs correction", points: 0 }
];

const makeAppropriateShallowOverloaded = (prefix) => [
    { id: `${prefix}-aso-appropriate`, label: "Appropriate", points: 10 },
    { id: `${prefix}-aso-shallow`, label: "Shallow", points: 5 },
    { id: `${prefix}-aso-overloaded`, label: "Overloaded", points: 0 }
];

const makeClearPartiallyUnclear = (prefix) => [
    { id: `${prefix}-cpu-clear`, label: "Clear", points: 10 },
    { id: `${prefix}-cpu-partial`, label: "Partially clear", points: 5 },
    { id: `${prefix}-cpu-unclear`, label: "Unclear", points: 0 }
];

const makeConfidentNeedsSupportAvoided = (prefix) => [
    { id: `${prefix}-cna-confident`, label: "Confident", points: 10 },
    { id: `${prefix}-cna-support`, label: "Needs support", points: 5 },
    { id: `${prefix}-cna-avoided`, label: "Avoided", points: 0 }
];

const makeYesPartiallyNo = (prefix) => [
    { id: `${prefix}-ypn-yes`, label: "Yes", points: 10 },
    { id: `${prefix}-ypn-partial`, label: "Partially", points: 5 },
    { id: `${prefix}-ypn-no`, label: "No", points: 0 }
];

const makeEffectiveLimitedNone = (prefix) => [
    { id: `${prefix}-eln-effective`, label: "Effective", points: 10 },
    { id: `${prefix}-eln-limited`, label: "Limited", points: 5 },
    { id: `${prefix}-eln-none`, label: "None", points: 0 }
];

const makeStrongOccasionalNotEvident = (prefix) => [
    { id: `${prefix}-sone-strong`, label: "Strong", points: 10 },
    { id: `${prefix}-sone-occasional`, label: "Occasional", points: 5 },
    { id: `${prefix}-sone-not`, label: "Not evident", points: 0 }
];

const makeEvidentLimitedNotPlanned = (prefix) => [
    { id: `${prefix}-elnp-evident`, label: "Evident", points: 10 },
    { id: `${prefix}-elnp-limited`, label: "Limited", points: 5 },
    { id: `${prefix}-elnp-not`, label: "Not planned", points: 0 }
];

const makeVeryClearAdequateNeedsSupport = (prefix) => [
    { id: `${prefix}-vcans-very`, label: "Very Clear", points: 10 },
    { id: `${prefix}-vcans-adequate`, label: "Adequate", points: 5 },
    { id: `${prefix}-vcans-needs`, label: "Needs Support", points: 0 }
];

const makeEffectivePartialNotUsed = (prefix) => [
    { id: `${prefix}-epnu-effective`, label: "Effective", points: 10 },
    { id: `${prefix}-epnu-partial`, label: "Partial", points: 5 },
    { id: `${prefix}-epnu-not`, label: "Not Used", points: 0 }
];

const makeStructuredSomewhatUnclear = (prefix) => [
    { id: `${prefix}-ssu-structured`, label: "Structured", points: 10 },
    { id: `${prefix}-ssu-somewhat`, label: "Somewhat Structured", points: 5 },
    { id: `${prefix}-ssu-unclear`, label: "Unclear", points: 0 }
];

const makeWellIntegratedLimitedNotEvident = (prefix) => [
    { id: `${prefix}-wilne-well`, label: "Well Integrated", points: 10 },
    { id: `${prefix}-wilne-limited`, label: "Limited", points: 5 },
    { id: `${prefix}-wilne-not`, label: "Not Evident", points: 0 }
];

const makeStrongOccasionalAbsent = (prefix) => [
    { id: `${prefix}-soa-strong`, label: "Strong", points: 10 },
    { id: `${prefix}-soa-occasional`, label: "Occasional", points: 5 },
    { id: `${prefix}-soa-absent`, label: "Absent", points: 0 }
];

const makeRelevantLimitedNotUsed = (prefix) => [
    { id: `${prefix}-rlnu-relevant`, label: "Relevant", points: 10 },
    { id: `${prefix}-rlnu-limited`, label: "Limited", points: 5 },
    { id: `${prefix}-rlnu-not`, label: "Not Used", points: 0 }
];

const makeAccurateMinorNeedsImprovement = (prefix) => [
    { id: `${prefix}-amni-accurate`, label: "Accurate", points: 10 },
    { id: `${prefix}-amni-minor`, label: "Minor Errors", points: 5 },
    { id: `${prefix}-amni-needs`, label: "Needs Improvement", points: 0 }
];

const makeClearSomewhatNotEvident = (prefix) => [
    { id: `${prefix}-csne-clear`, label: "Clear", points: 10 },
    { id: `${prefix}-csne-somewhat`, label: "Somewhat Clear", points: 5 },
    { id: `${prefix}-csne-not`, label: "Not Evident", points: 0 }
];

const makeStrongOccasionalNotLinked = (prefix) => [
    { id: `${prefix}-sonl-strong`, label: "Strong", points: 10 },
    { id: `${prefix}-sonl-occasional`, label: "Occasional", points: 5 },
    { id: `${prefix}-sonl-not`, label: "Not Linked", points: 0 }
];

const makeWellAddressedLimitedNotAddressed = (prefix) => [
    { id: `${prefix}-walna-well`, label: "Well Addressed", points: 10 },
    { id: `${prefix}-walna-limited`, label: "Limited", points: 5 },
    { id: `${prefix}-walna-not`, label: "Not Addressed", points: 0 }
];

const makeClearPartialWeak = (prefix) => [
    { id: `${prefix}-cpw-clear`, label: "Clear", points: 10 },
    { id: `${prefix}-cpw-partial`, label: "Partial", points: 5 },
    { id: `${prefix}-cpw-weak`, label: "Weak", points: 0 }
];

const makeActiveOccasionalAbsent = (prefix) => [
    { id: `${prefix}-aoa-active`, label: "Active", points: 10 },
    { id: `${prefix}-aoa-occasional`, label: "Occasional", points: 5 },
    { id: `${prefix}-aoa-absent`, label: "Absent", points: 0 }
];

const makeStrongDevelopingNeedsSupport = (prefix) => [
    { id: `${prefix}-sdns-strong`, label: "Strong", points: 10 },
    { id: `${prefix}-sdns-developing`, label: "Developing", points: 5 },
    { id: `${prefix}-sdns-needs`, label: "Needs Support", points: 0 }
];

const makeHighModerateLow = (prefix) => [
    { id: `${prefix}-hml-high`, label: "High", points: 10 },
    { id: `${prefix}-hml-moderate`, label: "Moderate", points: 5 },
    { id: `${prefix}-hml-low`, label: "Low", points: 0 }
];

const makeSafePartiallyNeedsAttention = (prefix) => [
    { id: `${prefix}-spna-safe`, label: "Safe", points: 10 },
    { id: `${prefix}-spna-partial`, label: "Partially safe", points: 5 },
    { id: `${prefix}-spna-needs`, label: "Needs attention", points: 0 }
];

const makeProbingBasicRecall = (prefix) => [
    { id: `${prefix}-pbr-probing`, label: "Probing", points: 10 },
    { id: `${prefix}-pbr-basic`, label: "Basic", points: 5 },
    { id: `${prefix}-pbr-recall`, label: "Recall-based", points: 0 }
];

const makePositiveNeutralNeedsImprovement = (prefix) => [
    { id: `${prefix}-pnni-positive`, label: "Positive", points: 10 },
    { id: `${prefix}-pnni-neutral`, label: "Neutral", points: 5 },
    { id: `${prefix}-pnni-needs`, label: "Needs improvement", points: 0 }
];

const makeFrequentOccasionalNone = (prefix) => [
    { id: `${prefix}-fon-frequent`, label: "Frequent", points: 10 },
    { id: `${prefix}-fon-occasional`, label: "Occasional", points: 5 },
    { id: `${prefix}-fon-none`, label: "None", points: 0 }
];

const makeBoardMixedWeak = (prefix) => [
    { id: `${prefix}-bmw-board`, label: "Board-oriented", points: 10 },
    { id: `${prefix}-bmw-mixed`, label: "Mixed", points: 5 },
    { id: `${prefix}-bmw-weak`, label: "Weak", points: 0 }
];

const makeConstructiveGeneralNotProvided = (prefix) => [
    { id: `${prefix}-cgnp-constructive`, label: "Constructive", points: 10 },
    { id: `${prefix}-cgnp-general`, label: "General", points: 5 },
    { id: `${prefix}-cgnp-not`, label: "Not provided", points: 0 }
];

const makeStrongPartialMissing = (prefix) => [
    { id: `${prefix}-spm-strong`, label: "Strong", points: 10 },
    { id: `${prefix}-spm-partial`, label: "Partial", points: 5 },
    { id: `${prefix}-spm-missing`, label: "Missing", points: 0 }
];

const makeClearExplicitPartialNotProvided = (prefix) => [
    { id: `${prefix}-cepn-clear`, label: "Clear & Explicit", points: 10 },
    { id: `${prefix}-cepn-partial`, label: "Partial", points: 5 },
    { id: `${prefix}-cepn-not`, label: "Not Provided", points: 0 }
];

const makeConsistentOccasionalNotEmphasised = (prefix) => [
    { id: `${prefix}-cone-consistent`, label: "Consistent", points: 10 },
    { id: `${prefix}-cone-occasional`, label: "Occasional", points: 5 },
    { id: `${prefix}-cone-not`, label: "Not Emphasised", points: 0 }
];

const makeClearlyBrieflyNotDiscussed = (prefix) => [
    { id: `${prefix}-cbnd-clearly`, label: "Clearly Addressed", points: 10 },
    { id: `${prefix}-cbnd-briefly`, label: "Briefly Mentioned", points: 5 },
    { id: `${prefix}-cbnd-not`, label: "Not Discussed", points: 0 }
];

const makeEffectiveAverageWeak = (prefix) => [
    { id: `${prefix}-eaw-effective`, label: "Effective", points: 10 },
    { id: `${prefix}-eaw-average`, label: "Average", points: 5 },
    { id: `${prefix}-eaw-weak`, label: "Weak", points: 0 }
];

const makeWellPreparedAdequateUnprepared = (prefix) => [
    { id: `${prefix}-wpau-well`, label: "Well-prepared", points: 10 },
    { id: `${prefix}-wpau-adequate`, label: "Adequate", points: 5 },
    { id: `${prefix}-wpau-unprepared`, label: "Unprepared", points: 0 }
];

const makeClearRespectfulNeedsRefinement = (prefix) => [
    { id: `${prefix}-crn-clear`, label: "Clear, respectful and confident", points: 10 },
    { id: `${prefix}-crn-adequate`, label: "Adequate but needs refinement", points: 5 },
    { id: `${prefix}-crn-significant`, label: "Needs significant improvement", points: 0 }
];

const makeCalmReactiveIneffective = (prefix) => [
    { id: `${prefix}-cri-calm`, label: "Calm and focused", points: 10 },
    { id: `${prefix}-cri-reactive`, label: "Occasionally reactive", points: 5 },
    { id: `${prefix}-cri-ineffective`, label: "Ineffective", points: 0 }
];

const makeCoreValuesItems = (prefix) => [
    { id: `item-${prefix}-cv-1`, title: "Punctuality & Attendance", description: "Consistent adherence to scheduled timings and duties", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 1, choices: makeScale1to10(`${prefix}-cv-1`) },
    { id: `item-${prefix}-cv-2`, title: "Discipline & Professional Conduct", description: "Respectful behaviour with peers, students and management", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 2, choices: makeScale1to10(`${prefix}-cv-2`) },
    { id: `item-${prefix}-cv-3`, title: "Honesty & Integrity", description: "Transparency and ethical conduct in all responsibilities", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 3, choices: makeScale1to10(`${prefix}-cv-3`) },
    { id: `item-${prefix}-cv-4`, title: "Teamwork & Collaboration", description: "Cooperative attitude and support for colleagues", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 4, choices: makeScale1to10(`${prefix}-cv-4`) },
    { id: `item-${prefix}-cv-5`, title: "Commitment & Dedication", description: "Willingness to go beyond minimum requirements", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 5, choices: makeScale1to10(`${prefix}-cv-5`) },
    { id: `item-${prefix}-cv-6`, title: "Adherence to Institutional Policies", description: "Follows guidelines and procedures consistently", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 6, choices: makeScale1to10(`${prefix}-cv-6`) },
    { id: `item-${prefix}-cv-7`, title: "Communication Skills", description: "Clarity and effectiveness in verbal and written communication", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 7, choices: makeScale1to10(`${prefix}-cv-7`) },
    { id: `item-${prefix}-cv-8`, title: "Appearance & Conduct", description: "Presentable, professional and appropriate at all times", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 8, choices: makeScale1to10(`${prefix}-cv-8`) },
    { id: `item-${prefix}-cv-9`, title: "Initiative & Problem-Solving", description: "Proactively identifies challenges and drives solutions", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 9, choices: makeScale1to10(`${prefix}-cv-9`) },
    { id: `item-${prefix}-cv-10`, title: "Respect & Inclusivity", description: "Treats all stakeholders with courtesy, empathy and fairness", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 10, choices: makeScale1to10(`${prefix}-cv-10`) }
];

const makeTeachingCompetencies = (prefix) => [
    { id: `item-${prefix}-comp-1`, title: "Subject Knowledge & Mastery", description: "Depth, accuracy and currency of content knowledge", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 1, choices: makeScale1to10(`${prefix}-comp-1`) },
    { id: `item-${prefix}-comp-2`, title: "Lesson Planning & Preparation", description: "Quality of lesson plans, objectives, pacing and materials", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 2, choices: makeScale1to10(`${prefix}-comp-2`) },
    { id: `item-${prefix}-comp-3`, title: "Teaching Methodology & Delivery", description: "Variety and effectiveness of instructional approaches", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 3, choices: makeScale1to10(`${prefix}-comp-3`) },
    { id: `item-${prefix}-comp-4`, title: "Classroom Management", description: "Maintaining an orderly, respectful and productive learning environment", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 4, choices: makeScale1to10(`${prefix}-comp-4`) },
    { id: `item-${prefix}-comp-5`, title: "Student Engagement & Participation", description: "Ability to motivate and involve all learners actively", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 5, choices: makeScale1to10(`${prefix}-comp-5`) },
    { id: `item-${prefix}-comp-6`, title: "Use of Technology & Teaching Aids", description: "Effective use of digital tools, AV resources and smart boards", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 6, choices: makeScale1to10(`${prefix}-comp-6`) },
    { id: `item-${prefix}-comp-7`, title: "Assessment & Evaluation", description: "Quality, frequency and alignment of formative and summative assessments", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 7, choices: makeScale1to10(`${prefix}-comp-7`) },
    { id: `item-${prefix}-comp-8`, title: "Feedback & Remediation", description: "Timely, constructive feedback and targeted support for learners who need it", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 8, choices: makeScale1to10(`${prefix}-comp-8`) },
    { id: `item-${prefix}-comp-9`, title: "Record Keeping", description: "Maintenance of attendance registers, mark sheets and progress records", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 9, choices: makeScale1to10(`${prefix}-comp-9`) },
    { id: `item-${prefix}-comp-10`, title: "Family & Community Engagement", description: "Regular and meaningful communication with parents/guardians", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 10, choices: makeScale1to10(`${prefix}-comp-10`) }
];

const makeActivityCompetencies = (prefix) => [
    { id: `item-${prefix}-comp-1`, title: "Domain Expertise", description: "Demonstrated skill and current knowledge in the activity area", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 1, choices: makeScale1to10(`${prefix}-comp-1`) },
    { id: `item-${prefix}-comp-2`, title: "Activity Planning & Structuring", description: "Well-sequenced, age-appropriate and curriculum-linked sessions", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 2, choices: makeScale1to10(`${prefix}-comp-2`) },
    { id: `item-${prefix}-comp-3`, title: "Student Safety & Supervision", description: "Ensuring physical and emotional safety of all participants at all times", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 3, choices: makeScale1to10(`${prefix}-comp-3`) },
    { id: `item-${prefix}-comp-4`, title: "Inclusive Participation", description: "Motivating and engaging learners across all ability levels", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 4, choices: makeScale1to10(`${prefix}-comp-4`) },
    { id: `item-${prefix}-comp-5`, title: "Equipment & Resource Management", description: "Proper care, maintenance and responsible use of materials", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 5, choices: makeScale1to10(`${prefix}-comp-5`) },
    { id: `item-${prefix}-comp-6`, title: "Event & Competition Preparation", description: "Supporting organisation of inter-group and external competitions", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 6, choices: makeScale1to10(`${prefix}-comp-6`) },
    { id: `item-${prefix}-comp-7`, title: "Progress Monitoring", description: "Tracking individual development, skill growth and improvement over time", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 7, choices: makeScale1to10(`${prefix}-comp-7`) },
    { id: `item-${prefix}-comp-8`, title: "Curriculum Integration", description: "Aligning activities purposefully with broader academic and institutional goals", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 8, choices: makeScale1to10(`${prefix}-comp-8`) },
    { id: `item-${prefix}-comp-9`, title: "Documentation & Reporting", description: "Maintaining attendance logs, progress notes and activity records", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 9, choices: makeScale1to10(`${prefix}-comp-9`) },
    { id: `item-${prefix}-comp-10`, title: "Student Motivation & Morale", description: "Creating a positive, encouraging and growth-oriented environment", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 10, choices: makeScale1to10(`${prefix}-comp-10`) }
];

const makeAdministrativeCompetencies = (prefix) => [
    { id: `item-${prefix}-comp-1`, title: "Accuracy & Attention to Detail", description: "Precision in official documents, records and data entry", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 1, choices: makeScale1to10(`${prefix}-comp-1`) },
    { id: `item-${prefix}-comp-2`, title: "Work Output & Efficiency", description: "Timely completion of assigned tasks within quality expectations", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 2, choices: makeScale1to10(`${prefix}-comp-2`) },
    { id: `item-${prefix}-comp-3`, title: "File & Document Management", description: "Systematic organisation and retrieval of physical and digital records", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 3, choices: makeScale1to10(`${prefix}-comp-3`) },
    { id: `item-${prefix}-comp-4`, title: "IT & Digital Proficiency", description: "Working knowledge of relevant software, tools and digital systems", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 4, choices: makeScale1to10(`${prefix}-comp-4`) },
    { id: `item-${prefix}-comp-5`, title: "Interdepartmental Coordination", description: "Smooth liaison and effective follow-through across teams", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 5, choices: makeScale1to10(`${prefix}-comp-5`) },
    { id: `item-${prefix}-comp-6`, title: "Correspondence Handling", description: "Professional drafting and dispatch of letters, emails and notices", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 6, choices: makeScale1to10(`${prefix}-comp-6`) },
    { id: `item-${prefix}-comp-7`, title: "Stakeholder Handling", description: "Courteous, efficient and professional interaction with visitors and families", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 7, choices: makeScale1to10(`${prefix}-comp-7`) },
    { id: `item-${prefix}-comp-8`, title: "Confidentiality & Data Security", description: "Strict adherence to privacy standards for sensitive information", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 8, choices: makeScale1to10(`${prefix}-comp-8`) },
    { id: `item-${prefix}-comp-9`, title: "Resilience Under Pressure", description: "Maintaining performance quality during peak periods and deadlines", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 9, choices: makeScale1to10(`${prefix}-comp-9`) },
    { id: `item-${prefix}-comp-10`, title: "Support to Leadership", description: "Proactive assistance and responsiveness to management needs", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 10, choices: makeScale1to10(`${prefix}-comp-10`) }
];

const makeFinanceCompetencies = (prefix) => [
    { id: `item-${prefix}-comp-1`, title: "Accounting Knowledge", description: "Proficiency in accounting principles and financial procedures", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 1, choices: makeScale1to10(`${prefix}-comp-1`) },
    { id: `item-${prefix}-comp-2`, title: "Fee / Revenue Processing", description: "Accurate and timely handling of payments, receipts and dues", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 2, choices: makeScale1to10(`${prefix}-comp-2`) },
    { id: `item-${prefix}-comp-3`, title: "Ledger & Bookkeeping Accuracy", description: "Correctness and currency of all financial records", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 3, choices: makeScale1to10(`${prefix}-comp-3`) },
    { id: `item-${prefix}-comp-4`, title: "Budget Tracking & Reporting", description: "Monitoring expenditures and producing financial summaries", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 4, choices: makeScale1to10(`${prefix}-comp-4`) },
    { id: `item-${prefix}-comp-5`, title: "Regulatory Compliance", description: "Adherence to applicable tax, statutory and audit requirements", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 5, choices: makeScale1to10(`${prefix}-comp-5`) },
    { id: `item-${prefix}-comp-6`, title: "Vendor & Supplier Management", description: "Timely and accurate processing of invoices and payments", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 6, choices: makeScale1to10(`${prefix}-comp-6`) },
    { id: `item-${prefix}-comp-7`, title: "Payroll Management", description: "Accuracy and punctuality in salary preparation and disbursement", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 7, choices: makeScale1to10(`${prefix}-comp-7`) },
    { id: `item-${prefix}-comp-8`, title: "Audit Readiness", description: "Maintenance of records in a state ready for internal and external audit", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 8, choices: makeScale1to10(`${prefix}-comp-8`) },
    { id: `item-${prefix}-comp-9`, title: "Financial Software Proficiency", description: "Effective use of accounting or ERP software", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 9, choices: makeScale1to10(`${prefix}-comp-9`) },
    { id: `item-${prefix}-comp-10`, title: "Confidentiality of Financial Data", description: "Strict adherence to financial privacy and information security", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 10, choices: makeScale1to10(`${prefix}-comp-10`) }
];

const makeCommunicationsCompetencies = (prefix) => [
    { id: `item-${prefix}-comp-1`, title: "Institutional Image Building", description: "Representing and promoting the institution positively", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 1, choices: makeScale1to10(`${prefix}-comp-1`) },
    { id: `item-${prefix}-comp-2`, title: "Community & Parent Engagement", description: "Building and maintaining productive stakeholder relationships", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 2, choices: makeScale1to10(`${prefix}-comp-2`) },
    { id: `item-${prefix}-comp-3`, title: "Media & Press Relations", description: "Professional management of media interactions and coverage", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 3, choices: makeScale1to10(`${prefix}-comp-3`) },
    { id: `item-${prefix}-comp-4`, title: "Digital & Social Media Management", description: "Managing the institution's online presence and communications", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 4, choices: makeScale1to10(`${prefix}-comp-4`) },
    { id: `item-${prefix}-comp-5`, title: "Event Coordination", description: "Planning, organising and executing institutional events and functions", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 5, choices: makeScale1to10(`${prefix}-comp-5`) },
    { id: `item-${prefix}-comp-6`, title: "Marketing & Admissions Support", description: "Contributing to enrolment growth and institutional branding", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 6, choices: makeScale1to10(`${prefix}-comp-6`) },
    { id: `item-${prefix}-comp-7`, title: "Content Creation & Publications", description: "Quality and regularity of newsletters, bulletins and updates", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 7, choices: makeScale1to10(`${prefix}-comp-7`) },
    { id: `item-${prefix}-comp-8`, title: "Crisis & Complaints Management", description: "Calm, professional handling of issues, escalations and concerns", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 8, choices: makeScale1to10(`${prefix}-comp-8`) },
    { id: `item-${prefix}-comp-9`, title: "Internal Coordination", description: "Seamless communication and liaison between departments and teams", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 9, choices: makeScale1to10(`${prefix}-comp-9`) },
    { id: `item-${prefix}-comp-10`, title: "Brand Consistency", description: "Ensuring all communications align with institutional identity and values", item_type: "choice", display_style: "stars", allow_remarks: true, weight: 1.00, sort_order: 10, choices: makeScale1to10(`${prefix}-comp-10`) }
];


const DEFAULT_SEED_DATA = {
    classes: ["Nursery", "LKG", "UKG", "Grade I", "Grade II", "Grade III", "Grade IV", "Grade V", "Grade VI", "Grade VII", "Grade VIII", "Grade IX", "Grade X", "Grade XI", "Grade XII"],
    sections: ["A", "B", "C", "D"],
    sessions: [
        { id: "sess-2024-25", name: "2024-25" },
        { id: "sess-2025-26", name: "2025-26" }
    ],
    activeSessionId: "sess-2025-26",
    tenant: {
        id: "tenant-bhusk-east-110",
        name: "Demo Public School (East Campus)",
        domain: "east.bhusku.edu",
        logo: "",
        address: "123 Academic Way, East District",
        contact_phone: "+1 (555) 019-2834",
        contact_email: "info@demoschool.edu"
    },
    
    roles: [
        { id: "tenant_admin", name: "Admin", permissions: ["user:view", "rubric:manage", "template:create", "assessment:observe", "assessment:view_own", "growth:manage_own", "reports:view", "ai:view", "settings:manage"] },
        { id: "school_leader", name: "Principal", permissions: ["rubric:manage", "template:create", "assessment:observe", "assessment:view_own", "growth:manage_own", "reports:view", "ai:view"] },
        { id: "dept_head", name: "Coordinator", permissions: ["rubric:manage", "template:create", "assessment:observe", "assessment:view_own", "growth:manage_own", "reports:view"] },
        { id: "staff_member", name: "Teacher", permissions: ["assessment:view_own", "growth:manage_own"] },
        { id: "activity_teacher", name: "Activity Teacher", permissions: ["assessment:view_own", "growth:manage_own"] },
        { id: "office_staff", name: "Office Assistant", permissions: ["assessment:view_own", "growth:manage_own"] },
        { id: "pro_staff", name: "PRO", permissions: ["assessment:view_own", "growth:manage_own"] },
        { id: "accounts_staff", name: "Accounts Officer", permissions: ["assessment:view_own", "growth:manage_own"] }
    ],
    
    departments: [
        { id: "dept-acad", name: "Academic Council", code: "DEPT-ACAD", parent_id: null, manager_id: "user-jenkins" },
        { id: "dept-teach", name: "Teaching Faculty", code: "DEPT-TEACH", parent_id: "dept-acad", manager_id: "user-skinner" },
        { id: "dept-admin", name: "Administration & Accounts", code: "DEPT-ADMIN", parent_id: null, manager_id: "user-vance" },
        { id: "dept-supp", name: "Operations & Support Services", code: "DEPT-SUPP", parent_id: null, manager_id: "user-cooper" },
        { id: "dept-activities", name: "Activities Department", code: "DEPT-ACT", parent_id: "dept-acad", manager_id: "user-skinner" },
        { id: "dept-pr", name: "Public Relations", code: "DEPT-PR", parent_id: "dept-admin", manager_id: "user-vance" }
    ],
    
    users: [
        { id: "user-jenkins", email: "sarah.jenkins@bhusk.edu", first_name: "Sarah", last_name: "Jenkins", role: "tenant_admin", dept_id: "dept-acad", avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150", status: "active" },
        { id: "user-skinner", email: "principal.skinner@bhusk.edu", first_name: "Seymour", last_name: "Skinner", role: "school_leader", dept_id: "dept-teach", avatar: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150", status: "active" },
        { id: "user-vance", email: "janet.vance@bhusk.edu", first_name: "Janet", last_name: "Vance", role: "dept_head", dept_id: "dept-admin", avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150", status: "active" },
        { id: "user-cooper", email: "alice.cooper@bhusk.edu", first_name: "Alice", last_name: "Cooper", role: "staff_member", dept_id: "dept-teach", avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150", status: "active", assigned_class: "Grade II", assigned_section: "A" },
        { id: "user-dylan", email: "bob.dylan@bhusk.edu", first_name: "Bob", last_name: "Dylan", role: "office_staff", dept_id: "dept-supp", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150", status: "active" },
        { id: "user-miller", email: "marcus.miller@bhusk.edu", first_name: "Marcus", last_name: "Miller", role: "pro_staff", dept_id: "dept-pr", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150", status: "active" },
        { id: "user-charlie", email: "charlie.parker@bhusk.edu", first_name: "Charlie", last_name: "Parker", role: "accounts_staff", dept_id: "dept-admin", avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150", status: "active" },
        { id: "user-miles", email: "miles.davis@bhusk.edu", first_name: "Miles", last_name: "Davis", role: "activity_teacher", dept_id: "dept-activities", avatar: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150", status: "active", assigned_class: "Grade V", assigned_section: "B" },
        { id: "user-lennon", email: "john.lennon@bhusk.edu", first_name: "John", last_name: "Lennon", role: "staff_member", dept_id: "dept-teach", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150", status: "active", assigned_class: "Grade I", assigned_section: "A" },
        { id: "user-mccartney", email: "paul.mccartney@bhusk.edu", first_name: "Paul", last_name: "McCartney", role: "staff_member", dept_id: "dept-teach", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150", status: "active", assigned_class: "Grade I", assigned_section: "B" },
        { id: "user-harrison", email: "george.harrison@bhusk.edu", first_name: "George", last_name: "Harrison", role: "staff_member", dept_id: "dept-teach", avatar: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150", status: "active", assigned_class: "Grade II", assigned_section: "A" },
        { id: "user-starr", email: "ringo.starr@bhusk.edu", first_name: "Ringo", last_name: "Starr", role: "staff_member", dept_id: "dept-teach", avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150", status: "active", assigned_class: "Grade II", assigned_section: "B" }
    ],
    
    rating_scales: [],
    rubrics: [],
    
    templates: [
        {
            id: "tmpl-teaching-appraisal",
            name: "Form 1 - Teaching Staff Performance Appraisal",
            description: "For all classroom teachers, subject teachers and tutors.",
            category: "teaching",
            version: 1,
            status: "published",
            sections: [
                {
                    id: "sec-ta-1",
                    title: "SECTION A - CORE VALUES",
                    weight: 1.00,
                    sort_order: 1,
                    items: makeCoreValuesItems("ta")
                },
                {
                    id: "sec-ta-2",
                    title: "SECTION B - TEACHING COMPETENCIES",
                    weight: 1.00,
                    sort_order: 2,
                    items: makeTeachingCompetencies("ta")
                }
            ]
        },
        {
            id: "tmpl-activities-appraisal",
            name: "Form 2 - Activity / CCA Teacher Performance Appraisal",
            description: "For Sports, Arts, Music, Dance, Drama, Library, Labs and Co-Curricular Activity Teachers.",
            category: "support",
            version: 1,
            status: "published",
            sections: [
                {
                    id: "sec-act-1",
                    title: "SECTION A - CORE VALUES",
                    weight: 1.00,
                    sort_order: 1,
                    items: makeCoreValuesItems("act")
                },
                {
                    id: "sec-act-2",
                    title: "SECTION B - ACTIVITY TEACHING COMPETENCIES",
                    weight: 1.00,
                    sort_order: 2,
                    items: makeActivityCompetencies("act")
                }
            ]
        },
        {
            id: "tmpl-office-appraisal",
            name: "Form 3 - Administrative / Office Staff Performance Appraisal",
            description: "For Administrative Officers, Receptionists, Office Assistants and Support Staff.",
            category: "administrative",
            version: 1,
            status: "published",
            sections: [
                {
                    id: "sec-off-1",
                    title: "SECTION A - CORE VALUES",
                    weight: 1.00,
                    sort_order: 1,
                    items: makeCoreValuesItems("off")
                },
                {
                    id: "sec-off-2",
                    title: "SECTION B - ADMINISTRATIVE COMPETENCIES",
                    weight: 1.00,
                    sort_order: 2,
                    items: makeAdministrativeCompetencies("off")
                }
            ]
        },
        {
            id: "tmpl-accounts-appraisal",
            name: "Form 4 - Finance / Accounts Staff Performance Appraisal",
            description: "For Accountants, Finance Officers and Accounts Assistants.",
            category: "administrative",
            version: 1,
            status: "published",
            sections: [
                {
                    id: "sec-acc-1",
                    title: "SECTION A - CORE VALUES",
                    weight: 1.00,
                    sort_order: 1,
                    items: makeCoreValuesItems("acc")
                },
                {
                    id: "sec-acc-2",
                    title: "SECTION B - FINANCE & ACCOUNTS COMPETENCIES",
                    weight: 1.00,
                    sort_order: 2,
                    items: makeFinanceCompetencies("acc")
                }
            ]
        },
        {
            id: "tmpl-pro-appraisal",
            name: "Form 5 - Communications / Public Relations Staff Performance Appraisal",
            description: "For PRO Officers, Marketing Staff, Communications Coordinators and Media Managers.",
            category: "administrative",
            version: 1,
            status: "published",
            sections: [
                {
                    id: "sec-pro-1",
                    title: "SECTION A - CORE VALUES",
                    weight: 1.00,
                    sort_order: 1,
                    items: makeCoreValuesItems("pro")
                },
                {
                    id: "sec-pro-2",
                    title: "SECTION B - COMMUNICATIONS & PR COMPETENCIES",
                    weight: 1.00,
                    sort_order: 2,
                    items: makeCommunicationsCompetencies("pro")
                }
            ]
        },
        {
            id: "tmpl-nursery-grade-v",
            name: "Form 6 - Classroom Observation Report (Junior)",
            description: "Nursery / Pre-Primary to Grade 5 (or equivalent).",
            category: "academic",
            version: 1,
            status: "published",
            sections: [
                {
                    id: "sec-nv-1",
                    title: "OBSERVATION CRITERIA",
                    weight: 1.00,
                    sort_order: 1,
                    items: [
                        { id: "item-nv-1", title: "Learning Environment Setup", description: "Classroom displays, word walls or visual aids are relevant, current and actively used by learners", item_type: "choice", display_style: "pills", allow_remarks: true, weight: 1.00, sort_order: 1, choices: [
                            { id: "opt-nv-1-1", label: "Relevant, displayed and students actively use them", points: 10 },
                            { id: "opt-nv-1-2", label: "Displayed and relevant; students not observed using them", points: 7 },
                            { id: "opt-nv-1-3", label: "Displayed but not relevant to current learning", points: 4 },
                            { id: "opt-nv-1-4", label: "Not displayed", points: 0 }
                        ]},
                        { id: "item-nv-2", title: "Emotional Safety", description: "Interactions between teacher and students, and among peers, foster a safe and positive environment", item_type: "choice", display_style: "pills", allow_remarks: true, weight: 1.00, sort_order: 2, choices: [
                            { id: "opt-nv-2-1", label: "Consistent assertive and affirming communication", points: 10 },
                            { id: "opt-nv-2-2", label: "Occasional encouragement; mostly neutral", points: 7 },
                            { id: "opt-nv-2-3", label: "Neutral; no affirming or discouraging evidence", points: 4 },
                            { id: "opt-nv-2-4", label: "Use of threats, shouting or inappropriate physical contact", points: 0 }
                        ]},
                        { id: "item-nv-3", title: "Classroom Routines", description: "Established routines are in place and support smooth classroom management", item_type: "choice", display_style: "pills", allow_remarks: true, weight: 1.00, sort_order: 3, choices: [
                            { id: "opt-nv-3-1", label: "Routines embedded; often led/reminded by students", points: 10 },
                            { id: "opt-nv-3-2", label: "Routines followed; primarily teacher-driven", points: 7 },
                            { id: "opt-nv-3-3", label: "Some routines evident", points: 4 },
                            { id: "opt-nv-3-4", label: "No routines observed", points: 0 }
                        ]},
                        { id: "item-nv-4", title: "Student Engagement", description: "Proportion of students actively engaged in classroom activities at time of observation", item_type: "choice", display_style: "pills", allow_remarks: true, weight: 1.00, sort_order: 4, choices: [
                            { id: "opt-nv-4-1", label: "More than 80% actively engaged", points: 10 },
                            { id: "opt-nv-4-2", label: "50–80% actively engaged", points: 7 },
                            { id: "opt-nv-4-3", label: "20–50% actively engaged", points: 4 },
                            { id: "opt-nv-4-4", label: "Fewer than 20% engaged / widespread distraction", points: 0 }
                        ]},
                        { id: "item-nv-5", title: "Pedagogy & Lesson Structure", description: "Lesson follows a clear sequence aligned to stated expected learning outcomes (ELOs)", item_type: "choice", display_style: "pills", allow_remarks: true, weight: 1.00, sort_order: 5, choices: [
                            { id: "opt-nv-5-1", label: "All steps followed; clear evidence of ELO attainment by most", points: 10 },
                            { id: "opt-nv-5-2", label: "Steps followed; ELO attainment evident in only a few", points: 7 },
                            { id: "opt-nv-5-3", label: "Some steps followed; ELO partially achieved", points: 4 },
                            { id: "opt-nv-5-4", label: "Steps not followed; ELO not achieved", points: 0 }
                        ]},
                        { id: "item-nv-6", title: "Instruction Clarity", description: "Instructions given are clear, specific and checked for student understanding", item_type: "choice", display_style: "pills", allow_remarks: true, weight: 1.00, sort_order: 6, choices: [
                            { id: "opt-nv-6-1", label: "Instructions clear; understanding checked and clarified", points: 10 },
                            { id: "opt-nv-6-2", label: "Instructions clear; understanding checked but not clarified", points: 7 },
                            { id: "opt-nv-6-3", label: "Instructions given to class; understanding not verified", points: 4 },
                            { id: "opt-nv-6-4", label: "Instructions unclear or not given", points: 0 }
                        ]},
                        { id: "item-nv-7", title: "Questioning & Inquiry", description: "Teacher uses relevant, level-appropriate questions to promote thinking and engage learners", item_type: "choice", display_style: "pills", allow_remarks: true, weight: 1.00, sort_order: 7, choices: [
                            { id: "opt-nv-7-1", label: "Relevant questions; most/all students engaged in responding", points: 10 },
                            { id: "opt-nv-7-2", label: "Questions relevant; only a few students responding", points: 7 },
                            { id: "opt-nv-7-3", label: "Questions posed but not appropriate for the level", points: 4 },
                            { id: "opt-nv-7-4", label: "No questions asked; teacher-led explanation only", points: 0 }
                        ]},
                        { id: "item-nv-8", title: "Collaborative / Group Learning", description: "Cooperative or group learning strategies are implemented effectively", item_type: "choice", display_style: "pills", allow_remarks: true, weight: 1.00, sort_order: 8, choices: [
                            { id: "opt-nv-8-1", label: "Group norms reinforced; all teams monitored and on task", points: 10 },
                            { id: "opt-nv-8-2", label: "Group steps followed; monitoring limited", points: 7 },
                            { id: "opt-nv-8-3", label: "Some cooperative elements followed", points: 4 },
                            { id: "opt-nv-8-4", label: "Cooperative learning not implemented", points: 0 }
                        ]},
                        { id: "item-nv-9", title: "Learning Outcomes Awareness", description: "Expected learning outcomes are communicated to students and revisited during/after the lesson", item_type: "choice", display_style: "pills", allow_remarks: true, weight: 1.00, sort_order: 9, choices: [
                            { id: "opt-nv-9-1", label: "Stated, displayed and consolidated with students", points: 10 },
                            { id: "opt-nv-9-2", label: "Stated or displayed during lesson", points: 7 },
                            { id: "opt-nv-9-3", label: "Not communicated; teacher could state on request", points: 4 },
                            { id: "opt-nv-9-4", label: "Not communicated; teacher unable to articulate on request", points: 0 }
                        ]},
                        { id: "item-nv-10", title: "Formative Assessment", description: "Teacher monitors student work and provides feedback or prompts to guide learning", item_type: "choice", display_style: "pills", allow_remarks: true, weight: 1.00, sort_order: 10, choices: [
                            { id: "opt-nv-10-1", label: "Circulates; gives specific feedback to individuals or groups", points: 10 },
                            { id: "opt-nv-10-2", label: "Circulates; gives correct answers instead of feedback", points: 7 },
                            { id: "opt-nv-10-3", label: "Circulates; no feedback or corrective action taken", points: 4 },
                            { id: "opt-nv-10-4", label: "Does not observe student work during the session", points: 0 }
                        ]},
                        { id: "item-nv-11", title: "Variety in Student Response", description: "Students demonstrate varied responses in written deliverables, indicating individual thinking", item_type: "choice", display_style: "pills", allow_remarks: true, weight: 1.00, sort_order: 11, choices: [
                            { id: "opt-nv-11-1", label: "75% or more show varied responses", points: 10 },
                            { id: "opt-nv-11-2", label: "50–75% show varied responses", points: 7 },
                            { id: "opt-nv-11-3", label: "25–50% show varied responses", points: 4 },
                            { id: "opt-nv-11-4", label: "Below 25% or rote/identical responses", points: 0 }
                        ]},
                        { id: "item-nv-12", title: "Review of Student Work", description: "Teacher checks student work and provides constructive feedback during or after the session", item_type: "choice", display_style: "pills", allow_remarks: true, weight: 1.00, sort_order: 12, choices: [
                            { id: "opt-nv-12-1", label: "Checked with feedback or prompts provided", points: 10 },
                            { id: "opt-nv-12-2", label: "Checked; correct answers given instead of feedback", points: 7 },
                            { id: "opt-nv-12-3", label: "Checked but no feedback or answers shared", points: 4 },
                            { id: "opt-nv-12-4", label: "Work not checked", points: 0 }
                        ]}
                    ]
                }
            ]
        },
        {
            id: "tmpl-grade-vi-ix",
            name: "Form 7 - Classroom Observation Report (Middle)",
            description: "Grade 6 to Grade 10 (or equivalent).",
            category: "academic",
            version: 1,
            status: "published",
            sections: [
                {
                    id: "sec-sec-1",
                    title: "OBSERVATION CRITERIA",
                    weight: 1.00,
                    sort_order: 1,
                    items: [
                        { id: "item-sec-1", title: "Introductory Motivation", description: "Teacher begins the lesson with an engaging hook, recap or context-setting activity", item_type: "choice", display_style: "pills", allow_remarks: true, weight: 1.00, sort_order: 1, choices: [
                            { id: "opt-sec-1-1", label: "Engaging activity that activates prior knowledge or announces topic clearly", points: 10 },
                            { id: "opt-sec-1-2", label: "Less engaging but topic-relevant opening activity", points: 7 },
                            { id: "opt-sec-1-3", label: "Topic announced verbally and written on board", points: 4 },
                            { id: "opt-sec-1-4", label: "Topic approached directly without introduction", points: 0 }
                        ]},
                        { id: "item-sec-2", title: "Teaching Methodology", description: "Teaching approach chosen is appropriate, varied and suited to the content and learners", item_type: "choice", display_style: "pills", allow_remarks: true, weight: 1.00, sort_order: 2, choices: [
                            { id: "opt-sec-2-1", label: "Interactive and engaging; methodology well-matched to topic", points: 10 },
                            { id: "opt-sec-2-2", label: "Interactive but not fully matched to expected outcomes", points: 7 },
                            { id: "opt-sec-2-3", label: "Partially effective; limited match to intended outcomes", points: 4 },
                            { id: "opt-sec-2-4", label: "Methodology not appropriate or undefined", points: 0 }
                        ]},
                        { id: "item-sec-3", title: "Teaching–Learning Materials", description: "Materials used are appropriate, creative and support the lesson objectives", item_type: "choice", display_style: "pills", allow_remarks: true, weight: 1.00, sort_order: 3, choices: [
                            { id: "opt-sec-3-1", label: "Appropriate and stimulates interest", points: 10 },
                            { id: "opt-sec-3-2", label: "Present but needs more creativity or relevance", points: 7 },
                            { id: "opt-sec-3-3", label: "Present but not appropriate for lesson", points: 4 },
                            { id: "opt-sec-3-4", label: "No materials used", points: 0 }
                        ]},
                        { id: "item-sec-4", title: "Student–Teacher Activity", description: "Activity chosen is appropriate, well-timed and promotes active learning", item_type: "choice", display_style: "pills", allow_remarks: true, weight: 1.00, sort_order: 4, choices: [
                            { id: "opt-sec-4-1", label: "Appropriate; actively engages learners", points: 10 },
                            { id: "opt-sec-4-2", label: "Relevant but needs more creativity", points: 7 },
                            { id: "opt-sec-4-3", label: "Present but not appropriate", points: 4 },
                            { id: "opt-sec-4-4", label: "No activity used", points: 0 }
                        ]},
                        { id: "item-sec-5", title: "Plan Completion", description: "Expected plan for the period was addressed to a satisfactory level", item_type: "choice", display_style: "pills", allow_remarks: true, weight: 1.00, sort_order: 5, choices: [
                            { id: "opt-sec-5-1", label: "Fully completed as planned", points: 10 },
                            { id: "opt-sec-5-2", label: "Partially completed", points: 7 },
                            { id: "opt-sec-5-3", label: "Substantially incomplete", points: 4 },
                            { id: "opt-sec-5-4", label: "No plan evident or not attempted", points: 0 }
                        ]},
                        { id: "item-sec-6", title: "Learning Outcomes Communication", description: "Expected learning outcomes are shared with students and consolidated at the end of the lesson", item_type: "choice", display_style: "pills", allow_remarks: true, weight: 1.00, sort_order: 6, choices: [
                            { id: "opt-sec-6-1", label: "Stated, written/displayed and consolidated with reflection questions", points: 10 },
                            { id: "opt-sec-6-2", label: "Stated and written/displayed; not consolidated", points: 7 },
                            { id: "opt-sec-6-3", label: "Referenced but not formally stated or consolidated", points: 4 },
                            { id: "opt-sec-6-4", label: "Not communicated at any point", points: 0 }
                        ]},
                        { id: "item-sec-7", title: "Learning Environment Displays", description: "Concept walls, vocabulary displays or relevant material are present and utilised by students", item_type: "choice", display_style: "pills", allow_remarks: true, weight: 1.00, sort_order: 7, choices: [
                            { id: "opt-sec-7-1", label: "Displayed, relevant and students evidently engage with them", points: 10 },
                            { id: "opt-sec-7-2", label: "Displayed and relevant; no evidence of student engagement", points: 7 },
                            { id: "opt-sec-7-3", label: "Displayed but not relevant to current unit", points: 4 },
                            { id: "opt-sec-7-4", label: "Not displayed", points: 0 }
                        ]},
                        { id: "item-sec-8", title: "Classroom Climate", description: "Interactions between teacher and students promote an emotionally safe, respectful environment", item_type: "choice", display_style: "pills", allow_remarks: true, weight: 1.00, sort_order: 8, choices: [
                            { id: "opt-sec-8-1", label: "Consistently assertive, warm and affirming communication", points: 10 },
                            { id: "opt-sec-8-2", label: "Occasional encouragement; generally neutral climate", points: 7 },
                            { id: "opt-sec-8-3", label: "Neutral; no affirming evidence observed", points: 4 },
                            { id: "opt-sec-8-4", label: "Use of threats, shouting or inappropriate physical contact", points: 0 }
                        ]},
                        { id: "item-sec-9", title: "Formative Assessment & Work Review", description: "Teacher monitors student work and provides feedback or prompts to guide understanding", item_type: "choice", display_style: "pills", allow_remarks: true, weight: 1.00, sort_order: 9, choices: [
                            { id: "opt-sec-9-1", label: "Checks work; gives feedback or prompts for improvement", points: 10 },
                            { id: "opt-sec-9-2", label: "Checks work; gives correct answers rather than feedback", points: 7 },
                            { id: "opt-sec-9-3", label: "Checks work; no feedback or answers shared", points: 4 },
                            { id: "opt-sec-9-4", label: "Does not check student work during the lesson", points: 0 }
                        ]}
                    ]
                }
            ]
        },
        {
            id: "tmpl-grade-xi-xii",
            name: "Form 8 - Classroom Observation Report (Senior)",
            description: "Grade 11 & 12 / A-Level / Year 12–13 / Pre-University (or equivalent). Features stream-specific criteria.",
            category: "academic",
            version: 1,
            status: "published",
            sections: [
                {
                    id: "sec-ss-1",
                    title: "1. LESSON PLANNING & CURRICULUM ALIGNMENT",
                    weight: 1.00,
                    sort_order: 1,
                    items: [
                        { id: "item-ss-1-1", title: "Clear learning objectives stated", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 1, choices: makeYesPartiallyNo("ss-1-1") },
                        { id: "item-ss-1-2", title: "Alignment with board / curriculum syllabus", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 2, choices: makeStrongAdequateNeeds("ss-1-2") },
                        { id: "item-ss-1-3", title: "Logical sequencing of content", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 3, choices: makeClearAverageWeak("ss-1-3") },
                        { id: "item-ss-1-4", title: "Connection with prior learning", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 4, choices: makeEvidentLimitedNotEvident("ss-1-4") },
                        { id: "item-ss-1-5", title: "Pacing appropriate for the level", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 5, choices: makeAppropriateFastSlow("ss-1-5") }
                    ]
                },
                {
                    id: "sec-ss-2",
                    title: "2. SUBJECT KNOWLEDGE & CONCEPTUAL CLARITY",
                    weight: 1.00,
                    sort_order: 2,
                    items: [
                        { id: "item-ss-2-1", title: "Accuracy of subject content", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 1, choices: makeAccurateMinorNeeds("ss-2-1") },
                        { id: "item-ss-2-2", title: "Depth appropriate for the level", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 2, choices: makeAppropriateShallowOverloaded("ss-2-2") },
                        { id: "item-ss-2-3", title: "Explanation of complex concepts", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 3, choices: makeClearPartiallyUnclear("ss-2-3") },
                        { id: "item-ss-2-4", title: "Handling of student questions", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 4, choices: makeConfidentNeedsSupportAvoided("ss-2-4") }
                    ]
                },
                {
                    id: "sec-ss-3",
                    title: "3. PEDAGOGY & TEACHING METHODOLOGY",
                    weight: 1.00,
                    sort_order: 3,
                    items: [
                        { id: "item-ss-3-1", title: "Teaching strategies suited to topic and level", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 1, choices: makeYesPartiallyNo("ss-3-1") },
                        { id: "item-ss-3-2", title: "Use of examples, analogies and illustrations", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 2, choices: makeEffectiveLimitedNone("ss-3-2") },
                        { id: "item-ss-3-3", title: "Encouragement of critical and higher-order thinking", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 3, choices: makeStrongOccasionalNotEvident("ss-3-3") },
                        { id: "item-ss-3-4", title: "Differentiation for varied learner abilities", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 4, choices: makeEvidentLimitedNotPlanned("ss-3-4") }
                    ]
                },
                {
                    id: "sec-ss-4a",
                    title: "4A. STREAM-SPECIFIC PEDAGOGY - Science / STEM",
                    weight: 1.00,
                    sort_order: 4,
                    items: [
                        { id: "item-ss-4a-1", title: "Logical development of abstract / theoretical concepts", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 1, choices: makeVeryClearAdequateNeedsSupport("ss-4a-1") },
                        { id: "item-ss-4a-2", title: "Use of diagrams, equations, derivations or models", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 2, choices: makeEffectivePartialNotUsed("ss-4a-2") },
                        { id: "item-ss-4a-3", title: "Step-wise problem-solving approach", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 3, choices: makeStructuredSomewhatUnclear("ss-4a-3") },
                        { id: "item-ss-4a-4", title: "Integration of theory with practical / lab context", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 4, choices: makeWellIntegratedLimitedNotEvident("ss-4a-4") },
                        { id: "item-ss-4a-5", title: "Emphasis on scientific reasoning ('why' and 'how')", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 5, choices: makeStrongOccasionalAbsent("ss-4a-5") }
                    ]
                },
                {
                    id: "sec-ss-4b",
                    title: "4B. STREAM-SPECIFIC PEDAGOGY - Commerce / Business",
                    weight: 1.00,
                    sort_order: 5,
                    items: [
                        { id: "item-ss-4b-1", title: "Use of real-world business, market or economic examples", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 1, choices: makeRelevantLimitedNotUsed("ss-4b-1") },
                        { id: "item-ss-4b-2", title: "Case-study or scenario-based teaching", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 2, choices: makeEffectivePartialNotUsed("ss-4b-2") },
                        { id: "item-ss-4b-3", title: "Numerical clarity, accuracy and working shown", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 3, choices: makeAccurateMinorNeedsImprovement("ss-4b-3") },
                        { id: "item-ss-4b-4", title: "Application of concepts to decision-making contexts", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 4, choices: makeClearSomewhatNotEvident("ss-4b-4") },
                        { id: "item-ss-4b-5", title: "Linkage with current affairs or industry trends", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 5, choices: makeStrongOccasionalNotLinked("ss-4b-5") }
                    ]
                },
                {
                    id: "sec-ss-4c",
                    title: "4C. STREAM-SPECIFIC PEDAGOGY - Humanities / Social Sciences",
                    weight: 1.00,
                    sort_order: 6,
                    items: [
                        { id: "item-ss-4c-1", title: "Presentation of multiple perspectives or viewpoints", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 1, choices: makeWellAddressedLimitedNotAddressed("ss-4c-1") },
                        { id: "item-ss-4c-2", title: "Cause–effect and analytical explanations", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 2, choices: makeClearPartialWeak("ss-4c-2") },
                        { id: "item-ss-4c-3", title: "Use of texts, sources, data, maps or primary evidence", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 3, choices: makeEffectivePartialNotUsed("ss-4c-3") },
                        { id: "item-ss-4c-4", title: "Encouragement of discussion, debate or reflective thinking", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 4, choices: makeActiveOccasionalAbsent("ss-4c-4") },
                        { id: "item-ss-4c-5", title: "Focus on evidence-based and reasoned argumentation", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 5, choices: makeStrongDevelopingNeedsSupport("ss-4c-5") }
                    ]
                },
                {
                    id: "sec-ss-5",
                    title: "5. STUDENT ENGAGEMENT & CLASSROOM CLIMATE",
                    weight: 1.00,
                    sort_order: 7,
                    items: [
                        { id: "item-ss-5-1", title: "Level of student participation in lesson", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 1, choices: makeHighModerateLow("ss-5-1") },
                        { id: "item-ss-5-2", title: "Inclusivity and emotional safety in classroom", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 2, choices: makeSafePartiallyNeedsAttention("ss-5-2") },
                        { id: "item-ss-5-3", title: "Quality of teacher questions posed", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 3, choices: makeProbingBasicRecall("ss-5-3") },
                        { id: "item-ss-5-4", title: "Classroom discipline, rapport and mutual respect", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 4, choices: makePositiveNeutralNeedsImprovement("ss-5-4") }
                    ]
                },
                {
                    id: "sec-ss-6",
                    title: "6. ASSESSMENT & FEEDBACK PRACTICES",
                    weight: 1.00,
                    sort_order: 8,
                    items: [
                        { id: "item-ss-6-1", title: "Checks for understanding during the lesson", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 1, choices: makeFrequentOccasionalNone("ss-6-1") },
                        { id: "item-ss-6-2", title: "Quality and level of questions posed to students", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 2, choices: makeBoardMixedWeak("ss-6-2") },
                        { id: "item-ss-6-3", title: "Nature and quality of feedback given", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 3, choices: makeConstructiveGeneralNotProvided("ss-6-3") },
                        { id: "item-ss-6-4", title: "Alignment of content with board exam patterns", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 4, choices: makeStrongPartialMissing("ss-6-4") }
                    ]
                },
                {
                    id: "sec-ss-7",
                    title: "7. EXAM READINESS & ACADEMIC RIGOUR",
                    weight: 1.00,
                    sort_order: 9,
                    items: [
                        { id: "item-ss-7-1", title: "Teacher's familiarity with board / external exam format", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 1, choices: makeStrongAdequateNeeds("ss-7-1") },
                        { id: "item-ss-7-2", title: "Guidance on answer structuring and presentation", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 2, choices: makeClearExplicitPartialNotProvided("ss-7-2") },
                        { id: "item-ss-7-3", title: "Emphasis on key terms, steps, formulas or keywords", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 3, choices: makeConsistentOccasionalNotEmphasised("ss-7-3") },
                        { id: "item-ss-7-4", title: "Time management strategies discussed with students", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 4, choices: makeClearlyBrieflyNotDiscussed("ss-7-4") }
                    ]
                },
                {
                    id: "sec-ss-8",
                    title: "8. CLASSROOM MANAGEMENT & PROFESSIONAL CONDUCT",
                    weight: 1.00,
                    sort_order: 10,
                    items: [
                        { id: "item-ss-8-1", title: "Time management within the period", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 1, choices: makeEffectiveAverageWeak("ss-8-1") },
                        { id: "item-ss-8-2", title: "Preparedness and organisation of resources", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 2, choices: makeWellPreparedAdequateUnprepared("ss-8-2") },
                        { id: "item-ss-8-3", title: "Professional communication style", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 3, choices: makeClearRespectfulNeedsRefinement("ss-8-3") },
                        { id: "item-ss-8-4", title: "Classroom control and learning environment", description: "", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 4, choices: makeCalmReactiveIneffective("ss-8-4") }
                    ]
                }
            ]
        },
        {
            id: "tmpl-daily-admin",
            name: "Form 9 - Daily Administrative Operations Observation Checklist",
            description: "Daily administrative audit, workspace compliance, and service excellence checklist.",
            category: "academic_daily",
            version: 1,
            status: "published",
            sections: [
                {
                    id: "sec-da-1",
                    title: "1. WORKSPACE COMPLIANCE & OFFICE READINESS",
                    weight: 1.00,
                    sort_order: 1,
                    items: [
                        { id: "item-da-1-1", title: "Desk organization & files storage", description: "Files are archived properly; desk is neat and ready for visitors", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 1, choices: makeYesPartiallyNo("da-1-1") },
                        { id: "item-da-1-2", title: "IT systems & portal check", description: "System portals, attendance registers, and emails are functional", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 2, choices: makeStrongAdequateNeeds("da-1-2") },
                        { id: "item-da-1-3", title: "Reception / Visitor area check", description: "Entrance and helpdesks are clean, presentable, and manned", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 3, choices: makeClearAverageWeak("da-1-3") }
                    ]
                },
                {
                    id: "sec-da-2",
                    title: "2. SERVICE QUALITY & TASK DISPATCH",
                    weight: 1.00,
                    sort_order: 2,
                    items: [
                        { id: "item-da-2-1", title: "Email / Ticket response time", description: "Incoming requests handled within SLA", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 1, choices: makeYesPartiallyNo("da-2-1") },
                        { id: "item-da-2-2", title: "Accuracy in record keeping", description: "No discrepancies found in daily logs, databases, or cash files", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 2, choices: makeStrongAdequateNeeds("da-2-2") }
                    ]
                }
            ]
        },
        {
            id: "tmpl-daily-support",
            name: "Form 10 - Daily Facility & Operations Checklist (Support Staff)",
            description: "Daily operations checks, cleanliness audits, and facility safety checks.",
            category: "academic_daily",
            version: 1,
            status: "published",
            sections: [
                {
                    id: "sec-ds-1",
                    title: "1. FACILITY CLEANLINESS & HOUSEKEEPING",
                    weight: 1.00,
                    sort_order: 1,
                    items: [
                        { id: "item-ds-1-1", title: "Classrooms & restrooms cleanliness", description: "Daily sanitation checks completed", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 1, choices: makeYesPartiallyNo("ds-1-1") },
                        { id: "item-ds-1-2", title: "Common areas & hallways", description: "Free of obstruction, sweeped, and lit", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 2, choices: makeStrongAdequateNeeds("ds-1-2") }
                    ]
                },
                {
                    id: "sec-ds-2",
                    title: "2. UTILITY & SAFETY CHECKS",
                    weight: 1.00,
                    sort_order: 2,
                    items: [
                        { id: "item-ds-2-1", title: "Fire safety & exit accessibility", description: "Fire exits clear; extinguishers in position", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 1, choices: makeYesPartiallyNo("ds-2-1") },
                        { id: "item-ds-2-2", title: "Water and electrical utility functions", description: "No leaks, active wiring issues, or failures", item_type: "choice", allow_remarks: true, weight: 1.00, sort_order: 2, choices: makeStrongAdequateNeeds("ds-2-2") }
                    ]
                }
            ]
        }
    ],
    template_groups: [
        { id: "group-academic", title: "Classroom & Operations Observations", emoji: "🎓" },
        { id: "group-faculty", title: "Faculty & Teaching Appraisals", emoji: "🍎" },
        { id: "group-admin", title: "Administrative & Support Reviews", emoji: "💼" }
    ],
    
    assessment_cycles: [
        { id: "cycle-term-1", name: "Term 1 Appraisals & Observations (2026)", start_date: "2026-06-01", end_date: "2026-08-30", status: "active" }
    ],
    
    assessments: [
        {
            id: "eval-alice-obs-1",
            tenant_id: "tenant-bhusk-east-110",
            cycle_id: "cycle-term-1",
            template_id: "tmpl-nursery-grade-v",
            subject_id: "user-cooper",
            evaluator_id: "user-skinner",
            status: "signed_off",
            score: 88.00,
            responses: {
                "item-nv-1-1": { selected_choice_id: "opt-nv-1-1-1", remarks: "Family word wall is well updated and students are engaged.", is_na: false },
                "item-nv-1-2": { selected_choice_id: "opt-nv-1-2-2", remarks: "Sight word cards displayed properly.", is_na: false },
                "item-nv-1-3": { selected_choice_id: "opt-nv-1-3-1", remarks: "Assertive yet warm tone with children.", is_na: false },
                "item-nv-2-1": { selected_choice_id: "opt-nv-2-1-1", remarks: "LO was fully achieved with materials.", is_na: false },
                "item-nv-2-2": { selected_choice_id: "opt-nv-2-2-2", remarks: "Checked comprehension briefly.", is_na: false }
            },
            subject_signature: "Alice Cooper",
            subject_signed_at: "2026-06-15T10:30:00Z",
            evaluator_signature: "Seymour Skinner",
            evaluator_signed_at: "2026-06-14T16:00:00Z",
            submitted_at: "2026-06-14T16:00:00Z",
            created_at: "2026-06-10T09:00:00Z",
            updated_at: "2026-06-15T10:30:00Z"
        },
        {
            id: "eval-bob-obs-1",
            tenant_id: "tenant-bhusk-east-110",
            cycle_id: "cycle-term-1",
            template_id: "tmpl-office-appraisal",
            subject_id: "user-dylan",
            evaluator_id: "user-vance",
            status: "draft",
            score: 90.00,
            responses: {
                "item-off-cv-1": { selected_choice_id: "item-off-cv-1-pts-9", remarks: "Bob is always on time.", is_na: false },
                "item-off-cv-2": { selected_choice_id: "item-off-cv-2-pts-8", remarks: "Works well with support staff.", is_na: false },
                "item-off-comp-1": { selected_choice_id: "item-off-comp-1-pts-10", remarks: "Data registers are precise.", is_na: false },
                "item-off-comp-2": { selected_choice_id: "item-off-comp-2-pts-9", remarks: "Proficient with school ERP system.", is_na: false }
            },
            subject_signature: "",
            subject_signed_at: null,
            evaluator_signature: "",
            evaluator_signed_at: null,
            submitted_at: null,
            created_at: "2026-06-18T08:00:00Z",
            updated_at: "2026-06-18T08:05:00Z"
        }
    ],
    
    growth_plans: [
        {
            id: "gp-alice",
            user_id: "user-cooper",
            mentor_id: "user-skinner",
            cycle_id: "cycle-term-1",
            title: "Primary Instruction Progression Plan",
            description: "Adopt phonics-based tools and enhance real-time formative review.",
            status: "active",
            goals: [
                {
                    id: "goal-tech-1",
                    title: "Integrate family word drills daily",
                    description: "Strengthen sound blending through flashcards.",
                    target_date: "2026-07-15",
                    status: "in_progress",
                    actions: [
                        { id: "act-1", description: "Design classroom poll templates in digital format", status: "done" },
                        { id: "act-2", description: "Configure student tablets with classroom app", status: "pending" }
                    ]
                }
            ]
        }
    ]
};

// =========================================================================
// 2. TOAST NOTIFICATION SERVICE
// =========================================================================
class ToastService {
    show(message, type = "info") {
        const root = document.getElementById("toaster-root");
        if (!root) return;

        const card = document.createElement("div");
        card.className = `toast-message-card ${type}-toast`;

        // SVG icon selection
        let iconSvg = "";
        if (type === "success") {
            iconSvg = `<svg class="toast-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
        } else if (type === "error") {
            iconSvg = `<svg class="toast-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
        } else if (type === "warning") {
            iconSvg = `<svg class="toast-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
        } else {
            iconSvg = `<svg class="toast-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
        }

        card.innerHTML = `
            ${iconSvg}
            <span class="toast-text">${message}</span>
            <button class="toast-close-btn">&times;</button>
        `;

        card.querySelector(".toast-close-btn").addEventListener("click", () => {
            card.style.transform = "translateY(-10px)";
            card.style.opacity = "0";
            setTimeout(() => card.remove(), 300);
        });

        root.appendChild(card);

        // Auto destroy after 3.5s
        setTimeout(() => {
            if (card.parentNode) {
                card.style.transform = "translateY(-10px)";
                card.style.opacity = "0";
                setTimeout(() => card.remove(), 300);
            }
        }, 3500);
    }
    
    success(msg) { this.show(msg, "success"); }
    error(msg) { this.show(msg, "error"); }
    warning(msg) { this.show(msg, "warning"); }
    info(msg) { this.show(msg, "info"); }
}

const Toaster = new ToastService();

// =========================================================================
// 3. APPLICATION STATE & PERSISTENCE
// =========================================================================
class AppState {
    constructor() {
        this.loadDatabase();
        this.loadTheme();
        this.activeRole = "tenant_admin";
        this.activeView = "dashboard";
        
        // Editor IDs
        this.selectedRubricId = null;
        this.selectedScaleId = null;
        this.selectedTemplateId = null;
        this.selectedRoleId = null;
        this.activePlayerAssessmentId = null;
        this.activeGrowthPlanUserId = null;
        this.activeStepIndex = 0; // multi-step player wizard tracker
        this.selectedReportUserId = null; // tracking reports subject
        this.selectedReportUserIds = []; // tracking reports subjects for multi-select

        // Enterprise Table states (Roster)
        this.rosterPage = 1;
        this.rosterPageSize = 4;
        this.rosterSortKey = "name";
        this.rosterSortDir = "asc";
        this.rosterSelectedIds = new Set();
        this.rosterCols = {
            email: true,
            dept: true,
            role: true,
            manager: true,
            status: true
        };
    }

    loadDatabase() {
        const stored = localStorage.getItem("revu_database_v4");
        if (stored) {
            try {
                this.db = JSON.parse(stored);
                // Demo data saved before the bhusku family rebrand
                if (this.db && this.db.tenant && /^bhuskU Academy/.test(this.db.tenant.name || "")) {
                    this.db.tenant.name = this.db.tenant.name.replace(/^bhuskU Academy/, "Demo Public School");
                }
                // Validate database formatting. If keys are missing or user lists are corrupt, trigger re-seeding
                if (!this.db || !this.db.users || !this.db.assessments || !this.db.templates || this.db.users.length < 4) {
                    throw new Error("Outdated or invalid database state detected.");
                }
                if (!this.db.roles) {
                    this.db.roles = JSON.parse(JSON.stringify(DEFAULT_SEED_DATA.roles));
                }
                // Migrate tenant_admin permissions to ensure settings:manage is available
                const adminRole = this.db.roles.find(r => r.id === "tenant_admin");
                if (adminRole && !adminRole.permissions.includes("settings:manage")) {
                    adminRole.permissions.push("settings:manage");
                }
                if (!this.db.tenant) {
                    this.db.tenant = JSON.parse(JSON.stringify(DEFAULT_SEED_DATA.tenant));
                } else {
                    if (this.db.tenant.logo === undefined) this.db.tenant.logo = "";
                    if (this.db.tenant.address === undefined) this.db.tenant.address = "123 Academic Way, East District";
                    if (this.db.tenant.contact_phone === undefined) this.db.tenant.contact_phone = "+1 (555) 019-2834";
                    if (this.db.tenant.contact_email === undefined) this.db.tenant.contact_email = "info@demoschool.edu";
                }
                if (!this.db.classes) {
                    this.db.classes = JSON.parse(JSON.stringify(DEFAULT_SEED_DATA.classes));
                }
                if (!this.db.sections) {
                    this.db.sections = JSON.parse(JSON.stringify(DEFAULT_SEED_DATA.sections));
                }
                if (!this.db.sessions) {
                    this.db.sessions = JSON.parse(JSON.stringify(DEFAULT_SEED_DATA.sessions));
                } else {
                    // Normalize existing sessions to remove prefix if any
                    this.db.sessions.forEach(s => {
                        s.name = s.name.replace("Academic Session ", "");
                    });
                }
                if (!this.db.activeSessionId) {
                    this.db.activeSessionId = DEFAULT_SEED_DATA.activeSessionId;
                }
                if (!this.db.directives) {
                    this.db.directives = [];
                }
                // Tag any assessments that do not have a session_id with the default active session
                this.db.assessments.forEach(a => {
                    if (!a.session_id) {
                        a.session_id = "sess-2025-26";
                    }
                });
                // Migrate seeded templates to ensure the latest global standardized templates are loaded
                const defaultTmplIds = DEFAULT_SEED_DATA.templates.map(t => t.id);
                this.db.templates = this.db.templates.filter(t => !defaultTmplIds.includes(t.id));
                this.db.templates.push(...JSON.parse(JSON.stringify(DEFAULT_SEED_DATA.templates)));
                if (!this.db.template_groups) {
                    this.db.template_groups = JSON.parse(JSON.stringify(DEFAULT_SEED_DATA.template_groups));
                }
                
                // Assign group_id, assigned_classes, and assigned_departments to templates if missing or standard
                this.db.templates.forEach(t => {
                    if (!t.group_id) {
                        if (t.category === "academic") {
                            t.group_id = "group-academic";
                        } else if (t.id === "tmpl-teaching-appraisal" || t.id === "tmpl-activities-appraisal" || t.category === "teaching") {
                            t.group_id = "group-faculty";
                        } else {
                            t.group_id = "group-admin";
                        }
                    }
                    
                    const isStandard = defaultTmplIds.includes(t.id);
                    if (isStandard) {
                        if (t.id === "tmpl-nursery-grade-v") {
                            t.assigned_classes = ["Nursery", "LKG", "UKG", "Grade I", "Grade II", "Grade III", "Grade IV", "Grade V"];
                        } else if (t.id === "tmpl-grade-vi-ix") {
                            t.assigned_classes = ["Grade VI", "Grade VII", "Grade VIII", "Grade IX", "Grade X"];
                        } else if (t.id === "tmpl-grade-xi-xii") {
                            t.assigned_classes = ["Grade XI", "Grade XII"];
                        } else {
                            t.assigned_classes = [];
                        }
                        
                        if (t.id === "tmpl-nursery-grade-v" || t.id === "tmpl-grade-vi-ix" || t.id === "tmpl-grade-xi-xii") {
                            t.assigned_departments = ["dept-teach", "dept-activities"];
                        } else if (t.id === "tmpl-teaching-appraisal") {
                            t.assigned_departments = ["dept-teach"];
                        } else if (t.id === "tmpl-activities-appraisal") {
                            t.assigned_departments = ["dept-activities"];
                        } else if (t.id === "tmpl-office-appraisal" || t.id === "tmpl-daily-support") {
                            t.assigned_departments = ["dept-supp"];
                        } else if (t.id === "tmpl-accounts-appraisal") {
                            t.assigned_departments = ["dept-admin"];
                        } else if (t.id === "tmpl-pro-appraisal") {
                            t.assigned_departments = ["dept-pr"];
                        } else if (t.id === "tmpl-daily-admin") {
                            t.assigned_departments = ["dept-admin"];
                        } else {
                            t.assigned_departments = [];
                        }
                    } else {
                        if (!t.assigned_classes) t.assigned_classes = [];
                        if (!t.assigned_departments) t.assigned_departments = [];
                    }
                });
                
                this.saveDatabase();

            } catch(e) {
                console.warn("Re-seeding database due to mismatch or parser error:", e);
                this.db = JSON.parse(JSON.stringify(DEFAULT_SEED_DATA));
                this.saveDatabase();
            }
        } else {
            this.db = JSON.parse(JSON.stringify(DEFAULT_SEED_DATA));
            this.saveDatabase();
        }
        
        // Auto-seed demo analytics data if the roster or evaluations are empty/incomplete
        if (this.db.users.length < 20 || this.db.assessments.length < 50) {
            this.generateMockAnalyticsData();
            this.saveDatabase();
        }
    }

    saveDatabase() {
        localStorage.setItem("revu_database_v4", JSON.stringify(this.db));
    }

    generateMockAnalyticsData() {
        console.log("Generating 20+ staff members and 150+ evaluation forms...");
        
        const mockUsers = [
            { id: "user-m1", email: "paul.simon@bhusk.edu", first_name: "Paul", last_name: "Simon", role: "staff_member", dept_id: "dept-teach", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150", status: "active", assigned_class: "Grade III", assigned_section: "A" },
            { id: "user-m2", email: "art.garfunkel@bhusk.edu", first_name: "Art", last_name: "Garfunkel", role: "staff_member", dept_id: "dept-teach", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150", status: "active", assigned_class: "Grade IV", assigned_section: "B" },
            { id: "user-m3", email: "freddie.mercury@bhusk.edu", first_name: "Freddie", last_name: "Mercury", role: "staff_member", dept_id: "dept-teach", avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150", status: "active", assigned_class: "Grade VI", assigned_section: "A" },
            { id: "user-m4", email: "brian.may@bhusk.edu", first_name: "Brian", last_name: "May", role: "staff_member", dept_id: "dept-teach", avatar: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150", status: "active", assigned_class: "Grade VII", assigned_section: "C" },
            { id: "user-m5", email: "roger.taylor@bhusk.edu", first_name: "Roger", last_name: "Taylor", role: "staff_member", dept_id: "dept-teach", avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150", status: "active", assigned_class: "Grade VIII", assigned_section: "D" },
            { id: "user-m6", email: "john.deacon@bhusk.edu", first_name: "John", last_name: "Deacon", role: "staff_member", dept_id: "dept-teach", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150", status: "active", assigned_class: "Grade IX", assigned_section: "B" },
            { id: "user-m7", email: "david.bowie@bhusk.edu", first_name: "David", last_name: "Bowie", role: "activity_teacher", dept_id: "dept-activities", avatar: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150", status: "active", assigned_class: "Grade X", assigned_section: "A" },
            { id: "user-m8", email: "mick.jagger@bhusk.edu", first_name: "Mick", last_name: "Jagger", role: "activity_teacher", dept_id: "dept-activities", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150", status: "active", assigned_class: "Grade XI", assigned_section: "B" },
            { id: "user-m9", email: "keith.richards@bhusk.edu", first_name: "Keith", last_name: "Richards", role: "office_staff", dept_id: "dept-supp", avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150", status: "active" },
            { id: "user-m10", email: "elton.john@bhusk.edu", first_name: "Elton", last_name: "John", role: "office_staff", dept_id: "dept-supp", avatar: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150", status: "active" },
            { id: "user-m11", email: "billy.joel@bhusk.edu", first_name: "Billy", last_name: "Joel", role: "pro_staff", dept_id: "dept-pr", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150", status: "active" },
            { id: "user-m12", email: "stevie.wonder@bhusk.edu", first_name: "Stevie", last_name: "Wonder", role: "accounts_staff", dept_id: "dept-admin", avatar: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150", status: "active" },
            { id: "user-m13", email: "jimi.hendrix@bhusk.edu", first_name: "Jimi", last_name: "Hendrix", role: "office_staff", dept_id: "dept-supp", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150", status: "active" },
            { id: "user-m14", email: "eric.clapton@bhusk.edu", first_name: "Eric", last_name: "Clapton", role: "office_staff", dept_id: "dept-supp", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150", status: "active" },
            { id: "user-m15", email: "jim.morrison@bhusk.edu", first_name: "Jim", last_name: "Morrison", role: "office_staff", dept_id: "dept-supp", avatar: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150", status: "active" }
        ];

        mockUsers.forEach(u => {
            if (!this.db.users.some(existing => existing.id === u.id)) {
                this.db.users.push(u);
            }
        });

        const staffSubjects = this.db.users.filter(u => 
            u.role !== "tenant_admin" && u.role !== "school_leader" && u.role !== "dept_head"
        );

        this.db.assessments = []; // clear existing assessments to ensure clean seed

        const evaluatorId = "user-skinner";
        const tenantId = "tenant-bhusk-east-110";
        const cycleId = "cycle-term-1";
        const sessionId = "sess-2025-26";

        const startDate = new Date("2025-06-01T09:00:00Z");
        const endDate = new Date("2026-06-20T17:00:00Z");

        staffSubjects.forEach((subject, subjIndex) => {
            let staffType = "administrative";
            if (subject.role === "staff_member" || subject.role === "activity_teacher") {
                if (subject.dept_id === "dept-teach" || subject.dept_id === "dept-activities") {
                    staffType = "teacher";
                } else if (subject.dept_id === "dept-supp") {
                    staffType = "support";
                }
            } else if (subject.role === "office_staff" || subject.role === "accounts_staff") {
                staffType = "support";
            } else if (subject.role === "pro_staff") {
                staffType = "administrative";
            }

            let eligibleTemplates = [];
            if (staffType === "teacher") {
                eligibleTemplates = [
                    { id: "tmpl-teaching-appraisal", type: "appraisal" },
                    { id: "tmpl-activities-appraisal", type: "appraisal" },
                    { id: "tmpl-nursery-grade-v", type: "observation" },
                    { id: "tmpl-grade-vi-ix", type: "observation" },
                    { id: "tmpl-grade-xi-xii", type: "observation" }
                ];
            } else if (staffType === "support") {
                eligibleTemplates = [
                    { id: "tmpl-office-appraisal", type: "appraisal" },
                    { id: "tmpl-daily-support", type: "observation" }
                ];
            } else {
                eligibleTemplates = [
                    { id: "tmpl-office-appraisal", type: "appraisal" },
                    { id: "tmpl-accounts-appraisal", type: "appraisal" },
                    { id: "tmpl-pro-appraisal", type: "appraisal" },
                    { id: "tmpl-daily-admin", type: "observation" }
                ];
            }

            // We generate 8 assessments per staff member.
            for (let i = 0; i < 8; i++) {
                const mockTmplSelection = eligibleTemplates[i % eligibleTemplates.length];
                const tmpl = this.db.templates.find(t => t.id === mockTmplSelection.id);
                if (!tmpl) continue;

                const dateOffset = (i * 45) + (subjIndex * 3);
                const createdDate = new Date(startDate.getTime() + dateOffset * 24 * 60 * 60 * 1000);
                if (createdDate > endDate) continue;

                const submittedDate = new Date(createdDate.getTime() + 2 * 60 * 60 * 1000);
                const signedDate = new Date(createdDate.getTime() + 24 * 60 * 60 * 1000);

                const responses = {};
                let sectionScoreSum = 0;
                let sectionWeightSum = 0;
                let templateScoreSum = 0;
                let templateWeightSum = 0;

                let performanceTier = "medium";
                if (subjIndex % 5 === 0) performanceTier = "high";
                else if (subjIndex % 5 === 4) performanceTier = "low";

                tmpl.sections.forEach(sec => {
                    let secMax = 0;
                    let secEarned = 0;
                    let hasValid = false;

                    sec.items.forEach(item => {
                        if (item.item_type === "choice" && item.choices) {
                            const choices = item.choices;
                            const maxPoints = Math.max(...choices.map(c => c.points || 0));
                            
                            let selectedChoice = null;
                            if (performanceTier === "high") {
                                selectedChoice = Math.random() > 0.2 ? choices.find(c => c.points === maxPoints) : choices[choices.length - 2] || choices[0];
                            } else if (performanceTier === "low") {
                                selectedChoice = Math.random() > 0.4 ? choices[choices.length - 1] || choices[0] : choices.find(c => c.points === maxPoints) || choices[0];
                            } else {
                                selectedChoice = choices[Math.floor(Math.random() * choices.length)];
                            }

                            if (!selectedChoice) selectedChoice = choices[0];

                            responses[item.id] = {
                                selected_choice_id: selectedChoice.id,
                                remarks: `Demonstrated standard compliance.`,
                                is_na: false
                            };

                            const maxItemPoints = Math.max(...choices.map(c => c.points || 0));
                            if (maxItemPoints > 0) {
                                const itemWeight = item.weight || 1;
                                const itemScore = ((selectedChoice.points || 0) / maxItemPoints) * itemWeight;
                                secEarned += itemScore;
                                secMax += itemWeight;
                                hasValid = true;
                            }
                        }
                    });

                    if (hasValid && secMax > 0) {
                        const secPct = secEarned / secMax;
                        templateScoreSum += secPct * sec.weight;
                        templateWeightSum += sec.weight;
                    }
                });

                let score = 0;
                if (templateWeightSum > 0) {
                    score = (templateScoreSum / templateWeightSum) * 100.0;
                }

                let status = "signed_off";
                const randStatus = Math.random();
                if (randStatus < 0.05) status = "draft";
                else if (randStatus < 0.10) status = "submitted";

                const isSignedOff = status === "signed_off";
                const isSubmitted = status === "submitted" || isSignedOff;

                const assId = `eval-mock-${subjIndex}-${i}-${Math.floor(Math.random()*1000)}`;
                this.db.assessments.push({
                    id: assId,
                    tenant_id: tenantId,
                    cycle_id: cycleId,
                    session_id: sessionId,
                    template_id: tmpl.id,
                    subject_id: subject.id,
                    evaluator_id: evaluatorId,
                    status: status,
                    score: parseFloat(score.toFixed(2)),
                    class: subject.assigned_class || null,
                    section: subject.assigned_section || null,
                    responses: responses,
                    subject_signature: isSignedOff ? `${subject.first_name} ${subject.last_name}` : "",
                    subject_signed_at: isSignedOff ? signedDate.toISOString() : null,
                    evaluator_signature: isSubmitted ? "Seymour Skinner" : "",
                    evaluator_signed_at: isSubmitted ? submittedDate.toISOString() : null,
                    submitted_at: isSubmitted ? submittedDate.toISOString() : null,
                    created_at: createdDate.toISOString(),
                    updated_at: signedDate.toISOString()
                });
            }
        });
        
        console.log(`Successfully generated ${this.db.assessments.length} mock assessments for ${staffSubjects.length} staff.`);
    }

    loadTheme() {
        this.activeTheme = localStorage.getItem("revu_theme") || "light";
        if (this.activeTheme === "standard") this.activeTheme = "light";
        document.body.className = `theme-${this.activeTheme}`;
    }

    setTheme(theme) {
        this.activeTheme = theme;
        localStorage.setItem("revu_theme", theme);
        document.body.className = `theme-${theme}`;
        
        // Move slider indicator
        const slider = document.getElementById("theme-slider");
        const btnIndex = ["light", "dark"].indexOf(theme);
        if (slider) {
            slider.style.transform = `translateX(${btnIndex * 85}px)`; // matches slider pill spacing
        }
    }

    getCurrentUser() {
        const mapping = {
            tenant_admin: "user-jenkins",
            school_leader: "user-skinner",
            dept_head: "user-vance",
            staff_member: "user-cooper"
        };
        const mappedId = mapping[this.activeRole];
        if (mappedId) {
            return this.db.users.find(u => u.id === mappedId) || this.db.users[0];
        }
        // Fallback for custom roles: find first user assigned this role
        const match = this.db.users.find(u => u.role === this.activeRole);
        return match || this.db.users[0];
    }
}

const state = new AppState();

// =========================================================================
// 4. BOOTSTRAP INITIALIZATION
// =========================================================================
function initApp() {
    initThemeSwitcher();
    initPersonaSelector();
    initSessionSelector();
    initSidebarNavigation();
    initSubTabs();
    initRosterEnterpriseTable();
    initScaleRubricEditor();
    initTemplateBuilder();
    initObservationHub();
    initAppraisalPlayerWizard();
    initGrowthPlans();
    initAnalytics();
    initAIWorkbench();
    initSchemaExplorer();
    initFileImportHandlers(); // safe import handlers registration
    initRolesManagement();
    initClassesSectionsEvents();
    populateClassSectionDropdowns();
    initSettingsEvents();
    updateHeaderBranding();

    // Trigger initial render of dashboard or read hash
    window.addEventListener("hashchange", () => {
        const viewId = window.location.hash ? window.location.hash.substring(1) : "dashboard";
        if (state.activeView !== viewId && document.getElementById(`view-${viewId}`)) {
            switchToView(viewId);
        }
    });

    const initialView = window.location.hash ? window.location.hash.substring(1) : "dashboard";
    if (document.getElementById(`view-${initialView}`)) {
        switchToView(initialView);
    } else {
        switchToView("dashboard");
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
} else {
    initApp();
}

function updateHeaderBranding() {
    const schoolLogoImg = document.getElementById("header-school-logo");
    const defaultLogoSvg = document.getElementById("header-default-logo");
    const schoolNameSpan = document.getElementById("header-school-name");
    
    if (state.db && state.db.tenant) {
        if (schoolNameSpan) {
            schoolNameSpan.innerText = state.db.tenant.name || "School";
        }
        
        if (schoolLogoImg && defaultLogoSvg) {
            if (state.db.tenant.logo) {
                schoolLogoImg.src = state.db.tenant.logo;
                schoolLogoImg.style.display = "inline-block";
                defaultLogoSvg.style.display = "none";
            } else {
                schoolLogoImg.src = "";
                schoolLogoImg.style.display = "none";
                defaultLogoSvg.style.display = "inline-block";
            }
        }
    }
}

function initThemeSwitcher() {
    const switcher = document.getElementById("theme-switcher");
    const buttons = switcher.querySelectorAll(".theme-pill-btn");
    
    // Set slider initial offset
    state.setTheme(state.activeTheme);

    buttons.forEach(btn => {
        btn.addEventListener("click", () => {
            buttons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            
            const targetTheme = btn.getAttribute("data-theme");
            state.setTheme(targetTheme);
            Toaster.success(`Theme updated to: ${targetTheme.toUpperCase()} MODE`);
        });
    });
}

function renderPersonaSelectorOptions() {
    const select = document.getElementById("persona-select");
    const currentVal = select.value || state.activeRole;
    select.innerHTML = "";
    state.db.roles.forEach(r => {
        const option = document.createElement("option");
        option.value = r.id;
        option.innerText = r.name;
        select.appendChild(option);
    });
    select.value = currentVal;
}

function initPersonaSelector() {
    const select = document.getElementById("persona-select");
    renderPersonaSelectorOptions();
    select.value = state.activeRole;
    
    select.addEventListener("change", (e) => {
        state.activeRole = e.target.value;
        const activeUser = state.getCurrentUser();
        
        // UI Header Updates
        document.getElementById("active-user-avatar").src = activeUser.avatar;
        document.getElementById("active-user-name").innerText = `${activeUser.first_name} ${activeUser.last_name}`;
        
        const activeRoleObj = state.db.roles.find(r => r.id === state.activeRole);
        document.getElementById("active-user-role-lbl").innerText = activeRoleObj ? activeRoleObj.name : "Staff";

        // Enforce RBAC permission changes
        enforceRBAC();
        
        // Reset selections to avoid layout leakage
        state.activePlayerAssessmentId = null;
        state.activeGrowthPlanUserId = null;
        state.selectedTemplateId = null;
        state.selectedScaleId = null;
        state.selectedRubricId = null;

        // Redirect if tab unauthorized
        const navItem = document.querySelector(`.nav-item[data-view="${state.activeView}"]`);
        if (navItem && navItem.classList.contains("hidden-rbac")) {
            switchToView("dashboard");
        } else {
            switchToView(state.activeView);
        }

        Toaster.info(`RBAC Persona Switched to ${select.options[select.selectedIndex].text}`);
    });

    enforceRBAC();
}

function renderSessionSelectorOptions() {
    const select = document.getElementById("session-select");
    if (!select) return;
    const currentVal = select.value || state.db.activeSessionId;
    select.innerHTML = "";
    state.db.sessions.forEach(s => {
        const option = document.createElement("option");
        option.value = s.id;
        option.innerText = s.name;
        select.appendChild(option);
    });
    select.value = currentVal;
}

function initSessionSelector() {
    const select = document.getElementById("session-select");
    if (!select) return;
    renderSessionSelectorOptions();
    select.value = state.db.activeSessionId;
    
    select.addEventListener("change", (e) => {
        state.db.activeSessionId = e.target.value;
        state.saveDatabase();
        
        // Refresh the current view to reflect data scoping
        switchToView(state.activeView);
        
        Toaster.info(`Academic Session Switched to ${select.options[select.selectedIndex].text}`);
    });
}

function enforceRBAC() {
    const navItems = document.querySelectorAll(".nav-item[data-permission]");
    
    const rolePermissions = {};
    state.db.roles.forEach(r => {
        rolePermissions[r.id] = r.permissions;
    });

    const activePermissions = rolePermissions[state.activeRole] || [];

    navItems.forEach(item => {
        const required = item.getAttribute("data-permission");
        if (activePermissions.includes(required)) {
            item.classList.remove("hidden-rbac");
        } else {
            item.classList.add("hidden-rbac");
        }
    });
}

// Collapsible Navigation and Hamburger
function initSidebarNavigation() {
    const sidebar = document.getElementById("app-sidebar");
    const toggleBtn = document.getElementById("btn-sidebar-collapse");
    
    // Desktop Collapse Toggle Action
    toggleBtn.addEventListener("click", () => {
        sidebar.classList.toggle("collapsed");
        const isCollapsed = sidebar.classList.contains("collapsed");
        localStorage.setItem("revu_sidebar_collapsed", isCollapsed);
    });
    
    // Load state
    if (localStorage.getItem("revu_sidebar_collapsed") === "true") {
        sidebar.classList.add("collapsed");
    }

    // Mobile Hamburger
    const hamburger = document.getElementById("btn-mobile-hamburger");
    hamburger.addEventListener("click", (e) => {
        e.stopPropagation();
        sidebar.classList.toggle("mobile-open");
    });

    document.addEventListener("click", (e) => {
        if (!sidebar.contains(e.target) && sidebar.classList.contains("mobile-open")) {
            sidebar.classList.remove("mobile-open");
        }
    });

    // View Switching clicks
    const navItems = document.querySelectorAll(".nav-item");
    navItems.forEach(item => {
        item.addEventListener("click", () => {
            navItems.forEach(n => n.classList.remove("active"));
            item.classList.add("active");
            
            // Auto close mobile drawer
            sidebar.classList.remove("mobile-open");
            
            // Clear active player when manually switching tabs via sidebar
            state.activePlayerAssessmentId = null;
            switchToView(item.getAttribute("data-view"));
        });
    });
}

function switchToView(viewId) {
    state.activeView = viewId;
    
    // Sync URL Hash for refresh retention & back button support
    if (window.location.hash !== `#${viewId}`) {
        window.location.hash = viewId;
    }

    // Sync active sidebar item class
    const navItems = document.querySelectorAll(".nav-item");
    navItems.forEach(n => {
        if (n.getAttribute("data-view") === viewId) {
            n.classList.add("active");
        } else {
            n.classList.remove("active");
        }
    });

    // Render skeleton dynamic loading block (Simulate premium API call)
    const contentArea = document.getElementById("app-content");
    
    // Remove existing loaders
    const oldLoader = document.getElementById("skeleton-screen-loader");
    if (oldLoader) oldLoader.remove();

    // Create skeleton screens wrapper overlay
    const skeleton = document.createElement("div");
    skeleton.id = "skeleton-screen-loader";
    skeleton.className = "skeleton-loading-overlay";
    skeleton.innerHTML = `
        <div class="skeleton-header"></div>
        <div class="skeleton-cards-grid">
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>
        </div>
        <div class="skeleton-table-block"></div>
    `;
    contentArea.appendChild(skeleton);

    // Hide all view panels during skeleton phase
    document.querySelectorAll(".view-panel").forEach(p => p.classList.remove("active"));

    // Delay render to make transitions elegant
    setTimeout(() => {
        skeleton.style.opacity = "0";
        setTimeout(() => {
            skeleton.remove();
            
            // Show real panel
            const panel = document.getElementById(`view-${viewId}`);
            if (panel) {
                panel.classList.add("active");
            }
            renderActiveView();
        }, 150);
    }, 350);
}

function renderActiveView() {
    switch (state.activeView) {
        case "dashboard":
            renderDashboard();
            break;
        case "roster":
            renderRoster();
            break;
        case "scales-rubrics":
            renderScalesRubrics();
            break;
        case "template-builder":
            renderTemplateBuilder();
            break;
        case "observations":
            renderObservations();
            break;
        case "appraisals":
            renderAppraisals();
            break;
        case "growth-plans":
            renderGrowthPlans();
            break;
        case "reports":
            renderAnalytics();
            break;
        case "ai-insights":
            renderAIInsights();
            break;
        case "schema-explorer":
            renderSchemaExplorer();
            break;
        case "settings":
            renderSettings();
            break;
    }
}

function initSubTabs() {
    const tabs = document.querySelectorAll(".nested-tab");
    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            const container = tab.closest(".view-panel");
            container.querySelectorAll(".nested-tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");

            const targetName = tab.getAttribute("data-nested-tab");
            container.querySelectorAll(".nested-view").forEach(v => v.classList.remove("active"));
            container.querySelector(`#nested-view-${targetName}`).classList.add("active");

            if (targetName === "roster-classes" || targetName === "settings-classes" || targetName === "settings-depts") {
                renderClassesSectionsList();
            }
        });
    });
}

function openModal(modalId) {
    document.getElementById(modalId).classList.remove("hidden");
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add("hidden");
}

// =========================================================================
// 5. VIEW BUILDER: DASHBOARD
// =========================================================================
function renderDashboard() {
    let usersList = state.db.users.filter(u => u.role === "staff_member");
    let cycleAssessments = state.db.assessments.filter(a => a.session_id === state.db.activeSessionId);
    
    if (state.activeRole === "dept_head") {
        usersList = usersList.filter(u => u.dept_id === "dept-teach");
        cycleAssessments = cycleAssessments.filter(a => {
            const subject = state.db.users.find(u => u.id === a.subject_id);
            return subject && subject.dept_id === "dept-teach";
        });
    } else if (state.activeRole === "staff_member") {
        usersList = usersList.filter(u => u.id === state.getCurrentUser().id);
        cycleAssessments = cycleAssessments.filter(a => a.subject_id === state.getCurrentUser().id);
    }
    
    document.getElementById("dash-stat-users").innerText = usersList.length;
    document.getElementById("dash-stat-templates").innerText = state.db.templates.length;
    
    const completedCount = cycleAssessments.filter(a => a.status === "signed_off" || a.status === "evaluator_completed").length;
    document.getElementById("dash-stat-completions").innerText = `${completedCount}/${cycleAssessments.length}`;
    
    const signedOff = cycleAssessments.filter(a => a.status === "signed_off" && a.score);
    if (signedOff.length > 0) {
        const sum = signedOff.reduce((acc, curr) => acc + parseFloat(curr.score), 0);
        const avg = (sum / signedOff.length).toFixed(1);
        document.getElementById("dash-stat-avg-score").innerText = `${(avg/20).toFixed(2)} / 5 (${avg}%)`;
    } else {
        document.getElementById("dash-stat-avg-score").innerText = "N/A";
    }

    const tbody = document.getElementById("dash-recent-assessments");
    tbody.innerHTML = "";
    
    const recent = [...cycleAssessments].sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0,5);
    
    recent.forEach(evalItem => {
        const subject = state.db.users.find(u => u.id === evalItem.subject_id);
        const evaluator = state.db.users.find(u => u.id === evalItem.evaluator_id);
        const dept = state.db.departments.find(d => d.id === subject.dept_id);
        
        const tr = document.createElement("tr");
        tr.style.cursor = "pointer";
        tr.addEventListener("click", (evt) => {
            if (evt.target.tagName !== "BUTTON" && evt.target.closest("button") === null) {
                openAppraisalFromDashboard(evalItem.id);
            }
        });
        tr.innerHTML = `
            <td>
                <div style="display:flex;align-items:center;gap:10px;">
                    <img src="${subject.avatar}" class="avatar" style="width:24px;height:24px;">
                    <strong>${subject.first_name} ${subject.last_name}</strong>
                </div>
            </td>
            <td>${dept ? dept.name : "N/A"}</td>
            <td>${evaluator.first_name} ${evaluator.last_name}</td>
            <td><span class="badge ${evalItem.status}">${evalItem.status.replace('_', ' ')}</span></td>
            <td><strong>${evalItem.score ? evalItem.score.toFixed(1) + '%' : '--'}</strong></td>
            <td>
                <button class="small-btn secondary-btn" onclick="openAppraisalFromDashboard('${evalItem.id}')">Open</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function openAppraisalFromDashboard(evalId) {
    state.activePlayerAssessmentId = evalId;
    state.activeStepIndex = 0; // Reset wizard step index
    const evalItem = state.db.assessments.find(a => a.id === evalId);
    if (evalItem) {
        const tmpl = state.db.templates.find(t => t.id === evalItem.template_id);
        if (tmpl && tmpl.category === "academic") {
            switchToView("observations");
            return;
        }
    }
    switchToView("appraisals");
}

// =========================================================================
// 6. ENTERPRISE TABLES ENGINE: STAFF ROSTER
// =========================================================================
function initRosterEnterpriseTable() {
    // Search Box Listener
    document.getElementById("roster-search").addEventListener("input", () => {
        state.rosterPage = 1;
        renderRoster();
    });
    
    // Department Selector Listener
    document.getElementById("roster-dept-filter").addEventListener("change", () => {
        state.rosterPage = 1;
        renderRoster();
    });

    // Column sorting click headers
    document.getElementById("th-roster-name").addEventListener("click", () => {
        const ind = document.getElementById("sort-ind-name");
        if (state.rosterSortDir === "asc") {
            state.rosterSortDir = "desc";
            ind.innerText = "▼";
        } else {
            state.rosterSortDir = "asc";
            ind.innerText = "▲";
        }
        renderRoster();
    });

    // Roster Columns visibility toggle box popup
    const colToggleBtn = document.getElementById("btn-roster-column-toggle");
    const colPopover = document.getElementById("roster-column-toggle-popover");
    
    colToggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        colPopover.classList.toggle("hidden");
    });
    
    document.addEventListener("click", (e) => {
        if (!colPopover.contains(e.target) && e.target !== colToggleBtn) {
            colPopover.classList.add("hidden");
        }
    });

    colPopover.querySelectorAll("input[type='checkbox']").forEach(box => {
        box.addEventListener("change", (e) => {
            const col = box.getAttribute("data-col");
            state.rosterCols[col] = e.target.checked;
            renderRoster();
        });
    });

    // Roster rows multi select all
    const selectAllCheck = document.getElementById("roster-select-all");
    selectAllCheck.addEventListener("change", (e) => {
        const displayedUsers = getFilteredRosterRows();
        if (e.target.checked) {
            displayedUsers.forEach(u => state.rosterSelectedIds.add(u.id));
        } else {
            displayedUsers.forEach(u => state.rosterSelectedIds.delete(u.id));
        }
        renderRoster();
    });

    // Export Selected CSV Button
    document.getElementById("btn-export-roster").addEventListener("click", () => {
        if (state.rosterSelectedIds.size === 0) {
            Toaster.warning("Selection required: Check checkboxes to select users for CSV export.");
            return;
        }
        
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "email,first_name,last_name,department,roles\n";
        
        state.rosterSelectedIds.forEach(id => {
            const u = state.db.users.find(x => x.id === id);
            if (u) {
                const dept = state.db.departments.find(d => d.id === u.dept_id);
                csvContent += `"${u.email}","${u.first_name}","${u.last_name}","${dept ? dept.name : ''}","${u.role}"\n`;
            }
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "revu_selected_roster.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        Toaster.success(`CSV Exported: Downloaded data for ${state.rosterSelectedIds.size} staff members.`);
    });

    // Import CSV Modal button
    document.getElementById("btn-import-roster").addEventListener("click", () => {
        if (state.activeRole !== "tenant_admin") {
            Toaster.error("RBAC Denied: Administrator role required to import records.");
            return;
        }
        
        // Reset Roster Import Modal fields
        const textarea = document.getElementById("roster-paste-textarea");
        if (textarea) textarea.value = "";
        
        const fileInput = document.getElementById("csv-file-input");
        if (fileInput) fileInput.value = "";
        
        const logBox = document.getElementById("csv-import-log");
        if (logBox) {
            logBox.classList.add("hidden");
            logBox.innerHTML = "";
        }
        
        const submitBtn = document.getElementById("btn-submit-csv-import");
        if (submitBtn) submitBtn.disabled = true;
        
        pendingRosterImportData = null;
        
        if (window.setRosterImportTab) {
            window.setRosterImportTab("upload");
        }
        
        openModal("modal-csv-import");
    });

    // Add Member Manual Button click
    document.getElementById("btn-add-member").addEventListener("click", () => {
        openAddMemberModal();
    });

    // Submit Member Form Button click
    document.getElementById("btn-submit-member").addEventListener("click", () => {
        submitMemberForm();
    });

    // Role change listener to toggle class/section visibility
    const memberRoleSelect = document.getElementById("member-role");
    if (memberRoleSelect) {
        memberRoleSelect.addEventListener("change", () => {
            updateClassSectionVisibility();
        });
    }

    // Populate departments filter dropdown initially
    populateDeptFilterDropdown();

    // Add Department Button click
    const addDeptBtn = document.getElementById("btn-add-dept");
    if (addDeptBtn) {
        addDeptBtn.addEventListener("click", () => {
            openAddDeptModal();
        });
    }

    // Submit Department Form Button click
    document.getElementById("btn-submit-dept").addEventListener("click", () => {
        submitDeptForm();
    });
}

function getFilteredRosterRows() {
    const searchVal = document.getElementById("roster-search").value.toLowerCase();
    const deptFilter = document.getElementById("roster-dept-filter").value;

    let users = state.db.users.filter(user => {
        const matchSearch = `${user.first_name} ${user.last_name} ${user.email}`.toLowerCase().includes(searchVal);
        
        let matchDept = true;
        if (deptFilter !== "all") {
            matchDept = (user.dept_id === deptFilter || isChildDepartment(user.dept_id, deptFilter));
        }
        return matchSearch && matchDept;
    });

    // Sorting
    users.sort((a,b) => {
        const nameA = `${a.first_name} ${a.last_name}`.toLowerCase();
        const nameB = `${b.first_name} ${b.last_name}`.toLowerCase();
        
        if (state.rosterSortDir === "asc") {
            return nameA.localeCompare(nameB);
        } else {
            return nameB.localeCompare(nameA);
        }
    });

    return users;
}

function populateClassSectionDropdowns() {
    // 1. Start Observation Modal
    const obsClassSelect = document.getElementById("obs-modal-class");
    if (obsClassSelect) {
        obsClassSelect.innerHTML = '<option value="">-- All Classes --</option>';
        (state.db.classes || []).forEach(c => {
            const opt = document.createElement("option");
            opt.value = c;
            opt.innerText = c;
            obsClassSelect.appendChild(opt);
        });
    }

    const obsSectionSelect = document.getElementById("obs-modal-section");
    if (obsSectionSelect) {
        obsSectionSelect.innerHTML = '<option value="">-- All Sections --</option>';
        (state.db.sections || []).forEach(s => {
            const opt = document.createElement("option");
            opt.value = s;
            opt.innerText = s;
            obsSectionSelect.appendChild(opt);
        });
    }

    // 2. Member Roster Modal
    const memberClassSelect = document.getElementById("member-class");
    if (memberClassSelect) {
        memberClassSelect.innerHTML = '<option value="">-- None --</option>';
        (state.db.classes || []).forEach(c => {
            const opt = document.createElement("option");
            opt.value = c;
            opt.innerText = c;
            memberClassSelect.appendChild(opt);
        });
    }

    const memberSectionSelect = document.getElementById("member-section");
    if (memberSectionSelect) {
        memberSectionSelect.innerHTML = '<option value="">-- None --</option>';
        (state.db.sections || []).forEach(s => {
            const opt = document.createElement("option");
            opt.value = s;
            opt.innerText = s;
            memberSectionSelect.appendChild(opt);
        });
    }
}

function renderClassesSectionsList() {
    // 1. Render Classes
    const classList = document.getElementById("class-list");
    if (classList) {
        classList.innerHTML = "";
        (state.db.classes || []).forEach(c => {
            const li = document.createElement("li");
            li.style.display = "flex";
            li.style.justifyContent = "space-between";
            li.style.alignItems = "center";
            li.style.padding = "10px 14px";
            li.style.borderRadius = "6px";
            li.style.marginBottom = "6px";
            li.style.backgroundColor = "rgba(255,255,255,0.02)";
            li.style.border = "1px solid var(--border-color)";
            li.innerHTML = `
                <span style="font-weight:600;color:var(--text-primary);">${c}</span>
                <div style="display:flex; gap:6px;">
                    <button class="small-btn secondary-btn" style="padding: 2px 6px; font-size:10.5px;" onclick="editClass('${c}')" ${state.activeRole !== 'tenant_admin' ? 'disabled' : ''}>Edit</button>
                    <button class="small-btn danger-btn" style="padding: 2px 6px; font-size:10.5px;" onclick="deleteClass('${c}')" ${state.activeRole !== 'tenant_admin' ? 'disabled' : ''}>Delete</button>
                </div>
            `;
            classList.appendChild(li);
        });
    }

    // 2. Render Sections
    const sectionList = document.getElementById("section-list");
    if (sectionList) {
        sectionList.innerHTML = "";
        (state.db.sections || []).forEach(s => {
            const li = document.createElement("li");
            li.style.display = "flex";
            li.style.justifyContent = "space-between";
            li.style.alignItems = "center";
            li.style.padding = "10px 14px";
            li.style.borderRadius = "6px";
            li.style.marginBottom = "6px";
            li.style.backgroundColor = "rgba(255,255,255,0.02)";
            li.style.border = "1px solid var(--border-color)";
            li.innerHTML = `
                <span style="font-weight:600;color:var(--text-primary);">${s}</span>
                <div style="display:flex; gap:6px;">
                    <button class="small-btn secondary-btn" style="padding: 2px 6px; font-size:10.5px;" onclick="editSection('${s}')" ${state.activeRole !== 'tenant_admin' ? 'disabled' : ''}>Edit</button>
                    <button class="small-btn danger-btn" style="padding: 2px 6px; font-size:10.5px;" onclick="deleteSection('${s}')" ${state.activeRole !== 'tenant_admin' ? 'disabled' : ''}>Delete</button>
                </div>
            `;
            sectionList.appendChild(li);
        });
    }

    // 3. Render Groups/Departments
    const groupList = document.getElementById("group-dept-list");
    if (groupList) {
        groupList.innerHTML = "";
        (state.db.departments || []).forEach(d => {
            const li = document.createElement("li");
            li.style.display = "flex";
            li.style.justifyContent = "space-between";
            li.style.alignItems = "center";
            li.style.padding = "10px 14px";
            li.style.borderRadius = "6px";
            li.style.marginBottom = "6px";
            li.style.backgroundColor = "rgba(255,255,255,0.02)";
            li.style.border = "1px solid var(--border-color)";
            li.innerHTML = `
                <div>
                    <span style="font-weight:600;color:var(--text-primary);display:block;">${d.name}</span>
                    <span style="font-size:10px;color:var(--text-muted);">${d.code}</span>
                </div>
                <div style="display:flex; gap:6px;">
                    <button class="small-btn secondary-btn" style="padding: 2px 6px; font-size:10.5px;" onclick="openEditDeptModal('${d.id}')" ${state.activeRole !== 'tenant_admin' ? 'disabled' : ''}>Edit</button>
                    <button class="small-btn danger-btn" style="padding: 2px 6px; font-size:10.5px;" onclick="deleteGroupDept('${d.id}')" ${state.activeRole !== 'tenant_admin' ? 'disabled' : ''}>Delete</button>
                </div>
            `;
            groupList.appendChild(li);
        });
    }
}

function openCustomConfigPrompt({ title, label, defaultValue, isEdit, onSubmit }) {
    const modal = document.getElementById("modal-config-prompt");
    if (!modal) return;
    
    document.getElementById("config-prompt-title").innerText = title;
    document.getElementById("config-prompt-label").innerText = label;
    
    const input = document.getElementById("config-prompt-input");
    input.value = defaultValue || "";
    
    const textarea = document.getElementById("config-prompt-textarea");
    if (textarea) textarea.value = "";

    const dropZoneText = document.getElementById("config-drop-zone-text");
    if (dropZoneText) dropZoneText.innerText = "Click or Drag & Drop CSV / TXT here";

    const fileInput = document.getElementById("config-file-input");
    if (fileInput) fileInput.value = "";

    const tabsContainer = document.getElementById("config-prompt-tabs");
    const singleBody = document.getElementById("config-prompt-single-body");
    const pasteBody = document.getElementById("config-prompt-paste-body");
    const uploadBody = document.getElementById("config-prompt-upload-body");
    
    const tabSingle = document.getElementById("config-tab-single");
    const tabPaste = document.getElementById("config-tab-paste");
    const tabUpload = document.getElementById("config-tab-upload");
    
    let activeTab = "single";
    let uploadedItems = [];
    
    function setTab(tabType) {
        activeTab = tabType;
        
        [
            { tab: tabSingle, type: "single" },
            { tab: tabPaste, type: "paste" },
            { tab: tabUpload, type: "upload" }
        ].forEach(({ tab, type }) => {
            if (!tab) return;
            if (activeTab === type) {
                tab.style.color = "var(--text-primary)";
                tab.style.borderBottom = "2px solid var(--color-primary)";
                tab.style.fontWeight = "600";
            } else {
                tab.style.color = "var(--text-muted)";
                tab.style.borderBottom = "2px solid transparent";
                tab.style.fontWeight = "500";
            }
        });
        
        if (singleBody) {
            if (activeTab === "single") singleBody.classList.remove("hidden");
            else singleBody.classList.add("hidden");
        }
        if (pasteBody) {
            if (activeTab === "paste") pasteBody.classList.remove("hidden");
            else pasteBody.classList.add("hidden");
        }
        if (uploadBody) {
            if (activeTab === "upload") uploadBody.classList.remove("hidden");
            else uploadBody.classList.add("hidden");
        }
        
        if (activeTab === "single") {
            setTimeout(() => input.focus(), 50);
        } else if (activeTab === "paste") {
            setTimeout(() => textarea.focus(), 50);
        }
    }
    
    if (isEdit) {
        if (tabsContainer) tabsContainer.classList.add("hidden");
        setTab("single");
    } else {
        if (tabsContainer) tabsContainer.classList.remove("hidden");
        if (tabSingle) tabSingle.onclick = () => setTab("single");
        if (tabPaste) tabPaste.onclick = () => setTab("paste");
        if (tabUpload) tabUpload.onclick = () => setTab("upload");
        
        const pasteLabel = document.getElementById("config-prompt-paste-label");
        if (pasteLabel) {
            pasteLabel.innerText = `Paste ${label.toLowerCase()} list from Excel (one entry per line, or separated by commas/tabs)`;
        }
        
        const downloadSampleBtn = document.getElementById("btn-download-config-sample");
        if (downloadSampleBtn) {
            const newDownloadBtn = downloadSampleBtn.cloneNode(true);
            downloadSampleBtn.parentNode.replaceChild(newDownloadBtn, downloadSampleBtn);
            
            newDownloadBtn.onclick = (e) => {
                e.preventDefault();
                let csvContent = "name\n";
                let filename = "sample.csv";
                if (label.toLowerCase().includes("class")) {
                    csvContent += "Grade I\nGrade II\nGrade III\nGrade IV\n";
                    filename = "revu_classes_sample.csv";
                } else {
                    csvContent += "A\nB\nC\nD\n";
                    filename = "revu_sections_sample.csv";
                }
                const encodedUri = encodeURI("data:text/csv;charset=utf-8," + csvContent);
                const link = document.createElement("a");
                link.setAttribute("href", encodedUri);
                link.setAttribute("download", filename);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                Toaster.success("Sample template downloaded successfully.");
            };
        }
        
        const dropZone = document.getElementById("config-drop-zone");
        if (dropZone && fileInput) {
            dropZone.onclick = () => fileInput.click();
            
            dropZone.ondragover = (e) => {
                e.preventDefault();
                dropZone.style.borderColor = "var(--color-primary)";
                dropZone.style.background = "rgba(0,0,0,0.05)";
            };
            dropZone.ondragleave = () => {
                dropZone.style.borderColor = "var(--border-color)";
                dropZone.style.background = "rgba(0,0,0,0.02)";
            };
            dropZone.ondrop = (e) => {
                e.preventDefault();
                dropZone.style.borderColor = "var(--border-color)";
                dropZone.style.background = "rgba(0,0,0,0.02)";
                
                const file = e.dataTransfer.files[0];
                if (file) {
                    processUploadedFile(file);
                }
            };
            
            fileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    processUploadedFile(file);
                }
            };
        }
        
        setTab("single");
    }
    
    function processUploadedFile(file) {
        if (!file.name.endsWith(".csv") && !file.name.endsWith(".txt")) {
            Toaster.error("Invalid file format. Please upload a .csv or .txt file.");
            return;
        }
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const text = e.target.result;
            const lines = text.split(/[\r\n]+/);
            let parsed = [];
            lines.forEach((line, index) => {
                let val = line.trim();
                if (!val) return;
                val = val.replace(/^["']|["']$/g, "").trim();
                if (!val) return;
                
                if (index === 0 && val.toLowerCase() === "name") {
                    return;
                }
                
                const parts = val.split(",");
                const firstCol = parts[0].trim().replace(/^["']|["']$/g, "").trim();
                if (firstCol) {
                    parsed.push(firstCol);
                }
            });
            
            uploadedItems = parsed;
            if (dropZoneText) {
                dropZoneText.innerHTML = `<span style="color: var(--color-success); font-weight:600;">✓ File loaded successfully</span><br><span style="font-size:12px;color:var(--text-primary);">${file.name} (${parsed.length} entries found)</span>`;
            }
            Toaster.success(`Loaded ${parsed.length} entries from ${file.name}.`);
        };
        reader.readAsText(file);
    }
    
    const submitBtn = document.getElementById("btn-config-prompt-submit");
    
    const newSubmitBtn = submitBtn.cloneNode(true);
    submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
    
    newSubmitBtn.addEventListener("click", () => {
        if (activeTab === "single") {
            const val = input.value.trim();
            if (onSubmit(val, false)) {
                closeModal("modal-config-prompt");
            }
        } else if (activeTab === "paste") {
            const rawVal = textarea.value;
            const items = rawVal
                .split(/[\r\n\t,]+/)
                .map(item => item.trim())
                .filter(Boolean);
            
            if (onSubmit(items, true)) {
                closeModal("modal-config-prompt");
            }
        } else if (activeTab === "upload") {
            if (uploadedItems.length === 0) {
                Toaster.warning("No entries loaded. Please select or drop a valid file first.");
                return;
            }
            if (onSubmit(uploadedItems, true)) {
                closeModal("modal-config-prompt");
            }
        }
    });
    
    openModal("modal-config-prompt");
}

function addClass() {
    if (state.activeRole !== "tenant_admin") {
        Toaster.error("RBAC Denied: Administrator role required to manage institutional parameters.");
        return;
    }
    openCustomConfigPrompt({
        title: "Add New Class",
        label: "Class Name",
        defaultValue: "",
        isEdit: false,
        onSubmit: (val, isBulk) => {
            if (isBulk) {
                if (!val || val.length === 0) {
                    Toaster.warning("No classes entered.");
                    return false;
                }
                const existing = state.db.classes || [];
                const toAdd = [];
                let duplicateCount = 0;
                let existingCount = 0;
                
                val.forEach(item => {
                    if (existing.includes(item)) {
                        existingCount++;
                    } else if (toAdd.includes(item)) {
                        duplicateCount++;
                    } else {
                        toAdd.push(item);
                    }
                });
                
                if (toAdd.length === 0) {
                    Toaster.warning("All entered classes already exist or are duplicates.");
                    return true;
                }
                
                state.db.classes = [...existing, ...toAdd];
                state.saveDatabase();
                
                let msg = `Successfully added ${toAdd.length} classes.`;
                if (existingCount > 0 || duplicateCount > 0) {
                    msg += ` Ignored ${existingCount + duplicateCount} duplicate/existing entries.`;
                }
                Toaster.success(msg);
                renderClassesSectionsList();
                populateClassSectionDropdowns();
                return true;
            } else {
                if (!val) {
                    Toaster.warning("Class name cannot be empty.");
                    return false;
                }
                if (state.db.classes.includes(val)) {
                    Toaster.warning("Class already exists.");
                    return false;
                }
                state.db.classes.push(val);
                state.saveDatabase();
                Toaster.success(`Class "${val}" successfully added.`);
                renderClassesSectionsList();
                populateClassSectionDropdowns();
                return true;
            }
        }
    });
}

function deleteClass(className) {
    if (state.activeRole !== "tenant_admin") {
        Toaster.error("RBAC Denied: Administrator role required to manage institutional parameters.");
        return;
    }
    if (!confirm(`Are you sure you want to delete class "${className}"? This will clear class assignments for any teachers in this class.`)) {
        return;
    }
    
    // Remove class from database list
    state.db.classes = state.db.classes.filter(c => c !== className);
    
    // Clear assignments in users
    state.db.users.forEach(u => {
        if (u.assigned_class === className) u.assigned_class = null;
    });
    // Clear assignments in assessments
    state.db.assessments.forEach(a => {
        if (a.class === className) a.class = null;
    });
    
    state.saveDatabase();
    Toaster.success(`Class "${className}" deleted.`);
    renderClassesSectionsList();
    populateClassSectionDropdowns();
    renderRoster(); // re-render roster table to show updated assigned classes
}

function addSection() {
    if (state.activeRole !== "tenant_admin") {
        Toaster.error("RBAC Denied: Administrator role required to manage institutional parameters.");
        return;
    }
    openCustomConfigPrompt({
        title: "Add New Section",
        label: "Section Name",
        defaultValue: "",
        isEdit: false,
        onSubmit: (val, isBulk) => {
            if (isBulk) {
                if (!val || val.length === 0) {
                    Toaster.warning("No sections entered.");
                    return false;
                }
                const existing = state.db.sections || [];
                const toAdd = [];
                let duplicateCount = 0;
                let existingCount = 0;
                
                val.forEach(item => {
                    if (existing.includes(item)) {
                        existingCount++;
                    } else if (toAdd.includes(item)) {
                        duplicateCount++;
                    } else {
                        toAdd.push(item);
                    }
                });
                
                if (toAdd.length === 0) {
                    Toaster.warning("All entered sections already exist or are duplicates.");
                    return true;
                }
                
                state.db.sections = [...existing, ...toAdd];
                state.saveDatabase();
                
                let msg = `Successfully added ${toAdd.length} sections.`;
                if (existingCount > 0 || duplicateCount > 0) {
                    msg += ` Ignored ${existingCount + duplicateCount} duplicate/existing entries.`;
                }
                Toaster.success(msg);
                renderClassesSectionsList();
                populateClassSectionDropdowns();
                return true;
            } else {
                if (!val) {
                    Toaster.warning("Section name cannot be empty.");
                    return false;
                }
                if (state.db.sections.includes(val)) {
                    Toaster.warning("Section already exists.");
                    return false;
                }
                state.db.sections.push(val);
                state.saveDatabase();
                Toaster.success(`Section "${val}" successfully added.`);
                renderClassesSectionsList();
                populateClassSectionDropdowns();
                return true;
            }
        }
    });
}

function deleteSection(sectionName) {
    if (state.activeRole !== "tenant_admin") {
        Toaster.error("RBAC Denied: Administrator role required to manage institutional parameters.");
        return;
    }
    if (!confirm(`Are you sure you want to delete section "${sectionName}"? This will clear section assignments for any teachers in this section.`)) {
        return;
    }
    
    // Remove section from database list
    state.db.sections = state.db.sections.filter(s => s !== sectionName);
    
    // Clear assignments in users
    state.db.users.forEach(u => {
        if (u.assigned_section === sectionName) u.assigned_section = null;
    });
    // Clear assignments in assessments
    state.db.assessments.forEach(a => {
        if (a.section === sectionName) a.section = null;
    });
    
    state.saveDatabase();
    Toaster.success(`Section "${sectionName}" deleted.`);
    renderClassesSectionsList();
    populateClassSectionDropdowns();
    renderRoster(); // re-render roster table to show updated assigned sections
}

function deleteGroupDept(deptId) {
    if (state.activeRole !== "tenant_admin") {
        Toaster.error("RBAC Denied: Administrator role required.");
        return;
    }
    
    // Don't allow deleting default academic dept
    if (deptId === "dept-teach" || deptId === "dept-acad") {
        Toaster.error("Cannot delete core institutional departments.");
        return;
    }
    
    if (!confirm("Are you sure you want to delete this group/department? Users assigned to it will be set to Unassigned.")) {
        return;
    }
    
    // Remove dept
    state.db.departments = state.db.departments.filter(d => d.id !== deptId);
    
    // Set users assigned to it to null/unassigned
    state.db.users.forEach(u => {
        if (u.dept_id === deptId) u.dept_id = null;
    });
    
    state.saveDatabase();
    Toaster.success("Department/Group successfully deleted.");
    renderClassesSectionsList();
    populateDeptFilterDropdown();
    renderRoster();
}

function initClassesSectionsEvents() {
    const addClassBtn = document.getElementById("btn-add-class");
    if (addClassBtn) {
        addClassBtn.addEventListener("click", () => {
            addClass();
        });
    }

    const addSectionBtn = document.getElementById("btn-add-section");
    if (addSectionBtn) {
        addSectionBtn.addEventListener("click", () => {
            addSection();
        });
    }

    const addGroupBtn = document.getElementById("btn-add-group-dept");
    if (addGroupBtn) {
        addGroupBtn.addEventListener("click", () => {
            openAddDeptModal();
        });
    }
}

// Bind to window for global inline event handler access
window.deleteClass = deleteClass;
window.deleteSection = deleteSection;
window.deleteGroupDept = deleteGroupDept;

function editClass(className) {
    if (state.activeRole !== "tenant_admin") {
        Toaster.error("RBAC Denied: Administrator role required to manage institutional parameters.");
        return;
    }
    openCustomConfigPrompt({
        title: "Edit Class Name",
        label: "New Class Name",
        defaultValue: className,
        isEdit: true,
        onSubmit: (val) => {
            if (!val) {
                Toaster.warning("Class name cannot be empty.");
                return false;
            }
            if (val === className) return true; // unchanged, close
            if (state.db.classes.includes(val)) {
                Toaster.warning("Class name already exists.");
                return false;
            }

            // Rename in list
            state.db.classes = state.db.classes.map(c => c === className ? val : c);

            // Rename in users
            state.db.users.forEach(u => {
                if (u.assigned_class === className) u.assigned_class = val;
            });

            // Rename in assessments
            state.db.assessments.forEach(a => {
                if (a.class === className) a.class = val;
            });

            state.saveDatabase();
            Toaster.success(`Class renamed to "${val}".`);
            renderClassesSectionsList();
            populateClassSectionDropdowns();
            renderRoster();
            return true;
        }
    });
}

function editSection(sectionName) {
    if (state.activeRole !== "tenant_admin") {
        Toaster.error("RBAC Denied: Administrator role required to manage institutional parameters.");
        return;
    }
    openCustomConfigPrompt({
        title: "Edit Section Name",
        label: "New Section Name",
        defaultValue: sectionName,
        isEdit: true,
        onSubmit: (val) => {
            if (!val) {
                Toaster.warning("Section name cannot be empty.");
                return false;
            }
            if (val === sectionName) return true; // unchanged
            if (state.db.sections.includes(val)) {
                Toaster.warning("Section name already exists.");
                return false;
            }

            // Rename in list
            state.db.sections = state.db.sections.map(s => s === sectionName ? val : s);

            // Rename in users
            state.db.users.forEach(u => {
                if (u.assigned_section === sectionName) u.assigned_section = val;
            });

            // Rename in assessments
            state.db.assessments.forEach(a => {
                if (a.section === sectionName) a.section = val;
            });

            state.saveDatabase();
            Toaster.success(`Section renamed to "${val}".`);
            renderClassesSectionsList();
            populateClassSectionDropdowns();
            renderRoster();
            return true;
        }
    });
}

window.editClass = editClass;
window.editSection = editSection;
window.openEditDeptModal = openEditDeptModal;

function initSettingsEvents() {
    const fileInput = document.getElementById("settings-school-logo-file");
    const schoolLogoInput = document.getElementById("settings-school-logo");
    const removeLogoBtn = document.getElementById("btn-remove-logo");
    
    if (fileInput) {
        fileInput.addEventListener("change", (e) => {
            if (e.target.files && e.target.files[0]) {
                const file = e.target.files[0];
                const reader = new FileReader();
                reader.onload = function(evt) {
                    const base64Url = evt.target.result;
                    
                    // Show preview
                    const previewContainer = document.getElementById("settings-logo-preview-container");
                    const previewImg = document.getElementById("settings-logo-preview");
                    if (previewImg && previewContainer) {
                        previewImg.src = base64Url;
                        previewContainer.style.display = "flex";
                    }
                    if (removeLogoBtn) {
                        removeLogoBtn.style.display = "inline-block";
                    }
                    
                    // Clear URL input value
                    if (schoolLogoInput) {
                        schoolLogoInput.value = "";
                        schoolLogoInput.placeholder = "Image uploaded from computer";
                    }
                    
                    // Store temporarily in state
                    state.tempUploadedLogo = base64Url;
                    state.logoCleared = false;
                };
                reader.readAsDataURL(file);
            }
        });
    }

    if (schoolLogoInput) {
        schoolLogoInput.addEventListener("input", () => {
            const val = schoolLogoInput.value.trim();
            state.tempUploadedLogo = null; // Clear file upload
            state.logoCleared = false;
            if (fileInput) fileInput.value = ""; // Clear file selector
            
            const previewContainer = document.getElementById("settings-logo-preview-container");
            const previewImg = document.getElementById("settings-logo-preview");
            if (val) {
                if (previewImg && previewContainer) {
                    previewImg.src = val;
                    previewContainer.style.display = "flex";
                }
                if (removeLogoBtn) removeLogoBtn.style.display = "inline-block";
            } else {
                if (previewContainer) previewContainer.style.display = "none";
                if (removeLogoBtn) removeLogoBtn.style.display = "none";
            }
        });
    }

    if (removeLogoBtn) {
        removeLogoBtn.addEventListener("click", (e) => {
            e.preventDefault();
            state.tempUploadedLogo = null;
            state.logoCleared = true;
            if (fileInput) fileInput.value = "";
            if (schoolLogoInput) {
                schoolLogoInput.value = "";
                schoolLogoInput.placeholder = "e.g. https://example.com/logo.png";
            }
            const previewContainer = document.getElementById("settings-logo-preview-container");
            if (previewContainer) previewContainer.style.display = "none";
            removeLogoBtn.style.display = "none";
        });
    }

    const btnCreateSession = document.getElementById("btn-create-session");
    if (btnCreateSession) {
        btnCreateSession.addEventListener("click", () => {
            const input = document.getElementById("settings-session-name");
            if (!input) return;
            const val = input.value.trim();
            if (!val) {
                Toaster.warning("Please enter a valid session name.");
                return;
            }
            // Check if it already exists
            const cleanVal = val.replace("Academic Session ", "").trim();
            const exists = state.db.sessions.some(s => s.name.toLowerCase() === cleanVal.toLowerCase() || s.id.toLowerCase() === `sess-${cleanVal.toLowerCase().replace(/\s+/g, '-')}`);
            if (exists) {
                Toaster.warning("Session already exists.");
                return;
            }
            
            const newSession = {
                id: `sess-${cleanVal.toLowerCase().replace(/\s+/g, '-')}`,
                name: cleanVal
            };
            
            state.db.sessions.push(newSession);
            state.saveDatabase();
            
            input.value = "";
            Toaster.success(`Session "${newSession.name}" created successfully.`);
            
            // Re-render settings sessions and header selector
            renderSettingsSessions();
            renderSessionSelectorOptions();
        });
    }
}

function renderSettings() {
    const schoolNameInput = document.getElementById("settings-school-name");
    const schoolLogoInput = document.getElementById("settings-school-logo");
    const schoolAddressInput = document.getElementById("settings-school-address");
    const schoolPhoneInput = document.getElementById("settings-school-phone");
    const schoolEmailInput = document.getElementById("settings-school-email");

    if (schoolNameInput) schoolNameInput.value = state.db.tenant.name || "";
    if (schoolAddressInput) schoolAddressInput.value = state.db.tenant.address || "";
    if (schoolPhoneInput) schoolPhoneInput.value = state.db.tenant.contact_phone || "";
    if (schoolEmailInput) schoolEmailInput.value = state.db.tenant.contact_email || "";

    const logoUrl = state.db.tenant.logo || "";
    const previewContainer = document.getElementById("settings-logo-preview-container");
    const previewImg = document.getElementById("settings-logo-preview");
    const fileInput = document.getElementById("settings-school-logo-file");
    const removeLogoBtn = document.getElementById("btn-remove-logo");

    if (fileInput) fileInput.value = ""; // Clear file selection on load
    state.tempUploadedLogo = null;
    state.logoCleared = false;

    if (logoUrl) {
        if (previewImg && previewContainer) {
            previewImg.src = logoUrl;
            previewContainer.style.display = "flex";
        }
        if (removeLogoBtn) removeLogoBtn.style.display = "inline-block";
        if (schoolLogoInput) {
            if (logoUrl.startsWith("data:")) {
                schoolLogoInput.value = "";
                schoolLogoInput.placeholder = "Image uploaded from computer";
            } else {
                schoolLogoInput.value = logoUrl;
                schoolLogoInput.placeholder = "e.g. https://example.com/logo.png";
            }
        }
    } else {
        if (previewContainer) previewContainer.style.display = "none";
        if (removeLogoBtn) removeLogoBtn.style.display = "none";
        if (schoolLogoInput) {
            schoolLogoInput.value = "";
            schoolLogoInput.placeholder = "e.g. https://example.com/logo.png";
        }
    }

    renderClassesSectionsList();
    renderSettingsSessions();
}

function renderSettingsSessions() {
    const list = document.getElementById("settings-sessions-list");
    if (!list) return;
    list.innerHTML = "";
    state.db.sessions.forEach(s => {
        const li = document.createElement("li");
        li.className = "list-navigation-item";
        li.style.display = "flex";
        li.style.justifyContent = "space-between";
        li.style.alignItems = "center";
        li.style.padding = "10px 14px";
        li.style.borderRadius = "8px";
        li.style.marginBottom = "6px";
        li.style.border = "1px solid var(--border-color)";
        li.style.background = "var(--bg-card)";
        
        const isActive = s.id === state.db.activeSessionId;
        
        li.innerHTML = `
            <div>
                <strong style="font-size:13px; color:var(--text-primary);">${s.name}</strong>
                ${isActive ? '<span class="badge success" style="font-size:9px; margin-left:8px;">Active</span>' : ''}
            </div>
            <div style="display:flex; gap:6px;">
                <button class="small-btn secondary-btn" style="padding:4px 8px; font-size:11px;" onclick="editSession('${s.id}')">Rename</button>
                ${!isActive ? `
                    <button class="small-btn secondary-btn" style="padding:4px 8px; font-size:11px;" onclick="setSettingsActiveSession('${s.id}')">Make Active</button>
                    <button class="small-btn danger-btn" style="padding:4px 8px; font-size:11px;" onclick="deleteSession('${s.id}')">Delete</button>
                ` : ''}
            </div>
        `;
        list.appendChild(li);
    });
}

window.setSettingsActiveSession = function(sessId) {
    state.db.activeSessionId = sessId;
    state.saveDatabase();
    renderSettingsSessions();
    renderSessionSelectorOptions();
    // Update the dropdown select value
    const select = document.getElementById("session-select");
    if (select) select.value = sessId;
    // Refresh current view
    switchToView(state.activeView);
    Toaster.success("Active session updated.");
};

function editSession(sessId) {
    if (state.activeRole !== "tenant_admin") {
        Toaster.error("RBAC Denied: Administrator role required to manage institutional parameters.");
        return;
    }
    const sess = state.db.sessions.find(s => s.id === sessId);
    if (!sess) return;

    let defaultVal = sess.name.replace("Academic Session ", "");

    openCustomConfigPrompt({
        title: "Edit Session Name",
        label: "New Session Name (e.g. 2026-27)",
        defaultValue: defaultVal,
        isEdit: true,
        onSubmit: (val) => {
            if (!val) {
                Toaster.warning("Session name cannot be empty.");
                return false;
            }
            const cleanVal = val.replace("Academic Session ", "").trim();
            
            const exists = state.db.sessions.some(s => s.id !== sessId && (s.name.toLowerCase() === cleanVal.toLowerCase() || s.name.replace("Academic Session ", "").toLowerCase() === cleanVal.toLowerCase()));
            if (exists) {
                Toaster.warning("Session already exists.");
                return false;
            }

            sess.name = cleanVal;
            state.saveDatabase();
            
            Toaster.success(`Session renamed to "${cleanVal}".`);
            renderSettingsSessions();
            renderSessionSelectorOptions();
            
            // Refresh current view to reflect renamed session in headings/drop downs
            switchToView(state.activeView);
            return true;
        }
    });
}

function deleteSession(sessId) {
    if (state.activeRole !== "tenant_admin") {
        Toaster.error("RBAC Denied: Administrator role required to manage institutional parameters.");
        return;
    }
    if (sessId === state.db.activeSessionId) {
        Toaster.warning("Cannot delete the active session. Please switch to another session first.");
        return;
    }
    const sess = state.db.sessions.find(s => s.id === sessId);
    if (!sess) return;

    if (confirm(`Are you sure you want to delete session "${sess.name}"? This will delete all evaluations/audits recorded under this session.`)) {
        state.db.assessments = state.db.assessments.filter(a => a.session_id !== sessId);
        state.db.sessions = state.db.sessions.filter(s => s.id !== sessId);
        state.saveDatabase();
        
        Toaster.success(`Session "${sess.name}" and all its evaluations have been deleted.`);
        
        renderSettingsSessions();
        renderSessionSelectorOptions();
        
        // Refresh current view
        switchToView(state.activeView);
    }
}

window.editSession = editSession;
window.deleteSession = deleteSession;

function saveSettingsProfile() {
    const schoolNameInput = document.getElementById("settings-school-name");
    const schoolLogoInput = document.getElementById("settings-school-logo");
    const schoolAddressInput = document.getElementById("settings-school-address");
    const schoolPhoneInput = document.getElementById("settings-school-phone");
    const schoolEmailInput = document.getElementById("settings-school-email");

    if (!state.db.tenant) state.db.tenant = {};

    state.db.tenant.name = schoolNameInput ? schoolNameInput.value.trim() : "";
    state.db.tenant.address = schoolAddressInput ? schoolAddressInput.value.trim() : "";
    state.db.tenant.contact_phone = schoolPhoneInput ? schoolPhoneInput.value.trim() : "";
    state.db.tenant.contact_email = schoolEmailInput ? schoolEmailInput.value.trim() : "";

    if (state.logoCleared) {
        state.db.tenant.logo = "";
    } else if (state.tempUploadedLogo) {
        state.db.tenant.logo = state.tempUploadedLogo;
    } else {
        const typedLogo = schoolLogoInput ? schoolLogoInput.value.trim() : "";
        if (typedLogo) {
            state.db.tenant.logo = typedLogo;
        } else {
            // Keep existing base64 logo if they didn't touch it
            if (state.db.tenant.logo && state.db.tenant.logo.startsWith("data:") && schoolLogoInput.placeholder.includes("uploaded")) {
                // Keep it
            } else {
                state.db.tenant.logo = "";
            }
        }
    }

    // Reset temp flags
    state.tempUploadedLogo = null;
    state.logoCleared = false;

    state.saveDatabase();
    updateHeaderBranding();
    Toaster.success("Settings profile saved successfully.");
}

window.saveSettingsProfile = saveSettingsProfile;

function renderRoster() {
    renderRolesList();
    renderClassesSectionsList();
    // Sync column headers display state
    document.querySelectorAll(".col-email").forEach(el => el.style.display = state.rosterCols.email ? "" : "none");
    document.querySelectorAll(".col-dept").forEach(el => el.style.display = state.rosterCols.dept ? "" : "none");
    document.querySelectorAll(".col-role").forEach(el => el.style.display = state.rosterCols.role ? "" : "none");
    document.querySelectorAll(".col-manager").forEach(el => el.style.display = state.rosterCols.manager ? "" : "none");
    document.querySelectorAll(".col-status").forEach(el => el.style.display = state.rosterCols.status ? "" : "none");

    const tbody = document.getElementById("roster-table-body");
    tbody.innerHTML = "";

    const filtered = getFilteredRosterRows();

    // Empty States validation
    if (filtered.length === 0) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td colspan="8">
                <div class="empty-state-card">
                    <svg class="empty-state-svg-wrapper" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <h4>No Staff Members Found</h4>
                    <p>No roster data matched your current search filters. Try modifying terms or import a CSV roster.</p>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
        document.getElementById("roster-pagination-info").innerText = "Showing 0 items";
        document.getElementById("roster-pagination-btns").innerHTML = "";
        return;
    }

    // Pagination bounds
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / state.rosterPageSize);
    
    // Bounds check
    if (state.rosterPage > totalPages) state.rosterPage = totalPages;
    if (state.rosterPage < 1) state.rosterPage = 1;

    const startIdx = (state.rosterPage - 1) * state.rosterPageSize;
    const endIdx = Math.min(startIdx + state.rosterPageSize, totalItems);
    const paginatedItems = filtered.slice(startIdx, endIdx);

    // Update info text
    document.getElementById("roster-pagination-info").innerText = `Showing ${startIdx + 1}-${endIdx} of ${totalItems} staff entries`;

    // Render page buttons
    const btnsWrapper = document.getElementById("roster-pagination-btns");
    btnsWrapper.innerHTML = "";
    
    const prevBtn = document.createElement("button");
    prevBtn.className = "page-btn";
    prevBtn.innerText = "◂";
    prevBtn.disabled = state.rosterPage === 1;
    prevBtn.addEventListener("click", () => { state.rosterPage--; renderRoster(); });
    btnsWrapper.appendChild(prevBtn);

    for (let p = 1; p <= totalPages; p++) {
        const btn = document.createElement("button");
        btn.className = `page-btn ${state.rosterPage === p ? 'active' : ''}`;
        btn.innerText = p;
        btn.addEventListener("click", () => { state.rosterPage = p; renderRoster(); });
        btnsWrapper.appendChild(btn);
    }

    const nextBtn = document.createElement("button");
    nextBtn.className = "page-btn";
    nextBtn.innerText = "▸";
    nextBtn.disabled = state.rosterPage === totalPages;
    nextBtn.addEventListener("click", () => { state.rosterPage++; renderRoster(); });
    btnsWrapper.appendChild(nextBtn);

    // Render rows
    paginatedItems.forEach(user => {
        const dept = state.db.departments.find(d => d.id === user.dept_id);
        const isSelected = state.rosterSelectedIds.has(user.id);
        
        let managerName = "N/A";
        if (user.reports_to) {
            const m = state.db.users.find(u => u.id === user.reports_to);
            if (m) managerName = `${m.first_name} ${m.last_name}`;
        } else if (dept && dept.manager_id) {
            const manager = state.db.users.find(u => u.id === dept.manager_id);
            if (manager) managerName = `${manager.first_name} ${manager.last_name}`;
        }

        const status = user.status || "active";

        const tr = document.createElement("tr");
        if (isSelected) tr.classList.add("row-selected");

        tr.innerHTML = `
            <td>
                <div class="checkbox-cell">
                    <input type="checkbox" class="roster-row-checkbox" data-user-id="${user.id}" ${isSelected ? 'checked' : ''}>
                </div>
            </td>
            <td>
                <div style="display:flex;align-items:center;gap:10px;">
                    <img src="${user.avatar}" class="avatar" style="width:28px;height:28px;">
                    <strong>${user.first_name} ${user.last_name}</strong>
                </div>
            </td>
            <td class="col-email" style="display:${state.rosterCols.email ? '' : 'none'}">${user.email || '--'}</td>
            <td class="col-dept" style="display:${state.rosterCols.dept ? '' : 'none'}">${dept ? dept.name : 'Unassigned'}</td>
            <td class="col-role" style="display:${state.rosterCols.role ? '' : 'none'}"><span style="color:var(--color-primary);font-weight:700;">${user.role.toUpperCase()}</span></td>
            <td class="col-manager" style="display:${state.rosterCols.manager ? '' : 'none'}">${managerName}</td>
            <td class="col-status" style="display:${state.rosterCols.status ? '' : 'none'}"><span class="badge ${status}">${status}</span></td>
            <td>
                <div style="display:flex;gap:6px;">
                    <button class="small-btn secondary-btn" onclick="openEditMemberModal('${user.id}')" ${state.activeRole !== 'tenant_admin' ? 'disabled' : ''}>Edit</button>
                    <button class="small-btn danger-btn" onclick="deleteUser('${user.id}')" ${state.activeRole !== 'tenant_admin' ? 'disabled' : ''}>Delete</button>
                </div>
            </td>
        `;

        // Checkbox events listener
        tr.querySelector(".roster-row-checkbox").addEventListener("change", (e) => {
            if (e.target.checked) {
                state.rosterSelectedIds.add(user.id);
            } else {
                state.rosterSelectedIds.delete(user.id);
            }
            renderRoster();
        });

        tbody.appendChild(tr);
    });
}

function deleteUser(userId) {
    if (confirm("Are you sure you want to delete this staff member? This will permanently remove the user registry from the system database.")) {
        state.db.users = state.db.users.filter(u => u.id !== userId);
        state.saveDatabase();
        Toaster.success("User successfully deleted from roster registry.");
        renderRoster();
    }
}

function updateClassSectionVisibility() {
    const roleSelect = document.getElementById("member-role");
    if (!roleSelect) return;
    const roleId = roleSelect.value;
    const container = document.getElementById("member-class-section-group");
    if (!container) return;
    
    const isTeacher = roleId === "staff_member" || 
                      roleId === "activity_teacher" || 
                      (state.db.roles.find(r => r.id === roleId)?.name || "").toLowerCase().includes("teacher");
                      
    if (isTeacher) {
        container.style.display = "flex";
    } else {
        container.style.display = "none";
        // Clear values when hidden
        document.getElementById("member-class").value = "";
        document.getElementById("member-section").value = "";
    }
}

function openAddMemberModal() {
    if (state.activeRole !== "tenant_admin") {
        Toaster.error("RBAC Denied: Administrator role required to manage staff roster.");
        return;
    }

    document.getElementById("member-modal-title").innerText = "Add New Staff Member";
    document.getElementById("member-id").value = "";
    document.getElementById("member-first-name").value = "";
    document.getElementById("member-last-name").value = "";
    document.getElementById("member-email").value = "";
    document.getElementById("member-class").value = "";
    document.getElementById("member-section").value = "";
    
    // Populate departments select
    const deptSelect = document.getElementById("member-dept");
    deptSelect.innerHTML = "";
    state.db.departments.forEach(d => {
        const option = document.createElement("option");
        option.value = d.id;
        option.innerText = d.name;
        deptSelect.appendChild(option);
    });

    // Populate roles select dynamically
    const roleSelect = document.getElementById("member-role");
    roleSelect.innerHTML = "";
    state.db.roles.forEach(r => {
        const option = document.createElement("option");
        option.value = r.id;
        option.innerText = r.name;
        roleSelect.appendChild(option);
    });
    roleSelect.value = "staff_member";
    updateClassSectionVisibility();

    // Populate reports to select dynamically
    const reportsSelect = document.getElementById("member-reports-to");
    reportsSelect.innerHTML = "";
    const noneOption = document.createElement("option");
    noneOption.value = "";
    noneOption.innerText = "-- None / Auto-fallback --";
    reportsSelect.appendChild(noneOption);
    
    state.db.users.forEach(u => {
        const option = document.createElement("option");
        option.value = u.id;
        option.innerText = `${u.first_name} ${u.last_name}`;
        reportsSelect.appendChild(option);
    });
    reportsSelect.value = "";

    // Set status to active
    document.getElementById("member-status").value = "active";

    openModal("modal-member");
}

function openEditMemberModal(userId) {
    if (state.activeRole !== "tenant_admin") {
        Toaster.error("RBAC Denied: Administrator role required to manage staff roster.");
        return;
    }

    const user = state.db.users.find(u => u.id === userId);
    if (!user) {
        Toaster.error("Error: User record not found.");
        return;
    }

    document.getElementById("member-modal-title").innerText = "Edit Staff Member";
    document.getElementById("member-id").value = user.id;
    document.getElementById("member-first-name").value = user.first_name || "";
    document.getElementById("member-last-name").value = user.last_name || "";
    document.getElementById("member-email").value = user.email || "";
    document.getElementById("member-class").value = user.assigned_class || "";
    document.getElementById("member-section").value = user.assigned_section || "";

    // Populate departments select
    const deptSelect = document.getElementById("member-dept");
    deptSelect.innerHTML = "";
    state.db.departments.forEach(d => {
        const option = document.createElement("option");
        option.value = d.id;
        option.innerText = d.name;
        deptSelect.appendChild(option);
    });
    deptSelect.value = user.dept_id;

    // Populate roles select dynamically
    const roleSelect = document.getElementById("member-role");
    roleSelect.innerHTML = "";
    state.db.roles.forEach(r => {
        const option = document.createElement("option");
        option.value = r.id;
        option.innerText = r.name;
        roleSelect.appendChild(option);
    });
    roleSelect.value = user.role;

    // Populate reports to select dynamically (filter out the user being edited)
    const reportsSelect = document.getElementById("member-reports-to");
    reportsSelect.innerHTML = "";
    const noneOption = document.createElement("option");
    noneOption.value = "";
    noneOption.innerText = "-- None / Auto-fallback --";
    reportsSelect.appendChild(noneOption);
    
    state.db.users.forEach(u => {
        if (u.id !== user.id) {
            const option = document.createElement("option");
            option.value = u.id;
            option.innerText = `${u.first_name} ${u.last_name}`;
            reportsSelect.appendChild(option);
        }
    });
    reportsSelect.value = user.reports_to || "";

    // Set status
    document.getElementById("member-status").value = user.status || "active";
    
    updateClassSectionVisibility();

    openModal("modal-member");
}

function submitMemberForm() {
    const id = document.getElementById("member-id").value;
    const firstName = document.getElementById("member-first-name").value.trim();
    const lastName = document.getElementById("member-last-name").value.trim();
    const email = document.getElementById("member-email").value.trim();
    const deptId = document.getElementById("member-dept").value;
    const role = document.getElementById("member-role").value;
    const reportsTo = document.getElementById("member-reports-to").value;
    const status = document.getElementById("member-status").value;

    const isTeacher = role === "staff_member" || 
                      role === "activity_teacher" || 
                      (state.db.roles.find(r => r.id === role)?.name || "").toLowerCase().includes("teacher");

    const assignedClass = isTeacher ? document.getElementById("member-class").value : "";
    const assignedSection = isTeacher ? document.getElementById("member-section").value : "";

    if (!firstName || !lastName) {
        Toaster.warning("Validation Failed: Please fill in first and last names.");
        return;
    }

    // Email is optional, but if specified, must contain @
    if (email && !email.includes("@")) {
        Toaster.warning("Validation Failed: Please enter a valid email address.");
        return;
    }

    if (id) {
        // Edit mode
        const user = state.db.users.find(u => u.id === id);
        if (user) {
            // Check email uniqueness if email is changed and not empty
            if (email && email.toLowerCase() !== (user.email || "").toLowerCase()) {
                const exists = state.db.users.some(u => u.email && u.email.toLowerCase() === email.toLowerCase());
                if (exists) {
                    Toaster.warning("Registration Conflict: Email address is already registered.");
                    return;
                }
            }
            user.first_name = firstName;
            user.last_name = lastName;
            user.email = email;
            user.dept_id = deptId;
            user.role = role;
            user.reports_to = reportsTo || null;
            user.status = status;
            user.assigned_class = assignedClass || null;
            user.assigned_section = assignedSection || null;
            state.saveDatabase();
            Toaster.success(`Updated details for ${firstName} ${lastName}`);
        } else {
            Toaster.error("Error: Failed to locate staff member record.");
            return;
        }
    } else {
        // Add mode
        // Check email uniqueness if email is specified
        if (email) {
            const exists = state.db.users.some(u => u.email && u.email.toLowerCase() === email.toLowerCase());
            if (exists) {
                Toaster.warning("Registration Conflict: Email address is already registered.");
                return;
            }
        }

        const newId = `user-auto-${Math.floor(Math.random() * 100000)}`;
        const avatar = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150"; 

        state.db.users.push({
            id: newId,
            email: email || "",
            first_name: firstName,
            last_name: lastName,
            role: role,
            dept_id: deptId,
            avatar: avatar,
            reports_to: reportsTo || null,
            status: status,
            assigned_class: assignedClass || null,
            assigned_section: assignedSection || null
        });
        state.saveDatabase();
        Toaster.success(`Added new staff member: ${firstName} ${lastName}`);
    }

    closeModal("modal-member");
    renderRoster();
}

function isChildDepartment(childId, parentId) {
    let currentId = childId;
    const visited = new Set();
    while (currentId && !visited.has(currentId)) {
        visited.add(currentId);
        const dept = state.db.departments.find(d => d.id === currentId);
        if (dept && dept.parent_id === parentId) {
            return true;
        }
        currentId = dept ? dept.parent_id : null;
    }
    return false;
}

function populateDeptFilterDropdown() {
    const filterSelect = document.getElementById("roster-dept-filter");
    if (!filterSelect) return;
    filterSelect.innerHTML = `<option value="all">All Departments</option>`;
    state.db.departments.forEach(d => {
        const option = document.createElement("option");
        option.value = d.id;
        option.innerText = d.name;
        filterSelect.appendChild(option);
    });
}

let activeDeptTab = "single";
let uploadedDepts = [];

function parsePastedDepts(rawText) {
    const lines = rawText.split(/[\r\n]+/);
    let parsed = [];
    lines.forEach((line, index) => {
        const rowText = line.trim();
        if (!rowText) return;
        const isTab = rowText.includes("\t");
        const values = rowText.split(isTab ? "\t" : ",").map(v => v.trim().replace(/^["']|["']$/g, ""));
        
        if (index === 0 && (values[0].toLowerCase() === "name" || values[1]?.toLowerCase() === "code")) {
            return;
        }
        
        const row = {
            name: values[0] || "",
            code: (values[1] || "").toUpperCase(),
            parent_code: values[2] || "",
            manager_email: values[3] || ""
        };
        
        if (row.name && row.code) {
            parsed.push(row);
        }
    });
    return parsed;
}

function processUploadedDeptFile(file) {
    if (!file.name.endsWith(".csv") && !file.name.endsWith(".txt")) {
        Toaster.error("Invalid file format. Please upload a .csv or .txt file.");
        return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        const lines = text.split(/[\r\n]+/);
        let parsed = [];
        let headers = [];
        
        lines.forEach((line, index) => {
            const rowText = line.trim();
            if (!rowText) return;
            const values = rowText.split(",").map(v => v.trim().replace(/^["']|["']$/g, ""));
            
            if (index === 0) {
                headers = values.map(h => h.toLowerCase());
                if (headers.includes("code") || headers.includes("name")) {
                    return;
                }
                headers = ["name", "code", "parent_code", "manager_email"];
            }
            
            const row = {};
            headers.forEach((h, i) => {
                row[h] = values[i] || "";
            });
            
            if (row.name && row.code) {
                parsed.push(row);
            }
        });
        
        uploadedDepts = parsed;
        const dropText = document.getElementById("dept-drop-zone-text");
        if (dropText) {
            dropText.innerHTML = `<span style="color: var(--color-success); font-weight:600;">✓ File loaded successfully</span><br><span style="font-size:12px;color:var(--text-primary);">${file.name} (${parsed.length} departments found)</span>`;
        }
        Toaster.success(`Loaded ${parsed.length} departments from ${file.name}.`);
    };
    reader.readAsText(file);
}

function openAddDeptModal() {
    if (state.activeRole !== "tenant_admin") {
        Toaster.error("RBAC Denied: Administrator role required to manage institutional departments.");
        return;
    }

    state.editingDeptId = null;
    activeDeptTab = "single";
    uploadedDepts = [];

    const modalTitle = document.getElementById("dept-modal-title");
    if (modalTitle) modalTitle.innerText = "Add New Department / Unit";

    document.getElementById("dept-name").value = "";
    document.getElementById("dept-code").value = "";
    
    const textarea = document.getElementById("dept-prompt-textarea");
    if (textarea) textarea.value = "";

    const dropText = document.getElementById("dept-drop-zone-text");
    if (dropText) dropText.innerText = "Click or Drag & Drop CSV / TXT here";

    const fileInput = document.getElementById("dept-file-input");
    if (fileInput) fileInput.value = "";

    const tabsContainer = document.getElementById("dept-prompt-tabs");
    if (tabsContainer) tabsContainer.classList.remove("hidden");

    // Populate selects
    const parentSelect = document.getElementById("dept-parent");
    parentSelect.innerHTML = "";
    const noneOption = document.createElement("option");
    noneOption.value = "";
    noneOption.innerText = "-- None --";
    parentSelect.appendChild(noneOption);

    state.db.departments.forEach(d => {
        const option = document.createElement("option");
        option.value = d.id;
        option.innerText = d.name;
        parentSelect.appendChild(option);
    });

    const managerSelect = document.getElementById("dept-manager");
    managerSelect.innerHTML = "";
    const noManagerOption = document.createElement("option");
    noManagerOption.value = "";
    noManagerOption.innerText = "-- None --";
    managerSelect.appendChild(noManagerOption);

    state.db.users.forEach(u => {
        const option = document.createElement("option");
        option.value = u.id;
        option.innerText = `${u.first_name} ${u.last_name}`;
        managerSelect.appendChild(option);
    });

    const singleBody = document.getElementById("dept-prompt-single-body");
    const pasteBody = document.getElementById("dept-prompt-paste-body");
    const uploadBody = document.getElementById("dept-prompt-upload-body");

    const tabSingle = document.getElementById("dept-tab-single");
    const tabPaste = document.getElementById("dept-tab-paste");
    const tabUpload = document.getElementById("dept-tab-upload");

    function setDeptTab(tabType) {
        activeDeptTab = tabType;
        [
            { tab: tabSingle, type: "single" },
            { tab: tabPaste, type: "paste" },
            { tab: tabUpload, type: "upload" }
        ].forEach(({ tab, type }) => {
            if (!tab) return;
            if (activeDeptTab === type) {
                tab.style.color = "var(--text-primary)";
                tab.style.borderBottom = "2px solid var(--color-primary)";
                tab.style.fontWeight = "600";
            } else {
                tab.style.color = "var(--text-muted)";
                tab.style.borderBottom = "2px solid transparent";
                tab.style.fontWeight = "500";
            }
        });

        if (singleBody) {
            if (activeDeptTab === "single") singleBody.classList.remove("hidden");
            else singleBody.classList.add("hidden");
        }
        if (pasteBody) {
            if (activeDeptTab === "paste") pasteBody.classList.remove("hidden");
            else pasteBody.classList.add("hidden");
        }
        if (uploadBody) {
            if (activeDeptTab === "upload") uploadBody.classList.remove("hidden");
            else uploadBody.classList.add("hidden");
        }
    }

    if (tabSingle) tabSingle.onclick = () => setDeptTab("single");
    if (tabPaste) tabPaste.onclick = () => setDeptTab("paste");
    if (tabUpload) tabUpload.onclick = () => setDeptTab("upload");

    const downloadSampleBtn = document.getElementById("btn-download-dept-sample");
    if (downloadSampleBtn) {
        downloadSampleBtn.onclick = (e) => {
            e.preventDefault();
            const csvContent = "name,code,parent_code,manager_email\n"
                + "Social Science,DEPT-SOC,,principal.skinner@bhusk.edu\n"
                + "History Club,DEPT-HIST,DEPT-SOC,sarah.jenkins@bhusk.edu\n";
            const encodedUri = encodeURI("data:text/csv;charset=utf-8," + csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", "revu_departments_sample.csv");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            Toaster.success("Sample template downloaded successfully.");
        };
    }

    const dropZone = document.getElementById("dept-drop-zone");
    if (dropZone && fileInput) {
        dropZone.onclick = () => fileInput.click();

        dropZone.ondragover = (e) => {
            e.preventDefault();
            dropZone.style.borderColor = "var(--color-primary)";
            dropZone.style.background = "rgba(0,0,0,0.05)";
        };
        dropZone.ondragleave = () => {
            dropZone.style.borderColor = "var(--border-color)";
            dropZone.style.background = "rgba(0,0,0,0.02)";
        };
        dropZone.ondrop = (e) => {
            e.preventDefault();
            dropZone.style.borderColor = "var(--border-color)";
            dropZone.style.background = "rgba(0,0,0,0.02)";

            const file = e.dataTransfer.files[0];
            if (file) {
                processUploadedDeptFile(file);
            }
        };

        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                processUploadedDeptFile(file);
            }
        };
    }

    setDeptTab("single");
    openModal("modal-department");
}

function openEditDeptModal(deptId) {
    if (state.activeRole !== "tenant_admin") {
        Toaster.error("RBAC Denied: Administrator role required.");
        return;
    }
    const dept = state.db.departments.find(d => d.id === deptId);
    if (!dept) return;

    state.editingDeptId = deptId;
    activeDeptTab = "single";

    const modalTitle = document.getElementById("dept-modal-title");
    if (modalTitle) modalTitle.innerText = "Edit Department / Unit";

    document.getElementById("dept-name").value = dept.name;
    document.getElementById("dept-code").value = dept.code;

    const tabsContainer = document.getElementById("dept-prompt-tabs");
    if (tabsContainer) tabsContainer.classList.add("hidden");

    const parentSelect = document.getElementById("dept-parent");
    parentSelect.innerHTML = "";
    const noneOption = document.createElement("option");
    noneOption.value = "";
    noneOption.innerText = "-- None --";
    parentSelect.appendChild(noneOption);

    state.db.departments.forEach(d => {
        if (d.id !== deptId) {
            const option = document.createElement("option");
            option.value = d.id;
            option.innerText = d.name;
            parentSelect.appendChild(option);
        }
    });
    parentSelect.value = dept.parent_id || "";

    const managerSelect = document.getElementById("dept-manager");
    managerSelect.innerHTML = "";
    const noManagerOption = document.createElement("option");
    noManagerOption.value = "";
    noManagerOption.innerText = "-- None --";
    managerSelect.appendChild(noManagerOption);

    state.db.users.forEach(u => {
        const option = document.createElement("option");
        option.value = u.id;
        option.innerText = `${u.first_name} ${u.last_name}`;
        managerSelect.appendChild(option);
    });
    managerSelect.value = dept.manager_id || "";

    const singleBody = document.getElementById("dept-prompt-single-body");
    const pasteBody = document.getElementById("dept-prompt-paste-body");
    const uploadBody = document.getElementById("dept-prompt-upload-body");

    if (singleBody) singleBody.classList.remove("hidden");
    if (pasteBody) pasteBody.classList.add("hidden");
    if (uploadBody) uploadBody.classList.add("hidden");

    openModal("modal-department");
}

function submitDeptForm() {
    if (activeDeptTab === "single") {
        const name = document.getElementById("dept-name").value.trim();
        const code = document.getElementById("dept-code").value.trim().toUpperCase();
        const parentId = document.getElementById("dept-parent").value;
        const managerId = document.getElementById("dept-manager").value;

        if (!name || !code) {
            Toaster.warning("Validation Failed: Please fill in department name and code.");
            return;
        }

        if (state.editingDeptId) {
            const dept = state.db.departments.find(d => d.id === state.editingDeptId);
            if (!dept) return;

            const codeExists = state.db.departments.some(d => d.id !== state.editingDeptId && d.code.toUpperCase() === code);
            if (codeExists) {
                Toaster.warning("Conflict: A department with this code already exists.");
                return;
            }

            dept.name = name;
            dept.code = code;
            dept.parent_id = parentId || null;
            dept.manager_id = managerId || null;

            state.saveDatabase();
            Toaster.success(`Department "${name}" updated successfully.`);
        } else {
            const codeExists = state.db.departments.some(d => d.code.toUpperCase() === code);
            if (codeExists) {
                Toaster.warning("Conflict: A department with this code already exists.");
                return;
            }

            const newId = `dept-auto-${Math.floor(Math.random() * 10000)}`;
            state.db.departments.push({
                id: newId,
                name: name,
                code: code,
                parent_id: parentId || null,
                manager_id: managerId || null
            });

            state.saveDatabase();
            Toaster.success(`Department "${name}" created successfully.`);
        }

        closeModal("modal-department");
        populateDeptFilterDropdown();
        renderRoster();
    } else {
        const existing = state.db.departments || [];
        let deptsToProcess = [];
        
        if (activeDeptTab === "paste") {
            const val = document.getElementById("dept-prompt-textarea").value;
            deptsToProcess = parsePastedDepts(val);
        } else {
            deptsToProcess = uploadedDepts;
        }
        
        if (deptsToProcess.length === 0) {
            Toaster.warning("No valid departments found to import.");
            return;
        }
        
        let addedCount = 0;
        let ignoredCount = 0;
        const addedList = [];
        
        deptsToProcess.forEach(item => {
            const code = item.code.toUpperCase();
            if (existing.some(d => d.code.toUpperCase() === code) || addedList.some(d => d.code.toUpperCase() === code)) {
                ignoredCount++;
            } else {
                const newId = `dept-auto-${Math.floor(Math.random() * 10000)}`;
                const newDept = {
                    id: newId,
                    name: item.name,
                    code: code,
                    parent_id: null,
                    manager_id: null,
                    _temp_parent_code: item.parent_code,
                    _temp_manager_email: item.manager_email
                };
                addedList.push(newDept);
            }
        });
        
        if (addedList.length === 0) {
            Toaster.warning("All entered departments already exist or are duplicates.");
            return;
        }
        
        state.db.departments = [...existing, ...addedList];
        
        addedList.forEach(dept => {
            if (dept._temp_parent_code) {
                const parentCode = dept._temp_parent_code.toUpperCase();
                const parent = state.db.departments.find(d => d.code.toUpperCase() === parentCode);
                if (parent) {
                    dept.parent_id = parent.id;
                }
            }
            if (dept._temp_manager_email) {
                const managerEmail = dept._temp_manager_email.toLowerCase();
                const manager = state.db.users.find(u => u.email.toLowerCase() === managerEmail);
                if (manager) {
                    dept.manager_id = manager.id;
                }
            }
            
            delete dept._temp_parent_code;
            delete dept._temp_manager_email;
        });
        
        state.saveDatabase();
        let msg = `Successfully added ${addedList.length} departments.`;
        if (ignoredCount > 0) {
            msg += ` Ignored ${ignoredCount} duplicate/existing entries.`;
        }
        Toaster.success(msg);
        closeModal("modal-department");
        
        populateDeptFilterDropdown();
        renderClassesSectionsList();
        renderRoster();
    }
}

// =========================================================================
// 6b. ROLES & PERMISSIONS MANAGEMENT
// =========================================================================

const AVAILABLE_PERMISSION_SCOPES = [
    { id: "user:view", name: "View Staff Roster & Hierarchy", desc: "Allows viewing, editing, and managing institutional staff entries and structure." },
    { id: "rubric:manage", name: "Configure Scales & Rubrics", desc: "Enables creating and deleting numeric rating scales and qualitative matrix frameworks." },
    { id: "template:create", name: "Create & Edit Templates", desc: "Enables designing forms and defining section metadata inside the template builder." },
    { id: "assessment:observe", name: "Start and Conduct Observations", desc: "Allows starting dynamic observation sheets, filling evaluation checklists, and adding evidence." },
    { id: "assessment:view_own", name: "View Self-Appraisals", desc: "Grants access to review completed forms, sign off appraisals, and view personal metrics." },
    { id: "growth:manage_own", name: "Manage Growth Plans", desc: "Enables creating developmental progression schedules and updating action checkboxes." },
    { id: "reports:view", name: "View Reports & Analytics", desc: "Allows viewing department leaderboard dashboards and general compliance matrices." },
    { id: "ai:view", name: "Access AI Insights Workbench", desc: "Allows querying target staff profiles to construct predictive qualitative feedback." },
    { id: "settings:manage", name: "Manage Settings", desc: "Allows customizing branding, profiles, classes, sections, and department settings." }
];

function renderRolesList() {
    const list = document.getElementById("role-list");
    if (!list) return;
    list.innerHTML = "";

    state.db.roles.forEach(role => {
        const li = document.createElement("li");
        li.innerText = role.name;
        if (state.selectedRoleId === role.id) {
            li.classList.add("active");
        }
        li.addEventListener("click", () => {
            state.selectedRoleId = role.id;
            renderRolesList();
            renderRoleEditor();
        });
        list.appendChild(li);
    });
}

function renderRoleEditor() {
    const emptyState = document.getElementById("role-editor-empty");
    const container = document.getElementById("role-editor-container");

    if (!state.selectedRoleId) {
        if (emptyState) emptyState.className = "empty-state";
        if (container) container.classList.add("hidden");
        return;
    }

    if (emptyState) emptyState.classList.add("hidden");
    if (container) container.classList.remove("hidden");

    const role = state.db.roles.find(r => r.id === state.selectedRoleId);
    if (!role) return;
    
    // Setup inputs
    const keyInput = document.getElementById("role-edit-id");
    const nameInput = document.getElementById("role-edit-name");
    const deleteBtn = document.getElementById("btn-delete-role");

    keyInput.value = role.id;
    nameInput.value = role.name;

    // Default roles are protected
    const isSystemRole = ["tenant_admin", "school_leader", "dept_head", "staff_member"].includes(role.id);
    if (isSystemRole) {
        keyInput.disabled = true;
        deleteBtn.disabled = true;
        deleteBtn.style.opacity = "0.5";
        deleteBtn.style.cursor = "not-allowed";
        document.getElementById("role-editor-title").innerText = `Edit System Role (${role.name})`;
        document.getElementById("role-editor-subtitle").innerText = "This is a protected system role. Identifier key cannot be modified and it cannot be deleted.";
    } else {
        keyInput.disabled = false;
        deleteBtn.disabled = false;
        deleteBtn.style.opacity = "1";
        deleteBtn.style.cursor = "pointer";
        document.getElementById("role-editor-title").innerText = "Edit Custom Role";
        document.getElementById("role-editor-subtitle").innerText = "Customize display labels and access scopes for this custom role profile.";
    }

    // Populate permission checkboxes
    const checklist = document.getElementById("role-permissions-checklist");
    checklist.innerHTML = "";

    AVAILABLE_PERMISSION_SCOPES.forEach(scope => {
        const isChecked = role.permissions.includes(scope.id);
        const label = document.createElement("label");
        label.style.display = "flex";
        label.style.alignItems = "flex-start";
        label.style.gap = "10px";
        label.style.cursor = "pointer";
        label.style.padding = "8px 12px";
        label.style.borderRadius = "6px";
        label.style.backgroundColor = "rgba(0,0,0,0.02)";
        label.style.border = "1px solid var(--border-color)";

        label.innerHTML = `
            <input type="checkbox" value="${scope.id}" ${isChecked ? 'checked' : ''} style="margin-top:3.5px;">
            <div>
                <strong style="font-size:13px;color:var(--text-primary);display:block;">${scope.name}</strong>
                <p class="small-text text-muted" style="margin:3px 0 0 0;font-size:11.5px;line-height:1.4;">${scope.desc}</p>
            </div>
        `;
        checklist.appendChild(label);
    });
}

function submitRoleForm() {
    if (!state.selectedRoleId) return;

    const keyInput = document.getElementById("role-edit-id");
    const nameInput = document.getElementById("role-edit-name");
    
    const roleId = keyInput.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    const roleName = nameInput.value.trim();

    if (!roleId || !roleName) {
        Toaster.warning("Validation Failed: Role identifier and label are required.");
        return;
    }

    const role = state.db.roles.find(r => r.id === state.selectedRoleId);
    if (!role) return;
    const isSystemRole = ["tenant_admin", "school_leader", "dept_head", "staff_member"].includes(role.id);

    // Collect permissions
    const checkedPermissions = [];
    const checklist = document.getElementById("role-permissions-checklist");
    checklist.querySelectorAll("input[type='checkbox']").forEach(box => {
        if (box.checked) checkedPermissions.push(box.value);
    });

    if (role.id === "new_role_draft") {
        // Create new role
        const exists = state.db.roles.some(r => r.id === roleId);
        if (exists) {
            Toaster.warning("Key Conflict: A role with this key identifier already exists.");
            return;
        }

        role.id = roleId;
        role.name = roleName;
        role.permissions = checkedPermissions;
        state.selectedRoleId = roleId;
        
        Toaster.success(`Created custom role: ${roleName}`);
    } else {
        // Edit existing role
        if (!isSystemRole && role.id !== roleId) {
            const exists = state.db.roles.some(r => r.id === roleId);
            if (exists) {
                Toaster.warning("Key Conflict: Another role with this key identifier already exists.");
                return;
            }
            
            state.db.users.forEach(u => {
                if (u.role === role.id) u.role = roleId;
            });
            
            role.id = roleId;
            state.selectedRoleId = roleId;
        }
        role.name = roleName;
        role.permissions = checkedPermissions;

        Toaster.success(`Saved changes for role: ${roleName}`);
    }

    state.saveDatabase();
    renderPersonaSelectorOptions();
    renderRolesList();
    renderRoleEditor();
}

function deleteRole() {
    if (!state.selectedRoleId) return;

    const role = state.db.roles.find(r => r.id === state.selectedRoleId);
    if (!role) return;
    const isSystemRole = ["tenant_admin", "school_leader", "dept_head", "staff_member"].includes(role.id);

    if (isSystemRole) {
        Toaster.error("Operation Denied: Cannot delete default system roles.");
        return;
    }

    if (confirm(`Are you sure you want to delete the role "${role.name}"? Users currently assigned to this role will revert to Teacher/Staff.`)) {
        state.db.users.forEach(u => {
            if (u.role === role.id) u.role = "staff_member";
        });

        state.db.roles = state.db.roles.filter(r => r.id !== role.id);
        state.selectedRoleId = null;
        state.saveDatabase();
        
        Toaster.success("Role successfully deleted.");
        renderPersonaSelectorOptions();
        renderRolesList();
        renderRoleEditor();
    }
}

function initRolesManagement() {
    const newRoleBtn = document.getElementById("btn-new-role");
    if (newRoleBtn) {
        newRoleBtn.addEventListener("click", () => {
            if (state.activeRole !== "tenant_admin") {
                Toaster.error("RBAC Denied: Administrator role required to configure roles.");
                return;
            }

            state.db.roles = state.db.roles.filter(r => r.id !== "new_role_draft");
            state.db.roles.push({
                id: "new_role_draft",
                name: "Custom Role Draft",
                permissions: []
            });

            state.selectedRoleId = "new_role_draft";
            renderRolesList();
            renderRoleEditor();
            
            const editName = document.getElementById("role-edit-name");
            if (editName) editName.focus();
        });
    }

    const saveRoleBtn = document.getElementById("btn-save-role");
    if (saveRoleBtn) {
        saveRoleBtn.addEventListener("click", () => {
            submitRoleForm();
        });
    }

    const deleteRoleBtn = document.getElementById("btn-delete-role");
    if (deleteRoleBtn) {
        deleteRoleBtn.addEventListener("click", () => {
            deleteRole();
        });
    }
}

// =========================================================================
// 7. VIEW BUILDERS: SCALES & RUBRICS MATRIX
// =========================================================================
function renderScalesRubrics() {
    renderRubricsList();
    renderScalesList();
}

function renderRubricsList() {
    const list = document.getElementById("rubric-list");
    list.innerHTML = "";
    
    state.db.rubrics.forEach(rubric => {
        const li = document.createElement("li");
        li.innerText = rubric.name;
        if (state.selectedRubricId === rubric.id) {
            li.classList.add("active");
        }
        li.addEventListener("click", () => {
            state.selectedRubricId = rubric.id;
            renderRubricsList();
            renderRubricEditor();
        });
        list.appendChild(li);
    });
}

function renderRubricEditor() {
    const emptyState = document.getElementById("rubric-editor-empty");
    const container = document.getElementById("rubric-editor-container");
    
    if (!state.selectedRubricId) {
        emptyState.className = "empty-state";
        emptyState.innerHTML = `
            <svg class="empty-state-svg-wrapper" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 4v16m8-8H4"/></svg>
            <h4>No Rubric Framework Selected</h4>
            <p>Choose an existing pedagogy or compliance rubric from the left panel to configure matrix parameters.</p>
        `;
        container.classList.add("hidden");
        return;
    }

    emptyState.classList.add("hidden");
    container.classList.remove("hidden");

    const rubric = state.db.rubrics.find(r => r.id === state.selectedRubricId);
    
    document.getElementById("edit-rubric-name").value = rubric.name;
    document.getElementById("edit-rubric-desc").value = rubric.description || "";

    // Columns
    const headerRow = document.getElementById("rubric-header-row");
    headerRow.innerHTML = `<th class="criteria-cell-hdr">Evaluation Criteria</th>`;
    
    rubric.levels.sort((a,b) => a.sort_order - b.sort_order).forEach(level => {
        const th = document.createElement("th");
        th.style.position = "relative";
        th.innerHTML = `
            <button class="delete-level-btn" onclick="deleteRubricLevel('${rubric.id}', '${level.id}')">&times;</button>
            <input type="text" class="level-header-input" value="${level.title}" data-level-id="${level.id}">
            <input type="number" step="0.5" class="level-pts-input" value="${level.points}" data-level-id="${level.id}">
        `;
        headerRow.appendChild(th);
    });

    // Rows
    const bodyRows = document.getElementById("rubric-body-rows");
    bodyRows.innerHTML = "";

    rubric.criteria.sort((a,b) => a.sort_order - b.sort_order).forEach(criteria => {
        const tr = document.createElement("tr");
        
        let criteriaHdrCell = document.createElement("td");
        criteriaHdrCell.className = "criteria-cell-hdr";
        criteriaHdrCell.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">
                <input type="text" class="criteria-input-name" value="${criteria.title}" data-criteria-id="${criteria.id}" style="width:calc(100% - 24px);">
                <button class="delete-criteria-btn" onclick="deleteRubricCriteria('${rubric.id}', '${criteria.id}')">&times;</button>
            </div>
            <input type="number" step="0.1" class="criteria-input-weight" value="${criteria.weight}" data-criteria-id="${criteria.id}">
            <span style="font-size:10px;color:var(--text-subtle);">wt</span>
        `;
        tr.appendChild(criteriaHdrCell);

        rubric.levels.forEach(level => {
            const cellKey = `${criteria.id}_${level.id}`;
            const description = rubric.cells[cellKey] || "";
            
            const cellTd = document.createElement("td");
            cellTd.innerHTML = `
                <textarea class="cell-textarea" data-cell-key="${cellKey}" onfocus="this.style.height = this.scrollHeight + 'px'" oninput="this.style.height = 'auto'; this.style.height = this.scrollHeight + 'px'" onblur="this.style.height = '48px'">${description}</textarea>
            `;
            tr.appendChild(cellTd);
        });

        bodyRows.appendChild(tr);
    });
}

window.deleteRubricCriteria = function(rubricId, criteriaId) {
    const rubric = state.db.rubrics.find(r => r.id === rubricId);
    if (!rubric) return;
    
    if (rubric.criteria.length <= 1) {
        Toaster.warning("Cannot delete: Rubric must contain at least one evaluation criterion.");
        return;
    }

    rubric.criteria = rubric.criteria.filter(c => c.id !== criteriaId);
    
    // Clean up cells associated with this criteria
    for (const key in rubric.cells) {
        if (key.startsWith(`${criteriaId}_`)) {
            delete rubric.cells[key];
        }
    }
    
    renderRubricEditor();
};

window.deleteRubricLevel = function(rubricId, levelId) {
    const rubric = state.db.rubrics.find(r => r.id === rubricId);
    if (!rubric) return;
    
    if (rubric.levels.length <= 1) {
        Toaster.warning("Cannot delete: Rubric must contain at least one evaluation level.");
        return;
    }

    rubric.levels = rubric.levels.filter(l => l.id !== levelId);
    
    // Clean up cells associated with this level
    for (const key in rubric.cells) {
        if (key.endsWith(`_${levelId}`)) {
            delete rubric.cells[key];
        }
    }
    
    renderRubricEditor();
};

function initScaleRubricEditor() {
    // Deprecated: Evaluation frameworks are now built inline inside each question card (MS Forms style)
}

function renderScalesList() {
    const list = document.getElementById("scale-list");
    list.innerHTML = "";
    state.db.rating_scales.forEach(scale => {
        const li = document.createElement("li");
        li.innerText = scale.name;
        if (state.selectedScaleId === scale.id) li.classList.add("active");
        li.addEventListener("click", () => {
            state.selectedScaleId = scale.id;
            renderScalesList();
            renderScaleEditor();
        });
        list.appendChild(li);
    });
}

function renderScaleEditor() {
    const emptyState = document.getElementById("scale-editor-empty");
    const container = document.getElementById("scale-editor-container");
    
    if (!state.selectedScaleId) {
        emptyState.className = "empty-state";
        emptyState.innerHTML = `<p>Select or create a rating scale framework from options.</p>`;
        container.classList.add("hidden");
        return;
    }

    emptyState.classList.add("hidden");
    container.classList.remove("hidden");

    const scale = state.db.rating_scales.find(s => s.id === state.selectedScaleId);
    document.getElementById("edit-scale-name").value = scale.name;
    document.getElementById("edit-scale-desc").value = scale.description || "";

    const valuesContainer = document.getElementById("scale-values-container");
    valuesContainer.innerHTML = "";

    scale.values.sort((a,b) => a.sort_order - b.sort_order).forEach(val => {
        const div = document.createElement("div");
        div.className = "scale-value-row";
        div.setAttribute("data-val-id", val.id);
        div.innerHTML = `
            <input type="number" step="0.5" class="form-control-light scale-val-input" value="${val.value}">
            <input type="text" class="form-control-light scale-lbl-input" value="${val.label}">
            <button class="small-btn secondary-btn" style="padding:8px 10px;" onclick="deleteScaleValue('${scale.id}', '${val.id}')">&times;</button>
        `;
        valuesContainer.appendChild(div);
    });
}

function deleteScaleValue(scaleId, valId) {
    const scale = state.db.rating_scales.find(s => s.id === scaleId);
    scale.values = scale.values.filter(v => v.id !== valId);
    renderScaleEditor();
}

// =========================================================================
// 8. VIEW BUILDERS: CONFIGURABLE TEMPLATE FORMS
// =========================================================================
function openFormBuilderModal(templateId) {
    state.selectedTemplateId = templateId;
    
    const tmpl = state.db.templates.find(t => t.id === templateId);
    if (!tmpl) return;
    
    const defaultTmplIds = DEFAULT_SEED_DATA.templates.map(t => t.id);
    const isStandard = defaultTmplIds.includes(tmpl.id);
    
    // Set dynamically smaller width for standard forms
    const modalBox = document.querySelector("#modal-form-builder .modal-box");
    if (modalBox) {
        modalBox.style.maxWidth = isStandard ? "800px" : "1200px";
    }
    
    const titleEl = document.getElementById("modal-form-builder-title");
    const subtitleEl = document.getElementById("modal-form-builder-subtitle");
    
    if (isStandard) {
        if (titleEl) titleEl.innerText = `${tmpl.name}`;
        if (subtitleEl) subtitleEl.innerHTML = `<span style="color:var(--color-primary); font-weight:600;">Global Standard Form (Read-Only Preview)</span>`;
        
        const editorCol = document.getElementById("modal-editor-column");
        if (editorCol) editorCol.style.display = "none";
        
        const deleteBtn = document.getElementById("btn-modal-delete-template");
        if (deleteBtn) deleteBtn.style.display = "none";
        
        const saveBtn = document.getElementById("btn-modal-save-template");
        if (saveBtn) saveBtn.style.display = "none";
    } else {
        if (titleEl) titleEl.innerText = `${tmpl.name}`;
        if (subtitleEl) subtitleEl.innerHTML = `<span style="color:#10b981; font-weight:600;">Custom School Form (Editable)</span>`;
        
        const editorCol = document.getElementById("modal-editor-column");
        if (editorCol) editorCol.style.display = "flex";
        
        const deleteBtn = document.getElementById("btn-modal-delete-template");
        if (deleteBtn) deleteBtn.style.display = "inline-flex";
        
        const saveBtn = document.getElementById("btn-modal-save-template");
        if (saveBtn) {
            saveBtn.style.display = "inline-flex";
            if (tmpl.status === "published") {
                saveBtn.innerText = "Publish Changes";
            } else {
                saveBtn.innerText = "Publish Template";
            }
        }
    }
    
    renderTemplateEditor();
    openModal("modal-form-builder");
}

function cloneTemplate(templateId) {
    const tmpl = state.db.templates.find(t => t.id === templateId);
    if (!tmpl) return;

    const newId = "tmpl-custom-" + Math.floor(Math.random()*10000);
    const newTemplate = JSON.parse(JSON.stringify(tmpl));
    newTemplate.id = newId;
    newTemplate.name = `${tmpl.name} (Custom Copy)`;
    newTemplate.status = "draft";

    state.db.templates.push(newTemplate);
    state.saveDatabase();
    state.selectedTemplateId = newId;

    Toaster.success(`Cloned "${tmpl.name}" to custom draft.`);
    
    const customTabButton = document.getElementById("tab-templates-custom");
    if (customTabButton) {
        customTabButton.click();
    } else {
        renderTemplatesList();
    }
    
    openFormBuilderModal(newId);
}

function deleteCustomTemplateDirectly(templateId) {
    const tmpl = state.db.templates.find(t => t.id === templateId);
    if (!tmpl) return;

    const inUse = state.db.assessments.some(a => a.template_id === tmpl.id);
    if (inUse) {
        Toaster.error("Integrity Error: Cannot delete template since active appraisal records are linked to it.");
        return;
    }

    if (confirm(`Are you sure you want to permanently delete custom template "${tmpl.name}"?`)) {
        state.db.templates = state.db.templates.filter(t => t.id !== tmpl.id);
        if (state.selectedTemplateId === tmpl.id) {
            state.selectedTemplateId = null;
        }
        state.saveDatabase();
        Toaster.success(`Form template "${tmpl.name}" deleted successfully.`);
        renderTemplatesList();
    }
}

function publishCustomTemplateDirectly(templateId) {
    const tmpl = state.db.templates.find(t => t.id === templateId);
    if (!tmpl) return;

    tmpl.status = "published";
    state.saveDatabase();
    Toaster.success(`Form template "${tmpl.name}" published successfully.`);
    renderTemplatesList();
}

function unpublishCustomTemplateDirectly(templateId) {
    const tmpl = state.db.templates.find(t => t.id === templateId);
    if (!tmpl) return;

    tmpl.status = "draft";
    state.saveDatabase();
    Toaster.success(`Form template "${tmpl.name}" set back to draft.`);
    renderTemplatesList();
}

function renderTemplateBuilder() {
    renderTemplatesList();
}

function getTemplateColor(tmplId) {
    if (!tmplId) return 220; // default blue/indigo hue
    let hash = 0;
    for (let i = 0; i < tmplId.length; i++) {
        hash = tmplId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash % 360);
}

function renderTemplatesList() {
    const globalGrid = document.getElementById("global-templates-grid");
    const customGrid = document.getElementById("custom-templates-grid");
    
    if (globalGrid) globalGrid.innerHTML = "";
    if (customGrid) customGrid.innerHTML = "";

    // Dynamically rebuild category filter bars based on active groups
    function populateTemplateFilterBars() {
        const globalBar = document.getElementById("global-templates-filter-bar");
        const customBar = document.getElementById("custom-templates-filter-bar");
        
        const activeGlobal = state.activeTemplateFilter || "all";
        const activeCustom = state.activeCustomTemplateFilter || "all";
        
        let pillsHTML = `<button class="filter-pill ${activeGlobal === "all" ? "active" : ""}" data-filter="all">All Forms</button>`;
        state.db.template_groups.forEach(g => {
            pillsHTML += `<button class="filter-pill ${activeGlobal === g.id ? "active" : ""}" data-filter="${g.id}">${g.title}</button>`;
        });
        
        const uncategorizedGlobal = state.db.templates.some(t => {
            const defaultTmplIds = DEFAULT_SEED_DATA.templates.map(d => d.id);
            return defaultTmplIds.includes(t.id) && (!t.group_id || t.group_id === "uncategorized");
        });
        if (uncategorizedGlobal) {
            pillsHTML += `<button class="filter-pill ${activeGlobal === "uncategorized" ? "active" : ""}" data-filter="uncategorized">Uncategorized</button>`;
        }
        
        if (globalBar) {
            globalBar.innerHTML = pillsHTML;
            const pills = globalBar.querySelectorAll(".filter-pill");
            pills.forEach(pill => {
                pill.addEventListener("click", (e) => {
                    state.activeTemplateFilter = e.target.dataset.filter;
                    renderTemplatesList();
                });
            });
        }
        
        let customPillsHTML = `<button class="filter-pill ${activeCustom === "all" ? "active" : ""}" data-filter="all">All Forms</button>`;
        state.db.template_groups.forEach(g => {
            customPillsHTML += `<button class="filter-pill ${activeCustom === g.id ? "active" : ""}" data-filter="${g.id}">${g.title}</button>`;
        });
        
        const uncategorizedCustom = state.db.templates.some(t => {
            const defaultTmplIds = DEFAULT_SEED_DATA.templates.map(d => d.id);
            return !defaultTmplIds.includes(t.id) && (!t.group_id || t.group_id === "uncategorized");
        });
        if (uncategorizedCustom) {
            customPillsHTML += `<button class="filter-pill ${activeCustom === "uncategorized" ? "active" : ""}" data-filter="uncategorized">Uncategorized</button>`;
        }
        
        if (customBar) {
            customBar.innerHTML = customPillsHTML;
            const pills = customBar.querySelectorAll(".filter-pill");
            pills.forEach(pill => {
                pill.addEventListener("click", (e) => {
                    state.activeCustomTemplateFilter = e.target.dataset.filter;
                    renderTemplatesList();
                });
            });
        }
    }
    
    populateTemplateFilterBars();
    const filterVal = state.activeTemplateFilter || "all";
    const filterValCustom = state.activeCustomTemplateFilter || "all";

    let templates = state.db.templates;
    if (state.activeRole === "dept_head") {
        templates = templates.filter(t => t.category === "academic");
    }

    const defaultTmplIds = DEFAULT_SEED_DATA.templates.map(t => t.id);
    const standardTemplates = templates.filter(t => defaultTmplIds.includes(t.id));
    const customTemplates = templates.filter(t => !defaultTmplIds.includes(t.id));

    function getTemplateStats(tmpl) {
        let sectionCount = tmpl.sections ? tmpl.sections.length : 0;
        let itemCount = 0;
        if (tmpl.sections) {
            tmpl.sections.forEach(s => {
                if (s.items) itemCount += s.items.length;
            });
        }
        return `${sectionCount} Section${sectionCount !== 1 ? 's' : ''} • ${itemCount} Parameter${itemCount !== 1 ? 's' : ''}`;
    }

    function createTemplateCardHTML(tmpl, stats, categoryLabel) {
        return `
            <div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <span class="badge ${tmpl.category}">${categoryLabel}</span>
                    <span style="font-size:11px; font-weight:600; color:var(--text-muted);">${stats}</span>
                </div>
                <h4 style="margin: 0 0 8px 0; font-size:15px; font-weight:700; color:var(--text-primary); line-height: 1.4;">${tmpl.name}</h4>
                <p style="margin:0 0 16px 0; font-size:12.5px; color:var(--text-subtle); line-height:1.5; min-height: 38px;">${tmpl.description || 'Standard institutional form template.'}</p>
            </div>
            <div style="display:flex; gap:8px; border-top:1px solid var(--border-color); padding-top:12px; justify-content:flex-end; align-items:center;">
                <button class="small-btn secondary-btn" style="padding: 6px 12px; font-size: 12px; border-radius: 6px;" onclick="openFormBuilderModal('${tmpl.id}')">Preview Form</button>
                <button class="small-btn action-btn" style="padding: 6px 12px; font-size: 12px; border-radius: 6px;" onclick="cloneTemplate('${tmpl.id}')">Clone to Customize</button>
            </div>
        `;
    }

    function createCustomTemplateCardHTML(tmpl, stats, categoryLabel) {
        const statusBadge = `<span class="badge ${tmpl.status}" style="font-size:9.5px; padding:2px 8px;">v${tmpl.version || 1} ${tmpl.status}</span>`;
        return `
            <div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <span class="badge ${tmpl.category}">${categoryLabel}</span>
                    <div style="display:flex; gap:6px; align-items:center;">
                        ${statusBadge}
                        <span style="font-size:11px; font-weight:600; color:var(--text-muted);">${stats}</span>
                    </div>
                </div>
                <h4 style="margin: 0 0 8px 0; font-size:15px; font-weight:700; color:var(--text-primary); line-height: 1.4;">${tmpl.name}</h4>
                <p style="margin:0 0 16px 0; font-size:12.5px; color:var(--text-subtle); line-height:1.5; min-height: 38px;">${tmpl.description || 'Custom institutional form template.'}</p>
            </div>
            <div style="display:flex; gap:8px; border-top:1px solid var(--border-color); padding-top:12px; justify-content:flex-end; align-items:center;">
                <button class="small-btn secondary-btn" style="color: var(--color-danger); border-color: rgba(239,68,68,0.2); background: transparent; padding: 6px 12px; font-size: 12px; border-radius: 6px;" onclick="deleteCustomTemplateDirectly('${tmpl.id}')">Delete</button>
                ${tmpl.status === "draft" ? `<button class="small-btn action-btn" style="background-color: var(--color-success); border-color: var(--color-success); padding: 6px 12px; font-size: 12px; border-radius: 6px;" onclick="publishCustomTemplateDirectly('${tmpl.id}')">Publish</button>` : ''}
                ${tmpl.status === "published" ? `<button class="small-btn secondary-btn" style="color: var(--color-warning); border-color: rgba(245,158,11,0.2); background: transparent; padding: 6px 12px; font-size: 12px; border-radius: 6px;" onclick="unpublishCustomTemplateDirectly('${tmpl.id}')">Unpublish</button>` : ''}
                <button class="small-btn action-btn" style="padding: 6px 12px; font-size: 12px; border-radius: 6px;" onclick="openFormBuilderModal('${tmpl.id}')">Open & Edit</button>
            </div>
        `;
    }

    if (globalGrid) {
        if (standardTemplates.length === 0) {
            globalGrid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1;"><h4>No Global Templates</h4></div>`;
        } else if (filterVal === "all") {
            globalGrid.style.display = "flex";
            globalGrid.style.flexDirection = "column";
            globalGrid.style.gap = "32px";
            
            const groups = state.db.template_groups.map(g => {
                return {
                    id: g.id,
                    title: g.title,
                    emoji: g.emoji || "📁",
                    templates: standardTemplates.filter(t => t.group_id === g.id)
                };
            });
            
            const uncategorizedTmpls = standardTemplates.filter(t => !t.group_id || t.group_id === "uncategorized");
            if (uncategorizedTmpls.length > 0) {
                groups.push({
                    id: "uncategorized",
                    title: "Uncategorized Forms",
                    emoji: "📁",
                    templates: uncategorizedTmpls
                });
            }
            
            groups.forEach(group => {
                if (group.templates.length === 0) return;
                
                const section = document.createElement("div");
                section.className = "template-group-section";
                section.style.width = "100%";
                
                section.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 14px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
                        <span style="font-size: 18px;">${group.emoji}</span>
                        <h3 style="margin: 0; font-size: 13.5px; font-weight: 700; color: var(--text-primary); text-transform: uppercase; letter-spacing: 0.5px;">${group.title}</h3>
                        <span class="badge" style="background: rgba(99, 102, 241, 0.08); color: var(--color-primary); margin-left: auto; border-radius: 12px; padding: 2px 8px; font-size: 11px; font-weight: 700;">${group.templates.length} Form${group.templates.length !== 1 ? 's' : ''}</span>
                    </div>
                `;
                
                const cardGrid = document.createElement("div");
                cardGrid.style.display = "grid";
                cardGrid.style.gridTemplateColumns = "repeat(auto-fill, minmax(340px, 1fr))";
                cardGrid.style.gap = "20px";
                cardGrid.style.width = "100%";
                
                group.templates.forEach(tmpl => {
                    const card = document.createElement("div");
                    card.className = "blueprint-card";
                    card.style.cursor = "default";
                    card.style.display = "flex";
                    card.style.flexDirection = "column";
                    card.style.justifyContent = "space-between";
                    card.style.minHeight = "180px";
                    card.style.setProperty("--card-hue", getTemplateColor(tmpl.id));
                    
                    const stats = getTemplateStats(tmpl);
                    const categoryLabel = tmpl.category === "academic" ? "Academic Observation" : 
                                          tmpl.category === "teaching" ? "Teaching Appraisal" :
                                          tmpl.category === "support" ? "Support Appraisal" : "Administrative Review";
                                          
                    card.innerHTML = createTemplateCardHTML(tmpl, stats, categoryLabel);
                    cardGrid.appendChild(card);
                });
                
                section.appendChild(cardGrid);
                globalGrid.appendChild(section);
            });
        } else {
            globalGrid.style.display = "grid";
            globalGrid.style.gridTemplateColumns = "repeat(auto-fill, minmax(340px, 1fr))";
            globalGrid.style.gap = "20px";
            
            let filteredTemplates = [];
            if (filterVal === "uncategorized") {
                filteredTemplates = standardTemplates.filter(t => !t.group_id || t.group_id === "uncategorized");
            } else {
                filteredTemplates = standardTemplates.filter(t => t.group_id === filterVal);
            }
            
            if (filteredTemplates.length === 0) {
                globalGrid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1;"><h4>No Matching Templates</h4></div>`;
            } else {
                filteredTemplates.forEach(tmpl => {
                    const card = document.createElement("div");
                    card.className = "blueprint-card";
                    card.style.cursor = "default";
                    card.style.display = "flex";
                    card.style.flexDirection = "column";
                    card.style.justifyContent = "space-between";
                    card.style.minHeight = "180px";
                    card.style.setProperty("--card-hue", getTemplateColor(tmpl.id));
                    
                    const stats = getTemplateStats(tmpl);
                    const categoryLabel = tmpl.category === "academic" ? "Academic Observation" : 
                                          tmpl.category === "teaching" ? "Teaching Appraisal" :
                                          tmpl.category === "support" ? "Support Appraisal" : "Administrative Review";
                                          
                    card.innerHTML = createTemplateCardHTML(tmpl, stats, categoryLabel);
                    globalGrid.appendChild(card);
                });
            }
        }
    }

    if (customGrid) {
        if (customTemplates.length === 0) {
            customGrid.style.display = "block";
            customGrid.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1; padding: 40px; text-align: center; background: var(--bg-card); border: 1px dashed var(--border-color); border-radius: 12px; width: 100%; box-sizing: border-box;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width: 48px; height: 48px; color: var(--text-muted); margin-bottom: 12px;"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    <h4 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600;">No Custom Templates Yet</h4>
                    <p style="margin: 0; font-size: 13px; color: var(--text-muted); max-width: 320px; margin: 0 auto 16px auto;">Create a template from scratch or clone one of the standard templates to customize it.</p>
                </div>
            `;
        } else if (filterValCustom === "all") {
            customGrid.style.display = "flex";
            customGrid.style.flexDirection = "column";
            customGrid.style.gap = "32px";
            
            const groups = state.db.template_groups.map(g => {
                return {
                    id: g.id,
                    title: g.title,
                    emoji: g.emoji || "📁",
                    templates: customTemplates.filter(t => t.group_id === g.id)
                };
            });
            
            const uncategorizedTmpls = customTemplates.filter(t => !t.group_id || t.group_id === "uncategorized");
            if (uncategorizedTmpls.length > 0) {
                groups.push({
                    id: "uncategorized",
                    title: "Uncategorized Forms",
                    emoji: "📁",
                    templates: uncategorizedTmpls
                });
            }
            
            let renderedAny = false;
            groups.forEach(group => {
                if (group.templates.length === 0) return;
                renderedAny = true;
                
                const section = document.createElement("div");
                section.className = "template-group-section";
                section.style.width = "100%";
                
                section.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 14px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
                        <span style="font-size: 18px;">${group.emoji}</span>
                        <h3 style="margin: 0; font-size: 13.5px; font-weight: 700; color: var(--text-primary); text-transform: uppercase; letter-spacing: 0.5px;">${group.title}</h3>
                        <span class="badge" style="background: rgba(99, 102, 241, 0.08); color: var(--color-primary); margin-left: auto; border-radius: 12px; padding: 2px 8px; font-size: 11px; font-weight: 700;">${group.templates.length} Form${group.templates.length !== 1 ? 's' : ''}</span>
                    </div>
                `;
                
                const cardGrid = document.createElement("div");
                cardGrid.style.display = "grid";
                cardGrid.style.gridTemplateColumns = "repeat(auto-fill, minmax(340px, 1fr))";
                cardGrid.style.gap = "20px";
                cardGrid.style.width = "100%";
                
                group.templates.forEach(tmpl => {
                    const card = document.createElement("div");
                    card.className = "blueprint-card";
                    card.style.cursor = "default";
                    card.style.display = "flex";
                    card.style.flexDirection = "column";
                    card.style.justifyContent = "space-between";
                    card.style.minHeight = "180px";
                    card.style.setProperty("--card-hue", getTemplateColor(tmpl.id));
                    
                    const stats = getTemplateStats(tmpl);
                    const categoryLabel = tmpl.category === "academic" ? "Academic Observation" : 
                                          tmpl.category === "teaching" ? "Teaching Appraisal" :
                                          tmpl.category === "support" ? "Support Appraisal" : "Administrative Review";
                                          
                    card.innerHTML = createCustomTemplateCardHTML(tmpl, stats, categoryLabel);
                    cardGrid.appendChild(card);
                });
                
                section.appendChild(cardGrid);
                customGrid.appendChild(section);
            });
            
            if (!renderedAny) {
                customGrid.style.display = "block";
                customGrid.innerHTML = `<div class="empty-state"><h4>No Custom Templates matching groups</h4></div>`;
            }
        } else {
            customGrid.style.display = "grid";
            customGrid.style.gridTemplateColumns = "repeat(auto-fill, minmax(340px, 1fr))";
            customGrid.style.gap = "20px";
            
            let filteredTemplates = [];
            if (filterValCustom === "uncategorized") {
                filteredTemplates = customTemplates.filter(t => !t.group_id || t.group_id === "uncategorized");
            } else {
                filteredTemplates = customTemplates.filter(t => t.group_id === filterValCustom);
            }
            
            if (filteredTemplates.length === 0) {
                customGrid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1;"><h4>No Matching Custom Templates</h4></div>`;
            } else {
                filteredTemplates.forEach(tmpl => {
                    const card = document.createElement("div");
                    card.className = "blueprint-card";
                    card.style.cursor = "default";
                    card.style.display = "flex";
                    card.style.flexDirection = "column";
                    card.style.justifyContent = "space-between";
                    card.style.minHeight = "180px";
                    card.style.setProperty("--card-hue", getTemplateColor(tmpl.id));
                    
                    const stats = getTemplateStats(tmpl);
                    const categoryLabel = tmpl.category === "academic" ? "Academic Observation" : 
                                          tmpl.category === "teaching" ? "Teaching Appraisal" :
                                          tmpl.category === "support" ? "Support Appraisal" : "Administrative Review";
                                          
                    card.innerHTML = createCustomTemplateCardHTML(tmpl, stats, categoryLabel);
                    customGrid.appendChild(card);
                });
            }
        }
    }
}

window.openManageGroupsModal = function() {
    renderManageGroupsList();
    openModal("modal-manage-groups");
};

window.renderManageGroupsList = function() {
    const listContainer = document.getElementById("manage-groups-list");
    if (!listContainer) return;
    
    listContainer.innerHTML = "";
    
    if (state.db.template_groups.length === 0) {
        listContainer.innerHTML = `<div class="text-muted text-center" style="font-size:13px; padding:12px;">No custom groups created yet.</div>`;
        return;
    }
    
    state.db.template_groups.forEach(group => {
        const item = document.createElement("div");
        item.style.display = "flex";
        item.style.gap = "8px";
        item.style.alignItems = "center";
        item.style.background = "var(--bg-body)";
        item.style.padding = "8px 12px";
        item.style.borderRadius = "8px";
        item.style.border = "1px solid var(--border-color)";
        
        item.innerHTML = `
            <input type="text" value="${group.emoji || '📁'}" class="form-control-light" style="width: 42px; text-align: center; font-size: 16px; font-family: inherit;" onchange="updateGroupEmoji('${group.id}', this.value)" maxlength="2">
            <input type="text" value="${group.title}" class="form-control-light" style="flex: 1; font-family: inherit;" onchange="updateGroupTitle('${group.id}', this.value)">
            <button class="small-btn secondary-btn" style="color: var(--color-danger); border-color: rgba(239,68,68,0.2); padding: 6px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; background: transparent; cursor: pointer;" onclick="deleteGroup('${group.id}')" title="Delete Group">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
        `;
        listContainer.appendChild(item);
    });
};

window.updateGroupEmoji = function(groupId, newEmoji) {
    const group = state.db.template_groups.find(g => g.id === groupId);
    if (group) {
        group.emoji = newEmoji.trim() || "📁";
        state.saveDatabase();
        Toaster.success("Group emoji updated.");
        renderTemplatesList();
    }
};

window.updateGroupTitle = function(groupId, newTitle) {
    const group = state.db.template_groups.find(g => g.id === groupId);
    if (group) {
        if (!newTitle.trim()) {
            Toaster.error("Group name cannot be empty.");
            renderManageGroupsList();
            return;
        }
        group.title = newTitle.trim();
        state.saveDatabase();
        Toaster.success("Group name updated.");
        renderTemplatesList();
    }
};

window.deleteGroup = function(groupId) {
    if (confirm("Are you sure you want to delete this group? Templates inside it will be moved to 'Uncategorized'.")) {
        state.db.templates.forEach(t => {
            if (t.group_id === groupId) {
                t.group_id = "uncategorized";
            }
        });
        state.db.template_groups = state.db.template_groups.filter(g => g.id !== groupId);
        state.saveDatabase();
        Toaster.success("Group deleted successfully.");
        renderManageGroupsList();
        renderTemplatesList();
    }
};

function syncTemplateBuilderToState() {
    // No-op because editing is done in-place directly in renderTemplateLivePreview
}

function setupInlineEdit(el, options) {
    el.addEventListener("click", (evt) => {
        evt.stopPropagation();
        
        if (state.selectedTemplateId) {
            const defaultTmplIds = DEFAULT_SEED_DATA.templates.map(t => t.id);
            if (defaultTmplIds.includes(state.selectedTemplateId) && document.getElementById("template-live-preview")?.contains(el)) {
                return;
            }
        }
        
        if (el.dataset.editing === "true") return;
        el.dataset.editing = "true";
        
        const oldChildren = Array.from(el.childNodes);
        
        let input;
        if (options.type === "textarea") {
            input = document.createElement("textarea");
            input.className = "form-control-light";
            input.style.width = "100%";
            input.style.minHeight = "60px";
            input.style.fontFamily = "inherit";
            input.style.fontSize = "inherit";
            input.value = options.value || "";
        } else if (options.type === "select") {
            input = document.createElement("select");
            input.className = "form-control-light";
            input.style.fontSize = "inherit";
            input.style.padding = "4px 8px";
            input.style.height = "auto";
            input.style.width = "auto";
            
            options.selectOptions.forEach(opt => {
                const optEl = document.createElement("option");
                optEl.value = opt.value;
                optEl.innerText = opt.label;
                if (opt.value === options.value) {
                    optEl.selected = true;
                }
                input.appendChild(optEl);
            });
        } else {
            input = document.createElement("input");
            input.type = options.type || "text";
            input.className = "form-control-light";
            input.style.fontSize = "inherit";
            input.style.fontWeight = "inherit";
            input.style.padding = "4px 8px";
            input.style.height = "auto";
            input.style.width = options.width || "100%";
            if (options.type === "number") {
                input.step = options.numberStep || "1";
                if (options.min !== undefined) input.min = options.min;
            }
            input.value = options.value !== undefined ? options.value : "";
        }
        
        el.innerHTML = "";
        el.appendChild(input);
        input.focus();
        if (options.type !== "select" && typeof input.select === "function") {
            input.select();
        }
        
        let finished = false;
        
        function finishEdit(save) {
            if (finished) return;
            finished = true;
            el.dataset.editing = "false";
            
            if (save) {
                let newVal = input.value;
                if (options.type === "number") {
                    newVal = parseFloat(newVal);
                    if (isNaN(newVal)) newVal = options.value;
                }
                options.onSave(newVal);
            } else {
                el.innerHTML = "";
                oldChildren.forEach(child => el.appendChild(child));
                if (options.onCancel) options.onCancel();
            }
        }
        
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                if (options.type === "textarea" && e.shiftKey) {
                    return;
                }
                e.preventDefault();
                finishEdit(true);
            } else if (e.key === "Escape") {
                e.preventDefault();
                finishEdit(false);
            }
        });
        
        input.addEventListener("blur", () => {
            finishEdit(true);
        });

        if (options.type === "select") {
            input.addEventListener("change", () => {
                finishEdit(true);
            });
        }
    });
}

function renderTemplateEditor() {
    const emptyState = document.getElementById("template-editor-empty");
    const container = document.getElementById("template-editor-container");

    if (!state.selectedTemplateId) {
        if (emptyState) {
            emptyState.className = "empty-state";
            emptyState.innerHTML = `
                <svg class="empty-state-svg-wrapper" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                <h4>No Template Selected</h4>
                <p>Create a new form draft or choose a custom template to begin styling observation and appraisal matrices.</p>
            `;
            emptyState.classList.remove("hidden");
        }
        if (container) container.classList.add("hidden");
        document.getElementById("template-live-preview").innerHTML = `<div class="empty-preview">Select template to render live preview.</div>`;
        return;
    }

    if (emptyState) emptyState.classList.add("hidden");
    if (container) container.classList.remove("hidden");

    const tmpl = state.db.templates.find(t => t.id === state.selectedTemplateId);
    if (tmpl) {
        const defaultTmplIds = DEFAULT_SEED_DATA.templates.map(t => t.id);
        const isStandard = defaultTmplIds.includes(tmpl.id);
        
        // Sync Left Editor Panel inputs
        if (!isStandard) {
            const editName = document.getElementById("edit-template-name");
            const editCat = document.getElementById("edit-template-category");
            const editDesc = document.getElementById("edit-template-desc");
            const editGroup = document.getElementById("edit-template-group");
            
            if (editName) editName.value = tmpl.name || "";
            if (editCat) editCat.value = tmpl.category || "academic";
            if (editDesc) editDesc.value = tmpl.description || "";
            
            if (editGroup) {
                editGroup.innerHTML = "";
                state.db.template_groups.forEach(g => {
                    const opt = document.createElement("option");
                    opt.value = g.id;
                    opt.innerText = `${g.emoji} ${g.title}`;
                    editGroup.appendChild(opt);
                });
                const optUncat = document.createElement("option");
                optUncat.value = "uncategorized";
                optUncat.innerText = "📁 Uncategorized";
                editGroup.appendChild(optUncat);
                editGroup.value = tmpl.group_id || "uncategorized";
            }
            
            // Sync Classes Button Text and Visibility
            const fieldClasses = document.getElementById("field-edit-template-classes");
            const btnClasses = document.getElementById("btn-edit-template-classes");
            
            const assignedDepts = tmpl.assigned_departments || [];
            const isTeachingOnly = assignedDepts.length > 0 && assignedDepts.every(d => d === "dept-teach" || d === "dept-activities");
            
            if (fieldClasses) {
                if (isTeachingOnly) {
                    fieldClasses.style.display = "flex";
                } else {
                    fieldClasses.style.display = "none";
                    if (tmpl.assigned_classes && tmpl.assigned_classes.length > 0) {
                        tmpl.assigned_classes = [];
                        state.saveDatabase();
                    }
                }
            }
            
            if (btnClasses && isTeachingOnly) {
                const count = (tmpl.assigned_classes || []).length;
                btnClasses.querySelector("span").innerText = count === 0 ? "🎓 All Classes" : `🎓 ${count} Class${count > 1 ? "es" : ""}`;
            }
            
            // Sync Depts Button Text
            const btnDepts = document.getElementById("btn-edit-template-depts");
            if (btnDepts) {
                const count = (tmpl.assigned_departments || []).length;
                btnDepts.querySelector("span").innerText = count === 0 ? "💼 All Departments" : `💼 ${count} Department${count > 1 ? "s" : ""}`;
            }
        }
        
        const deleteBtn = document.getElementById("btn-modal-delete-template") || document.getElementById("btn-delete-template");
        const saveBtn = document.getElementById("btn-modal-save-template") || document.getElementById("btn-save-template");
        const cloneBtn = document.getElementById("btn-clone-template");
        
        if (isStandard) {
            if (deleteBtn) deleteBtn.style.display = "none";
            if (saveBtn) saveBtn.style.display = "none";
            if (cloneBtn) cloneBtn.style.display = "inline-flex";
        } else {
            if (deleteBtn) deleteBtn.style.display = "inline-flex";
            if (saveBtn) {
                saveBtn.style.display = "inline-flex";
                saveBtn.innerText = tmpl.status === "published" ? "Unpublish Template" : "Publish Template";
                if (tmpl.status === "published") {
                    saveBtn.style.backgroundColor = "var(--color-warning)";
                    saveBtn.style.borderColor = "var(--color-warning)";
                } else {
                    saveBtn.style.backgroundColor = ""; // reset to default CSS
                    saveBtn.style.borderColor = "";
                }
            }
            if (cloneBtn) cloneBtn.style.display = "none";
        }
        renderTemplateLivePreview(tmpl);
    }
}

function renderTemplateLivePreview(tmpl) {
    const preview = document.getElementById("template-live-preview");
    preview.innerHTML = "";

    const defaultTmplIds = DEFAULT_SEED_DATA.templates.map(t => t.id);
    const isStandard = defaultTmplIds.includes(tmpl.id);
    preview.className = isStandard ? "live-preview-box readonly-preview" : "live-preview-box";

    if (isStandard) {
        const banner = document.createElement("div");
        banner.className = "system-template-banner";
        banner.style.display = "flex";
        banner.style.alignItems = "center";
        banner.style.gap = "10px";
        banner.style.padding = "12px 16px";
        banner.style.marginBottom = "16px";
        banner.style.borderRadius = "8px";
        banner.style.background = "var(--color-primary-glow)";
        banner.style.border = "1px solid var(--color-primary)";
        banner.style.color = "var(--text-primary)";
        banner.style.fontSize = "13px";
        banner.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 18px; height: 18px; color: var(--color-primary); flex-shrink: 0;">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
                <path d="M12 16v-4"/>
                <path d="M12 8h.01"/>
            </svg>
            <div>
                <strong>Global Standard Format:</strong> This is a read-only template preview. Close this popup and click <strong>Clone to Customize</strong> on the card to make an editable copy for your school.
            </div>
        `;
        preview.appendChild(banner);
    }

    // Header Container
    const headerContainer = document.createElement("div");
    headerContainer.className = "preview-header-edit-zone";
    headerContainer.style.marginBottom = "20px";
    headerContainer.style.padding = isStandard ? "0px 16px 16px 16px" : "16px";
    headerContainer.style.border = isStandard ? "none" : "1px dashed var(--border-color)";
    headerContainer.style.borderRadius = "8px";
    headerContainer.style.background = "rgba(255, 255, 255, 0.01)";

    // Title & Category Row
    const titleRow = document.createElement("div");
    titleRow.style.display = "flex";
    titleRow.style.alignItems = "center";
    titleRow.style.gap = "12px";
    titleRow.style.marginBottom = "8px";

    const titleLabel = document.createElement("span");
    titleLabel.style.fontSize = "11px";
    titleLabel.style.fontWeight = "bold";
    titleLabel.style.color = "var(--text-muted)";
    titleLabel.innerText = "FORM NAME:";
    titleRow.appendChild(titleLabel);

    const titleEl = document.createElement("h4");
    titleEl.style.margin = "0";
    titleEl.style.flex = "1";
    titleEl.innerText = tmpl.name || "Untitled Template";
    titleRow.appendChild(titleEl);

    const catLabel = document.createElement("span");
    catLabel.style.fontSize = "11px";
    catLabel.style.fontWeight = "bold";
    catLabel.style.color = "var(--text-muted)";
    catLabel.innerText = "CATEGORY:";
    titleRow.appendChild(catLabel);

    const catEl = document.createElement("span");
    catEl.className = `badge ${tmpl.category}`;
    catEl.style.fontSize = "11px";
    titleRow.appendChild(catEl);

    // Group Selector
    const groupLabel = document.createElement("span");
    groupLabel.style.fontSize = "11px";
    groupLabel.style.fontWeight = "bold";
    groupLabel.style.color = "var(--text-muted)";
    groupLabel.style.marginLeft = "12px";
    groupLabel.innerText = "GROUP:";
    titleRow.appendChild(groupLabel);

    const groupEl = document.createElement("span");
    const activeGroup = state.db.template_groups.find(g => g.id === tmpl.group_id) || { title: "Uncategorized", emoji: "📁" };
    groupEl.className = "badge";
    groupEl.style.fontSize = "11px";
    groupEl.style.backgroundColor = "rgba(99, 102, 241, 0.08)";
    groupEl.style.color = "var(--color-primary)";
    groupEl.style.border = "1px solid rgba(99, 102, 241, 0.2)";
    groupEl.innerText = `${activeGroup.emoji} ${activeGroup.title}`;
    titleRow.appendChild(groupEl);
    headerContainer.appendChild(titleRow);

    // Target Class and Department Assignments Row
    const assignmentRow = document.createElement("div");
    assignmentRow.style.display = "flex";
    assignmentRow.style.alignItems = "center";
    assignmentRow.style.gap = "16px";
    assignmentRow.style.marginTop = "10px";
    assignmentRow.style.paddingTop = "8px";
    assignmentRow.style.borderTop = "1px solid var(--border-color)";

    // Departments Selection
    const deptsContainer = document.createElement("div");
    
    const deptsLabel = document.createElement("span");
    deptsLabel.style.fontSize = "11px";
    deptsLabel.style.fontWeight = "bold";
    deptsLabel.style.color = "var(--text-muted)";
    deptsLabel.innerText = "ASSIGNED DEPARTMENTS: ";
    deptsContainer.appendChild(deptsLabel);

    const deptsBtn = document.createElement("span");
    deptsBtn.className = "badge";
    deptsBtn.style.fontSize = "11px";
    deptsBtn.style.backgroundColor = "rgba(245, 158, 11, 0.08)";
    deptsBtn.style.color = "#f59e0b";
    deptsBtn.style.border = "1px solid rgba(245, 158, 11, 0.2)";
    
    const assignedDeptsCount = (tmpl.assigned_departments || []).length;
    deptsBtn.innerText = assignedDeptsCount === 0 ? "All Departments" : `${assignedDeptsCount} Department${assignedDeptsCount > 1 ? "s" : ""}`;
    deptsContainer.appendChild(deptsBtn);

    assignmentRow.appendChild(deptsContainer);

    const assignedDepts = tmpl.assigned_departments || [];
    const isTeachingOnly = assignedDepts.length > 0 && assignedDepts.every(d => d === "dept-teach" || d === "dept-activities");

    if (isTeachingOnly) {
        // Classes Selection
        const classesContainer = document.createElement("div");
        classesContainer.style.marginLeft = "12px";
        
        const classesLabel = document.createElement("span");
        classesLabel.style.fontSize = "11px";
        classesLabel.style.fontWeight = "bold";
        classesLabel.style.color = "var(--text-muted)";
        classesLabel.innerText = "ASSIGNED CLASSES: ";
        classesContainer.appendChild(classesLabel);

        const classesBtn = document.createElement("span");
        classesBtn.className = "badge";
        classesBtn.style.fontSize = "11px";
        classesBtn.style.backgroundColor = "rgba(16, 185, 129, 0.08)";
        classesBtn.style.color = "#10b981";
        classesBtn.style.border = "1px solid rgba(16, 185, 129, 0.2)";
        
        const assignedClassesCount = (tmpl.assigned_classes || []).length;
        classesBtn.innerText = assignedClassesCount === 0 ? "All Classes" : `${assignedClassesCount} Class${assignedClassesCount > 1 ? "es" : ""}`;
        classesContainer.appendChild(classesBtn);

        assignmentRow.appendChild(classesContainer);
    }
    
    headerContainer.appendChild(assignmentRow);

    // Description Row
    const descRow = document.createElement("div");
    descRow.style.marginTop = "12px";
    
    const descLabel = document.createElement("div");
    descLabel.style.fontSize = "11px";
    descLabel.style.fontWeight = "600";
    descLabel.style.color = "var(--text-muted)";
    descLabel.style.marginBottom = "4px";
    descLabel.innerText = "DESCRIPTION / GUIDELINES:";
    descRow.appendChild(descLabel);

    const descEl = document.createElement("p");
    descEl.style.fontSize = "12.5px";
    descEl.style.color = "var(--text-muted)";
    descEl.style.margin = "0";
    descEl.style.whiteSpace = "pre-wrap";
    descEl.style.width = "100%";
    descEl.innerText = tmpl.description || "No description provided.";
    descRow.appendChild(descEl);
    headerContainer.appendChild(descRow);
    preview.appendChild(headerContainer);

    // Render Sections
    tmpl.sections.sort((a,b) => a.sort_order - b.sort_order).forEach((sect, sIdx) => {
        const sectBlock = document.createElement("div");
        sectBlock.className = "preview-sect-block";
        sectBlock.style.position = "relative";
        sectBlock.style.border = "1px solid var(--border-color)";
        sectBlock.style.borderRadius = "8px";
        sectBlock.style.padding = "16px";
        sectBlock.style.marginBottom = "20px";
        sectBlock.style.background = "rgba(255, 255, 255, 0.01)";

        // Section Title & Weight Row
        const sectHeaderRow = document.createElement("div");
        sectHeaderRow.className = "preview-sect-title";
        sectHeaderRow.style.display = "flex";
        sectHeaderRow.style.justifyContent = "space-between";
        sectHeaderRow.style.alignItems = "center";

        const leftHeader = document.createElement("div");
        leftHeader.style.display = "flex";
        leftHeader.style.alignItems = "center";
        leftHeader.style.gap = "8px";

        const sectTitleEl = document.createElement("span");
        if (!isStandard) {
            sectTitleEl.className = "editable-field";
        }
        sectTitleEl.style.fontWeight = "bold";
        sectTitleEl.innerText = sect.title || `Section ${sIdx + 1}`;
        if (!isStandard) {
            setupInlineEdit(sectTitleEl, {
                type: "text",
                value: sect.title,
                onSave: (newVal) => {
                    sect.title = newVal.trim() || `Section ${sIdx + 1}`;
                    state.saveDatabase();
                    renderTemplateLivePreview(tmpl);
                }
            });
        }
        leftHeader.appendChild(sectTitleEl);

        const sectWeightEl = document.createElement("span");
        if (!isStandard) {
            sectWeightEl.className = "editable-field";
        }
        sectWeightEl.style.fontSize = "12px";
        sectWeightEl.style.color = "var(--text-muted)";
        sectWeightEl.style.fontWeight = "normal";
        sectWeightEl.innerText = ` (weight: ${sect.weight !== undefined ? sect.weight : 1.0})`;
        if (!isStandard) {
            setupInlineEdit(sectWeightEl, {
                type: "number",
                value: sect.weight !== undefined ? sect.weight : 1.0,
                numberStep: "0.1",
                min: 0,
                width: "60px",
                onSave: (newVal) => {
                    sect.weight = newVal;
                    state.saveDatabase();
                    renderTemplateLivePreview(tmpl);
                }
            });
        }
        leftHeader.appendChild(sectWeightEl);
        sectHeaderRow.appendChild(leftHeader);

        if (!isStandard) {
            const rightHeader = document.createElement("div");
            rightHeader.style.display = "flex";
            rightHeader.style.alignItems = "center";
            rightHeader.style.gap = "8px";

            if (sIdx > 0) {
                const upBtn = document.createElement("button");
                upBtn.className = "small-btn secondary-btn";
                upBtn.style.padding = "2px 6px";
                upBtn.innerText = "▲";
                upBtn.title = "Move Section Up";
                upBtn.addEventListener("click", () => {
                    const prevSect = tmpl.sections.sort((a,b) => a.sort_order - b.sort_order)[sIdx - 1];
                    const tmp = sect.sort_order;
                    sect.sort_order = prevSect.sort_order;
                    prevSect.sort_order = tmp;
                    state.saveDatabase();
                    renderTemplateLivePreview(tmpl);
                });
                rightHeader.appendChild(upBtn);
            }
            if (sIdx < tmpl.sections.length - 1) {
                const downBtn = document.createElement("button");
                downBtn.className = "small-btn secondary-btn";
                downBtn.style.padding = "2px 6px";
                downBtn.innerText = "▼";
                downBtn.title = "Move Section Down";
                downBtn.addEventListener("click", () => {
                    const nextSect = tmpl.sections.sort((a,b) => a.sort_order - b.sort_order)[sIdx + 1];
                    const tmp = sect.sort_order;
                    sect.sort_order = nextSect.sort_order;
                    nextSect.sort_order = tmp;
                    state.saveDatabase();
                    renderTemplateLivePreview(tmpl);
                });
                rightHeader.appendChild(downBtn);
            }

            const delSectBtn = document.createElement("button");
            delSectBtn.className = "small-btn secondary-btn danger-btn";
            delSectBtn.style.padding = "4px 8px";
            delSectBtn.style.color = "var(--color-danger)";
            delSectBtn.innerText = "Delete Section";
            delSectBtn.addEventListener("click", () => {
                if (confirm(`Are you sure you want to delete section "${sect.title}" and all its questions?`)) {
                    tmpl.sections = tmpl.sections.filter(s => s.id !== sect.id);
                    tmpl.sections.sort((a,b) => a.sort_order - b.sort_order).forEach((s, idx) => {
                        s.sort_order = idx + 1;
                    });
                    state.saveDatabase();
                    renderTemplateLivePreview(tmpl);
                }
            });
            rightHeader.appendChild(delSectBtn);
            sectHeaderRow.appendChild(rightHeader);
        }
        sectBlock.appendChild(sectHeaderRow);

        // Render Questions within this Section
        const itemsContainer = document.createElement("div");
        sect.items.sort((a,b) => a.sort_order - b.sort_order).forEach((item, iIdx) => {
            const itemBlock = document.createElement("div");
            itemBlock.className = "preview-item-block";
            itemBlock.style.border = isStandard ? "1px solid var(--border-color)" : "1px dashed var(--border-color)";
            itemBlock.style.borderRadius = "6px";
            itemBlock.style.padding = "12px";
            itemBlock.style.marginBottom = "12px";
            itemBlock.style.position = "relative";

            const qHeaderRow = document.createElement("div");
            qHeaderRow.style.display = "flex";
            qHeaderRow.style.justifyContent = "space-between";
            qHeaderRow.style.alignItems = "flex-start";
            qHeaderRow.style.gap = "12px";
            qHeaderRow.style.marginBottom = "8px";

            const qTitleCol = document.createElement("div");
            qTitleCol.style.flex = "1";

            const qTitleEl = document.createElement("div");
            if (!isStandard) {
                qTitleEl.className = "preview-item-title editable-field";
            } else {
                qTitleEl.className = "preview-item-title";
            }
            qTitleEl.innerText = item.title || `Question ${iIdx + 1}`;
            if (!isStandard) {
                setupInlineEdit(qTitleEl, {
                    type: "text",
                    value: item.title,
                    onSave: (newVal) => {
                        item.title = newVal.trim() || `Question ${iIdx + 1}`;
                        state.saveDatabase();
                        renderTemplateLivePreview(tmpl);
                    }
                });
            }
            qTitleCol.appendChild(qTitleEl);

            const qDescEl = document.createElement("div");
            if (!isStandard) {
                qDescEl.className = "preview-item-desc editable-field";
            } else {
                qDescEl.className = "preview-item-desc";
            }
            qDescEl.style.fontSize = "11.5px";
            qDescEl.style.color = "var(--text-muted)";
            qDescEl.innerText = item.description || (isStandard ? "" : "Click to add question sub-description...");
            if (!isStandard) {
                setupInlineEdit(qDescEl, {
                    type: "text",
                    value: item.description || "",
                    onSave: (newVal) => {
                        item.description = newVal.trim();
                        state.saveDatabase();
                        renderTemplateLivePreview(tmpl);
                    }
                });
            }
            qTitleCol.appendChild(qDescEl);
            qHeaderRow.appendChild(qTitleCol);

            // Controls Row
            const qControls = document.createElement("div");
            qControls.style.display = "flex";
            qControls.style.alignItems = "center";
            qControls.style.gap = "8px";

            if (!isStandard) {
                const typeLabel = document.createElement("span");
                typeLabel.style.fontSize = "11px";
                typeLabel.style.color = "var(--text-muted)";
                typeLabel.innerText = "Type:";
                qControls.appendChild(typeLabel);

                const typeSelectEl = document.createElement("span");
                typeSelectEl.className = "badge editable-field";
                typeSelectEl.style.cursor = "pointer";
                typeSelectEl.innerText = item.item_type === "choice" ? "Multiple Choice" : "Text Comment";
                setupInlineEdit(typeSelectEl, {
                    type: "select",
                    value: item.item_type,
                    selectOptions: [
                        { value: "choice", label: "Multiple Choice" },
                        { value: "text_input", label: "Text Comment" }
                    ],
                    onSave: (newVal) => {
                        item.item_type = newVal;
                        if (newVal === "choice") {
                            if (!item.choices || item.choices.length === 0) {
                                item.choices = [
                                    { id: `${item.id}-opt-1`, label: "Option 1", points: 10 },
                                    { id: `${item.id}-opt-2`, label: "Option 2", points: 0 }
                                ];
                            }
                            item.display_style = item.display_style || "pills";
                        } else {
                            item.choices = [];
                        }
                        state.saveDatabase();
                        renderTemplateLivePreview(tmpl);
                    }
                });
                qControls.appendChild(typeSelectEl);
            }

            const wtLabel = document.createElement("span");
            wtLabel.style.fontSize = "11px";
            wtLabel.style.color = "var(--text-muted)";
            wtLabel.innerText = "Weight:";
            qControls.appendChild(wtLabel);

            const wtEl = document.createElement("span");
            if (!isStandard) {
                wtEl.className = "editable-field";
            }
            wtEl.style.fontWeight = "bold";
            wtEl.innerText = item.weight !== undefined ? item.weight : 1.0;
            if (!isStandard) {
                setupInlineEdit(wtEl, {
                    type: "number",
                    value: item.weight !== undefined ? item.weight : 1.0,
                    numberStep: "0.1",
                    min: 0,
                    width: "50px",
                    onSave: (newVal) => {
                        item.weight = newVal;
                        state.saveDatabase();
                        renderTemplateLivePreview(tmpl);
                    }
                });
            }
            qControls.appendChild(wtEl);

            if (!isStandard) {
                if (iIdx > 0) {
                    const qUpBtn = document.createElement("button");
                    qUpBtn.className = "small-btn secondary-btn";
                    qUpBtn.style.padding = "2px 4px";
                    qUpBtn.innerText = "▲";
                    qUpBtn.addEventListener("click", () => {
                        const prevItem = sect.items.sort((a,b) => a.sort_order - b.sort_order)[iIdx - 1];
                        const tmp = item.sort_order;
                        item.sort_order = prevItem.sort_order;
                        prevItem.sort_order = tmp;
                        state.saveDatabase();
                        renderTemplateLivePreview(tmpl);
                    });
                    qControls.appendChild(qUpBtn);
                }
                if (iIdx < sect.items.length - 1) {
                    const qDownBtn = document.createElement("button");
                    qDownBtn.className = "small-btn secondary-btn";
                    qDownBtn.style.padding = "2px 4px";
                    qDownBtn.innerText = "▼";
                    qDownBtn.addEventListener("click", () => {
                        const nextItem = sect.items.sort((a,b) => a.sort_order - b.sort_order)[iIdx + 1];
                        const tmp = item.sort_order;
                        item.sort_order = nextItem.sort_order;
                        prevItem.sort_order = tmp;
                        state.saveDatabase();
                        renderTemplateLivePreview(tmpl);
                    });
                    qControls.appendChild(qDownBtn);
                }

                const delItemBtn = document.createElement("button");
                delItemBtn.className = "small-btn secondary-btn";
                delItemBtn.style.padding = "4px 6px";
                delItemBtn.style.color = "var(--color-danger)";
                delItemBtn.innerText = "×";
                delItemBtn.title = "Delete Question";
                delItemBtn.addEventListener("click", () => {
                    if (confirm(`Delete question "${item.title}"?`)) {
                        sect.items = sect.items.filter(i => i.id !== item.id);
                        sect.items.sort((a,b) => a.sort_order - b.sort_order).forEach((it, idx) => {
                            it.sort_order = idx + 1;
                        });
                        state.saveDatabase();
                        renderTemplateLivePreview(tmpl);
                    }
                });
                qControls.appendChild(delItemBtn);
            }

            qHeaderRow.appendChild(qControls);
            itemBlock.appendChild(qHeaderRow);

            // Choice display style and matrix block
            if (item.item_type === "choice") {
                const maxPoints = item.choices && item.choices.length > 0 ? Math.max(...item.choices.map(c => c.points)) : 0;
                
                if (item.display_style === "stars") {
                    const starsRow = document.createElement("div");
                    starsRow.className = "star-rating-row";
                    const numStars = item.choices ? item.choices.length : 5;
                    
                    const row1 = document.createElement("div");
                    row1.className = "star-row-line";
                    const row2 = document.createElement("div");
                    row2.className = "star-row-line";

                    for (let sIdx = 0; sIdx < numStars; sIdx++) {
                        const star = document.createElement("span");
                        star.className = "star-icon";
                        star.innerText = "★";
                        if (numStars === 10) {
                            if (sIdx < 5) row1.appendChild(star);
                            else row2.appendChild(star);
                        } else {
                            starsRow.appendChild(star);
                        }
                    }
                    if (numStars === 10) {
                        starsRow.appendChild(row1);
                        starsRow.appendChild(row2);
                    }
                    
                    const labelSpan = document.createElement("span");
                    labelSpan.className = "star-label-preview";
                    labelSpan.innerText = `(Interactive star scale - ${numStars} stars)`;
                    starsRow.appendChild(labelSpan);
                    itemBlock.appendChild(starsRow);
                } else {
                    const row = document.createElement("div");
                    row.className = "preview-rubric-options";
                    (item.choices || []).forEach(v => {
                        const ratio = maxPoints > 0 ? (v.points / maxPoints) : 0;
                        let colorClass = "choice-score-low";
                        if (ratio >= 0.8) colorClass = "choice-score-high";
                        else if (ratio >= 0.5) colorClass = "choice-score-medium";
                        
                        const btn = document.createElement("div");
                        btn.className = `preview-rubric-btn ${colorClass}`;
                        btn.innerHTML = `${v.label} <span style="font-size:8px; opacity:0.8;">(${v.points} pts)</span>`;
                        row.appendChild(btn);
                    });
                    itemBlock.appendChild(row);
                }

                if (!isStandard) {
                    // Choices list and presets
                    const choicesBlock = document.createElement("div");
                    choicesBlock.style.marginTop = "12px";
                    choicesBlock.style.paddingTop = "12px";
                    choicesBlock.style.borderTop = "1px dashed var(--border-color)";

                    const cbHeader = document.createElement("div");
                    cbHeader.style.display = "flex";
                    cbHeader.style.justifyContent = "space-between";
                    cbHeader.style.alignItems = "center";
                    cbHeader.style.marginBottom = "8px";

                    const cbTitle = document.createElement("label");
                    cbTitle.style.fontSize = "11.5px";
                    cbTitle.style.fontWeight = "600";
                    cbTitle.style.color = "var(--text-muted)";
                    cbTitle.innerText = "Options & Points Matrix";
                    cbHeader.appendChild(cbTitle);

                    const cbActions = document.createElement("div");
                    cbActions.className = "builder-cb-actions";
                    cbActions.style.display = "flex";
                    cbActions.style.alignItems = "center";
                    cbActions.style.gap = "8px";

                    const dispLabel = document.createElement("span");
                    dispLabel.style.fontSize = "11px";
                    dispLabel.style.color = "var(--text-muted)";
                    dispLabel.innerText = "Display:";
                    cbActions.appendChild(dispLabel);

                    const dispSelect = document.createElement("select");
                    dispSelect.className = "form-control-light";
                    dispSelect.style.fontSize = "11px";
                    dispSelect.style.padding = "2px 6px";
                    dispSelect.style.height = "auto";
                    dispSelect.style.width = "auto";
                    dispSelect.innerHTML = `
                        <option value="pills" ${item.display_style === 'stars' ? '' : 'selected'}>Pills (Red-to-Green)</option>
                        <option value="stars" ${item.display_style === 'stars' ? 'selected' : ''}>Stars (Interactive)</option>
                    `;
                    dispSelect.addEventListener("change", (e) => {
                        item.display_style = e.target.value;
                        state.saveDatabase();
                        renderTemplateLivePreview(tmpl);
                    });
                    cbActions.appendChild(dispSelect);

                    const presetSelect = document.createElement("select");
                    presetSelect.className = "form-control-light";
                    presetSelect.style.fontSize = "11px";
                    presetSelect.style.padding = "2px 6px";
                    presetSelect.style.height = "auto";
                    presetSelect.style.width = "auto";
                    presetSelect.innerHTML = `
                        <option value="">Load Preset...</option>
                        <option value="scale_1_10">Scale 1-10 (Stars)</option>
                        <option value="yes_no_partially">Yes / No / Partially</option>
                        <option value="strong_adequate_needs">Strong / Adequate / Needs</option>
                    `;
                    presetSelect.addEventListener("change", (e) => {
                        const presetKey = e.target.value;
                        if (!presetKey) return;
                        if (presetKey === "scale_1_10") {
                            item.choices = makeScale1to10(item.id);
                            item.display_style = "stars";
                        } else if (presetKey === "yes_no_partially") {
                            item.choices = [
                                { id: `${item.id}-ynp-yes`, label: "Yes", points: 10 },
                                { id: `${item.id}-ynp-partial`, label: "Partially", points: 5 },
                                { id: `${item.id}-ynp-no`, label: "No", points: 0 }
                            ];
                            item.display_style = "pills";
                        } else if (presetKey === "strong_adequate_needs") {
                            item.choices = [
                                { id: `${item.id}-san-strong`, label: "Strong Alignment", points: 10 },
                                { id: `${item.id}-san-adequate`, label: "Adequate Alignment", points: 6 },
                                { id: `${item.id}-san-needs`, label: "Needs Alignment", points: 2 }
                            ];
                            item.display_style = "pills";
                        }
                        state.saveDatabase();
                        renderTemplateLivePreview(tmpl);
                    });
                    cbActions.appendChild(presetSelect);

                    const addOptBtn = document.createElement("button");
                    addOptBtn.className = "small-btn secondary-btn";
                    addOptBtn.style.fontSize = "11px";
                    addOptBtn.style.padding = "2px 6px";
                    addOptBtn.innerText = "+ Add Option";
                    addOptBtn.addEventListener("click", () => {
                        if (!item.choices) item.choices = [];
                        const choiceId = `opt-choice-${Math.floor(Math.random()*1000000)}`;
                        item.choices.push({
                            id: choiceId,
                            label: `Option ${item.choices.length + 1}`,
                            points: 5
                        });
                        state.saveDatabase();
                        renderTemplateLivePreview(tmpl);
                    });
                    cbActions.appendChild(addOptBtn);
                    cbHeader.appendChild(cbActions);
                    choicesBlock.appendChild(cbHeader);

                    const listContainer = document.createElement("div");
                    listContainer.style.display = "flex";
                    listContainer.style.flexDirection = "column";
                    listContainer.style.gap = "6px";

                    (item.choices || []).forEach((ch, chIdx) => {
                        const choiceRow = document.createElement("div");
                        choiceRow.className = "builder-choice-row";
                        choiceRow.style.display = "flex";
                        choiceRow.style.alignItems = "center";
                        choiceRow.style.gap = "8px";

                        const idxSpan = document.createElement("span");
                        idxSpan.style.fontSize = "11px";
                        idxSpan.style.color = "var(--text-subtle)";
                        idxSpan.style.width = "20px";
                        idxSpan.innerText = `${chIdx + 1}.`;
                        choiceRow.appendChild(idxSpan);

                        const chLabelEl = document.createElement("span");
                        chLabelEl.className = "editable-field";
                        chLabelEl.style.flex = "3";
                        chLabelEl.style.fontSize = "12px";
                        chLabelEl.style.padding = "4px 8px";
                        chLabelEl.style.border = "1px solid transparent";
                        chLabelEl.innerText = ch.label || "Option Label";
                        setupInlineEdit(chLabelEl, {
                            type: "text",
                            value: ch.label,
                            onSave: (newVal) => {
                                ch.label = newVal.trim() || "Option Label";
                                state.saveDatabase();
                                renderTemplateLivePreview(tmpl);
                            }
                        });
                        choiceRow.appendChild(chLabelEl);

                        const chPtsLabel = document.createElement("span");
                        chPtsLabel.style.fontSize = "11px";
                        chPtsLabel.style.color = "var(--text-muted)";
                        chPtsLabel.innerText = "pts:";
                        choiceRow.appendChild(chPtsLabel);

                        const chPtsEl = document.createElement("span");
                        chPtsEl.className = "editable-field";
                        chPtsEl.style.width = "40px";
                        chPtsEl.style.fontSize = "12px";
                        chPtsEl.style.fontWeight = "bold";
                        chPtsEl.style.padding = "4px 8px";
                        chPtsEl.style.border = "1px solid transparent";
                        chPtsEl.innerText = ch.points;
                        setupInlineEdit(chPtsEl, {
                            type: "number",
                            value: ch.points,
                            numberStep: "0.5",
                            width: "50px",
                            onSave: (newVal) => {
                                ch.points = newVal;
                                state.saveDatabase();
                                renderTemplateLivePreview(tmpl);
                            }
                        });
                        choiceRow.appendChild(chPtsEl);

                        const delOptBtn = document.createElement("button");
                        delOptBtn.className = "small-btn secondary-btn";
                        delOptBtn.style.padding = "2px 6px";
                        delOptBtn.style.color = "var(--color-danger)";
                        delOptBtn.innerText = "×";
                        delOptBtn.addEventListener("click", () => {
                            item.choices = item.choices.filter(c => c.id !== ch.id);
                            state.saveDatabase();
                            renderTemplateLivePreview(tmpl);
                        });
                        choiceRow.appendChild(delOptBtn);

                        listContainer.appendChild(choiceRow);
                    });
                    choicesBlock.appendChild(listContainer);
                    itemBlock.appendChild(choicesBlock);
                }
            } else {
                itemBlock.innerHTML += `<textarea class="form-control-light w-full" style="height:48px;" placeholder="Qualitative observations..." readonly></textarea>`;
            }

            // Additional Notes and evidence checkboxes
            const extraRow = document.createElement("div");
            extraRow.className = "builder-extra-row";
            extraRow.style.marginTop = "12px";
            extraRow.style.borderTop = "1px dotted var(--border-color)";
            extraRow.style.paddingTop = "8px";
            extraRow.style.display = "flex";
            extraRow.style.alignItems = "center";
            extraRow.style.flexWrap = "wrap";
            extraRow.style.gap = "16px";

            const remarksLabel = document.createElement("label");
            remarksLabel.style.display = "flex";
            remarksLabel.style.alignItems = "center";
            remarksLabel.style.gap = "6px";
            remarksLabel.style.fontSize = "11.5px";
            remarksLabel.style.color = "var(--text-muted)";
            remarksLabel.style.cursor = "pointer";
            remarksLabel.style.userSelect = "none";

            const remarksChk = document.createElement("input");
            remarksChk.type = "checkbox";
            remarksChk.checked = item.allow_remarks !== false;
            if (isStandard) {
                remarksChk.disabled = true;
                remarksLabel.style.cursor = "default";
            } else {
                remarksChk.addEventListener("change", (e) => {
                    item.allow_remarks = e.target.checked;
                    state.saveDatabase();
                    renderTemplateLivePreview(tmpl);
                });
            }
            remarksLabel.appendChild(remarksChk);
            remarksLabel.appendChild(document.createTextNode("Allow Additional Notes"));
            extraRow.appendChild(remarksLabel);

            const evidenceLabel = document.createElement("label");
            evidenceLabel.style.display = "flex";
            evidenceLabel.style.alignItems = "center";
            evidenceLabel.style.gap = "6px";
            evidenceLabel.style.fontSize = "11.5px";
            evidenceLabel.style.color = "var(--text-muted)";
            if (isStandard) {
                evidenceLabel.style.cursor = "default";
            } else {
                evidenceLabel.style.cursor = "pointer";
            }
            evidenceLabel.style.userSelect = "none";

            const evidenceChk = document.createElement("input");
            evidenceChk.type = "checkbox";
            evidenceChk.checked = item.allow_evidence !== false;
            if (isStandard) {
                evidenceChk.disabled = true;
            } else {
                evidenceChk.addEventListener("change", (e) => {
                    item.allow_evidence = e.target.checked;
                    state.saveDatabase();
                    renderTemplateLivePreview(tmpl);
                });
            }
            evidenceLabel.appendChild(evidenceChk);
            evidenceLabel.appendChild(document.createTextNode("Allow Media Evidence"));
            extraRow.appendChild(evidenceLabel);

            itemBlock.appendChild(extraRow);

            if (item.allow_remarks !== false) {
                const remarksBox = document.createElement("div");
                remarksBox.style.marginTop = "8px";
                remarksBox.innerHTML = `
                    <label style="font-size:10px; font-weight:600; color:var(--text-muted); display:block; margin-bottom:2px;">Additional Note</label>
                    <textarea class="form-control-light w-full" style="font-size:11px; height:32px; resize:none;" placeholder="Write observations/notes..." readonly></textarea>
                `;
                itemBlock.appendChild(remarksBox);
            }

            if (tmpl.category === "academic" && item.allow_evidence !== false) {
                const evidenceBox = document.createElement("div");
                evidenceBox.style.marginTop = "8px";
                evidenceBox.innerHTML = `
                    <div class="evidence-upload-zone" style="font-size:11px; padding:6px 12px; border-radius:6px; pointer-events:none; opacity:0.8;">
                        <span>📷 Attach evidence (eg. photo/video etc. to support your observation)</span>
                    </div>
                `;
                itemBlock.appendChild(evidenceBox);
            }

            itemsContainer.appendChild(itemBlock);
        });
        sectBlock.appendChild(itemsContainer);

        const addQBtn = document.createElement("button");
        addQBtn.className = "secondary-btn small-btn mt-2";
        addQBtn.innerText = "+ Add Question Item";
        addQBtn.addEventListener("click", () => {
            const nextOrder = sect.items.length + 1;
            const itemId = `ti-add-${Math.floor(Math.random()*10000)}`;
            sect.items.push({
                id: itemId,
                title: `Question ${nextOrder}`,
                description: "",
                item_type: "choice",
                choices: [
                    { id: `${itemId}-opt-1`, label: "Option 1", points: 10 },
                    { id: `${itemId}-opt-2`, label: "Option 2", points: 0 }
                ],
                allow_remarks: true,
                allow_evidence: true,
                display_style: "pills",
                weight: 1.00,
                sort_order: nextOrder
            });
            state.saveDatabase();
            renderTemplateLivePreview(tmpl);
        });
        if (!isStandard) {
            sectBlock.appendChild(addQBtn);
        }

        preview.appendChild(sectBlock);
    });

    if (!isStandard) {
        const addSectBtn = document.createElement("button");
        addSectBtn.className = "action-btn w-full mt-3";
        addSectBtn.style.padding = "10px";
        addSectBtn.innerText = "+ Add Form Section";
        addSectBtn.addEventListener("click", () => {
            const nextOrder = tmpl.sections.length + 1;
            tmpl.sections.push({
                id: `sec-auto-${nextOrder}-${Math.floor(Math.random()*100)}`,
                title: `Assessment Section Group ${nextOrder}`,
                weight: 1.00,
                sort_order: nextOrder,
                items: []
            });
            state.saveDatabase();
            renderTemplateLivePreview(tmpl);
        });
        preview.appendChild(addSectBtn);
    }
}

function initTemplateBuilder() {
    // Global click listener to close assignment dropdowns when clicking outside
    document.addEventListener("click", () => {
        document.querySelectorAll(".assignment-dropdown-menu").forEach(el => {
            if (el.id && el.id.startsWith("dropdown-edit-template-")) {
                el.classList.add("hidden");
            } else {
                el.remove();
            }
        });
    });

    // Wire up left editor inputs
    const editName = document.getElementById("edit-template-name");
    if (editName) {
        editName.addEventListener("input", (e) => {
            if (!state.selectedTemplateId) return;
            const tmpl = state.db.templates.find(t => t.id === state.selectedTemplateId);
            if (tmpl) {
                tmpl.name = e.target.value.trim() || "Untitled Template";
                state.saveDatabase();
                renderTemplatesList();
                // Update preview title
                const previewTitle = document.querySelector("#template-live-preview h4");
                if (previewTitle) previewTitle.innerText = tmpl.name;
            }
        });
    }
    
    const editCat = document.getElementById("edit-template-category");
    if (editCat) {
        editCat.addEventListener("change", (e) => {
            if (!state.selectedTemplateId) return;
            const tmpl = state.db.templates.find(t => t.id === state.selectedTemplateId);
            if (tmpl) {
                tmpl.category = e.target.value;
                state.saveDatabase();
                renderTemplatesList();
                renderTemplateLivePreview(tmpl);
            }
        });
    }
    
    const editGroup = document.getElementById("edit-template-group");
    if (editGroup) {
        editGroup.addEventListener("change", (e) => {
            if (!state.selectedTemplateId) return;
            const tmpl = state.db.templates.find(t => t.id === state.selectedTemplateId);
            if (tmpl) {
                tmpl.group_id = e.target.value;
                state.saveDatabase();
                renderTemplatesList();
                renderTemplateLivePreview(tmpl);
            }
        });
    }
    
    const editDesc = document.getElementById("edit-template-desc");
    if (editDesc) {
        editDesc.addEventListener("input", (e) => {
            if (!state.selectedTemplateId) return;
            const tmpl = state.db.templates.find(t => t.id === state.selectedTemplateId);
            if (tmpl) {
                tmpl.description = e.target.value.trim();
                state.saveDatabase();
                // Update preview description
                const previewDesc = document.querySelector("#template-live-preview p");
                if (previewDesc) previewDesc.innerText = tmpl.description || "Click to add guidelines / description...";
            }
        });
    }

    const btnClasses = document.getElementById("btn-edit-template-classes");
    const dropdownClasses = document.getElementById("dropdown-edit-template-classes");
    if (btnClasses && dropdownClasses) {
        btnClasses.addEventListener("click", (e) => {
            e.stopPropagation();
            dropdownClasses.classList.toggle("hidden");
            document.getElementById("dropdown-edit-template-depts")?.classList.add("hidden");
            
            if (!dropdownClasses.classList.contains("hidden")) {
                const tmpl = state.db.templates.find(t => t.id === state.selectedTemplateId);
                if (!tmpl) return;
                
                dropdownClasses.innerHTML = `
                    <div class="assignment-dropdown-header">
                        <h5>Select Applicable Classes</h5>
                        <div style="display:flex; gap:8px;">
                            <button class="assignment-dropdown-link" id="btn-left-classes-all">All</button>
                            <button class="assignment-dropdown-link" id="btn-left-classes-none">None</button>
                        </div>
                    </div>
                    <div class="assignment-dropdown-list" id="left-classes-checkbox-list"></div>
                    <div class="assignment-dropdown-footer">
                        <button class="small-btn action-btn" style="padding:4px 8px; font-size:11px;" id="btn-left-classes-apply">Apply</button>
                    </div>
                `;
                
                const listDiv = dropdownClasses.querySelector("#left-classes-checkbox-list");
                const allClasses = state.db.classes || [];
                const currentlySelected = new Set(tmpl.assigned_classes || []);
                
                allClasses.forEach(c => {
                    const item = document.createElement("label");
                    item.className = "assignment-dropdown-item";
                    
                    const cb = document.createElement("input");
                    cb.type = "checkbox";
                    cb.value = c;
                    cb.checked = currentlySelected.has(c);
                    
                    item.appendChild(cb);
                    item.appendChild(document.createTextNode(c));
                    listDiv.appendChild(item);
                });
                
                dropdownClasses.querySelector("#btn-left-classes-all").addEventListener("click", (evt) => {
                    evt.preventDefault();
                    listDiv.querySelectorAll("input").forEach(i => i.checked = true);
                });
                
                dropdownClasses.querySelector("#btn-left-classes-none").addEventListener("click", (evt) => {
                    evt.preventDefault();
                    listDiv.querySelectorAll("input").forEach(i => i.checked = false);
                });
                
                dropdownClasses.querySelector("#btn-left-classes-apply").addEventListener("click", () => {
                    const selected = [];
                    listDiv.querySelectorAll("input").forEach(i => {
                        if (i.checked) selected.push(i.value);
                    });
                    tmpl.assigned_classes = selected;
                    state.saveDatabase();
                    renderTemplateEditor();
                    dropdownClasses.classList.add("hidden");
                });
            }
        });
        dropdownClasses.addEventListener("click", (e) => e.stopPropagation());
    }

    const btnDepts = document.getElementById("btn-edit-template-depts");
    const dropdownDepts = document.getElementById("dropdown-edit-template-depts");
    if (btnDepts && dropdownDepts) {
        btnDepts.addEventListener("click", (e) => {
            e.stopPropagation();
            dropdownDepts.classList.toggle("hidden");
            document.getElementById("dropdown-edit-template-classes")?.classList.add("hidden");
            
            if (!dropdownDepts.classList.contains("hidden")) {
                const tmpl = state.db.templates.find(t => t.id === state.selectedTemplateId);
                if (!tmpl) return;
                
                dropdownDepts.innerHTML = `
                    <div class="assignment-dropdown-header">
                        <h5>Select Departments</h5>
                        <div style="display:flex; gap:8px;">
                            <button class="assignment-dropdown-link" id="btn-left-depts-all">All</button>
                            <button class="assignment-dropdown-link" id="btn-left-depts-none">None</button>
                        </div>
                    </div>
                    <div class="assignment-dropdown-list" id="left-depts-checkbox-list"></div>
                    <div class="assignment-dropdown-footer">
                        <button class="small-btn action-btn" style="padding:4px 8px; font-size:11px;" id="btn-left-depts-apply">Apply</button>
                    </div>
                `;
                
                const listDiv = dropdownDepts.querySelector("#left-depts-checkbox-list");
                const allDepts = state.db.departments || [];
                const currentlySelected = new Set(tmpl.assigned_departments || []);
                
                allDepts.forEach(d => {
                    const item = document.createElement("label");
                    item.className = "assignment-dropdown-item";
                    
                    const cb = document.createElement("input");
                    cb.type = "checkbox";
                    cb.value = d.id;
                    cb.checked = currentlySelected.has(d.id);
                    
                    item.appendChild(cb);
                    item.appendChild(document.createTextNode(d.name));
                    listDiv.appendChild(item);
                });
                
                dropdownDepts.querySelector("#btn-left-depts-all").addEventListener("click", (evt) => {
                    evt.preventDefault();
                    listDiv.querySelectorAll("input").forEach(i => i.checked = true);
                });
                
                dropdownDepts.querySelector("#btn-left-depts-none").addEventListener("click", (evt) => {
                    evt.preventDefault();
                    listDiv.querySelectorAll("input").forEach(i => i.checked = false);
                });
                
                dropdownDepts.querySelector("#btn-left-depts-apply").addEventListener("click", () => {
                    const selected = [];
                    listDiv.querySelectorAll("input").forEach(i => {
                        if (i.checked) selected.push(i.value);
                    });
                    tmpl.assigned_departments = selected;
                    state.saveDatabase();
                    renderTemplateEditor();
                    dropdownDepts.classList.add("hidden");
                });
            }
        });
        dropdownDepts.addEventListener("click", (e) => e.stopPropagation());
    }

    // Modal save button
    const modalSaveBtn = document.getElementById("btn-modal-save-template");
    if (modalSaveBtn) {
        modalSaveBtn.addEventListener("click", () => {
            if (!state.selectedTemplateId) return;
            const tmpl = state.db.templates.find(t => t.id === state.selectedTemplateId);
            if (!tmpl) return;

            if (tmpl.status === "published") {
                tmpl.status = "draft";
                state.saveDatabase();
                Toaster.success(`Form template "${tmpl.name}" set back to draft.`);
            } else {
                tmpl.status = "published";
                state.saveDatabase();
                Toaster.success(`Form template "${tmpl.name}" published successfully.`);
            }
            renderTemplatesList();
            closeModal("modal-form-builder");
        });
    }

    // Modal delete button
    const modalDeleteBtn = document.getElementById("btn-modal-delete-template");
    if (modalDeleteBtn) {
        modalDeleteBtn.addEventListener("click", () => {
            if (!state.selectedTemplateId) return;
            deleteCustomTemplateDirectly(state.selectedTemplateId);
            closeModal("modal-form-builder");
        });
    }

    // Close button for form builder
    const closeBuilderBtn = document.getElementById("btn-close-form-builder");
    if (closeBuilderBtn) {
        closeBuilderBtn.addEventListener("click", () => {
            closeModal("modal-form-builder");
            renderTemplatesList();
        });
    }

    // Add template group listener
    const addGroupBtn = document.getElementById("btn-add-template-group");
    if (addGroupBtn) {
        addGroupBtn.addEventListener("click", () => {
            const emojiInput = document.getElementById("new-group-emoji");
            const titleInput = document.getElementById("new-group-title");
            if (!emojiInput || !titleInput) return;
            
            const emoji = emojiInput.value.trim() || "📁";
            const title = titleInput.value.trim();
            
            if (!title) {
                Toaster.error("Please enter a group name.");
                return;
            }
            
            const newGroupId = "group-custom-" + Math.floor(Math.random()*100000);
            state.db.template_groups.push({
                id: newGroupId,
                title: title,
                emoji: emoji
            });
            
            state.saveDatabase();
            Toaster.success(`Group "${title}" created successfully.`);
            
            emojiInput.value = "";
            titleInput.value = "";
            
            renderManageGroupsList();
            renderTemplatesList();
        });
    }

    // Create custom button on custom templates tab
    const createCustomBtn = document.getElementById("btn-create-custom-template");
    if (createCustomBtn) {
        createCustomBtn.addEventListener("click", () => {
            renderBlueprintsModal();
            openModal("modal-select-template-format");
        });
    }

    const newTemplateBtn = document.getElementById("btn-new-template");
    if (newTemplateBtn) {
        newTemplateBtn.addEventListener("click", () => {
            renderBlueprintsModal();
            openModal("modal-select-template-format");
        });
    }

    let selectedBlueprintId = null;

    function renderBlueprintsModal() {
        const customContainer = document.getElementById("custom-blueprint-container");
        const grid = document.getElementById("blueprints-grid-container");
        if (!customContainer || !grid) return;
        
        customContainer.innerHTML = "";
        grid.innerHTML = "";
        selectedBlueprintId = null;
        document.getElementById("btn-submit-blueprint-select").disabled = true;

        // Custom Option Card
        const customCard = document.createElement("div");
        customCard.className = "blueprint-card custom-card";
        customCard.setAttribute("data-blueprint-id", "blueprint-custom");
        customCard.style.setProperty("--card-hue", 160); // custom green
        customCard.innerHTML = `
            <h4>+ Blank / Custom Form</h4>
            <p>Start with an empty template and create your own sections and questions from scratch.</p>
            <span class="badge custom" style="background-color:rgba(16,185,129,0.1);color:#10b981;border:1px solid rgba(16,185,129,0.2);">CUSTOM</span>
        `;
        customCard.addEventListener("click", () => {
            document.querySelectorAll(".blueprint-card").forEach(c => c.classList.remove("active"));
            customCard.classList.add("active");
            selectedBlueprintId = "blueprint-custom";
            document.getElementById("btn-submit-blueprint-select").disabled = false;
        });
        customContainer.appendChild(customCard);

        // Standard Reference Blueprints
        DEFAULT_SEED_DATA.templates.forEach(t => {
            const card = document.createElement("div");
            card.className = "blueprint-card";
            card.setAttribute("data-blueprint-id", t.id);
            card.style.setProperty("--card-hue", getTemplateColor(t.id));
            card.innerHTML = `
                <h4>${t.name}</h4>
                <p>${t.description}</p>
                <span class="badge ${t.category}">${t.category.toUpperCase()}</span>
            `;
            card.addEventListener("click", () => {
                document.querySelectorAll(".blueprint-card").forEach(c => c.classList.remove("active"));
                card.classList.add("active");
                selectedBlueprintId = t.id;
                document.getElementById("btn-submit-blueprint-select").disabled = false;
            });
            grid.appendChild(card);
        });
    }

    document.getElementById("btn-submit-blueprint-select").addEventListener("click", () => {
        if (!selectedBlueprintId) return;
        
        const newId = "tmpl-custom-" + Math.floor(Math.random()*10000);
        let newTemplate = null;
        
        if (selectedBlueprintId === "blueprint-custom") {
            newTemplate = {
                id: newId,
                name: "Custom Evaluation Blueprint",
                description: "Dynamic evaluation questions.",
                category: "academic",
                status: "draft",
                version: 1,
                sections: [
                    {
                        id: `sec-${newId}-1`,
                        title: "First Performance Section",
                        weight: 1.00,
                        sort_order: 1,
                        items: [
                            { 
                                id: `ti-${newId}-1`, 
                                title: "Target Observation Question 1", 
                                description: "", 
                                item_type: "choice", 
                                choices: [
                                    { id: `ti-${newId}-1-opt-1`, label: "Option 1", points: 10 },
                                    { id: `ti-${newId}-1-opt-2`, label: "Option 2", points: 0 }
                                ], 
                                allow_remarks: true, 
                                weight: 1.00, 
                                sort_order: 1 
                            }
                        ]
                    }
                ]
            };
        } else {
            const blueprint = DEFAULT_SEED_DATA.templates.find(t => t.id === selectedBlueprintId);
            if (blueprint) {
                newTemplate = JSON.parse(JSON.stringify(blueprint));
                newTemplate.id = newId;
                newTemplate.name = `${blueprint.name} (Custom Copy)`;
                newTemplate.status = "draft";
            }
        }
        
        if (newTemplate) {
            state.db.templates.push(newTemplate);
            state.saveDatabase();
            state.selectedTemplateId = newId;
            renderTemplatesList();
            closeModal("modal-select-template-format");
            Toaster.success(`Form template "${newTemplate.name}" created successfully.`);
            
            // Instantly open in modal
            openFormBuilderModal(newId);
        }
    });

    document.getElementById("btn-builder-add-section").addEventListener("click", () => {
        if (!state.selectedTemplateId) return;
        const tmpl = state.db.templates.find(t => t.id === state.selectedTemplateId);
        if (!tmpl) return;

        const nextOrder = tmpl.sections.length + 1;
        tmpl.sections.push({
            id: `sec-auto-${nextOrder}-${Math.floor(Math.random()*100)}`,
            title: `Assessment Section Group ${nextOrder}`,
            weight: 1.00,
            sort_order: nextOrder,
            items: []
        });

        renderTemplateEditor();
    });
}

// =========================================================================
// 9. VIEW BUILDERS: OBSERVATION HUB
// =========================================================================
function renderObservations() {
    if (state.activePlayerAssessmentId) {
        const assessment = state.db.assessments.find(a => a.id === state.activePlayerAssessmentId);
        if (assessment) {
            const tmpl = state.db.templates.find(t => t.id === assessment.template_id);
            if (tmpl && (tmpl.category === "academic" || tmpl.category === "academic_daily")) {
                renderAppraisalPlayerWizard();
                return;
            }
        }
    }

    const obsHubMain = document.getElementById("observations-hub-main");
    const obsPlayerContainer = document.getElementById("observations-player-container");
    if (obsHubMain) obsHubMain.classList.remove("hidden");
    if (obsPlayerContainer) obsPlayerContainer.classList.add("hidden");

    const tbody = document.getElementById("observations-table-body");
    tbody.innerHTML = "";

    const user = state.getCurrentUser();
    let assessments = state.db.assessments.filter(o => o.session_id === state.db.activeSessionId);

    // Filter by academic and academic_daily category
    assessments = assessments.filter(o => {
        const tmpl = state.db.templates.find(t => t.id === o.template_id);
        return tmpl && (tmpl.category === "academic" || tmpl.category === "academic_daily");
    });

    if (state.activeRole === "staff_member") {
        assessments = assessments.filter(o => o.subject_id === user.id);
    } else if (state.activeRole === "dept_head") {
        assessments = assessments.filter(o => {
            const subject = state.db.users.find(u => u.id === o.subject_id);
            return subject && subject.dept_id === "dept-teach";
        });
    }

    assessments.forEach(o => {
        const subject = state.db.users.find(u => u.id === o.subject_id);
        const dept = state.db.departments.find(d => d.id === subject.dept_id);
        const tmpl = state.db.templates.find(t => t.id === o.template_id);
        
        const clsSec = o.class || subject.assigned_class ? `${o.class || subject.assigned_class}${o.section || subject.assigned_section ? ' - ' + (o.section || subject.assigned_section) : ''}` : '';
        const tr = document.createElement("tr");
        tr.style.cursor = "pointer";
        tr.addEventListener("click", (evt) => {
            if (evt.target.tagName !== "BUTTON" && evt.target.closest("button") === null) {
                openAppraisalFromDashboard(o.id);
            }
        });
        tr.innerHTML = `
            <td>
                <div style="display:flex;align-items:center;gap:8px;">
                    <img src="${subject.avatar}" class="avatar" style="width:24px;height:24px">
                    <div>
                        <strong>${subject.first_name} ${subject.last_name}</strong>
                        ${clsSec ? `<span style="font-size:10.5px;color:var(--text-muted);display:block;margin-top:2px;">${clsSec}</span>` : ''}
                    </div>
                </div>
            </td>
            <td>${dept ? dept.name : "Unassigned"}</td>
            <td>${tmpl ? tmpl.name : "N/A"}</td>
            <td>${new Date(o.created_at).toLocaleDateString()}</td>
            <td><strong>${o.score ? o.score.toFixed(1) + '%' : '--'}</strong></td>
            <td><span class="badge ${o.status}">${o.status.replace('_', ' ')}</span></td>
            <td>
                <button class="small-btn secondary-btn" onclick="openAppraisalFromDashboard('${o.id}')">View Form</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function populateTemplatesForSelectedSubject(user) {
    const templateSelect = document.getElementById("obs-modal-template");
    if (!templateSelect) return;
    templateSelect.innerHTML = "";
    
    if (!user) return;
    
    const mode = state.startEvaluationMode || "observation";
    const selectedClass = document.getElementById("obs-modal-class")?.value || user.assigned_class || "";
    
    const defaultTmplIds = DEFAULT_SEED_DATA.templates.map(t => t.id);
    let eligibleTemplates = state.db.templates.filter(t => {
        const isStandard = defaultTmplIds.includes(t.id);
        // Only show published custom templates (standard templates are implicitly published)
        if (!isStandard && t.status !== "published") return false;
        
        // Filter by mode
        const isObsCategory = (t.category === "academic" || t.category === "academic_daily");
        if (mode === "observation" && !isObsCategory) return false;
        if (mode === "appraisal" && isObsCategory) return false;
        
        // Filter by assigned classes range
        if (t.assigned_classes && t.assigned_classes.length > 0) {
            if (!selectedClass || !t.assigned_classes.includes(selectedClass)) {
                return false;
            }
        }
        
        // Filter by assigned departments range
        if (t.assigned_departments && t.assigned_departments.length > 0) {
            if (!user.dept_id || !t.assigned_departments.includes(user.dept_id)) {
                return false;
            }
        }
        
        return true;
    });
    
    eligibleTemplates.forEach(t => {
        const option = document.createElement("option");
        option.value = t.id;
        option.innerText = `${t.name}`;
        templateSelect.appendChild(option);
    });
}

function filterStartObservationSubjects() {
    const mode = state.startEvaluationMode || "observation";
    const classVal = document.getElementById("obs-modal-class").value;
    const sectionVal = document.getElementById("obs-modal-section").value;
    const subjectSelect = document.getElementById("obs-modal-subject");
    
    const currentSelected = subjectSelect.value;
    subjectSelect.innerHTML = "";

    const allowedRoles = ["staff_member", "activity_teacher", "office_staff", "pro_staff", "accounts_staff", "dept_head", "school_leader", "tenant_admin"];

    const eligibleSubjects = state.db.users.filter(u => {
        if (!allowedRoles.includes(u.role) || u.id === state.getCurrentUser().id) return false;
        if (state.activeRole === "dept_head" && u.dept_id !== "dept-teach") return false;
        if (classVal && u.assigned_class !== classVal) return false;
        if (sectionVal && u.assigned_section !== sectionVal) return false;
        return true;
    });

    if (eligibleSubjects.length === 0) {
        const option = document.createElement("option");
        option.value = "";
        option.innerText = "-- No staff found --";
        subjectSelect.appendChild(option);
        
        const templateSelect = document.getElementById("obs-modal-template");
        if (templateSelect) templateSelect.innerHTML = "<option value=''>-- Select Staff Member First --</option>";
        return;
    }

    eligibleSubjects.forEach(u => {
        const option = document.createElement("option");
        option.value = u.id;
        const dept = state.db.departments.find(d => d.id === u.dept_id);
        const deptName = dept ? dept.name : "Unassigned";
        let displayStr = `${u.first_name} ${u.last_name}`;
        if (u.assigned_class || u.assigned_section) {
            displayStr += ` (${u.assigned_class || ''}-${u.assigned_section || ''})`;
        } else {
            displayStr += ` (${deptName})`;
        }
        option.innerText = displayStr;
        subjectSelect.appendChild(option);
    });

    if (currentSelected && eligibleSubjects.some(u => u.id === currentSelected)) {
        subjectSelect.value = currentSelected;
    } else {
        subjectSelect.value = eligibleSubjects[0].id;
    }

    handleStartObservationSubjectChange();
}

function handleStartObservationSubjectChange() {
    const subjectId = document.getElementById("obs-modal-subject").value;
    if (!subjectId) return;

    const user = state.db.users.find(u => u.id === subjectId);
    if (user) {
        document.getElementById("obs-modal-class").value = user.assigned_class || "";
        document.getElementById("obs-modal-section").value = user.assigned_section || "";
        populateTemplatesForSelectedSubject(user);
    }
}

function openStartObservationModal(mode = "observation") {
    if (state.activeRole === "staff_member") {
        Toaster.error("RBAC Denied: Staff members cannot perform audits/appraisals.");
        return;
    }

    state.startEvaluationMode = mode;

    document.getElementById("obs-modal-class").value = "";
    document.getElementById("obs-modal-section").value = "";

    const modalTitle = document.getElementById("obs-modal-title");
    if (modalTitle) {
        modalTitle.innerText = mode === "appraisal" ? "Start New Staff Appraisal" : "Start New Observation";
    }
    const submitBtn = document.getElementById("btn-submit-start-observation");
    if (submitBtn) {
        submitBtn.innerText = mode === "appraisal" ? "Start Appraisal" : "Start Observation";
    }

    filterStartObservationSubjects();
    openModal("modal-start-observation");
}

function submitStartObservation() {
    const subjectId = document.getElementById("obs-modal-subject").value;
    const templateId = document.getElementById("obs-modal-template").value;
    const classVal = document.getElementById("obs-modal-class").value;
    const sectionVal = document.getElementById("obs-modal-section").value;

    const targetSubject = state.db.users.find(u => u.id === subjectId);
    const targetTemplate = state.db.templates.find(t => t.id === templateId);

    if (!targetSubject || !targetTemplate) {
        Toaster.error("Please select a valid staff member and template.");
        return;
    }

    const id = `eval-auto-${Math.floor(Math.random()*10000)}`;
    state.db.assessments.push({
        id: id,
        tenant_id: "tenant-bhusk-east-110",
        cycle_id: "cycle-term-1",
        session_id: state.db.activeSessionId,
        template_id: targetTemplate.id,
        subject_id: targetSubject.id,
        evaluator_id: state.getCurrentUser().id,
        status: "draft",
        score: 0.00,
        class: classVal || targetSubject.assigned_class || null,
        section: sectionVal || targetSubject.assigned_section || null,
        responses: {},
        subject_signature: "",
        subject_signed_at: null,
        evaluator_signature: "",
        evaluator_signed_at: null,
        submitted_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    });

    state.saveDatabase();
    closeModal("modal-start-observation");
    
    const isAcademic = (targetTemplate.category === "academic" || targetTemplate.category === "academic_daily");
    Toaster.success(`Started new ${isAcademic ? 'observation' : 'appraisal'} sheet for ${targetSubject.first_name} ${targetSubject.last_name}`);
    
    state.activePlayerAssessmentId = id;
    state.activeStepIndex = 0;
    
    switchToView(isAcademic ? "observations" : "appraisals");
}

function initObservationHub() {
    document.getElementById("btn-start-observation").addEventListener("click", () => {
        openStartObservationModal("observation");
    });

    const startAppraisalBtn = document.getElementById("btn-start-appraisal");
    if (startAppraisalBtn) {
        startAppraisalBtn.addEventListener("click", () => {
            openStartObservationModal("appraisal");
        });
    }

    document.getElementById("btn-submit-start-observation").addEventListener("click", () => {
        submitStartObservation();
    });

    document.getElementById("obs-modal-class").addEventListener("change", () => {
        filterStartObservationSubjects();
    });

    document.getElementById("obs-modal-section").addEventListener("change", () => {
        filterStartObservationSubjects();
    });

    document.getElementById("obs-modal-subject").addEventListener("change", () => {
        handleStartObservationSubjectChange();
    });
}

// =========================================================================
// 10. WIZARD PLAYER & AUTOSAVE SCORING ENGINE
// =========================================================================
function renderAppraisals() {
    renderAppraisalsList();
    renderAppraisalPlayerWizard();
}

function renderAppraisalsList() {
    const container = document.getElementById("appraisals-list-cards");
    container.innerHTML = "";

    const user = state.getCurrentUser();
    let evaluations = state.db.assessments.filter(e => e.session_id === state.db.activeSessionId);

    // Filter out academic & academic_daily category (appraisals only)
    evaluations = evaluations.filter(e => {
        const tmpl = state.db.templates.find(t => t.id === e.template_id);
        return tmpl && tmpl.category !== "academic" && tmpl.category !== "academic_daily";
    });

    if (state.activeRole === "staff_member") {
        evaluations = evaluations.filter(e => e.subject_id === user.id);
    } else if (state.activeRole === "dept_head") {
        evaluations = evaluations.filter(e => {
            const subject = state.db.users.find(u => u.id === e.subject_id);
            return subject && subject.dept_id === "dept-teach";
        });
    }

    evaluations.forEach(e => {
        const subject = state.db.users.find(u => u.id === e.subject_id);
        const tmpl = state.db.templates.find(t => t.id === e.template_id);
        const isActive = state.activePlayerAssessmentId === e.id;

        const card = document.createElement("div");
        card.className = `list-navigation-item ${isActive ? 'active' : ''}`;
        card.style.padding = "14px";
        card.style.borderRadius = "8px";
        card.style.marginBottom = "8px";
        card.style.border = `1px solid ${isActive ? 'var(--color-primary)' : 'var(--border-color)'}`;
        card.style.backgroundColor = isActive ? 'rgba(99, 102, 241, 0.06)' : 'rgba(255,255,255,0.01)';
        card.style.cursor = "pointer";

        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                <span class="badge ${e.status}" style="font-size:8.5px">${e.status.replace('_', ' ')}</span>
                <span style="font-size:11.5px;font-weight:700;color:var(--color-success)">${e.score ? e.score.toFixed(1) + '%' : '--'}</span>
            </div>
            <h4 style="font-size:13.5px;margin-bottom:2px">${tmpl ? tmpl.name : 'Evaluation form'}</h4>
            <div style="font-size:11px;color:var(--text-muted)">
                Subject: <strong>${subject.first_name} ${subject.last_name}</strong>
            </div>
        `;

        card.addEventListener("click", () => {
            state.activePlayerAssessmentId = e.id;
            state.activeStepIndex = 0; // Reset wizard to first section
            renderAppraisalsList();
            renderAppraisalPlayerWizard();
        });

        container.appendChild(card);
    });
}

function renderAppraisalPlayerWizard() {
    const emptyState = document.getElementById("appraisal-execution-empty");
    const player = document.getElementById("appraisal-player");

    if (!state.activePlayerAssessmentId) {
        if (emptyState) {
            emptyState.className = "empty-state";
            emptyState.innerHTML = `
                <svg class="empty-state-svg-wrapper" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                <h4>No Appraisal Record Selected</h4>
                <p>Select a staff evaluation card from the ledger to begin scoring criteria, adding evidence, and signing sign-offs.</p>
            `;
            emptyState.classList.remove("hidden");
        }
        player.classList.add("hidden");
        
        // Hide observations player container and show observations main hub
        const obsHubMain = document.getElementById("observations-hub-main");
        const obsPlayerContainer = document.getElementById("observations-player-container");
        if (obsHubMain) obsHubMain.classList.remove("hidden");
        if (obsPlayerContainer) obsPlayerContainer.classList.add("hidden");
        
        return;
    }

    const assessment = state.db.assessments.find(a => a.id === state.activePlayerAssessmentId);
    if (!assessment) return;
    const subject = state.db.users.find(u => u.id === assessment.subject_id);
    const evaluator = state.db.users.find(u => u.id === assessment.evaluator_id);
    const tmpl = state.db.templates.find(t => t.id === assessment.template_id);
    if (!tmpl) return;

    const isAcademic = (tmpl.category === "academic");

    if (isAcademic) {
        // Move player element to observations player container
        const obsPlayerContainer = document.getElementById("observations-player-container");
        if (obsPlayerContainer && !obsPlayerContainer.contains(player)) {
            obsPlayerContainer.appendChild(player);
        }
        // Show observations player container and hide observations main hub
        const obsHubMain = document.getElementById("observations-hub-main");
        if (obsHubMain) obsHubMain.classList.add("hidden");
        if (obsPlayerContainer) obsPlayerContainer.classList.remove("hidden");
        player.classList.remove("hidden");
        
        // Hide appraisals empty state
        if (emptyState) emptyState.classList.add("hidden");
    } else {
        // Move player element back to appraisals panel
        const appPanel = document.getElementById("appraisal-execution-panel");
        if (appPanel && !appPanel.contains(player)) {
            appPanel.appendChild(player);
        }
        // Hide appraisals empty state
        if (emptyState) emptyState.classList.add("hidden");
        player.classList.remove("hidden");

        // Hide observations player container, show observations main hub
        const obsHubMain = document.getElementById("observations-hub-main");
        const obsPlayerContainer = document.getElementById("observations-player-container");
        if (obsHubMain) obsHubMain.classList.remove("hidden");
        if (obsPlayerContainer) obsPlayerContainer.classList.add("hidden");
    }

    // Dynamic Wizard steps configuration
    // Flatten all items across all sections to step question-by-question
    const flatItems = [];
    const sectionIndexMap = []; // maps section index -> first item index in flatItems
    const itemSectionMap = []; // maps item index -> section index
    
    tmpl.sections.sort((a,b) => a.sort_order - b.sort_order).forEach((sect, sIdx) => {
        sectionIndexMap[sIdx] = flatItems.length;
        sect.items.sort((a,b) => a.sort_order - b.sort_order).forEach(item => {
            itemSectionMap[flatItems.length] = sIdx;
            flatItems.push({
                ...item,
                section_title: sect.title,
                section_index: sIdx,
                is_item: true
            });
        });
    });
    
    const finalizeIndex = flatItems.length;
    itemSectionMap[finalizeIndex] = tmpl.sections.length;
    
    const steps = [...flatItems];
    steps.push({ id: "step-finalize", title: "Submit & Sign-off", is_finalize: true, section_index: tmpl.sections.length });

    // Ensure step index is inside bounds
    if (state.activeStepIndex >= steps.length) state.activeStepIndex = steps.length - 1;
    if (state.activeStepIndex < 0) state.activeStepIndex = 0;

    const activeSectionIndex = itemSectionMap[state.activeStepIndex] !== undefined ? itemSectionMap[state.activeStepIndex] : 0;

    // Render stepper indicator nodes (represents sections + sign-off)
    const stepperSteps = [];
    tmpl.sections.sort((a,b) => a.sort_order - b.sort_order).forEach((sect, sIdx) => {
        stepperSteps.push({
            id: sect.id,
            title: sect.title,
            first_item_index: sectionIndexMap[sIdx],
            is_finalize: false
        });
    });
    stepperSteps.push({
        id: "step-finalize",
        title: "Submit & Sign-off",
        first_item_index: finalizeIndex,
        is_finalize: true
    });

    const stepper = document.getElementById("player-stepper");
    stepper.innerHTML = "";

    stepperSteps.forEach((step, idx) => {
        const node = document.createElement("div");
        const isActive = idx === activeSectionIndex;
        const isCompleted = idx < activeSectionIndex;
        
        node.className = `wizard-step-node ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`;
        node.innerHTML = `
            <div class="step-num">${idx + 1}</div>
            <div class="step-title">${step.title}</div>
        `;
        
        node.addEventListener("click", () => {
            state.activeStepIndex = step.first_item_index;
            renderAppraisalPlayerWizard();
        });
        stepper.appendChild(node);
    });

    // Update form detail attributes
    document.getElementById("player-form-title").innerText = tmpl.name;
    let subjectText = `${subject.first_name} ${subject.last_name}`;
    if (assessment.class || subject.assigned_class) {
        subjectText += ` (${assessment.class || subject.assigned_class}${assessment.section || subject.assigned_section ? ' - ' + (assessment.section || subject.assigned_section) : ''})`;
    }
    document.getElementById("player-subject-name").innerText = subjectText;
    document.getElementById("player-evaluator-name").innerText = `${evaluator.first_name} ${evaluator.last_name}`;
    document.getElementById("player-live-score").innerText = assessment.score ? `${assessment.score.toFixed(1)}%` : "0.0%";

    const categoryBadge = document.getElementById("player-category");
    categoryBadge.className = `badge ${tmpl.category}`;
    categoryBadge.innerText = tmpl.category;

    // Wizard Controls Footer update
    const prevBtn = document.getElementById("btn-wizard-prev");
    const nextBtn = document.getElementById("btn-wizard-next");

    prevBtn.disabled = state.activeStepIndex === 0;
    if (state.activeStepIndex === steps.length - 1) {
        nextBtn.innerText = "Complete Review";
    } else {
        nextBtn.innerText = "Next Step ➔";
    }

    // Render step form elements
    const elementsContainer = document.getElementById("player-form-elements");
    elementsContainer.innerHTML = "";

    const activeStep = steps[state.activeStepIndex];
    const isLocked = assessment.status === "signed_off";

    if (activeStep.is_finalize) {
        // Render Final Sign-off Screen
        elementsContainer.innerHTML = `
            <div class="template-metadata-form" style="padding:24px;">
                <h4 style="margin-bottom:12px;">Verification & Sign-off Agreement</h4>
                <p class="small-text text-muted mb-2">Review aggregate scores and apply electronic signatures. Once co-signed by both subject and evaluator, the ledger is permanently locked from modification.</p>
                
                <div class="metrics-grid mt-2" style="margin-bottom:24px;">
                    <div class="metric-card" style="background-color:rgba(0,0,0,0.15)">
                        <span class="lbl">Form Template</span>
                        <h4 style="margin-top:6px;">${tmpl.name}</h4>
                    </div>
                    <div class="metric-card" style="background-color:rgba(0,0,0,0.15)">
                        <span class="lbl">Final Scored Competency</span>
                        <h3 class="metric-val text-glow" style="margin-top:6px;color:var(--color-success)">${assessment.score ? assessment.score.toFixed(1) + '%' : '0.0%'}</h3>
                    </div>
                </div>

                <div class="signatures-grid">
                    <div class="sig-box">
                        <label>Evaluator Electronic Signature</label>
                        <input type="text" id="player-eval-sig" placeholder="Type evaluator name to sign..." class="form-control-light" value="${assessment.evaluator_signature || ''}" ${isLocked ? 'disabled' : ''}>
                        <span class="sig-date" id="player-eval-sig-date">${assessment.evaluator_signed_at ? 'Signed: ' + new Date(assessment.evaluator_signed_at).toLocaleString() : 'Unsigned'}</span>
                    </div>
                    <div class="sig-box">
                        <label>Subject Staff Electronic Signature</label>
                        <input type="text" id="player-subj-sig" placeholder="Type subject name to sign..." class="form-control-light" value="${assessment.subject_signature || ''}" ${isLocked ? 'disabled' : ''}>
                        <span class="sig-date" id="player-subj-sig-date">${assessment.subject_signed_at ? 'Signed: ' + new Date(assessment.subject_signed_at).toLocaleString() : 'Unsigned'}</span>
                    </div>
                </div>
            </div>
        `;

        // Bind input indicators
        const evInput = document.getElementById("player-eval-sig");
        const subInput = document.getElementById("player-subj-sig");

        if (!isLocked) {
            evInput.addEventListener("change", (e) => {
                assessment.evaluator_signature = e.target.value;
                triggerAutosaveIndicator(assessment);
            });
            subInput.addEventListener("change", (e) => {
                assessment.subject_signature = e.target.value;
                triggerAutosaveIndicator(assessment);
            });
        }

    } else {
        // Render single progressive question step
        const item = activeStep;
        
        // Progress percentage calculation
        const progressPercent = flatItems.length > 0 ? (state.activeStepIndex / flatItems.length) * 100 : 100;
        
        // Dynamic labels & progress bar
        const progressLabel = document.createElement("div");
        progressLabel.style.display = "flex";
        progressLabel.style.justifyContent = "space-between";
        progressLabel.style.alignItems = "center";
        progressLabel.style.fontSize = "12px";
        progressLabel.style.color = "var(--text-muted)";
        progressLabel.style.marginBottom = "8px";
        progressLabel.innerHTML = `
            <span>Question ${state.activeStepIndex + 1} of ${flatItems.length} (${Math.round(progressPercent)}% complete)</span>
            <span style="font-weight:600; color:var(--text-primary); text-transform:uppercase; letter-spacing:0.5px;">${item.section_title}</span>
        `;
        
        const progressContainer = document.createElement("div");
        progressContainer.style.marginBottom = "24px";
        progressContainer.style.background = "rgba(255,255,255,0.08)";
        progressContainer.style.borderRadius = "10px";
        progressContainer.style.height = "6px";
        progressContainer.style.overflow = "hidden";
        progressContainer.style.position = "relative";
        
        const progressBar = document.createElement("div");
        progressBar.style.width = `${progressPercent}%`;
        progressBar.style.height = "100%";
        progressBar.style.background = "linear-gradient(90deg, var(--color-primary), var(--color-success))";
        progressBar.style.transition = "width 0.4s ease";
        progressContainer.appendChild(progressBar);

        const itemBlock = document.createElement("div");
        itemBlock.className = "player-rubric-card wizard-question-view";
        itemBlock.style.padding = "28px";
        itemBlock.style.borderRadius = "12px";
        itemBlock.style.border = "1px solid var(--border-color)";
        itemBlock.style.background = "rgba(255, 255, 255, 0.01)";
        itemBlock.style.boxShadow = "var(--shadow-lg)";
        
        const savedResp = assessment.responses[item.id] || {};
        const isNa = !!savedResp.is_na;

        itemBlock.innerHTML = `
            <div style="font-weight:700; font-size:18px; display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; color:var(--text-primary);">
                <span>${item.title}</span>
                <div style="display:flex; align-items:center; gap:16px;">
                    <span style="font-size:12px; font-weight:normal; color:var(--text-muted)">weight: ${item.weight}</span>
                    <label style="display:flex; align-items:center; gap:6px; font-size:13px; font-weight:600; color:var(--text-muted); cursor:pointer; user-select:none;">
                        <input type="checkbox" class="player-na-checkbox" style="width:16px; height:16px;" ${isNa ? 'checked' : ''} onchange="togglePlayerNa('${item.id}', this.checked)">
                        <span>N/A</span>
                    </label>
                </div>
            </div>
            <p class="text-muted" style="font-size:14px; line-height:1.6; margin-bottom:24px; color:var(--text-muted);">${item.description || ''}</p>
        `;

        if (item.item_type === "choice") {
            const maxPoints = item.choices && item.choices.length > 0 ? Math.max(...item.choices.map(c => c.points)) : 0;
            
            if (item.display_style === "stars") {
                const starsRow = document.createElement("div");
                starsRow.className = `star-rating-row ${isNa ? 'disabled-choices' : ''}`;
                starsRow.style.margin = "20px 0";
                
                const choicesSorted = (item.choices || []).sort((a,b) => a.points - b.points);
                const numStars = choicesSorted.length;
                const selectedChoiceIndex = choicesSorted.findIndex(c => c.id === savedResp.selected_choice_id);

                const labelSpan = document.createElement("span");
                labelSpan.className = "star-label-preview";
                labelSpan.style.fontSize = "14px";
                labelSpan.style.marginLeft = "16px";
                
                if (selectedChoiceIndex !== -1) {
                    labelSpan.innerText = `${choicesSorted[selectedChoiceIndex].label} (${choicesSorted[selectedChoiceIndex].points} pts)`;
                } else {
                    labelSpan.innerText = "Select rating...";
                }

                const row1 = document.createElement("div");
                row1.className = "star-row-line";
                const row2 = document.createElement("div");
                row2.className = "star-row-line";

                for (let sIdx = 0; sIdx < numStars; sIdx++) {
                    const star = document.createElement("span");
                    star.className = `star-icon ${sIdx <= selectedChoiceIndex ? 'filled' : ''}`;
                    star.style.fontSize = "32px";
                    star.style.cursor = isLocked || isNa ? "default" : "pointer";
                    star.innerText = "★";
                    
                    if (!isLocked && !isNa) {
                        star.addEventListener("mouseover", () => {
                            const allStars = starsRow.querySelectorAll(".star-icon");
                            allStars.forEach((st, i) => {
                                if (i <= sIdx) st.classList.add("filled");
                                else st.classList.remove("filled");
                            });
                            labelSpan.innerText = `${choicesSorted[sIdx].label} (${choicesSorted[sIdx].points} pts)`;
                        });

                        star.addEventListener("mouseout", () => {
                            const allStars = starsRow.querySelectorAll(".star-icon");
                            allStars.forEach((st, i) => {
                                if (i <= selectedChoiceIndex) st.classList.add("filled");
                                else st.classList.remove("filled");
                            });
                            if (selectedChoiceIndex !== -1) {
                                labelSpan.innerText = `${choicesSorted[selectedChoiceIndex].label} (${choicesSorted[selectedChoiceIndex].points} pts)`;
                            } else {
                                labelSpan.innerText = "Select rating...";
                            }
                        });

                        star.addEventListener("click", () => {
                            selectPlayerChoiceOption(item.id, choicesSorted[sIdx].id);
                        });
                    }
                    
                    if (numStars === 10) {
                        if (sIdx < 5) row1.appendChild(star);
                        else row2.appendChild(star);
                    } else {
                        starsRow.appendChild(star);
                    }
                }

                if (numStars === 10) {
                    starsRow.appendChild(row1);
                    starsRow.appendChild(row2);
                }
                starsRow.appendChild(labelSpan);
                itemBlock.appendChild(starsRow);
            } else {
                const row = document.createElement("div");
                row.className = `preview-rubric-options ${isNa ? 'disabled-choices' : ''}`;
                row.style.display = "flex";
                row.style.flexDirection = "column";
                row.style.gap = "10px";
                row.style.margin = "20px 0";
                
                (item.choices || []).forEach(v => {
                    const btn = document.createElement("div");
                    const isSelected = savedResp.selected_choice_id === v.id;
                    
                    const ratio = maxPoints > 0 ? (v.points / maxPoints) : 0;
                    let colorClass = "choice-score-low";
                    if (ratio >= 0.8) colorClass = "choice-score-high";
                    else if (ratio >= 0.5) colorClass = "choice-score-medium";

                    btn.className = `preview-rubric-btn ${colorClass} ${isSelected ? 'active' : ''}`;
                    btn.style.padding = "16px 20px";
                    btn.style.borderRadius = "8px";
                    btn.style.fontSize = "14px";
                    btn.style.display = "flex";
                    btn.style.justifyContent = "space-between";
                    btn.style.alignItems = "center";
                    btn.style.cursor = isLocked || isNa ? "default" : "pointer";
                    
                    btn.innerHTML = `
                        <span>${v.label}</span>
                        <span style="font-size:11px; font-weight:700; opacity:0.8; background:rgba(0,0,0,0.1); padding:2px 8px; border-radius:12px;">${v.points} pts</span>
                    `;
                    
                    if (!isLocked && !isNa) {
                        btn.addEventListener("click", () => {
                            selectPlayerChoiceOption(item.id, v.id);
                        });
                    }
                    row.appendChild(btn);
                });
                itemBlock.appendChild(row);
            }
        } else {
            const textarea = document.createElement("textarea");
            textarea.className = `form-control-light w-full ${isNa ? 'disabled-choices' : ''}`;
            textarea.style.height = "120px";
            textarea.style.fontSize = "14px";
            textarea.style.padding = "12px";
            textarea.placeholder = "Write descriptive feedback here...";
            textarea.value = savedResp.text_value || "";
            textarea.disabled = isLocked || isNa;
            
            if (!isLocked && !isNa) {
                textarea.addEventListener("change", (e) => {
                    updatePlayerTextResponse(item.id, e.target.value);
                });
            }
            itemBlock.appendChild(textarea);
        }

        // Render Additional Notes
        if (item.allow_remarks !== false) {
            const notesDiv = document.createElement("div");
            notesDiv.style.marginTop = "24px";
            notesDiv.style.borderTop = "1px solid var(--border-color)";
            notesDiv.style.paddingTop = "20px";
            notesDiv.className = isNa ? "disabled-choices" : "";
            notesDiv.innerHTML = `
                <label style="font-size:12.5px; font-weight:600; color:var(--text-muted); display:block; margin-bottom:8px;">Additional Notes / Observations</label>
                <textarea class="form-control-light w-full player-notes-input" style="font-size:13.5px; height:80px; padding:12px; resize:none;" placeholder="Write observations/notes here..." ${isLocked || isNa ? 'disabled' : ''}>${savedResp.notes || savedResp.remarks || ''}</textarea>
            `;
            
            const notesInput = notesDiv.querySelector(".player-notes-input");
            if (!isLocked && !isNa) {
                notesInput.addEventListener("change", (e) => {
                    updatePlayerRemarks(item.id, e.target.value);
                });
            }
            itemBlock.appendChild(notesDiv);
        }

        // Render Media Evidence - Only for Classroom Observations (isAcademic)
        if (isAcademic && item.allow_evidence !== false) {
            const evidenceDiv = document.createElement("div");
            evidenceDiv.style.marginTop = "24px";
            evidenceDiv.style.borderTop = "1px solid var(--border-color)";
            evidenceDiv.style.paddingTop = "20px";
            evidenceDiv.className = isNa ? "disabled-choices" : "";
            
            const hasEvidence = !!savedResp.evidence_data;
            
            evidenceDiv.innerHTML = `
                <label style="font-size:12.5px; font-weight:600; color:var(--text-muted); display:block; margin-bottom:8px;">Attach evidence (eg. photo/video etc. to support your observation)</label>
                ${!hasEvidence ? `
                    <div class="evidence-upload-zone" onclick="triggerPlayerEvidenceUpload('${item.id}')" style="padding: 24px; border: 2px dashed var(--border-color); border-radius: 8px; text-align: center; cursor: pointer; background: rgba(0,0,0,0.05); ${isLocked || isNa ? 'pointer-events:none; opacity:0.5;' : ''}">
                        <span style="font-size:13px; font-weight:600; color:var(--color-primary);">📷 Click to Attach Media Evidence</span>
                    </div>
                    <input type="file" id="evidence-file-input-${item.id}" class="hidden" accept="image/*,video/*" onchange="handlePlayerEvidenceUpload('${item.id}', this)">
                ` : `
                    <div class="evidence-media-preview-box" style="display: flex; align-items: center; gap: 16px; padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; background: rgba(255,255,255,0.01);">
                        ${savedResp.evidence_type && savedResp.evidence_type.startsWith("video") ? `
                            <div class="evidence-video-thumb" style="width: 80px; height: 60px; background: #000; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 20px;">▶</div>
                        ` : `
                            <img src="${savedResp.evidence_data}" class="evidence-thumbnail" onclick="viewLargeEvidence('${savedResp.evidence_data}')" style="width: 80px; height: 60px; object-fit: cover; border-radius: 4px; cursor:pointer;">
                        `}
                        <div class="evidence-meta" style="flex: 1; display: flex; flex-direction: column; gap: 2px;">
                            <span class="name" style="font-size: 13px; font-weight: 600; color: var(--text-primary);">${savedResp.evidence_name || "Attachment"}</span>
                            <span class="size" style="font-size: 11px; color: var(--text-muted);">${savedResp.evidence_size || "Unknown size"}</span>
                        </div>
                        ${!isLocked ? `
                            <button class="small-btn secondary-btn" style="padding:6px 12px; font-size: 12px; color:var(--color-danger); border-color: rgba(239,68,68,0.2);" onclick="clearPlayerEvidence('${item.id}')">Remove</button>
                        ` : ''}
                    </div>
                `}
            `;
            itemBlock.appendChild(evidenceDiv);
        }

        elementsContainer.appendChild(progressLabel);
        elementsContainer.appendChild(progressContainer);
        elementsContainer.appendChild(itemBlock);
    }
}

window.togglePlayerNa = function(itemId, isChecked) {
    if (!state.activePlayerAssessmentId) return;
    const assessment = state.db.assessments.find(a => a.id === state.activePlayerAssessmentId);
    if (!assessment.responses[itemId]) assessment.responses[itemId] = {};
    
    const resp = assessment.responses[itemId];
    resp.is_na = isChecked;
    if (isChecked) {
        if (resp.selected_choice_id) {
            resp.prev_choice_id = resp.selected_choice_id;
        }
        resp.selected_choice_id = null;
        resp.calculated_score = 0;
    } else {
        if (resp.prev_choice_id) {
            resp.selected_choice_id = resp.prev_choice_id;
            delete resp.prev_choice_id;
        }
    }
    
    triggerAutosaveIndicator(assessment);
    runScoringEngine(assessment);
    renderAppraisalPlayerWizard();
};

window.selectPlayerChoiceOption = function(itemId, choiceId) {
    if (!state.activePlayerAssessmentId) return;
    const assessment = state.db.assessments.find(a => a.id === state.activePlayerAssessmentId);
    if (!assessment.responses[itemId]) assessment.responses[itemId] = {};
    
    const resp = assessment.responses[itemId];
    resp.selected_choice_id = choiceId;
    if (resp.prev_choice_id) delete resp.prev_choice_id;
    
    triggerAutosaveIndicator(assessment);
    runScoringEngine(assessment);
    renderAppraisalPlayerWizard();
};

window.updatePlayerRemarks = function(itemId, text) {
    if (!state.activePlayerAssessmentId) return;
    const assessment = state.db.assessments.find(a => a.id === state.activePlayerAssessmentId);
    if (!assessment.responses[itemId]) assessment.responses[itemId] = {};
    
    assessment.responses[itemId].remarks = text;
    assessment.responses[itemId].notes = text;
    
    triggerAutosaveIndicator(assessment);
};

window.updatePlayerTextResponse = function(itemId, text) {
    if (!state.activePlayerAssessmentId) return;
    const assessment = state.db.assessments.find(a => a.id === state.activePlayerAssessmentId);
    if (!assessment.responses[itemId]) assessment.responses[itemId] = {};
    
    assessment.responses[itemId].text_value = text;
    
    triggerAutosaveIndicator(assessment);
};

window.triggerPlayerEvidenceUpload = function(itemId) {
    const fileInput = document.getElementById(`evidence-file-input-${itemId}`);
    if (fileInput) fileInput.click();
};

window.handlePlayerEvidenceUpload = function(itemId, inputElement) {
    if (!state.activePlayerAssessmentId) return;
    const file = inputElement.files[0];
    if (!file) return;

    if (file.size > 1.5 * 1024 * 1024) {
        Toaster.warning("File is too large! Please attach an image or video smaller than 1.5MB.");
        inputElement.value = "";
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const assessment = state.db.assessments.find(a => a.id === state.activePlayerAssessmentId);
        if (!assessment.responses[itemId]) assessment.responses[itemId] = {};
        
        const resp = assessment.responses[itemId];
        resp.evidence_data = e.target.result;
        resp.evidence_name = file.name;
        resp.evidence_type = file.type;
        resp.evidence_size = (file.size / 1024).toFixed(1) + " KB";

        triggerAutosaveIndicator(assessment);
        renderAppraisalPlayerWizard();
    };
    reader.readAsDataURL(file);
};

window.clearPlayerEvidence = function(itemId) {
    if (!state.activePlayerAssessmentId) return;
    const assessment = state.db.assessments.find(a => a.id === state.activePlayerAssessmentId);
    if (assessment.responses[itemId]) {
        const resp = assessment.responses[itemId];
        delete resp.evidence_data;
        delete resp.evidence_name;
        delete resp.evidence_type;
        delete resp.evidence_size;
    }
    triggerAutosaveIndicator(assessment);
    renderAppraisalPlayerWizard();
};

window.viewLargeEvidence = function(dataUrl) {
    let overlay = document.getElementById("large-evidence-overlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "large-evidence-overlay";
        overlay.style = "position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.8); z-index:999999; display:flex; align-items:center; justify-content:center; cursor:pointer;";
        overlay.onclick = () => overlay.remove();
        document.body.appendChild(overlay);
    }
    overlay.innerHTML = `<img src="${dataUrl}" style="max-width:90%; max-height:90%; border-radius:8px; box-shadow:0 10px 30px rgba(0,0,0,0.5);">`;
};

function triggerAutosaveIndicator(assessment) {
    const dot = document.querySelector("#autosave-indicator .pulse-dot");
    const txt = document.getElementById("autosave-text");
    
    if (dot && txt) {
        dot.classList.add("saving");
        txt.innerText = "Draft auto-saving...";
        
        setTimeout(() => {
            dot.classList.remove("saving");
            txt.innerText = `Draft Saved (${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})`;
            state.saveDatabase();
        }, 600);
    }
}

function initAppraisalPlayerWizard() {
    document.getElementById("btn-player-close").addEventListener("click", () => {
        if (!state.activePlayerAssessmentId) {
            switchToView("dashboard");
            return;
        }
        const assessment = state.db.assessments.find(a => a.id === state.activePlayerAssessmentId);
        state.activePlayerAssessmentId = null;
        if (assessment) {
            const tmpl = state.db.templates.find(t => t.id === assessment.template_id);
            if (tmpl && tmpl.category === "academic") {
                switchToView("observations");
                return;
            }
        }
        switchToView("appraisals");
    });

    document.getElementById("btn-wizard-prev").addEventListener("click", () => {
        if (state.activeStepIndex > 0) {
            state.activeStepIndex--;
            renderAppraisalPlayerWizard();
        }
    });

    document.getElementById("btn-wizard-next").addEventListener("click", () => {
        const assessment = state.db.assessments.find(a => a.id === state.activePlayerAssessmentId);
        const tmpl = state.db.templates.find(t => t.id === assessment.template_id);
        
        let flatItemCount = 0;
        tmpl.sections.forEach(sect => {
            flatItemCount += (sect.items || []).length;
        });

        if (state.activeStepIndex < flatItemCount) {
            state.activeStepIndex++;
            renderAppraisalPlayerWizard();
        } else {
            const isLocked = assessment.status === "signed_off";
            const targetView = tmpl.category === "academic" ? "observations" : "appraisals";

            if (isLocked) {
                state.activePlayerAssessmentId = null;
                switchToView(targetView);
                return;
            }

            const evalSig = assessment.evaluator_signature ? assessment.evaluator_signature.trim() : "";
            const subjSig = assessment.subject_signature ? assessment.subject_signature.trim() : "";

            if (!evalSig) {
                Toaster.warning("Signature required: Evaluator must sign template matrix before submission.");
                return;
            }

            assessment.evaluator_signed_at = new Date().toISOString();
            if (subjSig) {
                assessment.subject_signed_at = new Date().toISOString();
                assessment.status = "signed_off";
                Toaster.success("Evaluation finalized and digitally co-signed!");
            } else {
                assessment.status = "evaluator_completed";
                Toaster.success("Evaluation review signed and shared with staff subject.");
            }

            assessment.submitted_at = new Date().toISOString();
            state.saveDatabase();
            
            state.activePlayerAssessmentId = null;
            switchToView(targetView);
        }
    });
}

function runScoringEngine(assessment) {
    const tmpl = state.db.templates.find(t => t.id === assessment.template_id);
    if (!tmpl) return;
    
    let templateScoreSum = 0;
    let templateWeightSum = 0;

    tmpl.sections.forEach(sect => {
        let sectionScoreSum = 0;
        let sectionWeightSum = 0;

        sect.items.forEach(item => {
            const resp = assessment.responses[item.id] || {};
            
            if (resp.is_na) {
                resp.calculated_score = 0;
                return;
            }

            if (item.item_type === "choice") {
                const choices = item.choices || [];
                const selectedChoice = choices.find(c => c.id === resp.selected_choice_id);
                const maxPoints = choices.length > 0 ? Math.max(...choices.map(c => c.points)) : 0;
                
                if (selectedChoice && maxPoints > 0) {
                    const score = (selectedChoice.points / maxPoints) * item.weight;
                    resp.calculated_score = score;
                    sectionScoreSum += score;
                    sectionWeightSum += item.weight;
                }
            }
        });

        if (sectionWeightSum > 0) {
            const normalizedSection = sectionScoreSum / sectionWeightSum;
            templateScoreSum += normalizedSection * sect.weight;
            templateWeightSum += sect.weight;
        }
    });

    if (templateWeightSum > 0) {
        assessment.score = (templateScoreSum / templateWeightSum) * 100.0;
    } else {
        assessment.score = 0.00;
    }

    state.saveDatabase();
}

// =========================================================================
// 11. VIEW BUILDERS: GROWTH PLANS
// =========================================================================
function renderGrowthPlans() {
    renderGrowthPlansList();
    renderGrowthPlanDetail();
}

function renderGrowthPlansList() {
    const list = document.getElementById("growth-plans-list");
    list.innerHTML = "";

    const user = state.getCurrentUser();
    let plans = state.db.growth_plans;

    if (state.activeRole === "staff_member") {
        plans = plans.filter(p => p.user_id === user.id);
    } else if (state.activeRole === "dept_head") {
        plans = plans.filter(p => {
            const subject = state.db.users.find(u => u.id === p.user_id);
            return subject && subject.dept_id === "dept-teach";
        });
    }

    plans.forEach(plan => {
        const subject = state.db.users.find(u => u.id === plan.user_id);
        const li = document.createElement("li");
        li.innerText = `${subject.first_name} ${subject.last_name} - ${plan.title}`;
        
        if (state.activeGrowthPlanUserId === plan.user_id) li.classList.add("active");
        
        li.addEventListener("click", () => {
            state.activeGrowthPlanUserId = plan.user_id;
            renderGrowthPlansList();
            renderGrowthPlanDetail();
        });

        list.appendChild(li);
    });
}

function renderGrowthPlanDetail() {
    const emptyState = document.getElementById("growth-plan-detail-empty");
    const container = document.getElementById("growth-plan-detail-container");

    if (!state.activeGrowthPlanUserId) {
        emptyState.className = "empty-state";
        emptyState.innerHTML = `<p>Select a staff member's plan to configure goals and key action items.</p>`;
        container.classList.add("hidden");
        return;
    }

    emptyState.classList.add("hidden");
    container.classList.remove("hidden");

    const plan = state.db.growth_plans.find(p => p.user_id === state.activeGrowthPlanUserId);
    const subject = state.db.users.find(u => u.id === plan.user_id);

    document.getElementById("growth-plan-title").innerText = plan.title;
    document.getElementById("growth-plan-subject").innerText = `${subject.first_name} ${subject.last_name}`;
    document.getElementById("growth-plan-status").className = `badge ${plan.status}`;
    document.getElementById("growth-plan-status").innerText = plan.status;

    const goalsList = document.getElementById("growth-plan-goals-list");
    goalsList.innerHTML = "";

    plan.goals.forEach(goal => {
        const card = document.createElement("div");
        card.className = "goal-card-item";
        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <div>
                    <h4 style="font-size:14px;">${goal.title}</h4>
                    <p class="small-text text-muted" style="margin-top:2px;">${goal.description}</p>
                </div>
                <span class="badge ${goal.status}">${goal.status.replace('_', ' ')}</span>
            </div>
            <div style="font-size:11px;color:var(--text-subtle);margin-top:4px;">Target Date: ${new Date(goal.target_date).toLocaleDateString()}</div>
            <div class="actions-wrapper" id="actions-${goal.id}" style="margin-top:12px; border-top: 1px solid var(--border-color); padding-top:10px;">
                <strong style="font-size:11px;text-transform:uppercase;color:var(--text-muted);">Action Checklist:</strong>
            </div>
        `;
        
        const actWrapper = card.querySelector(`#actions-${goal.id}`);
        goal.actions.forEach(action => {
            const row = document.createElement("div");
            row.className = "action-checkbox-row";
            row.innerHTML = `
                <input type="checkbox" ${action.status === 'done' ? 'checked' : ''} ${state.activeRole === 'staff_member' && plan.user_id !== state.getCurrentUser().id ? 'disabled' : ''}>
                <span>${action.description}</span>
            `;
            
            row.querySelector("input").addEventListener("change", (e) => {
                action.status = e.target.checked ? "done" : "pending";
                state.saveDatabase();
                
                const allDone = goal.actions.every(a => a.status === "done");
                goal.status = allDone ? "achieved" : "in_progress";
                state.saveDatabase();
                renderGrowthPlanDetail();
            });
            actWrapper.appendChild(row);
        });

        goalsList.appendChild(card);
    });
}

function initGrowthPlans() {
    document.getElementById("btn-create-growth-plan").addEventListener("click", () => {
        if (state.activeRole === "staff_member") {
            Toaster.error("RBAC Denied: Staff members cannot create growth cycles.");
            return;
        }

        const targetSubject = state.db.users.find(u => {
            if (u.role !== "staff_member") return false;
            if (state.db.growth_plans.some(p => p.user_id === u.id)) return false;
            if (state.activeRole === "dept_head") {
                return u.dept_id === "dept-teach";
            }
            return true;
        });
        if (!targetSubject) {
            Toaster.warning("All eligible staff members already have growth plans assigned.");
            return;
        }

        state.db.growth_plans.push({
            id: `gp-auto-${Math.floor(Math.random()*1000)}`,
            user_id: targetSubject.id,
            mentor_id: state.getCurrentUser().id,
            cycle_id: "cycle-term-1",
            title: "Professional Instruction Progression Plan",
            description: "Mentoring plan configured based on assessment cycle audits.",
            status: "active",
            goals: [
                {
                    id: `g-auto-${Math.floor(Math.random()*1000)}`,
                    title: "Improve Classroom Control Methods",
                    description: "Implement time trackers for transitions.",
                    target_date: "2026-08-01",
                    status: "in_progress",
                    actions: [
                        { id: `a-auto-${Math.floor(Math.random()*1000)}`, description: "Review standard timers documentation", status: "pending" }
                    ]
                }
            ]
        });

        state.activeGrowthPlanUserId = targetSubject.id;
        state.saveDatabase();
        Toaster.success(`Growth Plan registered for ${targetSubject.first_name}`);
        renderGrowthPlans();
    });

    document.getElementById("btn-growth-add-goal").addEventListener("click", () => {
        const plan = state.db.growth_plans.find(p => p.user_id === state.activeGrowthPlanUserId);
        plan.goals.push({
            id: `g-auto-${Math.floor(Math.random()*1000)}`,
            title: "Expand Curriculum Technology Integration",
            description: "Use interactive clicker tools in lessons.",
            target_date: "2026-08-15",
            status: "not_started",
            actions: [
                { id: `a-auto-${Math.floor(Math.random()*1000)}`, description: "Schedule a training walkthrough session", status: "pending" }
            ]
        });
        state.saveDatabase();
        renderGrowthPlanDetail();
    });

    document.getElementById("btn-ai-suggest-goals").addEventListener("click", () => {
        const plan = state.db.growth_plans.find(p => p.user_id === state.activeGrowthPlanUserId);
        const subject = state.db.users.find(u => u.id === plan.user_id);
        const container = document.getElementById("ai-growth-suggestions");
        
        container.innerHTML = `<span style="color:var(--color-primary)">✦ Accessing Vertex AI Prompts gateway... Analyzing evaluation scorecards...</span>`;

        setTimeout(() => {
            let targetCompetency = "Classroom Technology Adoption";
            let suggestionText = "Implement interactive polls in lesson closures.";
            
            const userAssessments = state.db.assessments.filter(a => a.subject_id === subject.id && a.score);
            if (userAssessments.length > 0) {
                const last = userAssessments[userAssessments.length - 1];
                if (last.score < 90) {
                    targetCompetency = "Exit Checks & Formative Indicators";
                    suggestionText = "Design a 5-minute digital exit card matrix on mobile tablets for real-time tracking.";
                }
            }

            container.innerHTML = `
                <div style="border-left: 2px solid var(--color-secondary); padding-left:10px;">
                    <p style="font-size:12px;color:var(--text-primary);"><strong>Recommended AI Action Target:</strong></p>
                    <p style="font-size:11.5px;color:var(--text-muted);margin-top:2px;">"${suggestionText}"</p>
                    <button class="small-btn mt-2" onclick="addAISuggestedGoalToPlan('${plan.user_id}', '${targetCompetency}', '${suggestionText}')">Accept & Add to Plan</button>
                </div>
            `;
            Toaster.info("AI Analysis pathway recommendations fetched.");
        }, 1200);
    });
}

function addAISuggestedGoalToPlan(userId, title, desc) {
    const plan = state.db.growth_plans.find(p => p.user_id === userId);
    plan.goals.push({
        id: `g-ai-${Math.floor(Math.random()*1000)}`,
        title: title,
        description: desc,
        target_date: "2026-08-30",
        status: "not_started",
        actions: [
            { id: `a-ai-1`, description: "Draft the digital exit poll questions template", status: "pending" },
            { id: `a-ai-2`, description: "Run exit poll pilot in lesson", status: "pending" }
        ]
    });
    state.saveDatabase();
    renderGrowthPlanDetail();
    Toaster.success("AI Recommendation integrated into checklist.");
}

// =========================================================================
// 12. VIEW BUILDERS: ANALYTICS
// =========================================================================
function getRoleLabel(u) {
    if (!u) return "";
    return u.role
        .replace("activity_teacher", "Activity Teacher")
        .replace("staff_member", "Teacher")
        .replace("office_staff", "Support")
        .replace("pro_staff", "PR Admin")
        .replace("accounts_staff", "Accounts")
        .replace("dept_head", "Coordinator")
        .replace("school_leader", "Principal")
        .replace("tenant_admin", "Admin");
}

function getFilteredUsers() {
    let visibleUsers = state.db.users.filter(u => u.role !== "tenant_admin");
    if (state.activeRole === "dept_head") {
        visibleUsers = visibleUsers.filter(u => u.dept_id === "dept-teach");
    } else if (state.activeRole === "staff_member") {
        visibleUsers = visibleUsers.filter(u => u.id === state.getCurrentUser().id);
    }
    
    // Apply Department filter
    const deptVal = document.getElementById("report-filter-dept")?.value || "all";
    if (deptVal !== "all") {
        visibleUsers = visibleUsers.filter(u => u.dept_id === deptVal);
    }
    
    // Apply Category filter
    const catVal = document.getElementById("report-filter-category")?.value || "all";
    if (catVal !== "all") {
        if (catVal === "teaching") {
            visibleUsers = visibleUsers.filter(u => u.dept_id === "dept-teach" || u.dept_id === "dept-activities" || u.role === "staff_member" || u.role === "activity_teacher");
            
            // Apply Class & Section filters
            const classVal = document.getElementById("report-filter-class")?.value || "all";
            const sectionVal = document.getElementById("report-filter-section")?.value || "all";
            
            if (classVal !== "all") {
                visibleUsers = visibleUsers.filter(u => u.assigned_class === classVal);
            }
            if (sectionVal !== "all") {
                visibleUsers = visibleUsers.filter(u => u.assigned_section === sectionVal);
            }
        } else if (catVal === "non-teaching") {
            visibleUsers = visibleUsers.filter(u => !(u.dept_id === "dept-teach" || u.dept_id === "dept-activities" || u.role === "staff_member" || u.role === "activity_teacher"));
        }
    }
    
    return visibleUsers;
}

function getFilteredAssessments() {
    let visibleAssessments = state.db.assessments.filter(a => a.session_id === state.db.activeSessionId);
    
    const filteredUsers = getFilteredUsers();
    const userIds = filteredUsers.map(u => u.id);
    
    visibleAssessments = visibleAssessments.filter(a => userIds.includes(a.subject_id));
    
    // Date Filters
    const startVal = document.getElementById("report-filter-start").value;
    const endVal = document.getElementById("report-filter-end").value;
    if (startVal) {
        const startDate = new Date(startVal);
        visibleAssessments = visibleAssessments.filter(a => new Date(a.created_at) >= startDate);
    }
    if (endVal) {
        const endDate = new Date(endVal);
        endDate.setHours(23, 59, 59, 999);
        visibleAssessments = visibleAssessments.filter(a => new Date(a.created_at) <= endDate);
    }
    
    // Staff / Assessment Filter
    if (state.selectedReportAssessmentId) {
        visibleAssessments = visibleAssessments.filter(a => a.id === state.selectedReportAssessmentId);
    } else if (state.selectedReportUserId) {
        visibleAssessments = visibleAssessments.filter(a => a.subject_id === state.selectedReportUserId);
    } else if (state.selectedReportUserIds && state.selectedReportUserIds.length > 1) {
        visibleAssessments = visibleAssessments.filter(a => state.selectedReportUserIds.includes(a.subject_id));
    }
    
    return visibleAssessments;
}

function renderAnalytics() {
    // 1. Populate department filter select options based on category
    populateReportDeptFilter();
    
    // Toggle teaching filters visibility
    toggleTeachingFilters();
    
    // 2. Populate staff filter select options based on active category & department
    populateReportStaffFilter();
    
    // 3. Sync staff & audit dropdown selectors based on state
    syncAnalyticsFilterDropdowns();
    
    // 4. Refresh metrics statistics
    refreshAnalyticsMetrics();
    
    // 5. Render Competency Breakdowns & Department Standings
    renderAnalyticsBreakdowns();
    
    // 6. Render rankings ledger list
    renderAnalyticsLedgerOnly();
    
    // 7. Render directives action pane
    renderDirectivesPane();
    
    // 8. Draw Score Trend chart
    const visibleAssessments = getFilteredAssessments();
    drawScoreTrendChart(visibleAssessments);
}

function populateReportDeptFilter() {
    const deptSelect = document.getElementById("report-filter-dept");
    const categorySelect = document.getElementById("report-filter-category");
    if (!deptSelect || !categorySelect) return;
    
    const currentDeptVal = deptSelect.value || "all";
    const catVal = categorySelect.value;
    
    // Clear and add "All Departments" option
    deptSelect.innerHTML = '<option value="all">All Departments</option>';
    
    // Filter departments based on category
    let deptsToRender = state.db.departments;
    
    if (catVal === "teaching") {
        deptsToRender = state.db.departments.filter(d => d.id === "dept-teach" || d.id === "dept-activities");
    } else if (catVal === "non-teaching") {
        deptsToRender = state.db.departments.filter(d => !(d.id === "dept-teach" || d.id === "dept-activities"));
    }
    
    deptsToRender.forEach(d => {
        const option = document.createElement("option");
        option.value = d.id;
        option.innerText = d.name;
        deptSelect.appendChild(option);
    });
    
    // Restore selection if it still exists in the new options list
    if (currentDeptVal && [...deptSelect.options].some(o => o.value === currentDeptVal)) {
        deptSelect.value = currentDeptVal;
    } else {
        deptSelect.value = "all";
    }
}

function toggleTeachingFilters() {
    const categorySelect = document.getElementById("report-filter-category");
    const classWrapper = document.getElementById("report-filter-class-wrapper");
    const sectionWrapper = document.getElementById("report-filter-section-wrapper");
    
    if (!categorySelect || !classWrapper || !sectionWrapper) return;
    
    if (categorySelect.value === "teaching") {
        classWrapper.classList.remove("hidden");
        sectionWrapper.classList.remove("hidden");
        
        // Populate class filter options if empty (except the default "All Classes")
        const classSelect = document.getElementById("report-filter-class");
        if (classSelect && classSelect.options.length <= 1) {
            state.db.classes.forEach(c => {
                const opt = document.createElement("option");
                opt.value = c;
                opt.innerText = c;
                classSelect.appendChild(opt);
            });
        }
        
        // Populate section filter options if empty
        const sectionSelect = document.getElementById("report-filter-section");
        if (sectionSelect && sectionSelect.options.length <= 1) {
            const sections = ["A", "B", "C", "D"];
            sections.forEach(s => {
                const opt = document.createElement("option");
                opt.value = s;
                opt.innerText = `Section ${s}`;
                sectionSelect.appendChild(opt);
            });
        }
    } else {
        classWrapper.classList.add("hidden");
        sectionWrapper.classList.add("hidden");
        
        const classSelect = document.getElementById("report-filter-class");
        const sectionSelect = document.getElementById("report-filter-section");
        if (classSelect) classSelect.value = "all";
        if (sectionSelect) sectionSelect.value = "all";
    }
}

function populateReportStaffFilter() {
    const staffFilter = document.getElementById("report-filter-staff");
    if (!staffFilter) return;
    
    const currentSelection = staffFilter.value || "all";
    staffFilter.innerHTML = `<option value="all">All Staff</option>`;
    
    const filteredUsers = getFilteredUsers();
    filteredUsers.forEach(u => {
        const opt = document.createElement("option");
        opt.value = u.id;
        opt.innerText = `${u.first_name} ${u.last_name}`;
        staffFilter.appendChild(opt);
    });
    
    // Restore selection if it is still valid
    if (currentSelection !== "all" && filteredUsers.some(u => u.id === currentSelection)) {
        staffFilter.value = currentSelection;
    } else {
        staffFilter.value = "all";
    }
}

function populateReportAuditFilter() {
    const auditFilter = document.getElementById("report-filter-audit");
    if (!auditFilter) return;
    
    const currentSelection = auditFilter.value || "all";
    auditFilter.innerHTML = `<option value="all">All Audits</option>`;
    
    if (state.selectedReportUserId) {
        const staffVal = state.selectedReportUserId;
        const userAss = state.db.assessments.filter(a => a.subject_id === staffVal && a.session_id === state.db.activeSessionId);
        
        userAss.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); // Newest first
        
        userAss.forEach(ass => {
            const tmpl = state.db.templates.find(t => t.id === ass.template_id);
            const name = tmpl ? tmpl.name : "Custom Evaluation";
            const d = new Date(ass.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
            const score = ass.score ? ` (${ass.score.toFixed(1)}%)` : "";
            const opt = document.createElement("option");
            opt.value = ass.id;
            opt.innerText = `${d} - ${name}${score}`;
            auditFilter.appendChild(opt);
        });
        
        // Restore selection if it is still valid
        if (currentSelection !== "all" && userAss.some(a => a.id === currentSelection)) {
            auditFilter.value = currentSelection;
        } else {
            auditFilter.value = "all";
        }
    } else {
        auditFilter.value = "all";
    }
}

function syncAnalyticsFilterDropdowns() {
    const staffFilter = document.getElementById("report-filter-staff");
    const auditFilter = document.getElementById("report-filter-audit");
    
    if (staffFilter) {
        staffFilter.value = state.selectedReportUserId || "all";
    }
    
    // Rebuild and sync audit filter
    populateReportAuditFilter();
    
    if (auditFilter) {
        auditFilter.value = state.selectedReportAssessmentId || "all";
    }
}

function refreshAnalyticsMetrics() {
    const visibleAssessments = getFilteredAssessments();
    
    document.getElementById("report-stat-audits").innerText = visibleAssessments.length;
    
    // Appraisals Average
    const appraisals = visibleAssessments.filter(a => {
        const tmpl = state.db.templates.find(t => t.id === a.template_id);
        return tmpl && tmpl.category !== "academic" && tmpl.category !== "academic_daily" && a.score;
    });
    if (appraisals.length > 0) {
        const sum = appraisals.reduce((acc, curr) => acc + curr.score, 0);
        document.getElementById("report-stat-avg-appraisal").innerText = `${(sum / appraisals.length).toFixed(1)}%`;
    } else {
        document.getElementById("report-stat-avg-appraisal").innerText = "N/A";
    }
    
    // Observations Average
    const observations = visibleAssessments.filter(a => {
        const tmpl = state.db.templates.find(t => t.id === a.template_id);
        return tmpl && (tmpl.category === "academic" || tmpl.category === "academic_daily") && a.score;
    });
    if (observations.length > 0) {
        const sum = observations.reduce((acc, curr) => acc + curr.score, 0);
        document.getElementById("report-stat-avg-obs").innerText = `${(sum / observations.length).toFixed(1)}%`;
    } else {
        document.getElementById("report-stat-avg-obs").innerText = "N/A";
    }
    
    // Compliance Rate
    const signedOff = visibleAssessments.filter(a => a.status === "signed_off").length;
    const complianceRate = visibleAssessments.length > 0 ? Math.round((signedOff / visibleAssessments.length) * 100) : 100;
    document.getElementById("report-stat-compliance").innerText = `${complianceRate}%`;
}

function renderAnalyticsBreakdowns() {
    const competenciesContainer = document.getElementById("analytics-competencies");
    if (!competenciesContainer) return;
    competenciesContainer.innerHTML = "";

    const filteredAssessments = getFilteredAssessments();
    let signedOffAssessments = filteredAssessments.filter(a => a.status === "signed_off" && a.score);

    const sectionAverages = {};
    const sectionCounts = {};

    signedOffAssessments.forEach(ass => {
        const tmpl = state.db.templates.find(t => t.id === ass.template_id);
        if (!tmpl) return;

        tmpl.sections.forEach(sec => {
            let sectionMaxPoints = 0;
            let sectionEarnedPoints = 0;
            let hasValidResponses = false;

            sec.items.forEach(item => {
                if (item.item_type === "choice" && item.choices) {
                    const resp = ass.responses[item.id];
                    if (resp && !resp.is_na) {
                        const chosenOpt = item.choices.find(c => c.id === resp.selected_choice_id);
                        if (chosenOpt) {
                            const maxPoints = Math.max(...item.choices.map(c => c.points || 0));
                            sectionMaxPoints += maxPoints;
                            sectionEarnedPoints += (chosenOpt.points || 0);
                            hasValidResponses = true;
                        }
                    }
                }
            });

            if (hasValidResponses && sectionMaxPoints > 0) {
                const secPct = (sectionEarnedPoints / sectionMaxPoints) * 100.0;
                if (!sectionAverages[sec.title]) {
                    sectionAverages[sec.title] = 0;
                    sectionCounts[sec.title] = 0;
                }
                sectionAverages[sec.title] += secPct;
                sectionCounts[sec.title]++;
            }
        });
    });

    const competencies = [];
    for (const title in sectionAverages) {
        const avg = sectionAverages[title] / sectionCounts[title];
        competencies.push({ title, avg: avg.toFixed(1) });
    }

    if (competencies.length === 0) {
        competencies.push(
            { title: "Classroom Environment & Management", avg: "88.0" },
            { title: "Instructional Delivery & Student Engagement", avg: "84.5" },
            { title: "Lesson Planning & Professionalism", avg: "90.0" }
        );
    }

    competencies.forEach(comp => {
        const item = document.createElement("div");
        item.className = "analytics-bar-item";
        item.innerHTML = `
            <div class="analytics-bar-lbl-row">
                <span>${comp.title}</span>
                <strong>${comp.avg}% Average</strong>
            </div>
            <div class="analytics-bar-track">
                <div class="analytics-bar-fill" style="width: ${comp.avg}%"></div>
            </div>
        `;
        competenciesContainer.appendChild(item);
    });

    const leaderboard = document.getElementById("analytics-departments-list");
    if (!leaderboard) return;
    leaderboard.innerHTML = "";

    const allSessionAssessments = state.db.assessments.filter(a => a.session_id === state.db.activeSessionId && a.score);
    const depts = [
        { id: "dept-teach", name: "Academic Faculty", fallbackScore: 87.5 },
        { id: "dept-admin", name: "Administrative Staff", fallbackScore: 82.0 },
        { id: "dept-supp", name: "Operations Support", fallbackScore: 78.4 },
        { id: "dept-pr", name: "Communications / PR", fallbackScore: 85.0 }
    ];
    
    let deptScores = depts.map(d => {
        const deptUsers = state.db.users.filter(u => u.dept_id === d.id).map(u => u.id);
        const deptAss = allSessionAssessments.filter(a => deptUsers.includes(a.subject_id));
        const avg = deptAss.length > 0 ? (deptAss.reduce((acc, curr) => acc + parseFloat(curr.score), 0) / deptAss.length) : null;
        return {
            id: d.id,
            name: d.name,
            score: avg !== null ? avg : d.fallbackScore
        };
    });
    
    deptScores.sort((a, b) => b.score - a.score);

    if (state.activeRole === "dept_head") {
        deptScores = deptScores.filter(ds => ds.id === "dept-teach");
    }

    deptScores.forEach((ds, idx) => {
        const item = document.createElement("div");
        item.className = "leaderboard-item";
        item.innerHTML = `
            <div class="rank-badge">${idx + 1}</div>
            <div class="leaderboard-name">${ds.name}</div>
            <div class="leaderboard-score">${ds.score.toFixed(1)}%</div>
        `;
        leaderboard.appendChild(item);
    });

    const auditTbody = document.getElementById("analytics-compliance-table");
    if (!auditTbody) return;
    auditTbody.innerHTML = "";

    let visibleDepts = state.db.departments;
    if (state.activeRole === "dept_head") {
        visibleDepts = visibleDepts.filter(d => d.id === "dept-teach");
    }

    visibleDepts.forEach(dept => {
        const members = state.db.users.filter(u => u.dept_id === dept.id);
        const memberIds = members.map(m => m.id);

        const assessments = state.db.assessments.filter(a => a.session_id === state.db.activeSessionId && memberIds.includes(a.subject_id));
        const filed = assessments.length;
        const signedOff = assessments.filter(a => a.status === "signed_off").length;

        const rate = members.length > 0 ? Math.round((signedOff / members.length) * 100) : 100;
        
        let avgScore = "--";
        const scores = assessments.filter(a => a.score).map(a => parseFloat(a.score));
        if (scores.length > 0) {
            avgScore = (scores.reduce((a,b)=>a+b, 0) / scores.length).toFixed(1) + "%";
        }

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${dept.name}</strong></td>
            <td>${members.length}</td>
            <td>${filed}</td>
            <td>${signedOff}</td>
            <td>
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-weight:700;color:${rate > 70 ? 'var(--color-success)' : 'var(--color-warning)'}">${rate}%</span>
                </div>
            </td>
        `;
        auditTbody.appendChild(tr);
    });
}

function renderAnalyticsLedgerOnly() {
    const tbody = document.getElementById("report-ledger-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    
    let visibleUsers = getFilteredUsers();
    
    const searchVal = document.getElementById("report-ledger-search").value.toLowerCase().trim();
    if (searchVal) {
        visibleUsers = visibleUsers.filter(u => `${u.first_name} ${u.last_name}`.toLowerCase().includes(searchVal) || u.role.toLowerCase().includes(searchVal));
    }
    
    let ledgerAssessments = state.db.assessments.filter(a => a.session_id === state.db.activeSessionId);
    
    // Date Filters
    const startVal = document.getElementById("report-filter-start").value;
    const endVal = document.getElementById("report-filter-end").value;
    if (startVal) {
        const startDate = new Date(startVal);
        ledgerAssessments = ledgerAssessments.filter(a => new Date(a.created_at) >= startDate);
    }
    if (endVal) {
        const endDate = new Date(endVal);
        endDate.setHours(23, 59, 59, 999);
        ledgerAssessments = ledgerAssessments.filter(a => new Date(a.created_at) <= endDate);
    }
    
    const ledgerList = [];
    visibleUsers.forEach(u => {
        const userAss = ledgerAssessments.filter(a => a.subject_id === u.id && a.score);
        const scores = userAss.map(a => parseFloat(a.score));
        const avgScore = scores.length > 0 ? (scores.reduce((s, x) => s + x, 0) / scores.length) : null;
        ledgerList.push({
            user: u,
            avgScore: avgScore,
            count: userAss.length
        });
    });
    
    const sortVal = document.getElementById("report-ledger-sort").value;
    if (sortVal === "score_desc") {
        ledgerList.sort((a, b) => {
            if (a.avgScore === null) return 1;
            if (b.avgScore === null) return -1;
            return b.avgScore - a.avgScore;
        });
    } else if (sortVal === "score_asc") {
        ledgerList.sort((a, b) => {
            if (a.avgScore === null) return 1;
            if (b.avgScore === null) return -1;
            return a.avgScore - b.avgScore;
        });
    } else if (sortVal === "name_asc") {
        ledgerList.sort((a, b) => {
            const nameA = `${a.user.first_name} ${a.user.last_name}`.toLowerCase();
            const nameB = `${b.user.first_name} ${b.user.last_name}`.toLowerCase();
            return nameA.localeCompare(nameB);
        });
    } else if (sortVal === "name_desc") {
        ledgerList.sort((a, b) => {
            const nameA = `${a.user.first_name} ${a.user.last_name}`.toLowerCase();
            const nameB = `${b.user.first_name} ${b.user.last_name}`.toLowerCase();
            return nameB.localeCompare(nameA);
        });
    } else if (sortVal === "audits_desc") {
        ledgerList.sort((a, b) => b.count - a.count);
    } else if (sortVal === "audits_asc") {
        ledgerList.sort((a, b) => a.count - b.count);
    } else if (sortVal === "role_asc") {
        ledgerList.sort((a, b) => {
            const roleA = getRoleLabel(a.user).toLowerCase();
            const roleB = getRoleLabel(b.user).toLowerCase();
            return roleA.localeCompare(roleB);
        });
    } else if (sortVal === "role_desc") {
        ledgerList.sort((a, b) => {
            const roleA = getRoleLabel(a.user).toLowerCase();
            const roleB = getRoleLabel(b.user).toLowerCase();
            return roleB.localeCompare(roleA);
        });
    }
    
    ledgerList.forEach((item, index) => {
        const tr = document.createElement("tr");
        tr.style.cursor = "pointer";
        const isChecked = state.selectedReportUserIds.includes(item.user.id);
        
        if (state.selectedReportUserId === item.user.id || (state.selectedReportUserIds.length > 1 && isChecked)) {
            tr.style.background = "rgba(99, 102, 241, 0.08)";
            tr.style.borderLeft = "3px solid var(--color-primary)";
        }
        
        tr.addEventListener("click", (e) => {
            // Find if click target is the checkbox or inside the checkbox cell (first column)
            const isCheckboxCell = e.target.closest("td")?.firstElementChild?.classList.contains("report-ledger-row-checkbox") || e.target.classList.contains("report-ledger-row-checkbox");
            
            if (isCheckboxCell) {
                // If clicked on the cell (but not the checkbox itself), toggle the checkbox
                if (!e.target.classList.contains("report-ledger-row-checkbox")) {
                    const chk = e.target.closest("td").querySelector(".report-ledger-row-checkbox");
                    if (chk) {
                        chk.checked = !chk.checked;
                        chk.dispatchEvent(new Event("change"));
                    }
                }
                return;
            }
            
            // Support Ctrl / Cmd click for row multi-select
            if (e.ctrlKey || e.metaKey) {
                const chk = tr.querySelector(".report-ledger-row-checkbox");
                if (chk) {
                    chk.checked = !chk.checked;
                    chk.dispatchEvent(new Event("change"));
                }
                return;
            }
            
            state.selectedReportUserId = item.user.id;
            state.selectedReportUserIds = [item.user.id];
            state.selectedReportAssessmentId = null;
            
            renderAnalytics();
        });
        
        const rankStr = item.avgScore !== null ? (index + 1) : "--";
        const scoreStr = item.avgScore !== null ? `${item.avgScore.toFixed(1)}%` : "N/A";
        const roleLabel = getRoleLabel(item.user);
        
        tr.innerHTML = `
            <td style="text-align: center;">
                <input type="checkbox" class="report-ledger-row-checkbox" data-user-id="${item.user.id}" ${isChecked ? 'checked' : ''} style="cursor:pointer;" onclick="event.stopPropagation();">
            </td>
            <td><strong>${rankStr}</strong></td>
            <td>
                <div style="display:flex; align-items:center; gap:8px;">
                    <img src="${item.user.avatar}" class="avatar" style="width:24px; height:24px;">
                    <strong>${item.user.first_name} ${item.user.last_name}</strong>
                </div>
            </td>
            <td><span class="badge secondary" style="font-size:10px;">${roleLabel}</span></td>
            <td><strong style="color:${item.avgScore >= 80 ? 'var(--color-success)' : (item.avgScore >= 60 ? 'var(--color-warning)' : 'var(--color-danger)')}">${scoreStr}</strong></td>
            <td>${item.count}</td>
        `;
        tbody.appendChild(tr);
        
        tr.querySelector(".report-ledger-row-checkbox").addEventListener("change", (e) => {
            const userId = item.user.id;
            if (e.target.checked) {
                if (!state.selectedReportUserIds.includes(userId)) {
                    state.selectedReportUserIds.push(userId);
                }
            } else {
                state.selectedReportUserIds = state.selectedReportUserIds.filter(id => id !== userId);
            }
            
            if (state.selectedReportUserIds.length === 1) {
                state.selectedReportUserId = state.selectedReportUserIds[0];
            } else {
                state.selectedReportUserId = null;
            }
            state.selectedReportAssessmentId = null;
            
            renderAnalytics();
        });
    });
    
    const selectAllCheck = document.getElementById("report-ledger-select-all");
    if (selectAllCheck) {
        const visibleIds = visibleUsers.map(u => u.id);
        const allChecked = visibleIds.length > 0 && visibleIds.every(id => state.selectedReportUserIds.includes(id));
        selectAllCheck.checked = allChecked;
    }
    
    drawScoreDistributionChart(ledgerList);
}

function drawScoreDistributionChart(ledgerList) {
    const container = document.getElementById("report-chart-distribution");
    if (!container) return;
    
    // Check if a single staff member is selected
    if (state.selectedReportUserId) {
        const userId = state.selectedReportUserId;
        const user = state.db.users.find(u => u.id === userId);
        
        let competencies = [];
        let subtext = "";
        let title = "";
        
        if (state.selectedReportAssessmentId) {
            const ass = state.db.assessments.find(a => a.id === state.selectedReportAssessmentId);
            const dateStr = ass ? new Date(ass.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
            competencies = getAssessmentCompetencyAnalysis(state.selectedReportAssessmentId);
            title = `${user ? user.first_name + ' ' + user.last_name : 'Staff'} - Audit Breakdown (${dateStr})`;
            subtext = "Scores per competency section for the selected evaluation.";
        } else {
            competencies = getStaffCompetencyAnalysis(userId);
            title = `${user ? user.first_name + ' ' + user.last_name : 'Staff'} Competency Breakdown`;
            subtext = "Average scores by competency sections in active session.";
        }
        
        const cardHeader = container.parentElement.querySelector("h3");
        const cardSub = container.parentElement.querySelector("p");
        if (cardHeader) cardHeader.innerText = title;
        if (cardSub) cardSub.innerText = subtext;
        
        if (competencies.length === 0) {
            container.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:center; height:100%; width:100%; border: 1px dashed var(--border-color); border-radius:8px; padding:20px;">
                    <span class="text-muted small-text">No evaluation score data available for competency breakdown</span>
                </div>
            `;
            return;
        }
        
        const maxScore = 100;
        let svgContent = `
        <svg viewBox="0 0 500 180" width="100%" height="100%" style="font-family: inherit;">
            <defs>
                <linearGradient id="compBarGradSingle" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="var(--color-primary, #6366f1)"/>
                    <stop offset="100%" stop-color="var(--color-secondary, #a855f7)"/>
                </linearGradient>
            </defs>
        `;
        
        const gridLines = 4;
        for (let i = 0; i <= gridLines; i++) {
            const y = 15 + (130 * (1 - i / gridLines));
            const gridVal = i * 25;
            svgContent += `
                <line x1="40" y1="${y}" x2="480" y2="${y}" stroke="var(--border-color, #e5e7eb)" stroke-width="1" stroke-dasharray="3,3"/>
                <text x="30" y="${y + 4}" fill="var(--text-muted, #6b7280)" font-size="9" text-anchor="end">${gridVal}%</text>
            `;
        }
        
        const n = competencies.length;
        const spacing = 440 / n;
        const maxBarWidth = 50;
        const barWidth = Math.min(maxBarWidth, spacing * 0.5);
        
        competencies.forEach((item, i) => {
            const score = item.avg || 0;
            const barHeight = (score / maxScore) * 130;
            const x = 40 + (i * spacing) + (spacing - barWidth) / 2;
            const y = 145 - barHeight;
            
            const cleanTitle = item.title.replace("SECTION A - ", "").replace("SECTION B - ", "").replace("SECTION C - ", "").replace("SECTION D - ", "");
            const displayTitle = cleanTitle.length > 20 ? cleanTitle.substring(0, 17) + "..." : cleanTitle;
            
            svgContent += `
                <g class="chart-bar-group" style="cursor: pointer;">
                    <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="url(#compBarGradSingle)" rx="4" ry="4">
                        <title>${item.title}\nAverage Score: ${score.toFixed(1)}%</title>
                    </rect>
                    <text x="${x + barWidth / 2}" y="${y - 4}" fill="var(--text-primary, #111827)" font-size="9.5" font-weight="700" text-anchor="middle">${score.toFixed(1)}%</text>
                    <text x="${x + barWidth / 2}" y="160" fill="var(--text-muted, #6b7280)" font-size="8.5" font-weight="600" text-anchor="middle">${displayTitle}</text>
                </g>
            `;
        });
        
        svgContent += `</svg>`;
        container.innerHTML = svgContent;
        return;
    }
    
    if (state.selectedReportUserIds && state.selectedReportUserIds.length > 1) {
        const comparisonUsers = ledgerList.filter(item => state.selectedReportUserIds.includes(item.user.id));
        
        if (comparisonUsers.length === 0) {
            container.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:center; height:100%; width:100%; border: 1px dashed var(--border-color); border-radius:8px;">
                    <span class="text-muted small-text">No scores available to compare</span>
                </div>
            `;
            return;
        }
        
        const maxScore = 100;
        let svgContent = `
        <svg viewBox="0 0 500 180" width="100%" height="100%" style="font-family: inherit;">
            <defs>
                <linearGradient id="compBarGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="var(--color-secondary, #a855f7)"/>
                    <stop offset="100%" stop-color="var(--color-primary, #6366f1)"/>
                </linearGradient>
            </defs>
        `;
        
        const gridLines = 4;
        for (let i = 0; i <= gridLines; i++) {
            const y = 15 + (130 * (1 - i / gridLines));
            const gridVal = i * 25;
            svgContent += `
                <line x1="40" y1="${y}" x2="480" y2="${y}" stroke="var(--border-color, #e5e7eb)" stroke-width="1" stroke-dasharray="3,3"/>
                <text x="30" y="${y + 4}" fill="var(--text-muted, #6b7280)" font-size="9" text-anchor="end">${gridVal}%</text>
            `;
        }
        
        const n = comparisonUsers.length;
        const spacing = 440 / n;
        const maxBarWidth = 46;
        const barWidth = Math.min(maxBarWidth, spacing * 0.6);
        
        comparisonUsers.forEach((item, i) => {
            const score = item.avgScore || 0;
            const barHeight = (score / maxScore) * 130;
            const x = 40 + (i * spacing) + (spacing - barWidth) / 2;
            const y = 145 - barHeight;
            const nameLabel = `${item.user.first_name} ${item.user.last_name.charAt(0)}.`;
            
            svgContent += `
                <g class="chart-bar-group" style="cursor: pointer;">
                    <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="url(#compBarGrad)" rx="3" ry="3">
                        <title>${item.user.first_name} ${item.user.last_name}\nAverage Score: ${score.toFixed(1)}%</title>
                    </rect>
                    <text x="${x + barWidth / 2}" y="${y - 4}" fill="var(--text-primary, #111827)" font-size="9.5" font-weight="700" text-anchor="middle">${score > 0 ? score.toFixed(1) + '%' : 'N/A'}</text>
                    <text x="${x + barWidth / 2}" y="160" fill="var(--text-muted, #6b7280)" font-size="8.5" font-weight="600" text-anchor="middle">${nameLabel}</text>
                </g>
            `;
        });
        
        svgContent += `</svg>`;
        container.innerHTML = svgContent;
        
        const cardHeader = container.parentElement.querySelector("h3");
        const cardSub = container.parentElement.querySelector("p");
        if (cardHeader) cardHeader.innerText = "Selected Staff Comparison";
        if (cardSub) cardSub.innerText = "Side-by-side performance averages of the selected roster.";
        return;
    }
    
    const cardHeader = container.parentElement.querySelector("h3");
    const cardSub = container.parentElement.querySelector("p");
    if (cardHeader) cardHeader.innerText = "Score Distribution Analytics";
    if (cardSub) cardSub.innerText = "Count of staff grouped by score brackets in active session.";
    
    const activeScored = ledgerList.filter(item => item.avgScore !== null);
    
    if (activeScored.length === 0) {
        container.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:center; height:100%; width:100%; border: 1px dashed var(--border-color); border-radius: 8px; padding: 20px;">
                <span class="text-muted small-text">No evaluation score data available for distribution chart</span>
            </div>
        `;
        return;
    }
    
    const brackets = [0, 0, 0, 0, 0];
    activeScored.forEach(item => {
        const score = item.avgScore;
        if (score < 60) brackets[0]++;
        else if (score < 70) brackets[1]++;
        else if (score < 80) brackets[2]++;
        else if (score < 90) brackets[3]++;
        else brackets[4]++;
    });
    
    const maxVal = Math.max(...brackets, 1);
    const labels = ["< 60%", "60-69%", "70-79%", "80-89%", "90-100%"];
    
    let svgContent = `
    <svg viewBox="0 0 500 180" width="100%" height="100%" style="font-family: inherit;">
        <defs>
            <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--color-primary, #6366f1)"/>
                <stop offset="100%" stop-color="var(--color-secondary, #a855f7)"/>
            </linearGradient>
        </defs>
    `;
    
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
        const y = 15 + (130 * (1 - i / gridLines));
        const gridVal = Math.round((maxVal * i) / gridLines);
        svgContent += `
            <line x1="40" y1="${y}" x2="480" y2="${y}" stroke="var(--border-color, #e5e7eb)" stroke-width="1" stroke-dasharray="3,3"/>
            <text x="30" y="${y + 4}" fill="var(--text-muted, #6b7280)" font-size="9" text-anchor="end">${gridVal}</text>
        `;
    }
    
    const barWidth = 46;
    const spacing = 88;
    for (let i = 0; i < 5; i++) {
        const count = brackets[i];
        const barHeight = (count / maxVal) * 130;
        const x = 40 + (i * spacing) + (spacing - barWidth) / 2;
        const y = 145 - barHeight;
        
        svgContent += `
            <g class="chart-bar-group" style="cursor: pointer;">
                <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="url(#barGrad)" rx="4" ry="4">
                    <title>Bracket: ${labels[i]}\nCount: ${count} staff member(s)</title>
                </rect>
                ${barHeight > 15 ? `<text x="${x + barWidth / 2}" y="${y - 4}" fill="var(--text-primary, #111827)" font-size="10" font-weight="700" text-anchor="middle">${count}</text>` : (count > 0 ? `<text x="${x + barWidth / 2}" y="${y - 4}" fill="var(--text-primary, #111827)" font-size="10" font-weight="700" text-anchor="middle">${count}</text>` : "")}
                <text x="${x + barWidth / 2}" y="160" fill="var(--text-muted, #6b7280)" font-size="9" text-anchor="middle">${labels[i]}</text>
            </g>
        `;
    }
    
    svgContent += `</svg>`;
    container.innerHTML = svgContent;
}

function drawScoreTrendChart(visibleAssessments) {
    const container = document.getElementById("report-chart-trend");
    if (!container) return;
    
    const titleEl = document.getElementById("report-trend-title");
    const subtitleEl = document.getElementById("report-trend-subtitle");
    
    // Check if multiple users are selected
    if (state.selectedReportUserIds && state.selectedReportUserIds.length > 1) {
        if (titleEl) titleEl.innerText = "Roster Performance Comparison Trend";
        if (subtitleEl) subtitleEl.innerText = "Chronological score trajectory compared across selected staff members.";
        
        const selectedUsers = state.selectedReportUserIds.map(id => state.db.users.find(u => u.id === id)).filter(Boolean);
        const colors = ["#6366f1", "#ec4899", "#10b981", "#f59e0b", "#8b5cf6", "#3b82f6"];
        
        let svgContent = `
        <svg viewBox="0 0 500 180" width="100%" height="100%" style="font-family: inherit;">
        `;
        
        const gridLines = 4;
        for (let i = 0; i <= gridLines; i++) {
            const y = 15 + (125 * (1 - i / gridLines));
            const gridVal = i * 25;
            svgContent += `
                <line x1="40" y1="${y}" x2="480" y2="${y}" stroke="var(--border-color, #e5e7eb)" stroke-width="1" stroke-dasharray="3,3"/>
                <text x="35" y="${y + 4}" fill="var(--text-muted, #6b7280)" font-size="9" text-anchor="end">${gridVal}%</text>
            `;
        }
        
        const userSeries = selectedUsers.map((u, userIdx) => {
            const userAss = state.db.assessments.filter(a => a.subject_id === u.id && a.session_id === state.db.activeSessionId && a.score);
            userAss.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            
            const points = userAss.map((a, idx) => {
                const d = new Date(a.created_at);
                const dStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                return {
                    dateStr: dStr,
                    score: parseFloat(a.score),
                    label: `#${idx+1}`
                };
            });
            
            return {
                user: u,
                points: points,
                color: colors[userIdx % colors.length]
            };
        }).filter(ser => ser.points.length > 0);
        
        if (userSeries.length === 0) {
            container.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:center; height:100%; width:100%; border: 1px dashed var(--border-color); border-radius: 8px; padding: 20px;">
                    <span class="text-muted small-text">No evaluation score trend data available for comparison</span>
                </div>
            `;
            return;
        }
        
        const maxPointsCount = Math.max(...userSeries.map(s => s.points.length), 2);
        const xStart = 50;
        const xEnd = 470;
        const widthSpan = xEnd - xStart;
        const stepX = widthSpan / (maxPointsCount - 1);
        
        userSeries.forEach(ser => {
            const ptCoords = ser.points.map((pt, idx) => {
                const x = xStart + (idx * stepX);
                const y = 15 + (125 * (1 - pt.score / 100));
                return { x, y, pt };
            });
            
            let pathD = `M ${ptCoords[0].x} ${ptCoords[0].y}`;
            for (let i = 1; i < ptCoords.length; i++) {
                pathD += ` L ${ptCoords[i].x} ${ptCoords[i].y}`;
            }
            
            svgContent += `<path d="${pathD}" fill="none" stroke="${ser.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
            
            ptCoords.forEach(pt => {
                svgContent += `
                    <g class="chart-point-group" style="cursor: pointer;">
                        <circle cx="${pt.x}" cy="${pt.y}" r="3" fill="var(--color-card, #ffffff)" stroke="${ser.color}" stroke-width="2.5">
                            <title>${ser.user.first_name} ${ser.user.last_name}\nDate: ${pt.pt.dateStr}\nScore: ${pt.pt.score.toFixed(1)}%</title>
                        </circle>
                        <text x="${pt.x}" y="${pt.y - 7}" fill="var(--text-primary, #111827)" font-size="8" font-weight="700" text-anchor="middle">${pt.pt.score.toFixed(0)}%</text>
                    </g>
                `;
            });
        });
        
        for (let i = 0; i < maxPointsCount; i++) {
            const x = xStart + (i * stepX);
            svgContent += `<text x="${x}" y="152" fill="var(--text-muted, #6b7280)" font-size="8.5" text-anchor="middle">Obs #${i+1}</text>`;
        }
        
        let legendY = 170;
        let legendX = 40;
        userSeries.forEach(ser => {
            const label = `${ser.user.first_name} ${ser.user.last_name.charAt(0)}.`;
            svgContent += `
                <g transform="translate(${legendX}, ${legendY})">
                    <rect x="0" y="-7" width="10" height="4" fill="${ser.color}" rx="1"/>
                    <text x="14" y="-3" fill="var(--text-primary, #111827)" font-size="8" font-weight="600">${label}</text>
                </g>
            `;
            legendX += 80;
        });
        
        svgContent += `</svg>`;
        container.innerHTML = svgContent;
        return;
    }
    
    // Check if a single staff member is selected
    const isSingleStaff = !!state.selectedReportUserId;
    const staffVal = state.selectedReportUserId;
    
    if (isSingleStaff) {
        const u = state.db.users.find(usr => usr.id === staffVal);
        if (titleEl) titleEl.innerText = `${u ? u.first_name + ' ' + u.last_name : 'Staff'} Performance Trend`;
        
        const userAss = state.db.assessments.filter(a => a.subject_id === staffVal && a.session_id === state.db.activeSessionId && a.score);
        userAss.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        
        if (userAss.length === 0) {
            if (subtitleEl) subtitleEl.innerText = "Chronological score trajectory of evaluations in active session.";
            container.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:center; height:100%; width:100%; border: 1px dashed var(--border-color); border-radius: 8px; padding: 20px;">
                    <span class="text-muted small-text">No evaluation score trend data available for this staff member</span>
                </div>
            `;
            return;
        }
        
        const dataPoints = userAss.map((a, idx) => {
            const d = new Date(a.created_at);
            const dStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            return {
                id: a.id,
                dateStr: dStr,
                score: parseFloat(a.score),
                label: `Obs #${idx+1}`
            };
        });
        
        if (dataPoints.length === 1) {
            dataPoints.unshift({
                dateStr: "Start",
                score: dataPoints[0].score,
                label: "Base"
            });
        }
        
        let trendAnalysisText = "";
        if (dataPoints.length >= 2) {
            const first = dataPoints[0].score;
            const last = dataPoints[dataPoints.length - 1].score;
            const diff = last - first;
            const diffPct = diff.toFixed(1);
            if (diff > 0) {
                trendAnalysisText = ` • Trend: +${diffPct}% Improvement (Start: ${first.toFixed(1)}%, Last: ${last.toFixed(1)}%) 📈`;
            } else if (diff < 0) {
                trendAnalysisText = ` • Trend: ${diffPct}% Decline (Start: ${first.toFixed(1)}%, Last: ${last.toFixed(1)}%) 📉`;
            } else {
                trendAnalysisText = ` • Trend: Stable (0.0% change)`;
            }
        }
        if (subtitleEl) {
            subtitleEl.innerHTML = `Chronological score trajectory of evaluations in active session.${trendAnalysisText}`;
        }
        
        let svgContent = `
        <svg viewBox="0 0 500 180" width="100%" height="100%" style="font-family: inherit;">
            <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="var(--color-primary, #6366f1)" stop-opacity="0.25"/>
                    <stop offset="100%" stop-color="var(--color-primary, #6366f1)" stop-opacity="0.00"/>
                </linearGradient>
            </defs>
        `;
        
        const gridLines = 4;
        for (let i = 0; i <= gridLines; i++) {
            const y = 15 + (130 * (1 - i / gridLines));
            const gridVal = i * 25;
            svgContent += `
                <line x1="40" y1="${y}" x2="480" y2="${y}" stroke="var(--border-color, #e5e7eb)" stroke-width="1" stroke-dasharray="3,3"/>
                <text x="35" y="${y + 4}" fill="var(--text-muted, #6b7280)" font-size="9" text-anchor="end">${gridVal}%</text>
            `;
        }
        
        const n = dataPoints.length;
        const xStart = 50;
        const xEnd = 470;
        const widthSpan = xEnd - xStart;
        const stepX = n > 1 ? widthSpan / (n - 1) : widthSpan;
        
        const points = dataPoints.map((dp, idx) => {
            const x = xStart + (idx * stepX);
            const y = 15 + (130 * (1 - dp.score / 100));
            return { x, y, dp };
        });
        
        let pathD = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
            pathD += ` L ${points[i].x} ${points[i].y}`;
        }
        
        let areaD = pathD + ` L ${points[points.length - 1].x} 145 L ${points[0].x} 145 Z`;
        
        svgContent += `<path d="${areaD}" fill="url(#areaGrad)"/>`;
        svgContent += `<path d="${pathD}" fill="none" stroke="var(--color-primary, #6366f1)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
        
        // Draw regression dashed trend line
        if (dataPoints.length >= 2) {
            let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
            const N = points.length;
            points.forEach((p, idx) => {
                const valX = idx;
                const valY = p.dp.score;
                sumX += valX;
                sumY += valY;
                sumXY += valX * valY;
                sumXX += valX * valX;
            });
            const denom = (N * sumXX) - (sumX * sumX);
            if (denom !== 0) {
                const slope = (N * sumXY - sumX * sumY) / denom;
                const intercept = (sumY - slope * sumX) / N;
                
                const yStartScore = intercept;
                const yEndScore = slope * (N - 1) + intercept;
                
                const yStart = 15 + (130 * (1 - yStartScore / 100));
                const yEnd = 15 + (130 * (1 - yEndScore / 100));
                
                const xStartPt = points[0].x;
                const xEndPt = points[points.length - 1].x;
                
                svgContent += `
                    <line x1="${xStartPt}" y1="${yStart}" x2="${xEndPt}" y2="${yEnd}" 
                          stroke="var(--color-secondary, #a855f7)" stroke-width="1.5" stroke-dasharray="4,4" opacity="0.8">
                        <title>Linear Regression Trend Line\nStart: ${yStartScore.toFixed(1)}%\nEnd: ${yEndScore.toFixed(1)}%</title>
                    </line>
                `;
            }
        }
        
        points.forEach((pt, idx) => {
            const isPointSelected = state.selectedReportAssessmentId ? (pt.dp.id === state.selectedReportAssessmentId) : false;
            
            svgContent += `
                <g class="chart-point-group" style="cursor: pointer;">
                    <circle cx="${pt.x}" cy="${pt.y}" r="${isPointSelected ? 6 : 4}" fill="${isPointSelected ? 'var(--color-secondary, #a855f7)' : 'var(--color-card, #ffffff)'}" stroke="var(--color-primary, #6366f1)" stroke-width="2">
                        <title>Date: ${pt.dp.dateStr}\nScore: ${pt.dp.score.toFixed(1)}%${isPointSelected ? ' (Selected)' : ''}</title>
                    </circle>
                    <text x="${pt.x}" y="${pt.y - (isPointSelected ? 10 : 8)}" fill="${isPointSelected ? 'var(--color-secondary, #a855f7)' : 'var(--text-primary, #111827)'}" font-size="${isPointSelected ? 10.5 : 9.5}" font-weight="700" text-anchor="middle">${pt.dp.score.toFixed(1)}%</text>
                    <text x="${pt.x}" y="152" fill="var(--text-muted, #6b7280)" font-size="8.5" text-anchor="middle">${pt.dp.label}</text>
                    <text x="${pt.x}" y="165" fill="var(--text-muted, #6b7280)" font-size="7.5" text-anchor="middle">${pt.dp.dateStr}</text>
                </g>
            `;
        });
        
        svgContent += `</svg>`;
        container.innerHTML = svgContent;
        return;
    }
    
    if (titleEl) titleEl.innerText = "Organizational Score Trend";
    if (subtitleEl) subtitleEl.innerText = "Performance trajectory over time based on evaluation date.";
    
    const scoredAssessments = visibleAssessments.filter(a => a.score);
    
    if (scoredAssessments.length === 0) {
        container.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:center; height:100%; width:100%; border: 1px dashed var(--border-color); border-radius: 8px; padding: 20px;">
                <span class="text-muted small-text">No evaluation score trend data available</span>
            </div>
        `;
        return;
    }
    
    const groups = {};
    scoredAssessments.forEach(a => {
        const d = new Date(a.created_at);
        const dStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        if (!groups[dStr]) {
            groups[dStr] = {
                sum: 0,
                count: 0,
                timestamp: d.getTime(),
                dateStr: dStr
            };
        }
        groups[dStr].sum += parseFloat(a.score);
        groups[dStr].count++;
    });
    
    const dataPoints = Object.values(groups).map(g => ({
        dateStr: g.dateStr,
        score: g.sum / g.count,
        timestamp: g.timestamp
    }));
    
    dataPoints.sort((a, b) => a.timestamp - b.timestamp);
    
    if (dataPoints.length === 1) {
        dataPoints.unshift({
            dateStr: "Start",
            score: dataPoints[0].score,
            timestamp: dataPoints[0].timestamp - 86400000
        });
    }
    
    const displayPoints = dataPoints.slice(-8);
    
    let svgContent = `
    <svg viewBox="0 0 500 180" width="100%" height="100%" style="font-family: inherit;">
        <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--color-primary, #6366f1)" stop-opacity="0.25"/>
                <stop offset="100%" stop-color="var(--color-primary, #6366f1)" stop-opacity="0.00"/>
            </linearGradient>
        </defs>
    `;
    
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
        const y = 15 + (130 * (1 - i / gridLines));
        const gridVal = i * 25;
        svgContent += `
            <line x1="40" y1="${y}" x2="480" y2="${y}" stroke="var(--border-color, #e5e7eb)" stroke-width="1" stroke-dasharray="3,3"/>
            <text x="35" y="${y + 4}" fill="var(--text-muted, #6b7280)" font-size="9" text-anchor="end">${gridVal}%</text>
        `;
    }
    
    const n = displayPoints.length;
    const xStart = 50;
    const xEnd = 470;
    const widthSpan = xEnd - xStart;
    const stepX = n > 1 ? widthSpan / (n - 1) : widthSpan;
    
    const points = displayPoints.map((dp, idx) => {
        const x = xStart + (idx * stepX);
        const y = 15 + (130 * (1 - dp.score / 100));
        return { x, y, dp };
    });
    
    let pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
        pathD += ` L ${points[i].x} ${points[i].y}`;
    }
    
    let areaD = pathD + ` L ${points[points.length - 1].x} 145 L ${points[0].x} 145 Z`;
    
    svgContent += `<path d="${areaD}" fill="url(#areaGrad)"/>`;
    svgContent += `<path d="${pathD}" fill="none" stroke="var(--color-primary, #6366f1)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    
    points.forEach((pt, idx) => {
        svgContent += `
            <g class="chart-point-group" style="cursor: pointer;">
                <circle cx="${pt.x}" cy="${pt.y}" r="4" fill="var(--color-card, #ffffff)" stroke="var(--color-primary, #6366f1)" stroke-width="2">
                    <title>Date: ${pt.dp.dateStr}\nScore: ${pt.dp.score.toFixed(1)}%</title>
                </circle>
                <text x="${pt.x}" y="${pt.y - 8}" fill="var(--text-primary, #111827)" font-size="9" font-weight="700" text-anchor="middle">${pt.dp.score.toFixed(1)}%</text>
                <text x="${pt.x}" y="160" fill="var(--text-muted, #6b7280)" font-size="8.5" text-anchor="middle">${pt.dp.dateStr}</text>
            </g>
        `;
    });
    
    svgContent += `</svg>`;
    container.innerHTML = svgContent;
}

function getStaffCompetencyAnalysis(userId) {
    const userAss = state.db.assessments.filter(a => a.subject_id === userId && a.session_id === state.db.activeSessionId && a.score);
    const sectionScores = {};
    
    userAss.forEach(ass => {
        const tmpl = state.db.templates.find(t => t.id === ass.template_id);
        if (!tmpl) return;
        
        tmpl.sections.forEach(sec => {
            let secMax = 0;
            let secEarned = 0;
            let hasValid = false;
            
            sec.items.forEach(item => {
                if (item.item_type === "choice" && item.choices) {
                    const resp = ass.responses[item.id];
                    if (resp && !resp.is_na) {
                        const chosenOpt = item.choices.find(c => c.id === resp.selected_choice_id);
                        if (chosenOpt) {
                            const maxPoints = Math.max(...item.choices.map(c => c.points || 0));
                            secMax += maxPoints;
                            secEarned += (chosenOpt.points || 0);
                            hasValid = true;
                        }
                    }
                }
            });
            
            if (hasValid && secMax > 0) {
                const pct = (secEarned / secMax) * 100;
                if (!sectionScores[sec.title]) {
                    sectionScores[sec.title] = { sum: 0, count: 0 };
                }
                sectionScores[sec.title].sum += pct;
                sectionScores[sec.title].count++;
            }
        });
    });
    
    const list = [];
    for (const title in sectionScores) {
        list.push({
            title: title,
            avg: sectionScores[title].sum / sectionScores[title].count
        });
    }
    
    list.sort((a, b) => b.avg - a.avg);
    return list;
}

function getAssessmentCompetencyAnalysis(assessmentId) {
    const ass = state.db.assessments.find(a => a.id === assessmentId);
    if (!ass || !ass.score) return [];
    
    const tmpl = state.db.templates.find(t => t.id === ass.template_id);
    if (!tmpl) return [];
    
    const list = [];
    tmpl.sections.forEach(sec => {
        let secMax = 0;
        let secEarned = 0;
        let hasValid = false;
        
        sec.items.forEach(item => {
            if (item.item_type === "choice" && item.choices) {
                const resp = ass.responses[item.id];
                if (resp && !resp.is_na) {
                    const chosenOpt = item.choices.find(c => c.id === resp.selected_choice_id);
                    if (chosenOpt) {
                        const maxPoints = Math.max(...item.choices.map(c => c.points || 0));
                        secMax += maxPoints;
                        secEarned += (chosenOpt.points || 0);
                        hasValid = true;
                    }
                }
            }
        });
        
        if (hasValid && secMax > 0) {
            list.push({
                title: sec.title,
                avg: (secEarned / secMax) * 100
            });
        }
    });
    
    list.sort((a, b) => b.avg - a.avg);
    return list;
}

function renderObservationsLogList(userId) {
    const listContainer = document.getElementById("report-observations-list");
    if (!listContainer) return;
    listContainer.innerHTML = "";
    
    const sortVal = document.getElementById("report-observations-sort")?.value || "date_desc";
    const userAss = state.db.assessments.filter(a => a.subject_id === userId && a.session_id === state.db.activeSessionId);
    
    if (sortVal === "date_desc") {
        userAss.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else {
        userAss.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }
    
    if (userAss.length === 0) {
        listContainer.innerHTML = `<span class="text-muted small-text" style="text-align:center; padding: 10px 0;">No observations filed in this session.</span>`;
        return;
    }

    // Add "All Audits Combined" row at the top
    const allRow = document.createElement("div");
    allRow.style.display = "flex";
    allRow.style.justifyContent = "space-between";
    allRow.style.alignItems = "center";
    allRow.style.padding = "6px 8px";
    allRow.style.borderRadius = "4px";
    allRow.style.cursor = "pointer";
    
    const isAllSelected = !state.selectedReportAssessmentId;
    if (isAllSelected) {
        allRow.style.background = "rgba(99, 102, 241, 0.08)";
        allRow.style.border = "1px solid var(--color-primary)";
    } else {
        allRow.style.background = "rgba(255,255,255,0.02)";
        allRow.style.border = "1px solid var(--border-color)";
    }
    
    allRow.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px; flex:1;">
            <span style="font-size:14px;">📊</span>
            <strong style="font-size:11.5px; color:var(--text-primary);">All Audits Combined</strong>
        </div>
        <span style="font-size:10px; color:var(--text-muted); font-weight:600; text-transform:uppercase; margin-right:4px;">${isAllSelected ? "Active" : "Select"}</span>
    `;
    
    allRow.addEventListener("click", () => {
        state.selectedReportAssessmentId = null;
        renderAnalytics();
    });
    listContainer.appendChild(allRow);
    
    userAss.forEach(ass => {
        const tmpl = state.db.templates.find(t => t.id === ass.template_id);
        const name = tmpl ? tmpl.name : "Custom Roster Evaluation";
        const dateStr = new Date(ass.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        const scoreStr = ass.score ? `${ass.score.toFixed(1)}%` : "--";
        const isAppraisal = tmpl && tmpl.category !== "academic" && tmpl.category !== "academic_daily";
        const badgeClass = isAppraisal ? "secondary" : "primary";
        const badgeLabel = isAppraisal ? "Appraisal" : "Observation";
        
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.padding = "6px 8px";
        row.style.borderRadius = "4px";
        row.style.cursor = "pointer";
        
        const isSelected = state.selectedReportAssessmentId === ass.id;
        if (isSelected) {
            row.style.background = "rgba(99, 102, 241, 0.08)";
            row.style.border = "1px solid var(--color-primary)";
        } else {
            row.style.background = "rgba(255,255,255,0.02)";
            row.style.border = "1px solid var(--border-color)";
        }
        
        row.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:2px; flex:1; min-width:0; margin-right:8px;">
                <div style="display:flex; align-items:center; gap:6px;">
                    <span class="badge ${badgeClass}" style="font-size:8px; padding:2px 4px; border-radius:3px;">${badgeLabel}</span>
                    <strong style="font-size:11.5px; color:var(--text-primary); text-overflow:ellipsis; overflow:hidden; white-space:nowrap; display:block; max-width:180px;">${name}</strong>
                </div>
                <span style="font-size:10px; color:var(--text-muted);">${dateStr} &bull; Score: <strong style="color:var(--color-primary);">${scoreStr}</strong></span>
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
                <span style="font-size:10px; color:var(--text-muted); font-weight:600; text-transform:uppercase; margin-right:4px;">${isSelected ? "Active" : ""}</span>
                <button class="small-btn secondary-btn" style="padding: 2px 6px; font-size:10px;" onclick="event.stopPropagation(); openAppraisalFromDashboard('${ass.id}')">View Form</button>
            </div>
        `;
        
        row.addEventListener("click", () => {
            state.selectedReportAssessmentId = ass.id;
            renderAnalytics();
        });
        
        listContainer.appendChild(row);
    });
}

function renderComparisonPane() {
    const tbody = document.getElementById("comparison-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    
    const selectedUsers = state.selectedReportUserIds.map(id => state.db.users.find(u => u.id === id)).filter(Boolean);
    
    const comparisonList = [];
    selectedUsers.forEach(u => {
        const userAss = state.db.assessments.filter(a => a.subject_id === u.id && a.session_id === state.db.activeSessionId && a.score);
        const scores = userAss.map(a => parseFloat(a.score));
        const avgScore = scores.length > 0 ? (scores.reduce((s, x) => s + x, 0) / scores.length) : null;
        
        const signedOffCount = userAss.filter(a => a.status === "signed_off").length;
        const complianceRate = userAss.length > 0 ? Math.round((signedOffCount / userAss.length) * 100) : 100;
        
        const sortedUserAss = [...userAss].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        let trendStr = "--";
        let trendColor = "var(--text-muted)";
        if (sortedUserAss.length >= 2) {
            const diff = parseFloat(sortedUserAss[sortedUserAss.length - 1].score) - parseFloat(sortedUserAss[0].score);
            trendStr = diff >= 0 ? `+${diff.toFixed(1)}% 📈` : `${diff.toFixed(1)}% 📉`;
            trendColor = diff >= 0 ? "var(--color-success)" : "var(--color-danger)";
        }
        
        comparisonList.push({
            user: u,
            avgScore: avgScore,
            count: userAss.length,
            complianceRate: complianceRate,
            trendStr: trendStr,
            trendColor: trendColor
        });
    });
    
    comparisonList.forEach(item => {
        const scoreStr = item.avgScore !== null ? `${item.avgScore.toFixed(1)}%` : "N/A";
        const tr = document.createElement("tr");
        const roleLabel = getRoleLabel(item.user);
        
        tr.innerHTML = `
            <td>
                <div style="display:flex; align-items:center; gap:6px;">
                    <img src="${item.user.avatar}" class="avatar" style="width:20px; height:20px;">
                    <strong>${item.user.first_name} ${item.user.last_name}</strong>
                </div>
            </td>
            <td><span class="badge secondary" style="font-size:9px;">${roleLabel}</span></td>
            <td><strong style="color:${item.avgScore >= 80 ? 'var(--color-success)' : (item.avgScore >= 60 ? 'var(--color-warning)' : 'var(--color-danger)')}">${scoreStr}</strong></td>
            <td>${item.count}</td>
            <td><strong style="color:${item.complianceRate >= 80 ? 'var(--color-success)' : 'var(--color-warning)'}">${item.complianceRate}%</strong></td>
            <td><strong style="color:${item.trendColor}">${item.trendStr}</strong></td>
        `;
        tbody.appendChild(tr);
    });
    
    const comparisonText = document.getElementById("comparison-insight-text");
    if (comparisonText) {
        const names = comparisonList.map(item => item.user.first_name).join(", ");
        const highPerformer = comparisonList.reduce((prev, current) => {
            if (prev.avgScore === null) return current;
            if (current.avgScore === null) return prev;
            return prev.avgScore > current.avgScore ? prev : current;
        }, { avgScore: null });
        
        if (highPerformer.avgScore !== null) {
            comparisonText.innerHTML = `Comparing <strong>${names}</strong>. High performer is <strong>${highPerformer.user.first_name} ${highPerformer.user.last_name}</strong> with a score of <strong>${highPerformer.avgScore.toFixed(1)}%</strong>. Review their respective line trajectories in the trend graph to see observation progressions.`;
        } else {
            comparisonText.innerHTML = `Comparing <strong>${names}</strong>. No evaluation data available yet for this session scope.`;
        }
    }
    
    const comparisonBox = document.getElementById("comparison-ai-draft-box");
    if (comparisonBox) comparisonBox.classList.add("hidden");
}

function renderDirectivesPane() {
    const emptyState = document.getElementById("directive-empty-state");
    const contentArea = document.getElementById("directive-content-area");
    const comparisonArea = document.getElementById("comparison-content-area");
    
    if (state.selectedReportUserIds && state.selectedReportUserIds.length > 1) {
        if (emptyState) emptyState.classList.add("hidden");
        if (contentArea) contentArea.classList.add("hidden");
        if (comparisonArea) comparisonArea.classList.remove("hidden");
        renderComparisonPane();
        return;
    }
    
    if (comparisonArea) comparisonArea.classList.add("hidden");
    
    if (!state.selectedReportUserId) {
        if (emptyState) emptyState.classList.remove("hidden");
        if (contentArea) contentArea.classList.add("hidden");
        return;
    }
    
    const user = state.db.users.find(u => u.id === state.selectedReportUserId);
    if (!user) {
        if (emptyState) emptyState.classList.remove("hidden");
        if (contentArea) contentArea.classList.add("hidden");
        return;
    }
    
    if (emptyState) emptyState.classList.add("hidden");
    if (contentArea) contentArea.classList.remove("hidden");
    
    document.getElementById("directive-staff-avatar").src = user.avatar;
    document.getElementById("directive-staff-name").innerText = `${user.first_name} ${user.last_name}`;
    const roleLabel = getRoleLabel(user);
    document.getElementById("directive-staff-role").innerText = roleLabel;
    
    const userAss = state.db.assessments.filter(a => a.subject_id === user.id && a.session_id === state.db.activeSessionId && a.score);
    const scores = userAss.map(a => parseFloat(a.score));
    const avgScore = scores.length > 0 ? (scores.reduce((s, x) => s + x, 0) / scores.length) : null;
    
    const scoreVal = document.getElementById("directive-staff-score");
    if (avgScore !== null) {
        scoreVal.innerText = `${avgScore.toFixed(1)}%`;
        scoreVal.style.color = avgScore >= 80 ? 'var(--color-success)' : (avgScore >= 60 ? 'var(--color-warning)' : 'var(--color-danger)');
    } else {
        scoreVal.innerText = "N/A";
        scoreVal.style.color = "var(--text-muted)";
    }
    
    const visualsContainer = document.getElementById("directive-competency-visuals");
    if (visualsContainer) {
        visualsContainer.innerHTML = "";
        const analysis = getStaffCompetencyAnalysis(user.id);
        
        if (analysis.length === 0) {
            visualsContainer.innerHTML = `
                <div style="width:100%; border:1px dashed var(--border-color); border-radius:8px; padding:10px; text-align:center;">
                    <span class="text-muted small-text">No evaluation data available to map core strengths.</span>
                </div>
            `;
        } else {
            const str = analysis[0];
            const wk = analysis.length > 1 ? analysis[analysis.length - 1] : null;
            
            let strengthTitle = str.title.replace("SECTION A - ", "").replace("SECTION B - ", "");
            let strengthPct = str.avg.toFixed(0);
            
            let html = `
                <div style="flex:1; min-width:140px; padding:10px; border-radius:8px; border-left:4px solid var(--color-success); background:rgba(16, 185, 129, 0.04); display:flex; flex-direction:column; gap:4px;">
                    <span style="font-size:10px; font-weight:700; color:var(--color-success); text-transform:uppercase; display:flex; align-items:center; gap:4px;">
                        🌟 Key Strength (${strengthPct}%)
                    </span>
                    <span style="font-size:11.5px; font-weight:600; color:var(--text-primary); line-height:1.3;">${strengthTitle}</span>
                </div>
            `;
            
            if (wk && wk.title !== str.title) {
                let weaknessTitle = wk.title.replace("SECTION A - ", "").replace("SECTION B - ", "");
                let weaknessPct = wk.avg.toFixed(0);
                html += `
                    <div style="flex:1; min-width:140px; padding:10px; border-radius:8px; border-left:4px solid var(--color-danger); background:rgba(239, 68, 68, 0.04); display:flex; flex-direction:column; gap:4px;">
                        <span style="font-size:10px; font-weight:700; color:var(--color-danger); text-transform:uppercase; display:flex; align-items:center; gap:4px;">
                            ⚠️ Focus Growth Area (${weaknessPct}%)
                        </span>
                        <span style="font-size:11.5px; font-weight:600; color:var(--text-primary); line-height:1.3;">${weaknessTitle}</span>
                    </div>
                `;
            }
            visualsContainer.innerHTML = html;
        }
    }
    
    const coachingBox = document.getElementById("directive-coaching-box");
    const coachingText = document.getElementById("directive-coaching-text");
    
    if (avgScore === null) {
        coachingBox.style.borderLeftColor = "var(--text-muted)";
        coachingBox.style.background = "rgba(255,255,255,0.02)";
        coachingText.innerText = "No evaluation scores recorded for this staff member in the active session. Directives can be set for general development goals.";
    } else if (avgScore < 60) {
        coachingBox.style.borderLeftColor = "var(--color-danger)";
        coachingBox.style.background = "rgba(239, 68, 68, 0.05)";
        coachingText.innerText = "Critical intervention required: Mandatory coordinator observation & co-teaching plan within 7 days. Weekly structured lesson plan audits. Weekly coaching meetings.";
    } else if (avgScore >= 60 && avgScore < 80) {
        coachingBox.style.borderLeftColor = "var(--color-warning)";
        coachingBox.style.background = "rgba(251, 191, 36, 0.05)";
        coachingText.innerText = "Targeted growth recommended: Schedule peer observations of high-performing faculty. Focus on exit checks and student engagement triggers. Monthly review of feedback implementation.";
    } else {
        coachingBox.style.borderLeftColor = "var(--color-success)";
        coachingBox.style.background = "rgba(16, 185, 129, 0.05)";
        coachingText.innerText = "Acknowledge excellence and leverage: Showcase teaching methods in peer workshops. Assign mentoring responsibilities for junior faculty.";
    }
    
    renderObservationsLogList(user.id);
    
    state.db.directives = state.db.directives || [];
    const key = `${state.db.activeSessionId}_${user.id}`;
    const dir = state.db.directives.find(d => d.key === key);
    
    const textarea = document.getElementById("report-directive-notes");
    if (textarea) {
        textarea.value = dir ? dir.notes : "";
    }
}

function draftAIPerformanceNarrative() {
    const userId = state.selectedReportUserId;
    if (!userId) return;
    
    const user = state.db.users.find(u => u.id === userId);
    if (!user) return;
    
    const draftBox = document.getElementById("report-ai-draft-box");
    const loader = document.getElementById("report-ai-draft-loader");
    const content = document.getElementById("report-ai-draft-content");
    const narrativeText = document.getElementById("report-ai-narrative-text");
    
    if (!draftBox || !loader || !content || !narrativeText) return;
    
    draftBox.classList.remove("hidden");
    loader.classList.remove("hidden");
    content.classList.add("hidden");
    
    const roleLabel = getRoleLabel(user);
    const userAss = state.db.assessments.filter(a => a.subject_id === user.id && a.session_id === state.db.activeSessionId && a.score);
    const scores = userAss.map(a => parseFloat(a.score));
    const avgScore = scores.length > 0 ? (scores.reduce((s, x) => s + x, 0) / scores.length) : null;
    const auditCount = userAss.length;
    
    setTimeout(() => {
        let narrative = "";
        const name = `${user.first_name} ${user.last_name}`;
        
        if (avgScore === null) {
            narrative = `**AI PERFORMANCE EVALUATION REPORT (COPILOT)**\n**Subject:** ${name} (${roleLabel})\n**Session:** ${state.db.activeSessionId}\n\n*Status Note:* No evaluation scores are currently logged for this staff member in the active session.\n\n**Recommended Actions:**\n1. Establish initial baseline: Schedule a primary classroom observation or professional walkthrough.\n2. Professional Alignment: Conduct an annual goal-setting review session within the next 14 days to map core targets.`;
        } else if (avgScore >= 90) {
            narrative = `**AI PERFORMANCE EVALUATION REPORT (COPILOT)**\n**Subject:** ${name} (${roleLabel})\n**Session:** ${state.db.activeSessionId}\n**Evaluation Metrics:** ${avgScore.toFixed(1)}% Avg (based on ${auditCount} audits)\n**Performance Tier:** Tier 1 - Exceptional Excellence\n\n**Core Analysis:**\n${name} exhibits exemplary performance in professional competency. Classroom environment and planning metrics consistently score in the top decile. Observations indicate strong pedagogical execution and proactive student engagement.\n\n**Actionable Coaching Blueprint:**\n1. **Mentorship Pathway:** Designate as a Lead Peer Mentor to support junior faculty in lesson planning and structure.\n2. **Best Practices Workshop:** Invite to facilitate a 20-minute session on student engagement during the upcoming staff development seminar.\n3. **Growth Goal:** Expand research-based teaching modules to further push advanced learning tracks.`;
        } else if (avgScore >= 80) {
            narrative = `**AI PERFORMANCE EVALUATION REPORT (COPILOT)**\n**Subject:** ${name} (${roleLabel})\n**Session:** ${state.db.activeSessionId}\n**Evaluation Metrics:** ${avgScore.toFixed(1)}% Avg (based on ${auditCount} audits)\n**Performance Tier:** Tier 2 - High Proficient\n\n**Core Analysis:**\n${name} shows a strong grasp of professional duties and lesson execution. General indicators meet or exceed institutional standards. There is a high rate of compliance and positive instructional delivery.\n\n**Actionable Coaching Blueprint:**\n1. **Targeted refinement:** Refine exit check structures and formative assessment techniques to ensure 100% check-for-understanding loop.\n2. **Peer collaboration:** Schedule one peer observation with a Tier 1 colleague to study advanced lesson closure methods.\n3. **Action Step:** Implement a 5-minute digital exit card matrix on mobile tablets for real-time tracking.`;
        } else if (avgScore >= 60) {
            narrative = `**AI PERFORMANCE EVALUATION REPORT (COPILOT)**\n**Subject:** ${name} (${roleLabel})\n**Session:** ${state.db.activeSessionId}\n**Evaluation Metrics:** ${avgScore.toFixed(1)}% Avg (based on ${auditCount} audits)\n**Performance Tier:** Tier 3 - Developing Standard\n\n**Core Analysis:**\n${name} demonstrates standard competence but has notable performance variance. Major areas of growth include student response ratios, exit ticket strategies, and classroom pacing. Consistent structure is required to improve learner outcome ratings.\n\n**Actionable Coaching Blueprint:**\n1. **Structured Intervention:** Conduct bi-weekly 10-minute micro-walkthroughs focusing on the first 15 minutes of lesson transitions.\n2. **Lesson Plan Audits:** Review weekly lesson planning submissions every Friday with written feedback loops.\n3. **Professional Development:** Direct participation in the classroom management masterclass with focus on positive behavior reinforcement.`;
        } else {
            narrative = `**AI PERFORMANCE EVALUATION REPORT (COPILOT)**\n**Subject:** ${name} (${roleLabel})\n**Session:** ${state.db.activeSessionId}\n**Evaluation Metrics:** ${avgScore.toFixed(1)}% Avg (based on ${auditCount} audits)\n**Performance Tier:** Tier 4 - Critical Support Phase\n\n**Core Analysis:**\nSignificant competency gaps identified. Evaluation records indicate systemic concerns in classroom management, student alignment, and lesson pacing. Immediate coaching and formal growth structures are mandatory.\n\n**Actionable Coaching Blueprint:**\n1. **Mandatory Co-Teaching:** Pair with a Grade Coordinator or Senior Coach for 2 co-taught sessions per week for the next 21 days.\n2. **Weekly Performance Audits:** Schedule formal observations every Tuesday with immediate post-session alignment feedback.\n3. **Growth Checklist:** Define a strict 30-day performance improvement plan (PIP) targeting lesson start routines and behavior trackers.`;
        }
        
        narrativeText.innerText = narrative;
        loader.classList.add("hidden");
        content.classList.remove("hidden");
    }, 1500);
}

function insertAINarrative() {
    const textarea = document.getElementById("report-directive-notes");
    const narrativeText = document.getElementById("report-ai-narrative-text");
    if (textarea && narrativeText) {
        const currentVal = textarea.value.trim();
        textarea.value = currentVal ? `${currentVal}\n\n${narrativeText.innerText}` : narrativeText.innerText;
        Toaster.success("AI Narrative inserted into Action Plan notes.");
    }
}

function draftAIComparisonNarrative() {
    const selectedUsers = state.selectedReportUserIds.map(id => state.db.users.find(u => u.id === id)).filter(Boolean);
    if (selectedUsers.length === 0) return;
    
    const draftBox = document.getElementById("comparison-ai-draft-box");
    const loader = document.getElementById("comparison-ai-draft-loader");
    const content = document.getElementById("comparison-ai-draft-content");
    const narrativeText = document.getElementById("comparison-ai-narrative-text");
    
    if (!draftBox || !loader || !content || !narrativeText) return;
    
    draftBox.classList.remove("hidden");
    loader.classList.remove("hidden");
    content.classList.add("hidden");
    
    setTimeout(() => {
        let narrative = `**AI COHORT COMPARISON REPORT (COPILOT)**\n**Active Session:** ${state.db.activeSessionId}\n**Subjects:** ${selectedUsers.map(u => `${u.first_name} ${u.last_name}`).join(", ")}\n\n`;
        
        const list = selectedUsers.map(u => {
            const userAss = state.db.assessments.filter(a => a.subject_id === u.id && a.session_id === state.db.activeSessionId && a.score);
            const scores = userAss.map(a => parseFloat(a.score));
            const avg = scores.length > 0 ? (scores.reduce((s, x) => s + x, 0) / scores.length) : null;
            return {
                name: `${u.first_name} ${u.last_name}`,
                role: getRoleLabel(u),
                avg: avg,
                count: userAss.length
            };
        });
        
        const scored = list.filter(item => item.avg !== null);
        scored.sort((a, b) => b.avg - a.avg);
        
        if (scored.length > 0) {
            narrative += `**Comparative Analysis:**\n`;
            scored.forEach((item, idx) => {
                narrative += `${idx + 1}. **${item.name}** (${item.role}): Average score of **${item.avg.toFixed(1)}%** across **${item.count}** evaluation(s).\n`;
            });
            
            const gap = scored.length > 1 ? (scored[0].avg - scored[scored.length - 1].avg).toFixed(1) : 0;
            narrative += `\n**Key Cohort Findings:**\n`;
            narrative += `* Performance Spread: There is a **${gap}%** performance spread between the highest and lowest scoring staff members in this selection.\n`;
            
            narrative += `\n**Targeted Collaboration & Coaching Blueprint:**\n`;
            narrative += `1. **Peer Observations:** Recommend pairing **${scored[scored.length - 1].name}** to observe classroom methods of **${scored[0].name}** to study transition routines.\n`;
            narrative += `2. **Shared Best Practices:** Facilitate a joint planning meeting to align lesson exit-ticket configurations across subjects.\n`;
            narrative += `3. **Action Path:** Set bi-weekly checkpoints with Grade Coordinators to monitor growth progress for under-performing staff.`;
        } else {
            narrative += `No evaluations are currently filed for the selected staff cohort in this session scope. Establish initial baselines with observations.`;
        }
        
        narrativeText.innerText = narrative;
        loader.classList.add("hidden");
        content.classList.remove("hidden");
    }, 1500);
}

function initAnalytics() {

    const startFilter = document.getElementById("report-filter-start");
    const endFilter = document.getElementById("report-filter-end");
    const resetBtn = document.getElementById("btn-report-reset");
    
    const ledgerSearch = document.getElementById("report-ledger-search");
    const ledgerSort = document.getElementById("report-ledger-sort");
    
    const saveDirectiveBtn = document.getElementById("btn-save-directive");
    
    const deptFilter = document.getElementById("report-filter-dept");
    const categoryFilter = document.getElementById("report-filter-category");
    const staffFilter = document.getElementById("report-filter-staff");
    const auditFilter = document.getElementById("report-filter-audit");
    const classFilter = document.getElementById("report-filter-class");
    const sectionFilter = document.getElementById("report-filter-section");
    
    const aiDraftBtn = document.getElementById("btn-report-ai-draft");
    const aiInsertBtn = document.getElementById("btn-report-ai-insert");
    const aiCloseBtn = document.getElementById("btn-report-ai-close");
    
    const selectAllCheck = document.getElementById("report-ledger-select-all");
    const obsSort = document.getElementById("report-observations-sort");
    
    const comparisonAiDraftBtn = document.getElementById("btn-comparison-ai-draft");
    const comparisonAiCloseBtn = document.getElementById("btn-comparison-ai-close");
    
    if (deptFilter) {
        deptFilter.addEventListener("change", () => {
            renderAnalytics();
        });
    }
    
    if (categoryFilter) {
        categoryFilter.addEventListener("change", () => {
            renderAnalytics();
        });
    }
    
    if (staffFilter) {
        staffFilter.addEventListener("change", () => {
            const val = staffFilter.value;
            if (val === "all") {
                state.selectedReportUserId = null;
                state.selectedReportUserIds = [];
            } else {
                state.selectedReportUserId = val;
                state.selectedReportUserIds = [val];
            }
            state.selectedReportAssessmentId = null;
            
            renderAnalytics();
        });
    }
    
    if (auditFilter) {
        auditFilter.addEventListener("change", () => {
            const val = auditFilter.value;
            if (val === "all") {
                state.selectedReportAssessmentId = null;
            } else {
                state.selectedReportAssessmentId = val;
            }
            
            renderAnalytics();
        });
    }
    
    if (classFilter) {
        classFilter.addEventListener("change", () => {
            renderAnalytics();
        });
    }
    
    if (sectionFilter) {
        sectionFilter.addEventListener("change", () => {
            renderAnalytics();
        });
    }
    
    if (startFilter) {
        startFilter.addEventListener("change", () => renderAnalytics());
    }
    
    if (endFilter) {
        endFilter.addEventListener("change", () => renderAnalytics());
    }
    
    if (resetBtn) {
        resetBtn.addEventListener("click", () => {
            if (categoryFilter) categoryFilter.value = "all";
            populateReportDeptFilter();
            if (deptFilter) deptFilter.value = "all";
            if (startFilter) startFilter.value = "";
            if (endFilter) endFilter.value = "";
            if (ledgerSearch) ledgerSearch.value = "";
            if (staffFilter) staffFilter.value = "all";
            if (auditFilter) auditFilter.value = "all";
            if (classFilter) classFilter.value = "all";
            if (sectionFilter) sectionFilter.value = "all";
            state.selectedReportUserId = null;
            state.selectedReportUserIds = [];
            state.selectedReportAssessmentId = null;
            
            const draftBox = document.getElementById("report-ai-draft-box");
            if (draftBox) draftBox.classList.add("hidden");
            const comparisonBox = document.getElementById("comparison-ai-draft-box");
            if (comparisonBox) comparisonBox.classList.add("hidden");
            
            renderAnalytics();
        });
    }
    
    if (ledgerSearch) {
        ledgerSearch.addEventListener("input", () => renderAnalyticsLedgerOnly());
    }
    
    if (ledgerSort) {
        ledgerSort.addEventListener("change", () => renderAnalyticsLedgerOnly());
    }
    
    if (aiDraftBtn) {
        aiDraftBtn.addEventListener("click", () => {
            draftAIPerformanceNarrative();
        });
    }
    
    if (aiInsertBtn) {
        aiInsertBtn.addEventListener("click", () => {
            insertAINarrative();
        });
    }
    
    if (aiCloseBtn) {
        aiCloseBtn.addEventListener("click", () => {
            const draftBox = document.getElementById("report-ai-draft-box");
            if (draftBox) draftBox.classList.add("hidden");
        });
    }
    
    if (selectAllCheck) {
        selectAllCheck.addEventListener("change", (e) => {
            const visibleUsers = getFilteredUsers();
            const visibleIds = visibleUsers.map(u => u.id);
            
            if (e.target.checked) {
                visibleIds.forEach(id => {
                    if (!state.selectedReportUserIds.includes(id)) {
                        state.selectedReportUserIds.push(id);
                    }
                });
            } else {
                state.selectedReportUserIds = state.selectedReportUserIds.filter(id => !visibleIds.includes(id));
            }
            
            if (state.selectedReportUserIds.length === 1) {
                state.selectedReportUserId = state.selectedReportUserIds[0];
            } else {
                state.selectedReportUserId = null;
            }
            state.selectedReportAssessmentId = null;
            
            renderAnalytics();
        });
    }
    
    if (obsSort) {
        obsSort.addEventListener("change", () => {
            if (state.selectedReportUserId) {
                renderObservationsLogList(state.selectedReportUserId);
            }
        });
    }
    
    if (comparisonAiDraftBtn) {
        comparisonAiDraftBtn.addEventListener("click", () => {
            draftAIComparisonNarrative();
        });
    }
    
    if (comparisonAiCloseBtn) {
        comparisonAiCloseBtn.addEventListener("click", () => {
            const comparisonBox = document.getElementById("comparison-ai-draft-box");
            if (comparisonBox) comparisonBox.classList.add("hidden");
        });
    }
    
    if (saveDirectiveBtn) {
        saveDirectiveBtn.addEventListener("click", () => {
            const notesTextarea = document.getElementById("report-directive-notes");
            if (!notesTextarea || !state.selectedReportUserId) return;
            
            state.db.directives = state.db.directives || [];
            const key = `${state.db.activeSessionId}_${state.selectedReportUserId}`;
            let dir = state.db.directives.find(d => d.key === key);
            if (!dir) {
                dir = {
                    key: key,
                    session_id: state.db.activeSessionId,
                    user_id: state.selectedReportUserId
                };
                state.db.directives.push(dir);
            }
            dir.notes = notesTextarea.value.trim();
            dir.updated_at = new Date().toISOString();
            state.saveDatabase();
            Toaster.success("Action plan directives saved successfully.");
        });
    }
}

// =========================================================================
// 13. AI INSIGHTS WORKBENCH
// =========================================================================
function renderAIInsights() {
    const select = document.getElementById("ai-subject-select");
    select.innerHTML = "";
    
    const visibleUsers = state.db.users.filter(u => {
        if (u.role !== "staff_member") return false;
        if (state.activeRole === "dept_head") {
            return u.dept_id === "dept-teach";
        }
        return true;
    });

    visibleUsers.forEach(u => {
        select.innerHTML += `<option value="${u.id}">${u.first_name} ${u.last_name} (${u.email})</option>`;
    });

    const scopeSelect = document.getElementById("ai-scope-select");
    const wrapper = document.getElementById("ai-subject-select-wrapper");
    
    scopeSelect.addEventListener("change", (e) => {
        if (e.target.value === "subject") {
            wrapper.classList.remove("hidden");
        } else {
            wrapper.classList.add("hidden");
        }
    });
}

function initAIWorkbench() {
    document.getElementById("btn-run-ai-analysis").addEventListener("click", () => {
        const terminal = document.getElementById("ai-analysis-terminal");
        const scope = document.getElementById("ai-scope-select").value;
        let targetName = "Institution-wide Data";
        
        if (scope === "subject") {
            const user = state.db.users.find(u => u.id === document.getElementById("ai-subject-select").value);
            targetName = `${user.first_name} ${user.last_name}`;
        } else if (scope === "teaching") {
            targetName = "Teaching Faculty Roster";
        } else if (scope === "support") {
            targetName = "Operations & Support Services Roster";
        }

        terminal.innerHTML = `
            <div class="terminal-line terminal-system">[SYSTEM] Initializing revU AI Analytics synthesis gateway...</div>
            <div class="terminal-line terminal-system">[SYSTEM] Target Focus: ${targetName}</div>
            <div class="terminal-line terminal-user">> Fetching active appraisal scorecards, criteria weights and textual comments...</div>
        `;

        setTimeout(() => {
            terminal.innerHTML += `<div class="terminal-line terminal-user">> Running statistical models alignment against rubric cells...</div>`;
            terminal.scrollTop = terminal.scrollHeight;
        }, 800);

        setTimeout(() => {
            terminal.innerHTML += `<div class="terminal-line terminal-user">> Extracting thematic feedback and identifying competency gaps...</div>`;
            terminal.scrollTop = terminal.scrollHeight;
        }, 1600);

        setTimeout(() => {
            let promptReport = "";
            if (scope === "subject") {
                const subjectId = document.getElementById("ai-subject-select").value;
                const subjectUser = state.db.users.find(u => u.id === subjectId);
                const assessments = state.db.assessments.filter(a => a.subject_id === subjectId);
                
                if (assessments.length === 0) {
                    promptReport = `
=== PERFORMANCE INTELLIGENCE INSIGHTS REPORT ===
Subject: ${subjectUser.first_name} ${subjectUser.last_name}

No active appraisal records found for this staff member in the database.
To compile dynamic AI insights, please perform an observation or draft an appraisal first.
`;
                } else {
                    const avgScore = assessments.reduce((sum, a) => sum + (a.score || 0), 0) / assessments.length;
                    
                    let remarksList = [];
                    let naExclusions = [];
                    let strengths = [];
                    let improvements = [];

                    assessments.forEach(a => {
                        const tmpl = state.db.templates.find(t => t.id === a.template_id);
                        if (!tmpl) return;

                        tmpl.sections.forEach(sect => {
                            sect.items.forEach(item => {
                                const resp = a.responses[item.id] || {};
                                if (resp.is_na) {
                                    naExclusions.push(`${sect.title} -> ${item.title}`);
                                    return;
                                }

                                if (resp.notes) {
                                    remarksList.push(resp.notes);
                                }
                                if (resp.remarks) {
                                    remarksList.push(resp.remarks);
                                }
                                if (resp.text_value) {
                                    remarksList.push(resp.text_value);
                                }

                                if (item.item_type === "choice" && resp.selected_choice_id) {
                                    const choice = item.choices.find(c => c.id === resp.selected_choice_id);
                                    if (choice) {
                                        const maxPoints = Math.max(...item.choices.map(c => c.points));
                                        if (maxPoints > 0) {
                                            const pct = (choice.points / maxPoints) * 100;
                                            if (pct >= 80) {
                                                strengths.push(item.title);
                                            } else if (pct < 60) {
                                                improvements.push(item.title);
                                            }
                                        }
                                    }
                                }
                            });
                        });
                    });

                    remarksList = [...new Set(remarksList)];
                    naExclusions = [...new Set(naExclusions)];
                    strengths = [...new Set(strengths)].slice(0, 3);
                    improvements = [...new Set(improvements)].slice(0, 3);

                    promptReport = `
=== PERFORMANCE INTELLIGENCE INSIGHTS REPORT ===
Subject: ${subjectUser.first_name} ${subjectUser.last_name}
Role: ${state.db.roles.find(r => r.id === subjectUser.role)?.name || subjectUser.role}
Department: ${state.db.departments.find(d => d.id === subjectUser.dept_id)?.name || "Unassigned"}

1. PERFORMANCE OVERVIEW:
- Evaluated Records: ${assessments.length} appraisal cycle(s)
- Cumulative Competency Index: ${avgScore.toFixed(1)}%

2. DYNAMIC STRENGTHS IDENTIFIED:
${strengths.length > 0 ? strengths.map(s => `- ${s}`).join("\n") : "- No clear high-scoring criteria identified yet."}

3. AREAS FOR STRUCTURAL IMPROVEMENT:
${improvements.length > 0 ? improvements.map(imp => `- ${imp}`).join("\n") : "- All scored competencies aligned with standards."}

4. OBSERVER REMARKS & QUALITATIVE EVIDENCE SUMMARY:
${remarksList.length > 0 ? remarksList.map(r => `- "${r}"`).join("\n") : "- No textual feedback or evidence comments registered."}

5. N/A SCORING EXCLUSIONS DETECTED:
${naExclusions.length > 0 ? naExclusions.map(na => `- Excluded: ${na}`).join("\n") : "- No criteria excluded via N/A selector."}

6. TAILORED STRATEGIC RECOMMENDATIONS:
${improvements.length > 0 ? `- Focus professional growth actions on resolving gaps in: ${improvements.join(", ")}.` : `- Continue maintaining outstanding quality. Mentor peers in high-performing areas.`}
- Setup a recurring touchpoint review in the next growth cycle.
`;
                }
            } else if (scope === "teaching") {
                promptReport = `
=== PERFORMANCE INTELLIGENCE INSIGHTS REPORT ===
Target: Teaching Faculty Units

1. AGGREGATE COMPETENCIES:
- Lesson planning alignment is verified at 94% compliance.
- Formative Assessment methods are a secondary strength (83% avg).

2. CORE CHALLENGES:
- Student engagement shows high deviation. Younger grades classrooms score lower (Developing) on behavior control during transitions.

3. STRATEGIC PATHWAYS:
- Provide training on time-boxed transition games for Primary Years teachers.
`;
            } else {
                promptReport = `
=== PERFORMANCE INTELLIGENCE INSIGHTS REPORT ===
Target: Operations & Institutional Scope

1. SUMMARY:
- Checklist audit completion rates are at 92%.
- Operations compliance shows stable metrics. Logistical delays in supply registers represent the main focus area.
`;
            }

            terminal.innerHTML += `
                <div class="terminal-line terminal-success">[AI OUT] Analysis completed:</div>
                <pre style="color:#e0f2fe;font-family:monospace;white-space:pre-wrap;">${promptReport}</pre>
            `;
            terminal.scrollTop = terminal.scrollHeight;
            Toaster.success("AI Synthesis compiled successfully.");
        }, 2400);
    });
}

// =========================================================================
// 14. SCHEMA EXPLORER VISUALIZER
// =========================================================================
const SCHEMA_DOCUMENTATION = {
    tenants: {
        description: "Primary directory for client accounts (schools, colleges, districts). Houses domains and branding details.",
        badges: ["Primary Catalog Table", "Multi-Tenant Anchor"],
        rls: false,
        columns: [
            { name: "id", type: "UUID (Primary Key)", desc: "Unique global identifier for tenant." },
            { name: "name", type: "VARCHAR(255)", desc: "Display name of the institution (e.g. Demo Public School)." },
            { name: "domain", type: "VARCHAR(255) (Unique)", desc: "Subdomain used to resolve tenant context dynamically." },
            { name: "config", type: "JSONB", desc: "Branding elements, email servers configuration, feature toggles." }
        ]
    },
    users: {
        description: "User directory of all staff, teachers, administrators, and evaluators. Filtered via Row Level Security.",
        badges: ["Core Ledger Table", "RLS Enabled"],
        rls: true,
        columns: [
            { name: "id", type: "UUID (Primary Key)", desc: "Unique identifier." },
            { name: "tenant_id", type: "UUID (Foreign Key)", desc: "Links to tenants.id for multi-tenant mapping." },
            { name: "email", type: "VARCHAR(255)", desc: "Academic login email address." },
            { name: "password_hash", type: "VARCHAR(255)", desc: "Securely salted password credential." },
            { name: "first_name / last_name", type: "VARCHAR(100)", desc: "Staff member identity details." },
            { name: "status", type: "VARCHAR(50)", desc: "State indicator: active, suspended, invited." }
        ]
    },
    departments: {
        description: "Organizes institutional hierarchy, grouping users under academic classes or logistics divisions.",
        badges: ["Hierarchical Structures Table", "RLS Enabled"],
        rls: true,
        columns: [
            { name: "id", type: "UUID (Primary Key)", desc: "Unique identifier." },
            { name: "tenant_id", type: "UUID (Foreign Key)", desc: "Links to tenants.id." },
            { name: "name", type: "VARCHAR(255)", desc: "Name of the team (e.g. Mathematics Department)." },
            { name: "code", type: "VARCHAR(50)", desc: "Unique structural identifier (e.g., DEPT-MATH)." },
            { name: "parent_id", type: "UUID (Self Link)", desc: "Allows nesting of divisions (e.g., Math -> Academics)." },
            { name: "manager_id", type: "UUID (Foreign Key)", desc: "Identifies manager link for routing approvals." }
        ]
    },
    roles: {
        description: "Defines the system and custom security roles for the tenant.",
        badges: ["RBAC Table", "RLS Enabled"],
        rls: true,
        columns: [
            { name: "id", type: "UUID (Primary Key)", desc: "Unique identifier." },
            { name: "tenant_id", type: "UUID (Foreign Key)", desc: "Links to tenants.id." },
            { name: "name", type: "VARCHAR(100)", desc: "Role name key (e.g. evaluator, dept_head)." },
            { name: "is_system", type: "BOOLEAN", desc: "If true, this is a system-default role." }
        ]
    },
    permissions: {
        description: "Granular capability flags governing routing and page visibility.",
        badges: ["RBAC Catalog Table"],
        rls: false,
        columns: [
            { name: "id", type: "VARCHAR(100) (Primary Key)", desc: "Capability ID (e.g., template:create, user:delete)." },
            { name: "name / description", type: "VARCHAR / TEXT", desc: "User-facing explanations." }
        ]
    },
    rating_scales: {
        description: "Houses custom numeric or compliance rating systems used inside questions.",
        badges: ["Configurator Table", "RLS Enabled"],
        rls: true,
        columns: [
            { name: "id", type: "UUID (Primary Key)", desc: "Unique identifier." },
            { name: "name / description", type: "VARCHAR / TEXT", desc: "Scale title and parameters." }
        ]
    },
    rubrics: {
        description: "Qualitative rubric structures with achievement levels and details. Separated from templates.",
        badges: ["Configurator Matrix Table", "RLS Enabled"],
        rls: true,
        columns: [
            { name: "id", type: "UUID (Primary Key)", desc: "Unique identifier." },
            { name: "name / description", type: "VARCHAR / TEXT", desc: "Matrix details." }
        ]
    },
    templates: {
        description: "Form structures containing pages, sections, question items, weights, and categories.",
        badges: ["Form Configurator Table", "RLS Enabled"],
        rls: true,
        columns: [
            { name: "id", type: "UUID (Primary Key)", desc: "Unique identifier." },
            { name: "name / description", type: "VARCHAR / TEXT", desc: "Template attributes." },
            { name: "category", type: "VARCHAR(50)", desc: "Form type: academic, teaching, administrative, support." },
            { name: "status", type: "VARCHAR(50)", desc: "Version state: draft, published, archived." }
        ]
    },
    assessments: {
        description: "Active observations or appraisals instances mapping a subject to an evaluator.",
        badges: ["Ledger Transaction Table", "RLS Enabled"],
        rls: true,
        columns: [
            { name: "id", type: "UUID (Primary Key)", desc: "Unique identifier." },
            { name: "cycle_id", type: "UUID (Foreign Key)", desc: "Links to assessment_cycles.id." },
            { name: "template_id", type: "UUID (Foreign Key)", desc: "Links to templates.id." },
            { name: "subject_id", type: "UUID (Foreign Key)", desc: "Target employee." },
            { name: "evaluator_id", type: "UUID (Foreign Key)", desc: "Assigned observer." },
            { name: "status", type: "VARCHAR(50)", desc: "Workflow step: draft, evaluator_completed, signed_off." },
            { name: "score", type: "NUMERIC(5,2)", desc: "Aggregate calculated percentage score." }
        ]
    },
    assessment_responses: {
        description: "Answers given for items during an appraisal, holding score values.",
        badges: ["Ledger Transaction Table", "RLS Enabled"],
        rls: true,
        columns: [
            { name: "id", type: "UUID (Primary Key)", desc: "Unique identifier." },
            { name: "assessment_id", type: "UUID (Foreign Key)", desc: "Links to assessments.id." },
            { name: "template_item_id", type: "UUID (Foreign Key)", desc: "Links to template_items.id." },
            { name: "selected_level_id", type: "UUID", desc: "Referenced rubric level." },
            { name: "selected_value_id", type: "UUID", desc: "Referenced rating scale value." },
            { name: "text_value", type: "TEXT", desc: "Comments input." },
            { name: "calculated_score", type: "NUMERIC(5,2)", desc: "Calculated outcome score." }
        ]
    },
    growth_plans: {
        description: "Action-item checklists for personal progression.",
        badges: ["Ledger Transaction Table", "RLS Enabled"],
        rls: true,
        columns: [
            { name: "id", type: "UUID (Primary Key)", desc: "Unique identifier." },
            { name: "user_id", type: "UUID (Foreign Key)", desc: "Employee plan belongs to." },
            { name: "mentor_id", type: "UUID (Foreign Key)", desc: "Assigned reviewer." },
            { name: "status", type: "VARCHAR(50)", desc: "State: draft, active, met." }
        ]
    },
    ai_insights: {
        description: "Cached LLM thematic extractions and recommendations.",
        badges: ["AI Cache Table", "RLS Enabled"],
        rls: true,
        columns: [
            { name: "id", type: "UUID (Primary Key)", desc: "Unique identifier." },
            { name: "target_type / target_id", type: "VARCHAR / UUID", desc: "Identifies subject, department, or cycle." },
            { name: "content", type: "JSONB", desc: "JSON structures holding qualitative summaries." }
        ]
    }
};

function initSchemaExplorer() {
    const listItems = document.querySelectorAll(".schema-table-item");
    listItems.forEach(item => {
        item.addEventListener("click", () => {
            listItems.forEach(x => x.classList.remove("active"));
            item.classList.add("active");
            renderSchemaTableDetails(item.getAttribute("data-table"));
        });
    });
}

function renderSchemaExplorer() {
    const activeItem = document.querySelector(".schema-table-item.active");
    if (activeItem) {
        renderSchemaTableDetails(activeItem.getAttribute("data-table"));
    }
}

function renderSchemaTableDetails(tableName) {
    const container = document.getElementById("schema-table-details");
    const data = SCHEMA_DOCUMENTATION[tableName];

    if (!data) return;

    const badgesHTML = data.badges.map(b => `<span class="schema-badge">${b}</span>`).join("");
    const rlsHTML = data.rls 
        ? `<span class="schema-badge rls">Row Level Security: <strong>ENABLED</strong></span>`
        : `<span class="schema-badge">Row Level Security: <strong>BYPASSED</strong></span>`;

    let columnsHTML = "";
    data.columns.forEach(c => {
        columnsHTML += `
            <tr>
                <td style="color:var(--color-primary);font-family:monospace;font-weight:600;">${c.name}</td>
                <td style="font-family:monospace;font-size:12px;color:var(--color-success);">${c.type}</td>
                <td>${c.desc}</td>
            </tr>
        `;
    });

    container.innerHTML = `
        <h3>table: ${tableName}</h3>
        <p class="schema-description">${data.description}</p>
        
        <div class="schema-badge-row">
            ${badgesHTML}
            ${rlsHTML}
        </div>

        <h4 style="margin-bottom:12px;">Attributes & Columns Mapping</h4>
        <div class="table-container">
            <table class="interactive-table">
                <thead>
                    <tr>
                        <th style="width:200px;">Column Name</th>
                        <th style="width:200px;">Data Type</th>
                        <th>Logical Description</th>
                    </tr>
                </thead>
                <tbody>
                    ${columnsHTML}
                </tbody>
            </table>
        </div>
        
        <h4 style="margin-top:30px;margin-bottom:12px;">Security Isolation Policy (PostgreSQL)</h4>
        <div class="csv-template-snippet" style="background-color:rgba(0,0,0,0.1);border-color:var(--border-color);">
            <pre style="color:var(--color-success);font-family:monospace;">
${data.rls 
? `-- Row Level Security enforcement
ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON ${tableName}
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);`
: `-- Shared catalog mapping bypasses tenant RLS policies
ALTER TABLE ${tableName} DISABLE ROW LEVEL SECURITY;`
}
            </pre>
        </div>
    `;
}

// =========================================================================
// 15. DATA CSV/JSON FILE IMPORT HANDLERS
// =========================================================================
let pendingRosterImportData = null;
let pendingTemplateImportData = null;

function initFileImportHandlers() {
    const csvDropZone = document.getElementById("csv-drop-zone");
    const csvFileInput = document.getElementById("csv-file-input");
    const submitCsvBtn = document.getElementById("btn-submit-csv-import");
    const jsonDropZone = document.getElementById("json-drop-zone");
    const jsonFileInput = document.getElementById("json-file-input");
    const submitJsonBtn = document.getElementById("btn-submit-json-import");

    const downloadSampleBtn = document.getElementById("btn-download-csv-sample");
    if (downloadSampleBtn) {
        downloadSampleBtn.addEventListener("click", (e) => {
            e.preventDefault();
            const csvContent = "data:text/csv;charset=utf-8,"
                + "email,first_name,last_name,department_code,roles,manager_email\n"
                + "john.doe@bhusk.edu,John,Doe,DEPT-TEACH,staff_member,principal.skinner@bhusk.edu\n"
                + "jane.smith@bhusk.edu,Jane,Smith,DEPT-TEACH,staff_member,principal.skinner@bhusk.edu\n"
                + "robert.vance@bhusk.edu,Robert,Vance,DEPT-ADMIN,dept_head,sarah.jenkins@bhusk.edu\n";
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", "revu_roster_sample.csv");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            Toaster.success("Sample CSV file downloaded successfully.");
        });
    }

    if (csvDropZone && csvFileInput) {
        csvDropZone.addEventListener("click", () => csvFileInput.click());
        csvFileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    const text = e.target.result;
                    const logBox = document.getElementById("csv-import-log");
                    if (logBox) {
                        logBox.classList.remove("hidden");
                        logBox.innerHTML = "=== File Read Success ===\nValidating headers...\n";
                    }
                    
                    const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
                    if (lines.length < 2) {
                        if (logBox) logBox.innerHTML += "<span style='color:var(--color-danger)'>Error: Empty file.</span>";
                        return;
                    }

                    const headers = lines[0].split(",").map(h => h.trim().replace(/^["']|["']$/g, ""));
                    const expected = ["email", "first_name", "last_name", "department_code", "roles", "manager_email"];
                    
                    const missing = expected.filter(x => !headers.includes(x));
                    if (missing.length > 0) {
                        if (logBox) logBox.innerHTML += `<span style='color:var(--color-danger)'>Error: Missing columns: ${missing.join(", ")}</span>`;
                        return;
                    }

                    if (logBox) logBox.innerHTML += `Headers valid. Detected ${lines.length - 1} records. Click "Process & Import" to save.`;
                    if (submitCsvBtn) submitCsvBtn.disabled = false;
                    pendingRosterImportData = { headers, rows: lines.slice(1) };
                };
                reader.readAsText(file);
            }
        });
    }

    // Roster Import Tab Switcher
    const tabUpload = document.getElementById("roster-tab-upload");
    const tabPaste = document.getElementById("roster-tab-paste");
    const uploadBody = document.getElementById("roster-prompt-upload-body");
    const pasteBody = document.getElementById("roster-prompt-paste-body");

    window.setRosterImportTab = function(type) {
        if (type === "upload") {
            if (tabUpload) {
                tabUpload.style.color = "var(--text-primary)";
                tabUpload.style.borderBottom = "2px solid var(--color-primary)";
                tabUpload.style.fontWeight = "600";
            }
            if (tabPaste) {
                tabPaste.style.color = "var(--text-muted)";
                tabPaste.style.borderBottom = "2px solid transparent";
                tabPaste.style.fontWeight = "500";
            }
            if (uploadBody) uploadBody.classList.remove("hidden");
            if (pasteBody) pasteBody.classList.add("hidden");
        } else {
            if (tabPaste) {
                tabPaste.style.color = "var(--text-primary)";
                tabPaste.style.borderBottom = "2px solid var(--color-primary)";
                tabPaste.style.fontWeight = "600";
            }
            if (tabUpload) {
                tabUpload.style.color = "var(--text-muted)";
                tabUpload.style.borderBottom = "2px solid transparent";
                tabUpload.style.fontWeight = "500";
            }
            if (pasteBody) pasteBody.classList.remove("hidden");
            if (uploadBody) uploadBody.classList.add("hidden");
            
            const textarea = document.getElementById("roster-paste-textarea");
            if (textarea) setTimeout(() => textarea.focus(), 50);
        }
    };

    if (tabUpload && tabPaste) {
        tabUpload.onclick = () => window.setRosterImportTab("upload");
        tabPaste.onclick = () => window.setRosterImportTab("paste");
    }

    // Direct Excel Paste Textarea listener
    const pasteTextarea = document.getElementById("roster-paste-textarea");
    if (pasteTextarea) {
        pasteTextarea.addEventListener("input", (e) => {
            const text = e.target.value.trim();
            const logBox = document.getElementById("csv-import-log");
            
            if (!text) {
                if (submitCsvBtn) submitCsvBtn.disabled = true;
                pendingRosterImportData = null;
                if (logBox) logBox.classList.add("hidden");
                return;
            }
            
            if (logBox) {
                logBox.classList.remove("hidden");
                logBox.innerHTML = "Parsing pasted text...\n";
            }
            
            const lines = text.split(/[\r\n]+/).map(l => l.trim()).filter(l => l.length > 0);
            if (lines.length === 0) {
                if (submitCsvBtn) submitCsvBtn.disabled = true;
                pendingRosterImportData = null;
                return;
            }
            
            let rowsText = lines;
            const firstRow = lines[0];
            const isTab = firstRow.includes("\t");
            const firstRowValues = firstRow.split(isTab ? "\t" : ",").map(v => v.trim().replace(/^["']|["']$/g, ""));
            
            if (firstRowValues[0].toLowerCase() === "email" || firstRowValues[1]?.toLowerCase() === "first_name") {
                rowsText = lines.slice(1);
            }
            
            const convertedRows = rowsText.map(line => {
                const splitChar = line.includes("\t") ? "\t" : ",";
                const cols = line.split(splitChar).map(v => v.trim().replace(/^["']|["']$/g, ""));
                while (cols.length < 6) cols.push("");
                return cols.map(c => `"${c.replace(/"/g, '""')}"`).join(",");
            });
            
            const expected = ["email", "first_name", "last_name", "department_code", "roles", "manager_email"];
            
            if (logBox) {
                logBox.innerHTML = `=== Excel Paste Parse Success ===\nSuccessfully parsed ${convertedRows.length} paste entries.\nClick "Process & Import" to save.`;
            }
            if (submitCsvBtn) submitCsvBtn.disabled = false;
            pendingRosterImportData = { headers: expected, rows: convertedRows };
        });
    }

    if (submitCsvBtn) {
        submitCsvBtn.addEventListener("click", () => {
            if (!pendingRosterImportData) return;
            const logBox = document.getElementById("csv-import-log");
            if (logBox) logBox.innerHTML += "\n\n=== Running Roster transaction sync ===\n";

            const { headers, rows } = pendingRosterImportData;
            let count = 0;

            rows.forEach((rowText) => {
                const values = rowText.split(",").map(v => v.trim().replace(/^["']|["']$/g, ""));
                const row = {};
                headers.forEach((h, i) => { row[h] = values[i]; });

                if (!row.email || !row.first_name || !row.last_name) return;

                let user = state.db.users.find(u => u.email === row.email);
                let dept = state.db.departments.find(d => d.code === row.department_code);
                
                if (!dept && row.department_code) {
                    dept = {
                        id: "dept-auto-" + Math.floor(Math.random()*1000),
                        name: `Dynamic ${row.department_code} Group`,
                        code: row.department_code,
                        parent_id: null,
                        manager_id: null
                    };
                    state.db.departments.push(dept);
                    if (logBox) logBox.innerHTML += `[Catalog] Auto-registered department: ${row.department_code}\n`;
                }

                if (user) {
                    user.first_name = row.first_name;
                    user.last_name = row.last_name;
                    if (dept) user.dept_id = dept.id;
                    user.role = row.roles || "staff_member";
                } else {
                    state.db.users.push({
                        id: "user-imported-" + Math.floor(Math.random()*100000),
                        email: row.email,
                        first_name: row.first_name,
                        last_name: row.last_name,
                        role: row.roles || "staff_member",
                        dept_id: dept ? dept.id : "dept-teach",
                        avatar: `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150`
                    });
                }
                count++;
            });

            state.saveDatabase();
            Toaster.success(`CSV Imported: Loaded ${count} staff roster entries.`);
            pendingRosterImportData = null;
            submitCsvBtn.disabled = true;
            closeModal("modal-csv-import");
            renderRoster();
        });
    }

    if (jsonDropZone && jsonFileInput) {
        jsonDropZone.addEventListener("click", () => jsonFileInput.click());
        jsonFileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    const logBox = document.getElementById("json-import-log");
                    if (logBox) {
                        logBox.classList.remove("hidden");
                        logBox.innerHTML = "=== File Read success ===\nValidating template schema...\n";
                    }

                    try {
                        const bundle = JSON.parse(e.target.result);
                        if (!bundle.revu_portable_template || !bundle.template) {
                            if (logBox) logBox.innerHTML += "<span style='color:var(--color-danger)'>Error: Invalid schema tags.</span>";
                            return;
                        }

                        if (logBox) logBox.innerHTML += `Template verified: "${bundle.template.name}"\nReady to integrate.`;
                        if (submitJsonBtn) submitJsonBtn.disabled = false;
                        pendingTemplateImportData = bundle;
                    } catch(err) {
                        if (logBox) logBox.innerHTML += `<span style='color:var(--color-danger)'>JSON Error: ${err.message}</span>`;
                    }
                };
                reader.readAsText(file);
            }
        });
    }

    if (submitJsonBtn) {
        submitJsonBtn.addEventListener("click", () => {
            if (!pendingTemplateImportData) return;
            const { template, dependencies } = pendingTemplateImportData;

            dependencies.rating_scales.forEach(sc => {
                if (!state.db.rating_scales.some(x => x.id === sc.id)) state.db.rating_scales.push(sc);
            });

            dependencies.rubrics.forEach(rub => {
                if (!state.db.rubrics.some(x => x.id === rub.id)) state.db.rubrics.push(rub);
            });

            const existingIdx = state.db.templates.findIndex(t => t.id === template.id);
            if (existingIdx !== -1) {
                template.id = "tmpl-imported-" + Math.floor(Math.random()*100000);
                template.name = `${template.name} (Copy)`;
            }
            template.status = "draft";
            state.db.templates.push(template);

            state.saveDatabase();
            Toaster.success(`Template "${template.name}" imported successfully.`);
            pendingTemplateImportData = null;
            submitJsonBtn.disabled = true;
            closeModal("modal-json-import");
            renderTemplateBuilder();
        });
    }
}
