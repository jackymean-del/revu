// revU HPC - Frameworks: stages, levels, holistic domains, HPC components and the LO library.
// Everything here is seed configuration; institutions can edit their copy in the store.
(function () {
    "use strict";

    // ---------------------------------------------------------------------
    // One growth ladder for every stage (3 steps, or 4 for older learners)
    // ---------------------------------------------------------------------
    const LEVELS = {
        stream: [
            { key: "emerging", label: "Emerging", icon: "seed", desc: "Starting out - needs support" },
            { key: "developing", label: "Developing", icon: "sprout", desc: "Getting there - with some help" },
            { key: "secure", label: "Secure", icon: "tree", desc: "Does it independently" }
        ],
        bpa: [
            { key: "emerging", label: "Emerging", icon: "seed", desc: "Starting out - needs support" },
            { key: "developing", label: "Developing", icon: "sprout", desc: "Getting there - with some help" },
            { key: "secure", label: "Secure", icon: "tree", desc: "Does it independently" }
        ],
        four: [
            { key: "emerging", label: "Emerging", icon: "seed", desc: "Starting out - needs support" },
            { key: "developing", label: "Developing", icon: "sprout", desc: "Getting there - with some help" },
            { key: "secure", label: "Secure", icon: "tree", desc: "Does it independently" },
            { key: "excelling", label: "Excelling", icon: "star", desc: "Goes beyond and helps others" }
        ]
    };

    // Child-friendly wording for self assessment (same length as the stage level set)
    const SELF_SCALES = {
        stream: ["Not yet", "Sometimes", "Yes, I can!"],
        bpa: ["Not yet", "Sometimes", "Yes, I can!"],
        four: ["Not yet", "Sometimes", "Yes, I can", "I can teach it"]
    };

    // ---------------------------------------------------------------------
    // Holistic (co-scholastic) domains rated by teacher, self, peer and parent
    // ---------------------------------------------------------------------
    const D = (id, name, icon, self, parent, competencies) => ({ id, name, icon, self, parent, competencies });
    const C = (id, text) => ({ id, text });

    const STAGES = {
        foundational: {
            id: "foundational", name: "Early Years", grades: "Pre-school - Grade 2", levelSet: "stream", hasMarks: true,
            domains: [
                D("phys", "Physical Development", "run", "I run, jump and play with confidence", "My child is active and follows healthy habits", [
                    C("phys1", "Shows coordination in running, jumping and balancing"),
                    C("phys2", "Uses fine motor skills - holding a pencil, cutting, threading")]),
                D("sem", "Socio-Emotional & Ethical", "heart", "I share and take turns with friends", "My child expresses feelings and is kind to others", [
                    C("sem1", "Expresses feelings appropriately"),
                    C("sem2", "Plays, shares and cooperates with peers")]),
                D("cog", "Cognitive Development", "bulb", "I ask questions about things around me", "My child is curious and solves small problems", [
                    C("cog1", "Observes, explores and asks questions"),
                    C("cog2", "Recognises patterns and solves simple problems")]),
                D("lang", "Language & Literacy", "book", "I enjoy stories and can read simple words", "My child talks, listens and enjoys books", [
                    C("lang1", "Listens and speaks with understanding"),
                    C("lang2", "Recognises letters and sounds; reads simple words")]),
                D("aes", "Aesthetic & Cultural", "palette", "I love to draw, sing and dance", "My child enjoys art, music or dance", [
                    C("aes1", "Engages with art, music, dance and craft"),
                    C("aes2", "Shows imagination in play and creation")]),
                D("habit", "Positive Learning Habits", "target", "I finish my work even when it is hard", "My child completes tasks with patience", [
                    C("habit1", "Pays attention and stays with a task"),
                    C("habit2", "Takes care of belongings and follows routines")])
            ]
        },
        preparatory: {
            id: "preparatory", name: "Primary", grades: "Grades 3 - 5", levelSet: "stream", hasMarks: true,
            domains: [
                D("comm", "Communication", "chat", "I share my ideas clearly in class", "My child speaks confidently about their day", [
                    C("comm1", "Expresses ideas clearly in speech and writing"),
                    C("comm2", "Listens actively and responds to others")]),
                D("think", "Thinking & Inquiry", "bulb", "I try different ways to solve a problem", "My child asks 'why' and 'how' questions", [
                    C("think1", "Asks questions and investigates"),
                    C("think2", "Applies learning to everyday situations")]),
                D("arts", "Arts & Creativity", "palette", "I make new things with my own ideas", "My child creates, draws, sings or builds", [
                    C("arts1", "Participates in visual and performing arts"),
                    C("arts2", "Shows original ideas")]),
                D("pe", "Physical Education & Well-being", "run", "I play games and keep myself fit", "My child plays outdoors and eats well", [
                    C("pe1", "Participates in sports and fitness activities"),
                    C("pe2", "Follows healthy and safe habits")]),
                D("sel", "Socio-Emotional Skills", "heart", "I help my friends and manage my feelings", "My child is caring and handles disappointment well", [
                    C("sel1", "Manages emotions and shows self-control"),
                    C("sel2", "Shows empathy and cooperates in groups")]),
                D("values", "Values & Responsibility", "shield", "I am honest and take care of my things", "My child is responsible with tasks at home", [
                    C("values1", "Is honest and takes responsibility"),
                    C("values2", "Cares for the environment and shared spaces")])
            ]
        },
        middle: {
            id: "middle", name: "Middle School", grades: "Grades 6 - 8", levelSet: "bpa", hasMarks: true,
            domains: [
                D("cti", "Critical Thinking & Inquiry", "bulb", "I analyse problems and look for evidence", "My child reasons things out before deciding", [
                    C("cti1", "Analyses information and evidence"),
                    C("cti2", "Applies concepts to new situations")]),
                D("comm", "Communication", "chat", "I express my ideas clearly in speech and writing", "My child communicates clearly with family", [
                    C("comm1", "Presents ideas clearly orally"),
                    C("comm2", "Writes with clarity and structure")]),
                D("collab", "Collaboration & Leadership", "users", "I work well in teams and take initiative", "My child takes initiative and helps others", [
                    C("collab1", "Contributes effectively to teamwork"),
                    C("collab2", "Takes initiative and leads when needed")]),
                D("create", "Creativity & Arts", "palette", "I come up with original ideas", "My child pursues a creative interest", [
                    C("create1", "Expresses creatively through art, music, drama"),
                    C("create2", "Shows innovation in projects")]),
                D("well", "Health & Well-being", "run", "I stay active and manage stress", "My child is active and emotionally balanced", [
                    C("well1", "Participates in sports and fitness"),
                    C("well2", "Shows resilience and emotional balance")]),
                D("values", "Ethics & Citizenship", "shield", "I act honestly and respect everyone", "My child is honest and respectful", [
                    C("values1", "Acts with honesty and responsibility"),
                    C("values2", "Respects diversity and the environment")]),
                D("voc", "Vocational & Digital Skills", "tool", "I can use tools and technology to make things", "My child learns practical or digital skills", [
                    C("voc1", "Completes hands-on vocational projects"),
                    C("voc2", "Uses digital tools safely and productively")])
            ]
        },
        secondary: {
            id: "secondary", name: "High School", grades: "Grades 9 - 12", levelSet: "four", hasMarks: true,
            domains: [
                D("cti", "Critical & Analytical Thinking", "bulb", "I evaluate sources and solve complex problems", "My child thinks independently", [
                    C("cti1", "Analyses complex problems"), C("cti2", "Evaluates information sources critically")]),
                D("comm", "Communication", "chat", "I present and write confidently", "My child expresses opinions with confidence", [
                    C("comm1", "Presents ideas confidently"), C("comm2", "Writes coherently for different audiences")]),
                D("lead", "Leadership & Collaboration", "users", "I lead teams and resolve conflicts", "My child shows leadership", [
                    C("lead1", "Leads and motivates teams"), C("lead2", "Resolves conflicts constructively")]),
                D("innov", "Creativity & Innovation", "palette", "I create original solutions", "My child pursues creative work", [
                    C("innov1", "Generates original solutions"), C("innov2", "Pursues arts, design or making")]),
                D("well", "Health & Well-being", "run", "I manage my health and stress", "My child balances study and well-being", [
                    C("well1", "Maintains physical fitness"), C("well2", "Manages stress and emotions")]),
                D("citizen", "Citizenship & Ethics", "shield", "I contribute to my community", "My child is socially responsible", [
                    C("citizen1", "Engages in community service"), C("citizen2", "Acts with integrity")]),
                D("career", "Career Readiness", "compass", "I know my strengths and plan my goals", "My child has clear goals", [
                    C("career1", "Understands own interests and aptitudes"), C("career2", "Sets goals and plans towards them")])
            ]
        },
        higher: {
            id: "higher", name: "College & University", grades: "Undergraduate & postgraduate", levelSet: "four", hasMarks: true,
            domains: [
                D("disc", "Disciplinary Knowledge", "book", "I understand my subject in depth", "My ward is confident in their discipline", [
                    C("disc1", "Demonstrates depth of subject understanding"), C("disc2", "Applies knowledge in practice")]),
                D("research", "Research & Inquiry", "bulb", "I can design and carry out an inquiry", "My ward shows research interest", [
                    C("research1", "Uses appropriate research methods"), C("research2", "Critically evaluates literature")]),
                D("comm", "Communication", "chat", "I write and present academically", "My ward communicates professionally", [
                    C("comm1", "Academic writing"), C("comm2", "Presentation and viva")]),
                D("lead", "Teamwork & Leadership", "users", "I work and lead in teams", "My ward collaborates well", [
                    C("lead1", "Collaborates in projects"), C("lead2", "Takes leadership responsibility")]),
                D("ethics", "Ethics & Social Responsibility", "shield", "I act with integrity", "My ward is responsible and ethical", [
                    C("ethics1", "Academic integrity"), C("ethics2", "Community engagement")]),
                D("employ", "Employability & Entrepreneurship", "compass", "I am ready for internships and work", "My ward is preparing for a career", [
                    C("employ1", "Industry and internship readiness"), C("employ2", "Initiative and problem-solving")]),
                D("well", "Wellness & Co-curricular", "run", "I balance study, sport and culture", "My ward participates beyond academics", [
                    C("well1", "Sports or cultural participation"), C("well2", "Self-management and well-being")])
            ]
        }
    };

    function stageForGrade(grade) {
        const g = String(grade).toLowerCase();
        if (g === "balvatika" || g === "kg" || g === "ukg" || g === "lkg") return "foundational";
        const n = parseInt(g, 10);
        if (isNaN(n)) return "higher";
        if (n <= 2) return "foundational";
        if (n <= 5) return "preparatory";
        if (n <= 8) return "middle";
        return "secondary";
    }

    // ---------------------------------------------------------------------
    // HPC components: where an additional section's marks land on the card.
    // Grades 1-5 -> Extra Skills (Oral, Activity); Grades 6-8 -> Subject Enrichment, Notebook.
    // ---------------------------------------------------------------------
    const COMPONENTS = {
        oral: { key: "oral", label: "Oral", group: "Skills", hpcMax: 5 },
        activity: { key: "activity", label: "Activity", group: "Skills", hpcMax: 5 },
        enrichment: { key: "enrichment", label: "Enrichment", group: "Enrichment", hpcMax: 5 },
        notebook: { key: "notebook", label: "Notebook", group: "Notebook", hpcMax: 5 }
    };
    // Subject-specific name of the enrichment activity
    const ENRICHMENT_NAMES = { "English": "ASL", "Mathematics": "Maths Lab", "Science": "Practical", "Social Science": "Project Work" };

    function componentLabel(key, subject) {
        if (key === "enrichment" && ENRICHMENT_NAMES[subject]) return ENRICHMENT_NAMES[subject];
        return COMPONENTS[key] ? COMPONENTS[key].label : key;
    }

    function componentsForGrade(grade) {
        const n = parseInt(grade, 10);
        if (!isNaN(n) && n >= 1 && n <= 5) return ["oral", "activity"];
        if (!isNaN(n) && n >= 6 && n <= 8) return ["enrichment", "notebook"];
        return ["oral", "activity", "enrichment", "notebook"];
    }

    // Subjects per grade band. "hpc" subjects carry competencies/LOs; others are marks-only (non-Chrysalis).
    function subjectsForGrade(grade) {
        const n = parseInt(grade, 10);
        if (!isNaN(n) && n <= 5) return [
            { name: "English", hpc: true }, { name: "Mathematics", hpc: true }, { name: "EVS", hpc: true },
            { name: "Hindi", hpc: false }, { name: "Odia", hpc: false }];
        if (!isNaN(n) && n <= 8) return [
            { name: "English", hpc: true }, { name: "Mathematics", hpc: true }, { name: "Science", hpc: true }, { name: "Social Science", hpc: true },
            { name: "Hindi", hpc: false }, { name: "Odia", hpc: false }, { name: "Sanskrit", hpc: false }];
        return [{ name: "English", hpc: true }, { name: "Mathematics", hpc: true }, { name: "Physics", hpc: true }, { name: "Chemistry", hpc: true }, { name: "Biology", hpc: true }];
    }
    // Papers in these subjects are usually merged into one HPC subject
    const MERGE_HINTS = { "Physics": "Science", "Chemistry": "Science", "Biology": "Science", "History": "Social Science", "Geography": "Social Science", "Civics": "Social Science" };

    // ---------------------------------------------------------------------
    // Competency & LO library (seed). kind: regular | oral | activity | enrichment | notebook
    // ---------------------------------------------------------------------
    let _n = 0;
    const K = (code, title, kind, los) => ({
        id: "cmp-" + code.replace(/\W+/g, "").toLowerCase(), code, title, kind,
        los: los.map((t, i) => ({ id: "lo-" + code.replace(/\W+/g, "").toLowerCase() + "-" + (i + 1), code: code + "." + (i + 1), text: t }))
    });

    const LO_LIBRARY = {
        "2": {
            "English": [
                K("EN2.1", "Reading readiness", "regular", ["Recognises letter sounds and blends them into words", "Reads simple sentences with understanding"]),
                K("EN2.2", "Early writing", "regular", ["Writes simple words and sentences legibly", "Uses capital letters and full stops"]),
                K("EN2.O", "Oral - Speaking", "oral", ["Recites rhymes with expression", "Speaks about self and family in simple sentences"]),
                K("EN2.X", "Activity - Show and tell", "activity", ["Presents an object and talks about it"])
            ],
            "Mathematics": [
                K("MA2.1", "Numbers", "regular", ["Counts, reads and writes numbers up to 100", "Adds and subtracts 2-digit numbers without regrouping"]),
                K("MA2.2", "Shapes and patterns", "regular", ["Identifies basic 2D shapes", "Extends simple patterns"]),
                K("MA2.O", "Oral - Mental maths", "oral", ["Says number names and counts forward/backward"]),
                K("MA2.X", "Activity - Sorting", "activity", ["Sorts and groups objects by attributes"])
            ],
            "EVS": [
                K("EV2.1", "My body and me", "regular", ["Names body parts and their uses", "Follows healthy habits"]),
                K("EV2.2", "Plants and animals", "regular", ["Identifies plants and animals around"]),
                K("EV2.O", "Oral - My family", "oral", ["Talks about family members and their roles"]),
                K("EV2.X", "Activity - Nature walk", "activity", ["Observes and records things seen on a nature walk"])
            ]
        },
        "4": {
            "English": [
                K("EN4.1", "Reading", "regular", ["Reads aloud with fluency and expression", "Answers questions from a short passage"]),
                K("EN4.2", "Grammar", "regular", ["Uses nouns, pronouns and adjectives correctly", "Uses punctuation correctly"]),
                K("EN4.3", "Writing", "regular", ["Writes a short paragraph on a familiar topic"]),
                K("EN4.O", "Oral - Speaking", "oral", ["Recites poems with expression", "Speaks on a familiar topic for one minute"]),
                K("EN4.X", "Activity - Role play", "activity", ["Participates in role play and storytelling"])
            ],
            "Mathematics": [
                K("MA4.1", "Numbers and operations", "regular", ["Reads and writes 4-digit numbers", "Adds and subtracts with regrouping"]),
                K("MA4.2", "Multiplication and division", "regular", ["Multiplies 2-digit numbers", "Divides with and without remainders"]),
                K("MA4.3", "Measurement and shapes", "regular", ["Measures length, weight and capacity", "Finds the perimeter of simple shapes"]),
                K("MA4.O", "Oral - Mental maths", "oral", ["Recalls tables and calculates mentally"]),
                K("MA4.X", "Activity - Maths lab", "activity", ["Uses manipulatives to show fractions"])
            ],
            "EVS": [
                K("EV4.1", "Living world", "regular", ["Identifies plants and their uses", "Describes animals and their habitats"]),
                K("EV4.2", "Water and community", "regular", ["Explains sources of water and conservation", "Describes community helpers"]),
                K("EV4.O", "Oral - Observation", "oral", ["Explains observations from surroundings"]),
                K("EV4.X", "Activity - Model making", "activity", ["Builds a simple model and explains it"])
            ]
        },
        "7": {
            "English": [
                K("EN7.1", "Reading comprehension", "regular", ["Identifies the main idea of an unseen passage", "Infers word meaning from context"]),
                K("EN7.2", "Grammar", "regular", ["Uses tenses correctly", "Applies subject-verb agreement", "Transforms active and passive voice"]),
                K("EN7.3", "Writing", "regular", ["Writes a formal letter in the correct format", "Writes a notice concisely"]),
                K("EN7.4", "Literature", "regular", ["Interprets characters and themes", "Responds to a poem with reflection"]),
                K("EN7.A", "ASL - Speaking & Listening", "enrichment", ["Speaks fluently and coherently on a topic", "Listens and responds accurately"]),
                K("EN7.N", "Notebook", "notebook", ["Maintains a complete and neat notebook", "Completes corrections and follow-up work"])
            ],
            "Mathematics": [
                K("MA7.1", "Integers and rational numbers", "regular", ["Performs operations on integers", "Represents rational numbers on a number line"]),
                K("MA7.2", "Algebra", "regular", ["Forms and simplifies algebraic expressions", "Solves simple linear equations"]),
                K("MA7.3", "Geometry", "regular", ["Applies the angle-sum property of triangles", "Uses the Pythagoras property"]),
                K("MA7.4", "Data handling", "regular", ["Computes mean, median and mode"]),
                K("MA7.A", "Maths Lab", "enrichment", ["Verifies a property through a hands-on activity"]),
                K("MA7.N", "Notebook", "notebook", ["Maintains notebook with neat, complete working"])
            ],
            "Science": [
                K("SC7.1", "Life processes (Biology)", "regular", ["Explains photosynthesis", "Describes digestion in humans"]),
                K("SC7.2", "Heat and light (Physics)", "regular", ["Differentiates conduction, convection and radiation", "Describes reflection of light"]),
                K("SC7.3", "Acids, bases and changes (Chemistry)", "regular", ["Identifies acids and bases using indicators", "Classifies physical and chemical changes"]),
                K("SC7.A", "Practical", "enrichment", ["Performs an experiment safely and records observations"]),
                K("SC7.N", "Notebook", "notebook", ["Records diagrams and experiments neatly"])
            ],
            "Social Science": [
                K("SS7.1", "History", "regular", ["Explains the rise of regional kingdoms", "Uses sources to describe the past"]),
                K("SS7.2", "Geography", "regular", ["Describes the components of the environment", "Reads and interprets maps"]),
                K("SS7.3", "Civics", "regular", ["Explains equality in democracy"]),
                K("SS7.A", "Project Work", "enrichment", ["Plans and presents a research project"]),
                K("SS7.N", "Notebook", "notebook", ["Keeps maps, notes and activities organised"])
            ]
        }
    };

    // ---------------------------------------------------------------------
    // Question bank (seed) - keyed by LO id
    // ---------------------------------------------------------------------
    const QUESTION_BANK = [
        { lo: "lo-en72-1", text: "Fill in the blank with the correct form of the verb: She ____ (go) to school every day.", marks: 1, qtype: "fill" },
        { lo: "lo-en72-1", text: "Rewrite the paragraph in the past tense.", marks: 3, qtype: "short" },
        { lo: "lo-en72-2", text: "Choose the correct verb: The list of items ____ on the desk. (a) is (b) are", marks: 1, qtype: "mcq", options: ["is", "are", "were", "be"] },
        { lo: "lo-en72-3", text: "Change into passive voice: The children planted the trees.", marks: 1, qtype: "short" },
        { lo: "lo-en73-1", text: "Write a letter to your Principal requesting permission to organise a science exhibition.", marks: 5, qtype: "long" },
        { lo: "lo-en73-2", text: "Write a notice for your school notice board about a lost water bottle.", marks: 4, qtype: "long" },
        { lo: "lo-ma71-1", text: "Evaluate: (-12) + 7 - (-5)", marks: 1, qtype: "short" },
        { lo: "lo-ma72-2", text: "Solve: 3x + 5 = 20", marks: 2, qtype: "short" },
        { lo: "lo-ma73-1", text: "Two angles of a triangle are 50° and 60°. Find the third angle.", marks: 2, qtype: "short" },
        { lo: "lo-ma73-2", text: "In a right triangle the legs are 6 cm and 8 cm. Find the hypotenuse.", marks: 3, qtype: "short" },
        { lo: "lo-ma74-1", text: "Find the mean of 4, 8, 6, 10, 12.", marks: 2, qtype: "short" },
        { lo: "lo-sc71-1", text: "Write the word equation for photosynthesis.", marks: 2, qtype: "short" },
        { lo: "lo-sc73-1", text: "Which indicator turns red in an acidic solution? (a) Turmeric (b) Blue litmus (c) China rose (d) Phenolphthalein", marks: 1, qtype: "mcq", options: ["Turmeric", "Blue litmus", "China rose", "Phenolphthalein"] },
        { lo: "lo-ma41-2", text: "Add: 3,456 + 2,789", marks: 2, qtype: "short" },
        { lo: "lo-ma42-1", text: "Multiply: 46 × 23", marks: 2, qtype: "short" },
        { lo: "lo-en41-2", text: "Read the passage and answer: Why did Meena go to the market?", marks: 2, qtype: "short" }
    ];

    // Marks -> grade (school 8-point; higher-ed 10-point)
    const GRADE_SCALES = {
        school: [[91, "A1"], [81, "A2"], [71, "B1"], [61, "B2"], [51, "C1"], [41, "C2"], [33, "D"], [0, "E"]],
        higher: [[90, "O"], [80, "A+"], [70, "A"], [60, "B+"], [50, "B"], [45, "C"], [40, "P"], [0, "F"]]
    };

    const EXAMS = [
        { id: "pt1", name: "Periodic Test 1", term: "Term 1" },
        { id: "mid", name: "Mid-Term", term: "Term 1" },
        { id: "pt2", name: "Periodic Test 2", term: "Term 2" },
        { id: "postmid", name: "Post Mid-Term", term: "Term 2" }
    ];

    // How a subject's term total (out of 100) is built. "exam" parts take the core-section
    // percentage of that exam; the "fields" part pools every extra-section field in the term.
    const TERM_TOTAL = {
        "Term 1": [
            { key: "pt", label: "Periodic Test", short: "PT", exam: "pt1", outOf: 10 },
            { key: "exam", label: "Mid-Term", short: "Mid-Term", exam: "mid", outOf: 80 },
            { key: "fields", label: "Skills", fields: true, outOf: 10 }
        ],
        "Term 2": [
            { key: "pt", label: "Periodic Test", short: "PT", exam: "pt2", outOf: 10 },
            { key: "exam", label: "Post Mid-Term", short: "Post Mid", exam: "postmid", outOf: 80 },
            { key: "fields", label: "Skills", fields: true, outOf: 10 }
        ]
    };
    // What the pooled extra-section part is called for a grade
    function fieldsLabel(grade, short) {
        const n = parseInt(grade, 10);
        if (!isNaN(n) && n <= 5) return short ? "O&A" : "Oral & Activity";
        if (!isNaN(n) && n <= 8) return short ? "E&N" : "Enrichment & Notebook";
        return "Skills";
    }

    window.HPC_FW = {
        LEVELS, SELF_SCALES, STAGES, COMPONENTS, ENRICHMENT_NAMES, LO_LIBRARY, QUESTION_BANK, GRADE_SCALES, EXAMS, MERGE_HINTS, TERM_TOTAL,
        stageForGrade, componentLabel, componentsForGrade, subjectsForGrade, fieldsLabel
    };
})();
