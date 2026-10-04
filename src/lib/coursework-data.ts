// Sample course content for every course in the dataset: what a student's Moodle and Gradescope
// would hold by week 8 of Fall 2026. Shared across demo profiles; the per-student parts (scores,
// submissions, attendance) are generated in src/lib/coursework.ts from each profile's own numbers.
//
// Dates follow the demo clock (src/lib/mock.ts NOW = Tue 2026-10-06). Instructors, rooms and
// deadlines agree with the sample inbox (src/lib/inbox.ts) and the week grid (src/lib/schedule.ts).
// Everything here is labeled "sample" in the UI.

export type DeadlineKind =
  "exam" | "quiz" | "assignment" | "project" | "reading" | "other";
export type DocType = "slides" | "notes" | "reading" | "handout" | "lab";

export type AssignmentSpec = {
  name: string;
  category: string; // matches a grading component name
  due: string; // YYYY-MM-DD
  max: number;
};

export type CourseDoc = {
  id: string;
  title: string;
  type: DocType;
  week: number;
  summary: string; // one or two sentences; this is what Viva reads
  body: string; // the material itself; this is what the quiz and flashcard tools read
};

export type CourseInfo = {
  code: string;
  name: string;
  term: string;
  credits: number;
  about: string;
  instructor: { name: string; email: string; office: string; hours: string };
  ta?: { name: string; email: string; hours: string };
  meets: string;
  lab?: string;
  textbook: string;
  grading: { component: string; weight_percent: number; notes: string }[];
  policies: {
    late_work: string;
    attendance: string;
    extensions: string;
    academic_integrity: string;
  };
  deadlines: {
    title: string;
    kind: DeadlineKind;
    date: string;
    time: string;
    weight_percent: number | null;
  }[];
  schedule: { week: number; starts: string; topic: string; reading: string }[];
  assignments: AssignmentSpec[];
  docs: CourseDoc[];
};

const T = "Fall 2026";

export const COURSES: Record<string, CourseInfo> = {
  "BIO 181": {
    code: "BIO 181",
    name: "Introductory Biology",
    term: T,
    credits: 4,
    about:
      "Cells, energy, genetics and evolution, with a weekly lab. The midterm covers chapters 1 through 7.",
    instructor: {
      name: "Dr. Lena Ortiz",
      email: "lortiz@ncsu.edu",
      office: "Bostian 2718",
      hours: "Tue 2–3 PM, Thu 10–11 AM",
    },
    ta: {
      name: "Marcus Bell",
      email: "mbell3@ncsu.edu",
      hours: "Wed 4–6 PM, Bostian 2104",
    },
    meets: "Mon, Wed, Fri 9:35–10:25 AM · Bostian 2722",
    lab: "Thu 1:30–4:15 PM · Bostian 2104",
    textbook: "Campbell Biology in Focus, 3rd ed. (chapters 1–12 this term)",
    grading: [
      {
        component: "Midterm",
        weight_percent: 20,
        notes: "Sat Oct 10, chapters 1–7",
      },
      {
        component: "Final exam",
        weight_percent: 25,
        notes: "Cumulative, weighted toward chapters 8–12",
      },
      {
        component: "Lab reports",
        weight_percent: 20,
        notes: "Lowest of 8 dropped",
      },
      {
        component: "Homework",
        weight_percent: 15,
        notes: "Weekly, due Fridays 11:59 PM",
      },
      {
        component: "Quizzes",
        weight_percent: 10,
        notes: "Every other Wednesday, in class",
      },
      {
        component: "Participation",
        weight_percent: 10,
        notes: "Clicker questions; 2 free misses",
      },
    ],
    policies: {
      late_work:
        "Homework loses 10% per day late, up to 3 days. Lab reports are not accepted late; the lowest report is dropped instead.",
      attendance:
        "Clicker participation counts for 10%. Two missed lectures are forgiven without documentation.",
      extensions:
        "Email Dr. Ortiz before the deadline with a reason; one 48-hour extension per student per term.",
      academic_integrity:
        "Homework may be discussed, but written work must be your own. Lab reports are individual.",
    },
    deadlines: [
      {
        title: "Midterm",
        kind: "exam",
        date: "2026-10-10",
        time: "10:00",
        weight_percent: 20,
      },
      {
        title: "Lab practical",
        kind: "exam",
        date: "2026-11-05",
        time: "13:30",
        weight_percent: null,
      },
      {
        title: "Species field report",
        kind: "project",
        date: "2026-11-20",
        time: "23:59",
        weight_percent: null,
      },
      {
        title: "Final exam",
        kind: "exam",
        date: "2026-12-14",
        time: "08:00",
        weight_percent: 25,
      },
    ],
    schedule: [
      {
        week: 1,
        starts: "2026-08-17",
        topic: "The scientific method; chemistry of life",
        reading: "Ch. 1–2",
      },
      {
        week: 2,
        starts: "2026-08-24",
        topic: "Cells, organelles and membranes",
        reading: "Ch. 3–4",
      },
      {
        week: 3,
        starts: "2026-08-31",
        topic: "Energy, enzymes and metabolism",
        reading: "Ch. 5",
      },
      {
        week: 4,
        starts: "2026-09-07",
        topic: "Cellular respiration",
        reading: "Ch. 6",
      },
      {
        week: 5,
        starts: "2026-09-14",
        topic: "Photosynthesis",
        reading: "Ch. 7",
      },
      {
        week: 6,
        starts: "2026-09-21",
        topic: "The cell cycle and mitosis",
        reading: "Ch. 8",
      },
      {
        week: 7,
        starts: "2026-09-28",
        topic: "Meiosis and Mendelian genetics",
        reading: "Ch. 9–10",
      },
      {
        week: 8,
        starts: "2026-10-05",
        topic: "Midterm week: review session Wed 5 PM; DNA structure",
        reading: "Review Ch. 1–7",
      },
      {
        week: 9,
        starts: "2026-10-12",
        topic: "DNA replication and gene expression",
        reading: "Ch. 11",
      },
      {
        week: 10,
        starts: "2026-10-19",
        topic: "Evolution by natural selection",
        reading: "Ch. 12",
      },
    ],
    assignments: [
      { name: "Homework 1", category: "Homework", due: "2026-08-28", max: 20 },
      { name: "Quiz 1", category: "Quizzes", due: "2026-09-02", max: 10 },
      {
        name: "Lab report 1: Microscopy",
        category: "Lab reports",
        due: "2026-09-03",
        max: 25,
      },
      { name: "Homework 2", category: "Homework", due: "2026-09-04", max: 20 },
      { name: "Homework 3", category: "Homework", due: "2026-09-11", max: 20 },
      { name: "Quiz 2", category: "Quizzes", due: "2026-09-16", max: 10 },
      {
        name: "Lab report 2: Osmosis",
        category: "Lab reports",
        due: "2026-09-17",
        max: 25,
      },
      { name: "Homework 4", category: "Homework", due: "2026-09-18", max: 20 },
      {
        name: "Lab report 3: Respiration",
        category: "Lab reports",
        due: "2026-09-24",
        max: 25,
      },
      { name: "Homework 5", category: "Homework", due: "2026-09-25", max: 20 },
      { name: "Quiz 3", category: "Quizzes", due: "2026-09-30", max: 10 },
      {
        name: "Lab report 4: Enzyme kinetics",
        category: "Lab reports",
        due: "2026-10-01",
        max: 25,
      },
      { name: "Homework 6", category: "Homework", due: "2026-10-02", max: 20 },
      {
        name: "Lab report 5: Photosynthesis",
        category: "Lab reports",
        due: "2026-10-08",
        max: 25,
      },
      { name: "Homework 7", category: "Homework", due: "2026-10-09", max: 20 },
    ],
    docs: [
      {
        id: "bio-l12",
        title: "Lecture 12: Cellular respiration",
        type: "slides",
        week: 4,
        summary:
          "Glycolysis, the citric acid cycle and oxidative phosphorylation; where ATP is made and how much; what happens without oxygen.",
        body: `Lecture 12: Cellular respiration (chapter 6)

Big picture. Cellular respiration converts the chemical energy in glucose into ATP, the cell's energy currency. Overall reaction: C6H12O6 + 6 O2 -> 6 CO2 + 6 H2O + energy (about 30-32 ATP per glucose in eukaryotes). Glucose is oxidized (loses electrons), oxygen is reduced (gains electrons). The electron carriers NADH and FADH2 shuttle electrons from the early stages to the electron transport chain.

Stage 1: Glycolysis. Location: cytosol. One glucose (6 carbons) is split into two pyruvate (3 carbons each). Net yield: 2 ATP (by substrate-level phosphorylation) and 2 NADH. Glycolysis needs no oxygen. Phosphofructokinase is the key regulated enzyme: ATP inhibits it, AMP activates it, so the pathway slows when energy is plentiful.

Stage 2: Pyruvate oxidation and the citric acid cycle. Location: mitochondrial matrix. Each pyruvate loses a CO2 and becomes acetyl-CoA (making 1 NADH each). In the citric acid cycle (Krebs cycle), each acetyl group is fully oxidized to 2 CO2, producing per turn: 3 NADH, 1 FADH2, 1 ATP (or GTP). Two turns per glucose.

Stage 3: Oxidative phosphorylation. Location: inner mitochondrial membrane. The electron transport chain passes electrons from NADH and FADH2 down a series of carriers to oxygen, which forms water. The energy released pumps protons (H+) into the intermembrane space, building a gradient. ATP synthase lets protons flow back into the matrix and uses that flow to make ATP: this is chemiosmosis. About 26-28 ATP come from this stage. NADH yields about 2.5 ATP, FADH2 about 1.5, because FADH2 enters the chain later.

Without oxygen: fermentation. The electron transport chain stops, NADH piles up, and glycolysis would halt without a way to regenerate NAD+. Lactic acid fermentation (muscle cells, some bacteria) reduces pyruvate to lactate. Alcohol fermentation (yeast) converts pyruvate to ethanol and CO2. Both yield only the 2 ATP from glycolysis.

Common exam mistakes: saying ATP synthase pumps protons (it does not; the chain pumps them), placing the citric acid cycle in the cytosol, and forgetting that oxygen is the final electron acceptor.`,
      },
      {
        id: "bio-l15",
        title: "Lecture 15: Photosynthesis",
        type: "slides",
        week: 5,
        summary:
          "Light reactions in the thylakoid make ATP and NADPH; the Calvin cycle in the stroma fixes CO2 with rubisco; C4 and CAM plants beat photorespiration.",
        body: `Lecture 15: Photosynthesis (chapter 7)

Overall reaction: 6 CO2 + 6 H2O + light -> C6H12O6 + 6 O2. Photosynthesis is the reverse of respiration in its bookkeeping, but it runs in a different organelle (the chloroplast) with different machinery. Two linked stages: the light reactions and the Calvin cycle.

Light reactions. Location: thylakoid membranes. Chlorophyll a and b and accessory pigments absorb mainly blue and red light (green is reflected, which is why leaves look green). Photosystem II absorbs light, splits water (producing O2, the oxygen we breathe), and sends excited electrons down an electron transport chain to photosystem I. The chain pumps protons into the thylakoid space; ATP synthase uses the gradient to make ATP (photophosphorylation). Photosystem I re-energizes the electrons and passes them to NADP+ to make NADPH. Products: ATP, NADPH and O2.

Calvin cycle. Location: stroma. Three phases. (1) Carbon fixation: rubisco attaches CO2 to RuBP (a 5-carbon sugar), giving two 3-phosphoglycerate molecules. (2) Reduction: ATP and NADPH from the light reactions convert them to G3P. (3) Regeneration of RuBP, which costs more ATP. It takes 3 turns (3 CO2) to make one G3P that leaves the cycle; two G3P make one glucose. Per G3P: 9 ATP and 6 NADPH.

Photorespiration. Rubisco can also bind O2 instead of CO2, which wastes energy and releases CO2. On hot, dry days plants close stomata to save water, CO2 inside drops, and photorespiration rises.

Adaptations. C4 plants (corn, sugarcane) fix CO2 first in mesophyll cells as a 4-carbon compound using PEP carboxylase, which ignores O2, then release it near rubisco in bundle-sheath cells. CAM plants (cacti, pineapple) open stomata at night, store CO2 as an acid, and run the Calvin cycle by day with stomata shut.

Likely midterm questions: where O2 comes from (water, not CO2), the inputs and outputs of each stage, and why C4 and CAM plants have an advantage in hot climates.`,
      },
      {
        id: "bio-l18",
        title: "Lecture 18: The cell cycle and mitosis",
        type: "notes",
        week: 6,
        summary:
          "Interphase (G1, S, G2) and the phases of mitosis; checkpoints, cyclins and CDKs; how cancer relates to lost checkpoint control.",
        body: `Lecture 18: The cell cycle and mitosis (chapter 8)

The cell cycle has two main parts. Interphase takes about 90% of the time: G1 (growth, normal function), S (DNA synthesis: each chromosome is copied so it has two sister chromatids joined at the centromere), G2 (growth and preparation for division). The M phase is mitosis plus cytokinesis. Cells that stop dividing enter G0.

Mitosis in order. Prophase: chromatin condenses into visible chromosomes; the mitotic spindle starts forming from the centrosomes. Prometaphase: the nuclear envelope breaks down; spindle microtubules attach to kinetochores at the centromeres. Metaphase: chromosomes line up at the metaphase plate (the cell's equator). Anaphase: cohesin proteins are cut, sister chromatids separate and are pulled to opposite poles; now each is a full chromosome. Telophase: nuclear envelopes re-form, chromosomes decondense. Cytokinesis: animal cells pinch in with a cleavage furrow; plant cells build a cell plate.

Memory aid: PMAT (prophase, metaphase, anaphase, telophase). The product of mitosis is two genetically identical diploid cells.

Control system. Checkpoints decide whether the cycle proceeds. G1 checkpoint (restriction point): is the cell big enough, is DNA undamaged, are growth factors present? G2 checkpoint: was DNA copied completely and correctly? M checkpoint: are all kinetochores attached to the spindle? Cyclins are proteins whose levels rise and fall through the cycle; they activate cyclin-dependent kinases (CDKs). MPF (maturation-promoting factor) is a cyclin-CDK complex that triggers entry into mitosis.

Cancer. Cancer cells ignore checkpoint signals, do not show density-dependent inhibition, and can divide indefinitely. p53 is a tumor suppressor that halts the cycle when DNA is damaged; it is mutated in roughly half of human cancers. Proto-oncogenes normally promote division; mutated into oncogenes they drive it uncontrolled.

Quiz 3 covered this material. The midterm will ask you to order the phases from a set of micrographs and to explain what each checkpoint checks.`,
      },
      {
        id: "bio-mid",
        title: "Midterm study guide (chapters 1–7)",
        type: "handout",
        week: 8,
        summary:
          "What the Oct 10 midterm covers, the question format, and the list of concepts to be able to explain, from the chemistry of life through photosynthesis.",
        body: `BIO 181 Midterm study guide. Saturday Oct 10, 10:00 AM, Bostian 2722. Bring a pencil and your student ID. Optional review session Wednesday Oct 7 at 5:00 PM in Bostian 2722.

Format: 40 multiple-choice questions (2 points each) and 2 short-answer questions (10 points each). Chapters 1 through 7. No notes, no calculators needed.

Chapter 1-2: the scientific method (hypothesis vs. theory, controlled experiments, independent and dependent variables); levels of biological organization; properties of water (cohesion, high specific heat, solvent) and why hydrogen bonds explain them; pH and buffers; the four classes of macromolecules and their monomers (monosaccharides, amino acids, nucleotides, fatty acids plus glycerol).

Chapter 3-4: prokaryotic vs. eukaryotic cells; the function of each organelle (nucleus, ribosomes, ER, Golgi, lysosomes, mitochondria, chloroplasts); the fluid mosaic model; passive transport (diffusion, osmosis, facilitated diffusion) vs. active transport; what happens to a cell in hypotonic, isotonic and hypertonic solutions.

Chapter 5: free energy and spontaneous reactions; ATP hydrolysis and energy coupling; how enzymes lower activation energy; competitive vs. noncompetitive inhibition; feedback inhibition.

Chapter 6: glycolysis, the citric acid cycle and oxidative phosphorylation (location, inputs, outputs, ATP yield); the role of NADH and FADH2; chemiosmosis; fermentation.

Chapter 7: light reactions vs. Calvin cycle (location, inputs, outputs); the role of photosystems II and I; rubisco; photorespiration; C4 and CAM adaptations.

Practice: the three in-class quizzes, the end-of-chapter concept checks, and the Lab 3 and Lab 4 analysis questions. Students who did best on last year's midterm reported starting review at least three days out and doing one timed practice set.`,
      },
      {
        id: "bio-lab4",
        title: "Lab 4 handout: Enzyme kinetics",
        type: "lab",
        week: 7,
        summary:
          "The catalase experiment: measuring reaction rate against substrate concentration and temperature, and what the report must include.",
        body: `Lab 4: Enzyme kinetics with catalase. Report due Thursday Oct 1, 11:59 PM, on Gradescope.

Purpose: measure how the rate of an enzyme-catalyzed reaction depends on substrate concentration and temperature. Catalase (from potato extract) breaks hydrogen peroxide into water and oxygen: 2 H2O2 -> 2 H2O + O2. We measure the oxygen produced as the height of foam in a graduated tube after 60 seconds.

Procedure summary. Part A: five tubes with 0.5%, 1%, 2%, 4% and 8% H2O2, each with 1 mL of extract at room temperature; record foam height at 60 s. Part B: 2% H2O2 at 4 C (ice bath), 22 C (room), 37 C (water bath) and 70 C (boiled extract). Run each condition three times and average.

What you should see. In Part A the rate rises with substrate concentration and then levels off: at high concentration every enzyme molecule is busy, so adding substrate cannot speed things up (saturation; Vmax). In Part B the rate rises with temperature up to an optimum near 37 C and then collapses at 70 C because the enzyme denatures: heat breaks the weak bonds that hold its active-site shape.

Report requirements (25 points): a data table with means and standard deviations (5), a graph of rate vs. concentration and rate vs. temperature with labeled axes (5), a results paragraph (5), a discussion that explains both curves using the terms active site, saturation and denaturation (7), and a sentence on one source of error (3).

Common deductions: graphs without units, discussing the curve without naming saturation, and reporting the boiled extract as having "no enzyme" (it has enzyme; the enzyme is denatured).`,
      },
    ],
  },

  "ST 311": {
    code: "ST 311",
    name: "Intro to Statistics",
    term: T,
    credits: 3,
    about:
      "Describing data, probability, sampling distributions, confidence intervals and hypothesis tests, with weekly R labs.",
    instructor: {
      name: "Dr. Hannah Whitfield",
      email: "hwhitfield@ncsu.edu",
      office: "SAS 5270",
      hours: "Mon 10 AM–12 PM",
    },
    ta: {
      name: "Priya Nair",
      email: "pnair2@ncsu.edu",
      hours: "Wed 2–4 PM, SAS 1101",
    },
    meets: "Tue, Thu 1:30–2:45 PM · SAS 1102",
    textbook: "OpenIntro Statistics, 4th ed. (free online)",
    grading: [
      {
        component: "Homework",
        weight_percent: 25,
        notes: "Every two weeks, due 11:59 PM",
      },
      {
        component: "R labs",
        weight_percent: 10,
        notes: "Completed in the Friday lab session",
      },
      {
        component: "Quizzes",
        weight_percent: 10,
        notes: "Short, on Moodle, every other Tuesday",
      },
      {
        component: "Midterm",
        weight_percent: 25,
        notes: "Wed Oct 14, 1:30 PM",
      },
      { component: "Final exam", weight_percent: 30, notes: "Cumulative" },
    ],
    policies: {
      late_work:
        "Homework is accepted up to 48 hours late with a 20% penalty. Quizzes close at the deadline.",
      attendance:
        "Not graded directly, but labs are completed in class and cannot be made up without a documented absence.",
      extensions:
        "Ask the TA before the deadline. Documented illness or university travel gets a full extension.",
      academic_integrity:
        "You may work together on homework but must write up your own solutions and your own R code.",
    },
    deadlines: [
      {
        title: "Midterm",
        kind: "exam",
        date: "2026-10-14",
        time: "13:30",
        weight_percent: 25,
      },
      {
        title: "Project proposal",
        kind: "project",
        date: "2026-11-03",
        time: "23:59",
        weight_percent: null,
      },
      {
        title: "Final project",
        kind: "project",
        date: "2026-12-04",
        time: "23:59",
        weight_percent: null,
      },
      {
        title: "Final exam",
        kind: "exam",
        date: "2026-12-11",
        time: "13:00",
        weight_percent: 30,
      },
    ],
    schedule: [
      {
        week: 1,
        starts: "2026-08-17",
        topic: "Data, variables and study design",
        reading: "Ch. 1",
      },
      {
        week: 2,
        starts: "2026-08-24",
        topic: "Summarizing data: center, spread, shape",
        reading: "Ch. 2",
      },
      {
        week: 3,
        starts: "2026-08-31",
        topic: "Probability and conditional probability",
        reading: "Ch. 3",
      },
      {
        week: 4,
        starts: "2026-09-07",
        topic: "Random variables; the normal distribution",
        reading: "Ch. 4",
      },
      {
        week: 5,
        starts: "2026-09-14",
        topic: "Sampling distributions and the Central Limit Theorem",
        reading: "Ch. 5",
      },
      {
        week: 6,
        starts: "2026-09-21",
        topic: "Confidence intervals for a mean",
        reading: "Ch. 7",
      },
      {
        week: 7,
        starts: "2026-09-28",
        topic: "Hypothesis tests; two-sample t tests",
        reading: "Ch. 7",
      },
      {
        week: 8,
        starts: "2026-10-05",
        topic: "Paired data; power; midterm review",
        reading: "Ch. 7",
      },
      {
        week: 9,
        starts: "2026-10-12",
        topic: "Midterm (Wed); inference for proportions",
        reading: "Ch. 6",
      },
      {
        week: 10,
        starts: "2026-10-19",
        topic: "Chi-square tests",
        reading: "Ch. 6",
      },
    ],
    assignments: [
      { name: "Homework 1", category: "Homework", due: "2026-08-28", max: 50 },
      {
        name: "R Lab 1: Getting started",
        category: "R labs",
        due: "2026-09-04",
        max: 10,
      },
      { name: "Quiz 1", category: "Quizzes", due: "2026-09-08", max: 10 },
      { name: "Homework 2", category: "Homework", due: "2026-09-11", max: 50 },
      {
        name: "R Lab 2: Simulating the CLT",
        category: "R labs",
        due: "2026-09-18",
        max: 10,
      },
      { name: "Quiz 2", category: "Quizzes", due: "2026-09-22", max: 10 },
      { name: "Homework 3", category: "Homework", due: "2026-09-25", max: 50 },
      {
        name: "R Lab 3: t.test()",
        category: "R labs",
        due: "2026-10-02",
        max: 10,
      },
      { name: "Homework 4", category: "Homework", due: "2026-10-06", max: 50 },
    ],
    docs: [
      {
        id: "st-l7",
        title:
          "Lecture 7: Sampling distributions and the Central Limit Theorem",
        type: "slides",
        week: 5,
        summary:
          "Why sample means vary, the standard error, and the CLT: sample means are approximately normal for large n whatever the population looks like.",
        body: `Lecture 7: Sampling distributions and the Central Limit Theorem

A statistic (like the sample mean x-bar) changes from sample to sample. Its distribution over all possible samples of size n is the sampling distribution. Understanding it is what lets us say how far a sample mean is likely to be from the population mean mu.

Facts about the sample mean. The mean of the sampling distribution of x-bar equals mu (x-bar is unbiased). Its standard deviation, called the standard error, is sigma divided by the square root of n. Larger samples give less variable means: quadrupling n halves the standard error.

Central Limit Theorem. For a large enough sample (rule of thumb n >= 30, smaller if the population is roughly symmetric), the sampling distribution of x-bar is approximately normal, no matter the shape of the population. Skewed populations need bigger n. If the population is already normal, x-bar is exactly normal for any n.

Worked example. Commute times have mean 24 minutes and standard deviation 8 minutes, skewed right. For a sample of 64 commuters, the sample mean has mean 24 and standard error 8/8 = 1 minute, and is approximately normal. P(x-bar > 26) = P(Z > 2) = about 0.023.

In R Lab 2 you simulated this: drawing 1000 samples of size 5, 30 and 100 from an exponential population and plotting the means. The histograms of means get narrower and more bell-shaped as n grows, while a single sample stays skewed.

Why it matters: every confidence interval and test for a mean in this course uses the normal (or t) shape that the CLT guarantees. When n is small and the population is not normal, those methods are not trustworthy.`,
      },
      {
        id: "st-l9",
        title: "Lecture 9: Two-sample t tests (pooled vs. Welch)",
        type: "slides",
        week: 7,
        summary:
          "Comparing two means: the pooled-variance t test when spreads are similar, the Welch test when they are not, and how to read R's output.",
        body: `Lecture 9: Comparing two means

Setup. Two independent samples, sizes n1 and n2, means x1 and x2, standard deviations s1 and s2. Null hypothesis: mu1 = mu2. Alternative: mu1 != mu2 (two-sided) or one direction.

Pooled t test. Assumes the two populations have the same variance. Pool the variances: sp^2 = ((n1-1)s1^2 + (n2-1)s2^2) / (n1+n2-2). Test statistic: t = (x1 - x2) / (sp * sqrt(1/n1 + 1/n2)) with n1+n2-2 degrees of freedom. Use this when the sample standard deviations are within a factor of about 2 of each other, or when a study was designed with equal variances in mind. Homework 4 question 3b uses the pooled version.

Welch t test. Does not assume equal variances. Standard error: sqrt(s1^2/n1 + s2^2/n2). Degrees of freedom come from the Welch-Satterthwaite formula (R computes it; it is usually not a whole number). This is R's default in t.test(). When the variances really are equal, Welch loses very little power, which is why many statisticians recommend it by default.

Conditions for both: independent random samples, and either normal populations or sample sizes large enough for the CLT (about 30 each; check for strong skew and outliers with boxplots).

Reading R output. t.test(score ~ group, data = d, var.equal = TRUE) gives the pooled test; drop var.equal for Welch. Report the t statistic, df, p-value and the confidence interval for mu1 - mu2. A p-value below 0.05 at alpha 0.05 means the data are unlikely if the means were equal; the interval tells you how big the difference plausibly is, which matters more.

Example. Sleep hours, students who work more than 20 hours a week (n = 18, mean 5.9, sd 1.1) vs. others (n = 42, mean 6.8, sd 1.2). Pooled sp = 1.17, t = -2.74, df = 58, p = 0.008, 95% CI for the difference (-1.56, -0.24).`,
      },
      {
        id: "st-l11",
        title: "Lecture 11: Confidence intervals for a mean",
        type: "notes",
        week: 6,
        summary:
          "Point estimate plus or minus margin of error; the t distribution for unknown sigma; how to interpret 95% confidence correctly.",
        body: `Lecture 11: Confidence intervals for a mean

A confidence interval is a range of plausible values for a population parameter, built from a sample: point estimate +/- margin of error. For a mean with unknown population standard deviation (the usual case): x-bar +/- t* times s / sqrt(n), where t* comes from the t distribution with n - 1 degrees of freedom.

Why t instead of z. Replacing sigma with s adds uncertainty. The t distribution is bell-shaped but has heavier tails than the normal, more so for small df. As df grows it approaches the normal; at df = 30 the 95% t* is 2.04 vs. z* = 1.96.

Conditions. Random sample (or a reasonable argument for representativeness), independence (sample under 10% of the population), and normality: either the population is roughly normal or n is at least 30 and without extreme outliers.

Interpretation. "We are 95% confident that the population mean is between a and b" means: the method captures the true mean in 95% of samples. It does NOT mean there is a 95% probability the mean is in this particular interval, and it says nothing about individual observations. Students lose points on this every term.

Margin of error. Shrinks with larger n (by the square root of n) and with lower confidence. To halve the margin, quadruple the sample. To go from 95% to 99% confidence, the interval gets wider.

Worked example. 25 students' weekly study hours: mean 14.2, sd 4.5. df = 24, t* = 2.064. Margin = 2.064 * 4.5 / 5 = 1.86. Interval: (12.3, 16.1) hours.

In R: t.test(x)$conf.int, or t.test(x, conf.level = 0.99) for 99%.`,
      },
      {
        id: "st-lab3",
        title: "R Lab 3 handout: t.test() and checking assumptions",
        type: "lab",
        week: 7,
        summary:
          "Running one- and two-sample t tests in R, checking normality with histograms and QQ plots, and reporting results.",
        body: `R Lab 3: t tests in R

Load the data: d <- read.csv("sleep_work.csv"). Variables: hours (sleep per night), group ("working" or "not working").

Step 1, look before testing. hist(d$hours); boxplot(hours ~ group, data = d); qqnorm(d$hours); qqline(d$hours). Points near the line on the QQ plot suggest approximate normality. Mild skew is fine with n above 30 per group.

Step 2, one-sample test. Is mean sleep different from 7 hours? t.test(d$hours, mu = 7). Read off t, df, p-value and the 95% confidence interval.

Step 3, two-sample test. t.test(hours ~ group, data = d) runs Welch by default. Add var.equal = TRUE for the pooled test. Compare the two outputs: the df differ, the conclusions usually agree.

Step 4, effect size. The confidence interval for the difference in means is the most useful number to report. A difference of 0.9 hours of sleep per night is meaningful even if the p-value is modest.

Step 5, write-up. Two or three sentences: what was compared, the test used and why, the estimate with its interval, and the conclusion in plain words.

Submit the R script and a PDF of your write-up on Gradescope by Friday Oct 2, 11:59 PM. Graded on completion and correctness of the code (6 points) and the interpretation (4 points).`,
      },
      {
        id: "st-formula",
        title: "Midterm formula sheet",
        type: "handout",
        week: 8,
        summary:
          "The formulas provided on the Oct 14 midterm: summaries, probability rules, normal and t procedures, and the two-sample tests.",
        body: `ST 311 Midterm formula sheet (provided with the exam, Wed Oct 14, 1:30 PM, SAS 1102)

Descriptive statistics. Mean: sum of x over n. Variance: sum of (x - mean)^2 over (n - 1). Standard deviation: square root of the variance. IQR: Q3 - Q1. Outlier rule: below Q1 - 1.5 IQR or above Q3 + 1.5 IQR. z-score: (x - mean) / sd.

Probability. Addition rule: P(A or B) = P(A) + P(B) - P(A and B). Multiplication rule for independent events: P(A and B) = P(A) P(B). Conditional probability: P(A | B) = P(A and B) / P(B). Complement: P(not A) = 1 - P(A).

Random variables. Expected value: sum of x times P(x). Variance: sum of (x - mu)^2 P(x). Binomial: mean n p, standard deviation sqrt(n p (1 - p)).

Sampling distribution of the mean. Mean mu, standard error sigma / sqrt(n). CLT: approximately normal when n is at least 30.

Confidence interval for a mean: x-bar +/- t* s / sqrt(n), df = n - 1. One-sample t statistic: (x-bar - mu0) / (s / sqrt(n)).

Two-sample t tests. Pooled: sp^2 = ((n1 - 1) s1^2 + (n2 - 1) s2^2) / (n1 + n2 - 2); t = (x1 - x2) / (sp sqrt(1/n1 + 1/n2)), df = n1 + n2 - 2. Welch: standard error sqrt(s1^2/n1 + s2^2/n2), df from the Welch-Satterthwaite formula (given in the problem).

Paired data: compute the differences, then use the one-sample procedure on the differences.

A t table and a standard normal table are attached to the exam.`,
      },
    ],
  },

  "CSC 216": {
    code: "CSC 216",
    name: "Software Development Fundamentals",
    term: T,
    credits: 4,
    about:
      "Object-oriented design in Java: inheritance, exceptions, collections, finite state machines and test-driven development, through weekly labs and guided projects.",
    instructor: {
      name: "Prof. Daniel Reyes",
      email: "dreyes@ncsu.edu",
      office: "EB2 2278",
      hours: "Mon, Wed 2–3 PM",
    },
    ta: {
      name: "Alicia Tran",
      email: "atran6@ncsu.edu",
      hours: "Tue 5–7 PM, EB2 1222",
    },
    meets: "Mon, Wed, Fri 11:45 AM–12:35 PM · EB2 1226",
    lab: "Wed 1:30–3:20 PM · EB2 1222",
    textbook: "Course notes on Moodle; Java 21 and Eclipse required",
    grading: [
      {
        component: "Guided projects",
        weight_percent: 20,
        notes: "Two parts each, with starter code",
      },
      {
        component: "Projects",
        weight_percent: 30,
        notes: "Project 1 and 2, each in two parts",
      },
      {
        component: "Exams",
        weight_percent: 35,
        notes: "Exam 1 (10), Exam 2 (10), Final (15)",
      },
      {
        component: "Labs",
        weight_percent: 10,
        notes: "Weekly, graded on completion",
      },
      { component: "Quizzes", weight_percent: 5, notes: "On Moodle, Fridays" },
    ],
    policies: {
      late_work:
        "Projects and labs lose 10% per day, up to 3 days. Jenkins submissions after that are not graded.",
      attendance:
        "Lab attendance is required; labs are graded on the work completed during the session.",
      extensions:
        "Extensions only for documented reasons, requested at least 24 hours before the deadline.",
      academic_integrity:
        "Code must be your own. Discussing ideas is fine; sharing code or using AI to write submitted code is not.",
    },
    deadlines: [
      {
        title: "Exam 1",
        kind: "exam",
        date: "2026-10-16",
        time: "11:45",
        weight_percent: 10,
      },
      {
        title: "Project 1 part 2",
        kind: "project",
        date: "2026-10-14",
        time: "23:59",
        weight_percent: null,
      },
      {
        title: "Exam 2",
        kind: "exam",
        date: "2026-11-18",
        time: "11:45",
        weight_percent: 10,
      },
      {
        title: "Final exam",
        kind: "exam",
        date: "2026-12-09",
        time: "08:00",
        weight_percent: 15,
      },
    ],
    schedule: [
      {
        week: 1,
        starts: "2026-08-17",
        topic: "Course tools: Eclipse, Git, Jenkins; Java review",
        reading: "Notes 1",
      },
      {
        week: 2,
        starts: "2026-08-24",
        topic: "Classes, encapsulation and JavaDoc",
        reading: "Notes 2",
      },
      {
        week: 3,
        starts: "2026-08-31",
        topic: "Unit testing with JUnit; test-driven development",
        reading: "Notes 3",
      },
      {
        week: 4,
        starts: "2026-09-07",
        topic: "Inheritance, polymorphism and abstract classes",
        reading: "Notes 4",
      },
      {
        week: 5,
        starts: "2026-09-14",
        topic: "Interfaces and the Comparable contract",
        reading: "Notes 5",
      },
      {
        week: 6,
        starts: "2026-09-21",
        topic: "Exceptions and defensive programming",
        reading: "Notes 6",
      },
      {
        week: 7,
        starts: "2026-09-28",
        topic: "Finite state machines; the State pattern",
        reading: "Notes 7",
      },
      {
        week: 8,
        starts: "2026-10-05",
        topic: "Array-based lists and generics",
        reading: "Notes 8",
      },
      {
        week: 9,
        starts: "2026-10-12",
        topic: "Exam 1 (Fri Oct 16, EB2 1230); linked lists",
        reading: "Notes 9",
      },
      {
        week: 10,
        starts: "2026-10-19",
        topic: "Recursion",
        reading: "Notes 10",
      },
    ],
    assignments: [
      {
        name: "Lab 1: Eclipse and Git",
        category: "Labs",
        due: "2026-08-26",
        max: 10,
      },
      {
        name: "Lab 2: JavaDoc and style",
        category: "Labs",
        due: "2026-09-02",
        max: 10,
      },
      { name: "Quiz 1", category: "Quizzes", due: "2026-09-04", max: 10 },
      { name: "Lab 3: JUnit", category: "Labs", due: "2026-09-09", max: 10 },
      {
        name: "Guided Project 1 part 1",
        category: "Guided projects",
        due: "2026-09-11",
        max: 100,
      },
      {
        name: "Lab 4: Inheritance",
        category: "Labs",
        due: "2026-09-16",
        max: 10,
      },
      { name: "Quiz 2", category: "Quizzes", due: "2026-09-18", max: 10 },
      {
        name: "Lab 5: Interfaces",
        category: "Labs",
        due: "2026-09-23",
        max: 10,
      },
      {
        name: "Guided Project 1 part 2",
        category: "Guided projects",
        due: "2026-09-25",
        max: 100,
      },
      {
        name: "Lab 6: Exceptions",
        category: "Labs",
        due: "2026-09-30",
        max: 10,
      },
      {
        name: "Project 1 part 1",
        category: "Projects",
        due: "2026-10-02",
        max: 100,
      },
      { name: "Quiz 3", category: "Quizzes", due: "2026-10-02", max: 10 },
      {
        name: "Lab 7: State machines",
        category: "Labs",
        due: "2026-10-07",
        max: 10,
      },
    ],
    docs: [
      {
        id: "csc-l14",
        title: "Lecture 14: Inheritance and polymorphism in Java",
        type: "slides",
        week: 4,
        summary:
          "extends and super, overriding vs. overloading, dynamic dispatch, abstract classes, and when inheritance is the wrong tool.",
        body: `Lecture 14: Inheritance and polymorphism

Inheritance lets a subclass reuse and specialize a superclass: class Student extends Person. The subclass inherits public and protected members. Constructors are not inherited; the subclass constructor must call super(...) first (explicitly, or Java inserts super() with no arguments).

Overriding vs. overloading. Overriding: same name, same parameters, in a subclass; use @Override so the compiler checks you. Overloading: same name, different parameter lists, in the same class. Overriding is resolved at run time, overloading at compile time.

Dynamic dispatch. Person p = new Student("Maya"); p.describe() runs Student's version, because the object's actual class decides, not the variable's declared type. This is polymorphism: one call, many behaviors. The declared type decides which methods you are allowed to call; the run-time type decides which implementation runs.

Abstract classes. abstract class Shape { abstract double area(); } cannot be instantiated; subclasses must implement area(). Use an abstract class when subclasses share state or code; use an interface when you only need a contract.

equals and hashCode. If you override equals, override hashCode, or HashMap and HashSet will misbehave. Generated equals should compare the fields that define identity, and should use getClass() rather than instanceof when subclasses must not be equal to superclass objects.

When not to inherit. Prefer composition ("has a") when the relationship is not truly "is a". A Course has a list of Students; it is not a kind of ArrayList. Inheriting from ArrayList exposes 40 methods you do not want.

Exam 1 will include a code-tracing question on dynamic dispatch and a question asking you to write a subclass with a constructor that calls super.`,
      },
      {
        id: "csc-l16",
        title: "Lecture 16: JUnit and test-driven development",
        type: "slides",
        week: 3,
        summary:
          "Writing JUnit 5 tests, the structure of a good test, assertions, test-driven development, and how Jenkins grades coverage.",
        body: `Lecture 16: JUnit and test-driven development

A unit test checks one behavior of one class in isolation. In JUnit 5, a test is a public void method annotated with @Test. Common assertions: assertEquals(expected, actual), assertTrue, assertFalse, assertNull, assertThrows(IllegalArgumentException.class, () -> new Course(null)). Always put the expected value first.

Anatomy of a test: arrange (build the objects), act (call the method), assert (check the result). One behavior per test, with a name that says what it checks: testConstructorRejectsNullName.

Test-driven development: write a failing test first, write the minimum code to pass, then refactor. Red, green, refactor. It forces you to decide what the code should do before you decide how.

Boundary and error cases matter most: empty strings, null, zero, negative sizes, the last element of an array, duplicates. Jenkins measures line and branch coverage; this course requires at least 80% of each for full credit on projects, and the tests must actually assert something.

Test independence. Tests must not depend on order or on each other. Use @BeforeEach to rebuild fixtures for every test instead of sharing mutable state.

Testing exceptions. Exception e = assertThrows(IllegalArgumentException.class, () -> c.setCredits(0)); assertEquals("Invalid credits", e.getMessage()); This checks both the type and the message, which projects require.

Common mistakes seen in Guided Project 1: tests with no assertions, catching exceptions and failing silently, and testing private methods directly instead of through the public interface.`,
      },
      {
        id: "csc-l18",
        title: "Lecture 18: Exceptions and finite state machines",
        type: "notes",
        week: 7,
        summary:
          "Checked vs. unchecked exceptions, try/catch/finally, custom exceptions, and modeling behavior as states and transitions with the State pattern.",
        body: `Lecture 18: Exceptions and finite state machines

Exceptions. Throwable splits into Error (do not catch) and Exception. Checked exceptions (IOException, custom ones that extend Exception) must be declared with throws or handled. Unchecked exceptions extend RuntimeException (IllegalArgumentException, NullPointerException, IndexOutOfBoundsException) and signal programmer errors or invalid input; constructors and setters in this course throw IllegalArgumentException for invalid values.

try, catch, finally. The finally block always runs, even after a return or an uncaught exception, which makes it the place to close files. Catch specific exceptions before general ones; the compiler rejects an unreachable catch. Never leave a catch block empty.

Custom exceptions. public class ConflictException extends Exception with two constructors: one with a message, one with a default message calling this("Schedule conflict."). Throw it when adding an activity that overlaps an existing one.

Finite state machines. A state machine has a finite set of states, an initial state, and transitions triggered by inputs. Example from Project 1: a course-registration record moves from Open to Waitlisted to Closed; "drop" from Closed goes back to Open or Waitlisted depending on the waitlist size. Draw it as a diagram before coding; each arrow is one transition.

The State pattern. The context class holds a reference to its current State object and delegates: state.enroll(student). Each concrete state (OpenState, ClosedState) implements the transitions that make sense for it and sets context.currentState for the next state. Benefits: no giant switch statement, and adding a state does not touch the others.

Testing a state machine: one test per transition, plus tests that invalid inputs in a given state throw or are ignored as the diagram says. Exam 1 will give a diagram and ask you to trace a sequence of inputs.`,
      },
      {
        id: "csc-p1",
        title: "Project 1 requirements: WolfScheduler",
        type: "handout",
        week: 6,
        summary:
          "What Project 1 must do: load courses from a file, build a conflict-free schedule, export it, with the required classes, exceptions and test coverage.",
        body: `Project 1: WolfScheduler. Part 1 due Fri Oct 2, 11:59 PM; Part 2 due Wed Oct 14, 11:59 PM. Submit through GitHub and check Jenkins.

Overview. A student loads a catalog of courses from a text file and builds a schedule. The program must reject courses that conflict in time, allow events (like a work shift) alongside courses, and export the schedule to a file.

Required classes. Activity (abstract: title, meeting days, start and end time), Course extends Activity (name, section, credits, instructor id), Event extends Activity (event details), WolfScheduler (the catalog and the schedule), CourseRecordIO and ActivityRecordIO (file input and output), and ConflictException (checked; extends Exception).

Rules to enforce. Course names match a department code of 1-4 letters, a space, and 3 digits. Sections are exactly 3 digits. Credits are between 1 and 5. Meeting days use M, T, W, H, F, or A for arranged; an arranged course has no times. Times are 0000-2359 with minutes under 60. Any invalid value throws IllegalArgumentException with the exact message in the requirements document.

Conflicts. Two activities conflict if they share at least one meeting day and their times overlap, including sharing a single minute (a course ending at 1045 and one starting at 1045 conflict). Implement checkConflict in Activity and throw ConflictException when adding to the schedule.

Part 1 deliverables: Activity, Course, Event, ConflictException, the conflict check, and unit tests with at least 80% line and branch coverage. Part 2 adds file export, the arranged-days case, and the GUI hookup provided in the starter code.

Grading: Jenkins tests (50%), your tests and coverage (25%), JavaDoc and style with zero checkstyle errors (15%), design (10%). Late penalty 10% per day for up to 3 days.`,
      },
      {
        id: "csc-exam1",
        title: "Exam 1 topics list",
        type: "handout",
        week: 8,
        summary:
          "The topics on the Oct 16 exam in EB2 1230, the question types, and what to practice.",
        body: `CSC 216 Exam 1. Friday Oct 16, 11:45 AM, EB2 1230 (not the usual room). 50 minutes, closed book, no electronics. One double-sided page of handwritten notes is allowed.

Topics. Java basics and style: visibility, static vs. instance, final, constructors, this. Encapsulation and JavaDoc. JUnit 5: writing tests, assertions, assertThrows, coverage. Inheritance and polymorphism: super, overriding, dynamic dispatch, abstract classes, equals and hashCode. Interfaces and Comparable. Exceptions: checked vs. unchecked, try/catch/finally, custom exceptions. Finite state machines and the State pattern.

Question types. About 40% multiple choice and short answer, 30% code tracing (what prints, what exception is thrown and where), 30% writing code (a short subclass, a test method, a state transition).

How to prepare. Redo Labs 3 through 7 without the starter code. Trace Guided Project 1's inheritance hierarchy by hand. Write the state diagram for Project 1's registration states from memory. Practice the Quiz 1-3 questions on Moodle; their style matches the exam.

Office hours before the exam: Prof. Reyes Mon and Wed 2-3 PM in EB2 2278; Alicia Tran holds an extra session Tue Oct 13, 5-8 PM in EB2 1222.`,
      },
    ],
  },

  "MA 241": {
    code: "MA 241",
    name: "Calculus II",
    term: T,
    credits: 4,
    about:
      "Techniques of integration, applications of the integral, improper integrals, sequences and series, and an introduction to differential equations.",
    instructor: {
      name: "Dr. Thomas Okafor",
      email: "tokafor@ncsu.edu",
      office: "SAS 3236",
      hours: "Tue, Thu 10–11 AM",
    },
    ta: {
      name: "Jordan Lee",
      email: "jlee47@ncsu.edu",
      hours: "Mon 3–5 PM, SAS 1218",
    },
    meets: "Tue, Thu 8:30–9:45 AM · SAS 2203",
    textbook:
      "Stewart, Calculus: Early Transcendentals, 9th ed. (chapters 7–11)",
    grading: [
      {
        component: "WebAssign homework",
        weight_percent: 15,
        notes: "Weekly, due Mondays 11:59 PM; lowest two dropped",
      },
      {
        component: "Quizzes",
        weight_percent: 15,
        notes: "Every other Thursday, 15 minutes, in class",
      },
      {
        component: "Tests",
        weight_percent: 45,
        notes: "Three tests, 15% each",
      },
      {
        component: "Final exam",
        weight_percent: 25,
        notes: "Common final, cumulative",
      },
    ],
    policies: {
      late_work:
        "WebAssign closes at the deadline with an automatic 48-hour extension at 50% credit. Quizzes cannot be made up without an excused absence.",
      attendance:
        "Not recorded, but quizzes happen in class. Missed quizzes with an excused absence can be made up within one week through the TA.",
      extensions:
        "Test makeups only for documented reasons through the department's makeup policy.",
      academic_integrity:
        "Calculators are not allowed on quizzes or tests. Homework collaboration is encouraged.",
    },
    deadlines: [
      {
        title: "Test 2",
        kind: "exam",
        date: "2026-10-20",
        time: "08:30",
        weight_percent: 15,
      },
      {
        title: "Test 3",
        kind: "exam",
        date: "2026-11-19",
        time: "08:30",
        weight_percent: 15,
      },
      {
        title: "Final exam",
        kind: "exam",
        date: "2026-12-15",
        time: "08:00",
        weight_percent: 25,
      },
    ],
    schedule: [
      {
        week: 1,
        starts: "2026-08-17",
        topic: "Review: the Fundamental Theorem; u-substitution",
        reading: "5.3–5.5",
      },
      {
        week: 2,
        starts: "2026-08-24",
        topic: "Integration by parts",
        reading: "7.1",
      },
      {
        week: 3,
        starts: "2026-08-31",
        topic: "Trigonometric integrals and substitution",
        reading: "7.2–7.3",
      },
      {
        week: 4,
        starts: "2026-09-07",
        topic: "Partial fractions",
        reading: "7.4",
      },
      {
        week: 5,
        starts: "2026-09-14",
        topic: "Strategy for integration; numerical integration",
        reading: "7.5, 7.7",
      },
      {
        week: 6,
        starts: "2026-09-21",
        topic: "Improper integrals; Test 1 (Thu Sep 24)",
        reading: "7.8",
      },
      {
        week: 7,
        starts: "2026-09-28",
        topic: "Arc length and area of a surface of revolution",
        reading: "8.1–8.2",
      },
      {
        week: 8,
        starts: "2026-10-05",
        topic: "Sequences; series and the divergence test",
        reading: "11.1–11.2",
      },
      {
        week: 9,
        starts: "2026-10-12",
        topic: "Integral and comparison tests",
        reading: "11.3–11.4",
      },
      {
        week: 10,
        starts: "2026-10-19",
        topic: "Test 2 (Tue Oct 20); alternating series",
        reading: "11.5",
      },
    ],
    assignments: [
      {
        name: "WebAssign HW 1",
        category: "WebAssign homework",
        due: "2026-08-24",
        max: 20,
      },
      {
        name: "WebAssign HW 2",
        category: "WebAssign homework",
        due: "2026-08-31",
        max: 20,
      },
      { name: "Quiz 1", category: "Quizzes", due: "2026-09-03", max: 10 },
      {
        name: "WebAssign HW 3",
        category: "WebAssign homework",
        due: "2026-09-14",
        max: 20,
      },
      { name: "Quiz 2", category: "Quizzes", due: "2026-09-17", max: 10 },
      {
        name: "WebAssign HW 4",
        category: "WebAssign homework",
        due: "2026-09-21",
        max: 20,
      },
      { name: "Test 1", category: "Tests", due: "2026-09-24", max: 100 },
      {
        name: "WebAssign HW 5",
        category: "WebAssign homework",
        due: "2026-09-28",
        max: 20,
      },
      { name: "Quiz 3", category: "Quizzes", due: "2026-10-01", max: 10 },
      {
        name: "WebAssign HW 6",
        category: "WebAssign homework",
        due: "2026-10-05",
        max: 20,
      },
      {
        name: "WebAssign HW 7",
        category: "WebAssign homework",
        due: "2026-10-12",
        max: 20,
      },
    ],
    docs: [
      {
        id: "ma-l10",
        title: "Lecture 10: Integration by parts",
        type: "notes",
        week: 2,
        summary:
          "The parts formula, choosing u with LIATE, repeated parts, and the trick for integrals that return to themselves.",
        body: `Lecture 10: Integration by parts (section 7.1)

The formula comes from the product rule: integral of u dv = u v - integral of v du. Choose u to be the factor that gets simpler when differentiated and dv to be the factor you can integrate.

Choosing u: LIATE. Logarithmic, Inverse trig, Algebraic, Trigonometric, Exponential. The earlier in the list, the better a choice for u. For x e^x: u = x, dv = e^x dx, giving x e^x - e^x + C. For x ln x: u = ln x (logarithmic beats algebraic), dv = x dx.

Integrals that need parts twice. x^2 sin x: u = x^2 reduces the power each time. Keep the signs straight: after two rounds you get -x^2 cos x + 2x sin x + 2 cos x + C. The tabular method (alternating signs, derivatives of u in one column, integrals of dv in the other) is faster and allowed on tests.

Integrals that return to themselves. e^x cos x: apply parts twice and the original integral reappears on the right side; move it to the left and divide by 2: (e^x (sin x + cos x)) / 2 + C. The same trick handles e^x sin x and sec^3 x.

Sneaky single-factor cases. Integral of ln x: u = ln x, dv = dx, giving x ln x - x + C. Integral of arctan x: u = arctan x, dv = dx, giving x arctan x - (1/2) ln(1 + x^2) + C.

Definite integrals: evaluate the u v term at the limits too. Integral from 1 to e of ln x dx = [x ln x - x] from 1 to e = 1.

Quiz 1 and Test 1 both had an integral requiring parts twice; the most common error was a sign mistake in the second round.`,
      },
      {
        id: "ma-l13",
        title: "Lecture 13: Trig substitution and partial fractions",
        type: "notes",
        week: 4,
        summary:
          "The three trig substitutions and their triangles, and decomposing rational functions into partial fractions, including repeated and quadratic factors.",
        body: `Lecture 13: Trigonometric substitution and partial fractions (sections 7.3-7.4)

Trig substitution handles square roots of quadratics. sqrt(a^2 - x^2): x = a sin t. sqrt(a^2 + x^2): x = a tan t. sqrt(x^2 - a^2): x = a sec t. After substituting, the root collapses using 1 - sin^2 = cos^2, 1 + tan^2 = sec^2, or sec^2 - 1 = tan^2. Draw the right triangle at the end to convert back to x: for x = a sin t, the triangle has hypotenuse a, opposite x, adjacent sqrt(a^2 - x^2).

Example. Integral of dx / (x^2 sqrt(x^2 + 4)): x = 2 tan t, dx = 2 sec^2 t dt, root = 2 sec t. The integrand becomes (1/4) cos t / sin^2 t dt, which integrates to -(1/4) csc t. From the triangle, csc t = sqrt(x^2 + 4) / x, so the answer is -sqrt(x^2 + 4) / (4x) + C.

Partial fractions decompose a proper rational function P(x)/Q(x) (degree of P less than degree of Q; if not, divide first). Factor Q completely. Each distinct linear factor (x - a) gets A / (x - a). A repeated factor (x - a)^2 gets A / (x - a) + B / (x - a)^2. An irreducible quadratic x^2 + bx + c gets (Ax + B) / (x^2 + bx + c).

Finding the constants. Multiply through by Q(x). Either plug in the roots (fast for distinct linear factors: the cover-up method) or match coefficients of powers of x.

Example. (3x + 5) / ((x - 1)(x + 2)) = A/(x - 1) + B/(x + 2). Cover-up: A = (3 + 5)/(1 + 2) = 8/3, B = (-6 + 5)/(-2 - 1) = 1/3. Integral: (8/3) ln|x - 1| + (1/3) ln|x + 2| + C.

Quadratic pieces integrate to a log plus an arctan: split (Ax + B)/(x^2 + 4) into A x/(x^2 + 4) + B/(x^2 + 4).

Test 2 will have one trig substitution and one partial fractions problem; show the triangle and the decomposition setup for partial credit.`,
      },
      {
        id: "ma-l16",
        title: "Lecture 16: Improper integrals",
        type: "notes",
        week: 6,
        summary:
          "Integrals over infinite intervals and across infinite discontinuities, written as limits; the p-test; the comparison test for convergence.",
        body: `Lecture 16: Improper integrals (section 7.8)

Type 1: infinite interval. Integral from 1 to infinity of f(x) dx is defined as the limit as b goes to infinity of the integral from 1 to b. If the limit exists and is finite, the integral converges; otherwise it diverges. Integral from 1 to infinity of 1/x^p dx converges exactly when p > 1, to 1/(p - 1). So 1/x^2 converges (to 1) while 1/x diverges, even though both go to zero.

Type 2: infinite discontinuity. If f blows up at an endpoint, replace that endpoint with a variable and take a one-sided limit. Integral from 0 to 1 of 1/sqrt(x) dx = limit as a goes to 0+ of 2 sqrt(x) from a to 1 = 2, so it converges. Integral from 0 to 1 of 1/x^p dx converges exactly when p < 1 (the opposite of type 1). A discontinuity in the middle of the interval must be split into two integrals; both must converge.

Common trap. Integral from -1 to 1 of 1/x^2 dx is not -2; the function is discontinuous at 0 and the integral diverges. Always check for discontinuities inside the interval before integrating.

Comparison test. If 0 <= f(x) <= g(x) for x >= a and the integral of g converges, so does the integral of f. If the integral of f diverges, so does the integral of g. Use it when you cannot find an antiderivative: the integral from 1 to infinity of e^(-x^2) dx converges because e^(-x^2) <= e^(-x) for x >= 1, and the integral of e^(-x) converges.

Worked example. Integral from 0 to infinity of x e^(-x) dx: parts gives -x e^(-x) - e^(-x), and the limit as b goes to infinity of (-b e^(-b) - e^(-b) + 1) = 1 (b e^(-b) goes to 0 by L'Hopital).

Test 2 topics start here; Quiz 3 covered type 1 and type 2 and the p-test.`,
      },
      {
        id: "ma-test2",
        title: "Test 2 review: sequences and series",
        type: "handout",
        week: 8,
        summary:
          "What Test 2 on Oct 20 covers: improper integrals, arc length, sequences, series, the divergence test, the integral test and comparison tests, with practice problems.",
        body: `MA 241 Test 2 review. Tuesday Oct 20, 8:30 AM, SAS 2203. 75 minutes, no calculator, no notes. Sections 7.8, 8.1-8.2, 11.1-11.4.

Improper integrals (7.8): write the limit, evaluate, state converge or diverge. Know the p-test for both types and the comparison test.

Arc length (8.1): L = integral of sqrt(1 + (dy/dx)^2) dx. Set up and simplify under the root before integrating; the problems are chosen so the root collapses. Surface area of revolution (8.2): S = integral of 2 pi y sqrt(1 + (dy/dx)^2) dx about the x-axis.

Sequences (11.1): a sequence converges if the limit of a_n exists. Use L'Hopital on the related function, the squeeze theorem, and the fact that r^n goes to 0 when |r| < 1. A bounded monotonic sequence converges.

Series (11.2): a series converges if its partial sums converge. Geometric series: sum of a r^n converges to a / (1 - r) when |r| < 1, diverges otherwise. Telescoping series: write out partial sums. Divergence test: if a_n does not go to 0, the series diverges; if a_n goes to 0 the test says nothing (the harmonic series is the warning example).

Integral test (11.3): for positive, continuous, decreasing terms, the series and the integral converge or diverge together. p-series: sum of 1/n^p converges exactly when p > 1. Remainder estimate: R_n is between the integral from n+1 and the integral from n.

Comparison tests (11.4): direct comparison with a known p-series or geometric series; the limit comparison test when the inequality is awkward: if a_n / b_n has a positive finite limit, both series behave the same way.

Practice set: 7.8 #5, 13, 27, 41; 8.1 #9, 15; 11.1 #23, 31, 47; 11.2 #17, 29, 43, 55; 11.3 #7, 19; 11.4 #11, 21, 33. Review session with Jordan Lee: Mon Oct 19, 3-5 PM, SAS 1218.`,
      },
      {
        id: "ma-q3",
        title: "Quiz 3 solutions",
        type: "handout",
        week: 7,
        summary:
          "Worked solutions to the Oct 1 quiz on improper integrals, with the grading notes.",
        body: `MA 241 Quiz 3 solutions (Thursday Oct 1). Average 7.1 / 10.

1. (4 points) Determine whether the integral from 1 to infinity of 1 / (x^2 + x) dx converges, and find its value if it does. Partial fractions: 1 / (x(x + 1)) = 1/x - 1/(x + 1). Antiderivative: ln(x / (x + 1)). As b goes to infinity, ln(b/(b+1)) goes to ln 1 = 0; at x = 1 the value is ln(1/2). Result: 0 - ln(1/2) = ln 2. Converges to ln 2. Common error: forgetting the limit and writing "infinity minus ln(1/2)".

2. (3 points) Integral from 0 to 2 of 1 / (x - 1)^2 dx. The integrand is undefined at x = 1, inside the interval. Split at 1; the integral from 0 to 1 of 1/(x - 1)^2 dx = limit as a goes to 1- of [-1/(x - 1)] from 0 to a, which goes to infinity. Diverges. Many students integrated straight through and got -2; that lost all 3 points because the setup is the whole point.

3. (3 points) Use comparison to decide whether the integral from 1 to infinity of (2 + sin x) / x^2 dx converges. Since 1 <= 2 + sin x <= 3, the integrand is at most 3/x^2, whose integral converges (p = 2). Converges by comparison. Full credit needed the inequality and the name of the p-test or the value p = 2.

If you missed the quiz, see the email from Jordan Lee about a makeup time this week.`,
      },
    ],
  },

  "ECE 200": {
    code: "ECE 200",
    name: "Intro to Signals, Circuits and Systems",
    term: T,
    credits: 4,
    about:
      "DC circuit analysis, equivalent circuits, capacitors and inductors, op-amps and an introduction to signals, with a weekly lab in the same room.",
    instructor: {
      name: "Dr. Sun Park",
      email: "spark9@ncsu.edu",
      office: "EB2 3064",
      hours: "Tue 1–3 PM",
    },
    ta: {
      name: "Omar Haddad",
      email: "ohaddad@ncsu.edu",
      hours: "Thu 3–5 PM, EB2 1021",
    },
    meets: "Mon, Wed 11:20 AM–1:10 PM · EB2 1021 (lecture and lab)",
    textbook:
      "Hambley, Electrical Engineering: Principles and Applications, 7th ed.",
    grading: [
      {
        component: "Problem sets",
        weight_percent: 25,
        notes: "Roughly every two weeks, due Wednesdays 11:59 PM",
      },
      {
        component: "Labs",
        weight_percent: 25,
        notes: "Pre-lab, in-lab check-off and a short report",
      },
      { component: "Midterm", weight_percent: 20, notes: "Fri Oct 9, 3:00 PM" },
      { component: "Final exam", weight_percent: 25, notes: "Cumulative" },
      {
        component: "Participation",
        weight_percent: 5,
        notes: "In-class polls",
      },
    ],
    policies: {
      late_work:
        "Late work is accepted until the Friday of the due week with 10% off per day. No submissions after that.",
      attendance:
        "Labs cannot be made up; a documented absence excuses one lab per term.",
      extensions:
        "Email Dr. Park before the deadline. Problem set 5's deadline is firm because solutions are released before the midterm.",
      academic_integrity:
        "Problem sets may be discussed in groups; submit your own work. Lab reports are per lab pair.",
    },
    deadlines: [
      {
        title: "Midterm",
        kind: "exam",
        date: "2026-10-09",
        time: "15:00",
        weight_percent: 20,
      },
      {
        title: "Lab practical",
        kind: "exam",
        date: "2026-11-09",
        time: "11:20",
        weight_percent: null,
      },
      {
        title: "Final exam",
        kind: "exam",
        date: "2026-12-10",
        time: "13:00",
        weight_percent: 25,
      },
    ],
    schedule: [
      {
        week: 1,
        starts: "2026-08-17",
        topic: "Charge, current, voltage, power; Ohm's law",
        reading: "Ch. 1",
      },
      {
        week: 2,
        starts: "2026-08-24",
        topic: "Kirchhoff's laws; series and parallel",
        reading: "Ch. 2.1–2.3",
      },
      {
        week: 3,
        starts: "2026-08-31",
        topic: "Node voltage analysis",
        reading: "Ch. 2.4",
      },
      {
        week: 4,
        starts: "2026-09-07",
        topic: "Mesh current analysis",
        reading: "Ch. 2.5",
      },
      {
        week: 5,
        starts: "2026-09-14",
        topic: "Thevenin and Norton equivalents; superposition",
        reading: "Ch. 2.6–2.7",
      },
      {
        week: 6,
        starts: "2026-09-21",
        topic: "Capacitors and inductors",
        reading: "Ch. 3",
      },
      {
        week: 7,
        starts: "2026-09-28",
        topic: "RC and RL transients",
        reading: "Ch. 4.1–4.3",
      },
      {
        week: 8,
        starts: "2026-10-05",
        topic: "Op-amps; midterm review; Midterm Fri Oct 9",
        reading: "Ch. 14.1–14.4",
      },
      {
        week: 9,
        starts: "2026-10-12",
        topic: "Sinusoidal steady state; phasors",
        reading: "Ch. 5.1–5.3",
      },
      {
        week: 10,
        starts: "2026-10-19",
        topic: "Impedance and AC circuit analysis",
        reading: "Ch. 5.4–5.6",
      },
    ],
    assignments: [
      {
        name: "Problem set 1",
        category: "Problem sets",
        due: "2026-08-26",
        max: 50,
      },
      {
        name: "Lab 1: Instruments and Ohm's law",
        category: "Labs",
        due: "2026-08-31",
        max: 20,
      },
      {
        name: "Problem set 2",
        category: "Problem sets",
        due: "2026-09-09",
        max: 50,
      },
      {
        name: "Lab 2: Series and parallel",
        category: "Labs",
        due: "2026-09-14",
        max: 20,
      },
      {
        name: "Lab 3: Node voltages",
        category: "Labs",
        due: "2026-09-21",
        max: 20,
      },
      {
        name: "Problem set 3",
        category: "Problem sets",
        due: "2026-09-23",
        max: 50,
      },
      {
        name: "Lab 4: Thevenin equivalents",
        category: "Labs",
        due: "2026-09-28",
        max: 20,
      },
      {
        name: "Problem set 4",
        category: "Problem sets",
        due: "2026-09-30",
        max: 50,
      },
      {
        name: "Lab 5: RC transients",
        category: "Labs",
        due: "2026-10-05",
        max: 20,
      },
      {
        name: "Problem set 5",
        category: "Problem sets",
        due: "2026-10-08",
        max: 50,
      },
    ],
    docs: [
      {
        id: "ece-l8",
        title: "Lecture 8: Node voltage analysis",
        type: "slides",
        week: 3,
        summary:
          "Choosing a reference node, writing KCL at each node in terms of node voltages, handling voltage sources and supernodes, and solving the system.",
        body: `Lecture 8: Node voltage analysis

The idea. Pick one node as the reference (ground, 0 V). Every other node gets an unknown voltage. Write Kirchhoff's current law at each non-reference node: the currents leaving through each branch sum to zero. Each branch current is (voltage difference) / resistance for a resistor, or the source value for a current source. Solve the resulting linear equations.

Procedure. 1. Choose the reference node, usually the one with the most connections or the negative terminal of a voltage source. 2. Label the node voltages v1, v2, ... 3. At each node, sum currents leaving: for a resistor R between node a and node b, the current leaving a is (va - vb)/R. 4. Solve.

Example. Node 1 connects to ground through 4 ohms, to node 2 through 2 ohms, and receives 3 A from a current source. Node 2 connects to ground through 6 ohms. KCL at node 1: v1/4 + (v1 - v2)/2 = 3. KCL at node 2: (v2 - v1)/2 + v2/6 = 0. Multiply out: 3 v1 - 2 v2 = 12 and -3 v1 + 4 v2 = 0, so v2 = 6 V and v1 = 8 V.

Voltage sources. A voltage source between a node and ground fixes that node's voltage: one fewer unknown. A voltage source between two non-reference nodes forms a supernode: write one KCL equation for the pair treated as a single node, plus the constraint va - vb = Vs.

Dependent sources. Write the controlling quantity in terms of node voltages first, then substitute. The equations stay linear.

Checks. Current through each resistor should satisfy Ohm's law with the solved voltages; the currents at every node should sum to zero; power delivered by sources should equal power absorbed by resistors. Lab 3 measured node voltages on a breadboard and compared them with these calculations; typical agreement was within 3%.`,
      },
      {
        id: "ece-l10",
        title: "Lecture 10: Thevenin and Norton equivalents",
        type: "slides",
        week: 5,
        summary:
          "Replacing any two-terminal linear network with a source and a resistor: finding Vth, Rth and In, with dependent sources, and the maximum power transfer theorem.",
        body: `Lecture 10: Thevenin and Norton equivalents

Theorem. Any linear two-terminal circuit is equivalent, at its terminals, to a single voltage source Vth in series with a resistor Rth (Thevenin), or to a current source In in parallel with the same Rth (Norton). In = Vth / Rth.

Finding Vth: the open-circuit voltage across the terminals with the load removed. Finding In: the short-circuit current with the terminals shorted. Finding Rth with only independent sources: turn off every source (voltage sources become shorts, current sources become opens) and compute the resistance seen from the terminals. With dependent sources: leave them on, apply a 1 V test source at the terminals, compute the current it delivers, and Rth = 1 V / i_test; or use Rth = Vth / In.

Example. A 12 V source in series with 4 ohms, in parallel with 12 ohms, feeding terminals a-b. Open-circuit: voltage divider gives Vth = 12 * 12/(4 + 12) = 9 V. Source off: 4 ohms in parallel with 12 ohms, Rth = 3 ohms. Norton: In = 3 A.

Why it matters. Once you have the equivalent, any load can be analyzed with one loop: i = Vth / (Rth + RL). You redo the hard part only once even if the load changes.

Maximum power transfer. A load receives maximum power when RL = Rth, and that maximum is Vth^2 / (4 Rth). Half the power is lost in Rth at that point, so efficiency is only 50%; power systems avoid this, but signal circuits often want it.

Source transformation. A voltage source Vs in series with R is interchangeable with a current source Vs/R in parallel with R. Useful for simplifying a circuit step by step before applying node analysis.

Lab 4 asked you to measure Vth and Rth of a black box and predict the current into three different loads. Problem set 5 is mostly equivalents and transients, and it is the best midterm preparation.`,
      },
      {
        id: "ece-l12",
        title: "Lecture 12: RC circuits and time constants",
        type: "notes",
        week: 7,
        summary:
          "Capacitor charging and discharging as first-order transients, the time constant tau = RC, the universal exponential solution, and inductors as the dual case.",
        body: `Lecture 12: RC and RL transients

Capacitor basics. i = C dv/dt. The voltage across a capacitor cannot change instantly (that would need infinite current). At DC steady state a capacitor is an open circuit. Energy stored: (1/2) C v^2.

Discharging. A capacitor charged to V0 connected across R: v(t) = V0 e^(-t/tau) with tau = RC. After one time constant the voltage is 37% of V0; after five, under 1% (effectively zero).

Charging. Switching a capacitor onto a source Vs through R: v(t) = Vs + (V0 - Vs) e^(-t/tau). The general first-order solution for any RC or RL circuit: x(t) = x_final + (x_initial - x_final) e^(-t/tau). Find three things: the initial value just after the switch (capacitor voltage continuous), the final value (capacitor open), and tau = R_th C where R_th is the Thevenin resistance seen by the capacitor.

Example. 10 V source, 2 kilo-ohm resistor, 100 microfarad capacitor initially at 0 V. tau = 0.2 s. v(t) = 10 (1 - e^(-t/0.2)). At t = 0.2 s, v = 6.3 V; at t = 1 s, v = 9.93 V. The current starts at 5 mA and decays with the same tau.

Inductors are the dual. v = L di/dt; current cannot change instantly; at DC an inductor is a short. tau = L / R_th. Energy: (1/2) L i^2.

Lab 5 captured the charging curve on the oscilloscope and estimated tau from the 63% point; the measured values were within 5% of RC, with the error mostly from the capacitor's tolerance.

Midterm: expect one full transient problem (find initial, final, tau, write v(t), evaluate at a given time) and one conceptual question about why capacitor voltage is continuous.`,
      },
      {
        id: "ece-lab5",
        title: "Lab 5 handout: Op-amp amplifiers",
        type: "lab",
        week: 8,
        summary:
          "Building inverting and non-inverting amplifiers with a 741 op-amp, measuring gain, and seeing saturation; pre-lab questions and report requirements.",
        body: `Lab 5: Operational amplifiers. Pre-lab due at the start of lab; report due Monday Oct 12, 11:59 PM.

Ideal op-amp rules. 1. No current flows into the input terminals. 2. With negative feedback, the two input voltages are equal (the virtual short). Everything in this lab follows from those two rules plus KCL at the inverting input.

Inverting amplifier. Input through R1 to the inverting terminal, feedback resistor Rf from output to inverting terminal, non-inverting terminal grounded. Gain = -Rf / R1. With R1 = 10 k and Rf = 100 k, gain = -10: a 0.5 V peak sine in gives a 5 V peak sine out, inverted.

Non-inverting amplifier. Input to the non-inverting terminal; Rf from output to the inverting terminal; R1 from inverting terminal to ground. Gain = 1 + Rf / R1. Same resistors give a gain of 11, not inverted. Input resistance is very high, which is why this form is preferred when the source is weak.

Saturation. The output cannot exceed the supply rails (about plus or minus 13.5 V with plus or minus 15 V supplies on a 741). Increase the input amplitude until the output clips flat; record the input level where it starts. Gain measured below saturation should match theory within resistor tolerance (5%).

Pre-lab questions. 1. For R1 = 4.7 k and Rf = 47 k, find both gains. 2. What input amplitude saturates the inverting amplifier with plus or minus 15 V supplies? 3. Why does the virtual short not apply without feedback?

Report (20 points): schematic (3), table of measured vs. predicted gain for both circuits (6), one oscilloscope capture showing saturation with the input level labeled (4), discussion of the discrepancy sources (5), pre-lab answers attached (2).`,
      },
      {
        id: "ece-mid",
        title: "Midterm review sheet",
        type: "handout",
        week: 8,
        summary:
          "Coverage and format of the Oct 9 midterm (chapters 1–4), the equations provided, and what to practice.",
        body: `ECE 200 Midterm. Friday Oct 9, 3:00-4:15 PM, EB2 1021. Closed book. One handwritten page of notes and a non-programmable calculator are allowed.

Coverage: chapters 1 through 4. Ohm's law, power and energy; Kirchhoff's laws; series and parallel combinations, voltage and current dividers; node voltage and mesh current analysis, including supernodes and dependent sources; Thevenin and Norton equivalents, source transformation, superposition, maximum power transfer; capacitors and inductors; first-order RC and RL transients.

Format: 5 problems, 20 points each. Partial credit for a correct setup (reference node chosen and labeled, KCL equations written) even if the algebra goes wrong.

Provided: the universal first-order solution x(t) = x_final + (x_initial - x_final) e^(-t/tau), tau = RC and L/R, and the maximum power formula.

Practice: problem sets 1-5 (solutions for sets 1-4 are on Moodle; set 5 solutions post Thursday evening, which is why its deadline is firm). Lab 3 and Lab 4 calculations. Textbook problems 2.31, 2.45, 2.62, 2.78, 3.12, 4.9, 4.21.

Review session: Wednesday Oct 7, 5:00-6:30 PM, EB2 1021, run by Omar Haddad. Bring questions from the problem sets.`,
      },
    ],
  },

  "EC 201": {
    code: "EC 201",
    name: "Principles of Microeconomics",
    term: T,
    credits: 3,
    about:
      "How markets work: supply and demand, elasticity, welfare, taxes, market failure, and the behavior of firms and consumers.",
    instructor: {
      name: "Dr. Angela Moss",
      email: "amoss@ncsu.edu",
      office: "Nelson 4162",
      hours: "Wed 1–3 PM",
    },
    ta: {
      name: "Ben Carter",
      email: "bcarter@ncsu.edu",
      hours: "Fri 10 AM–12 PM, Nelson 3104",
    },
    meets: "Tue, Thu 10:15–11:30 AM · Nelson 3400",
    textbook: "Mankiw, Principles of Microeconomics, 10th ed., with Aplia",
    grading: [
      {
        component: "Exams",
        weight_percent: 45,
        notes: "Three exams, 15% each",
      },
      { component: "Final exam", weight_percent: 25, notes: "Cumulative" },
      {
        component: "Online homework",
        weight_percent: 20,
        notes: "Aplia, due Sundays 11:59 PM",
      },
      {
        component: "Participation",
        weight_percent: 10,
        notes: "iClicker; best 80% of sessions",
      },
    ],
    policies: {
      late_work:
        "Aplia homework can be submitted up to one week late for 50% credit.",
      attendance:
        "iClicker participation counts for 10%; the lowest 20% of sessions are dropped, so no documentation is needed for occasional absences.",
      extensions:
        "Exam makeups require documentation and must be scheduled within one week.",
      academic_integrity:
        "Exams are individual. Homework may be discussed but each student submits their own answers.",
    },
    deadlines: [
      {
        title: "Exam 2",
        kind: "exam",
        date: "2026-10-15",
        time: "10:15",
        weight_percent: 15,
      },
      {
        title: "Exam 3",
        kind: "exam",
        date: "2026-11-12",
        time: "10:15",
        weight_percent: 15,
      },
      {
        title: "Final exam",
        kind: "exam",
        date: "2026-12-08",
        time: "08:00",
        weight_percent: 25,
      },
    ],
    schedule: [
      {
        week: 1,
        starts: "2026-08-17",
        topic: "Ten principles; thinking like an economist",
        reading: "Ch. 1–2",
      },
      {
        week: 2,
        starts: "2026-08-24",
        topic: "Comparative advantage and trade",
        reading: "Ch. 3",
      },
      {
        week: 3,
        starts: "2026-08-31",
        topic: "Supply and demand",
        reading: "Ch. 4",
      },
      { week: 4, starts: "2026-09-07", topic: "Elasticity", reading: "Ch. 5" },
      {
        week: 5,
        starts: "2026-09-14",
        topic: "Price controls; Exam 1 (Thu Sep 17)",
        reading: "Ch. 6",
      },
      {
        week: 6,
        starts: "2026-09-21",
        topic: "Consumer and producer surplus",
        reading: "Ch. 7",
      },
      {
        week: 7,
        starts: "2026-09-28",
        topic: "Taxes and deadweight loss",
        reading: "Ch. 8",
      },
      {
        week: 8,
        starts: "2026-10-05",
        topic: "International trade; Exam 2 review",
        reading: "Ch. 9",
      },
      {
        week: 9,
        starts: "2026-10-12",
        topic: "Exam 2 (Thu Oct 15); externalities",
        reading: "Ch. 10",
      },
      {
        week: 10,
        starts: "2026-10-19",
        topic: "Public goods and common resources",
        reading: "Ch. 11",
      },
    ],
    assignments: [
      {
        name: "Aplia HW 1",
        category: "Online homework",
        due: "2026-08-30",
        max: 20,
      },
      {
        name: "Aplia HW 2",
        category: "Online homework",
        due: "2026-09-06",
        max: 20,
      },
      {
        name: "Aplia HW 3",
        category: "Online homework",
        due: "2026-09-13",
        max: 20,
      },
      { name: "Exam 1", category: "Exams", due: "2026-09-17", max: 100 },
      {
        name: "Aplia HW 4",
        category: "Online homework",
        due: "2026-09-20",
        max: 20,
      },
      {
        name: "Aplia HW 5",
        category: "Online homework",
        due: "2026-09-27",
        max: 20,
      },
      {
        name: "Aplia HW 6",
        category: "Online homework",
        due: "2026-10-04",
        max: 20,
      },
      {
        name: "Aplia HW 7",
        category: "Online homework",
        due: "2026-10-11",
        max: 20,
      },
    ],
    docs: [
      {
        id: "ec-l6",
        title: "Lecture 6: Elasticity",
        type: "slides",
        week: 4,
        summary:
          "Price elasticity of demand and supply, the midpoint method, what makes demand elastic, and how elasticity determines whether a price rise raises revenue.",
        body: `Lecture 6: Elasticity (chapter 5)

Price elasticity of demand measures how much quantity demanded responds to a price change: percentage change in quantity divided by percentage change in price (reported as a positive number). Elastic: greater than 1. Inelastic: less than 1. Unit elastic: exactly 1.

Midpoint method. Use the average of the two prices and the two quantities as the base, so the answer is the same whichever direction you move: (Q2 - Q1) / ((Q2 + Q1)/2) divided by (P2 - P1) / ((P2 + P1)/2). Example: price rises from 4 to 6, quantity falls from 120 to 80. Quantity change: 40/100 = 40%. Price change: 2/5 = 40%. Elasticity = 1, unit elastic.

What makes demand more elastic: close substitutes available (butter vs. margarine), a luxury rather than a necessity, a narrowly defined market (one brand vs. all food), and a longer time horizon (people find alternatives eventually; gasoline is inelastic this month, more elastic over five years).

Along a straight-line demand curve elasticity is not constant: it is high at the top (high price, low quantity) and low at the bottom. Perfectly inelastic demand is vertical; perfectly elastic demand is horizontal.

Total revenue test. Revenue = price times quantity. If demand is inelastic, a price rise raises revenue (quantity falls proportionally less). If demand is elastic, a price rise lowers revenue. This is why a bad harvest can raise farmers' total revenue (food demand is inelastic) and why a bus fare increase can backfire if riders have alternatives.

Other elasticities. Income elasticity (positive for normal goods, negative for inferior goods, above 1 for luxuries). Cross-price elasticity (positive for substitutes, negative for complements). Price elasticity of supply: how quantity supplied responds to price; higher when producers can adjust easily and over longer periods.

Exam 2 will have a midpoint calculation and a revenue question. Aplia HW 4 is the best practice.`,
      },
      {
        id: "ec-l9",
        title: "Lecture 9: Consumer and producer surplus",
        type: "slides",
        week: 6,
        summary:
          "Willingness to pay and consumer surplus, cost and producer surplus, measuring them as areas, and why the market equilibrium maximizes total surplus.",
        body: `Lecture 9: Consumers, producers and the efficiency of markets (chapter 7)

Consumer surplus. Willingness to pay is the maximum a buyer would pay. Consumer surplus is willingness to pay minus the price actually paid, summed over all buyers: the area below the demand curve and above the price. If the price falls, existing buyers gain and new buyers enter; both add to consumer surplus.

Producer surplus. Cost is the minimum a seller would accept (opportunity cost of producing). Producer surplus is price minus cost, summed over all sellers: the area above the supply curve and below the price.

Total surplus = consumer surplus + producer surplus = value to buyers minus cost to sellers. The free-market equilibrium maximizes total surplus: the goods go to the buyers who value them most, are produced by the sellers with the lowest cost, and the quantity is where marginal value equals marginal cost. Producing less leaves valuable trades unmade; producing more means units that cost more than they are worth.

Worked example. Linear demand P = 100 - Q, supply P = 20 + Q. Equilibrium: Q = 40, P = 60. Consumer surplus: triangle with height 100 - 60 = 40 and base 40, area 800. Producer surplus: height 60 - 20 = 40, base 40, area 800. Total surplus 1600.

Caveats. Efficiency is not equity: the market says nothing about whether the distribution is fair. The result also assumes competitive markets with no externalities; those assumptions fail in chapters 10 and 15 and the market no longer maximizes surplus.

Exam 2: expect to compute consumer and producer surplus from a graph or equations, and to explain in words why a quantity below equilibrium wastes surplus.`,
      },
      {
        id: "ec-l11",
        title: "Lecture 11: Taxes and deadweight loss",
        type: "notes",
        week: 7,
        summary:
          "How a tax drives a wedge between buyer and seller prices, who bears the burden, tax revenue, deadweight loss, and how elasticity changes all of it.",
        body: `Lecture 11: Application: the costs of taxation (chapter 8)

A tax on a good drives a wedge between the price buyers pay and the price sellers receive, equal to the tax. It does not matter whether the tax is legally collected from buyers or sellers; the outcome is the same. Quantity falls below the no-tax equilibrium.

Tax incidence. The burden falls more heavily on the side of the market that is less elastic. If demand is inelastic (buyers cannot easily avoid the good), buyers pay most of the tax through a higher price. If supply is inelastic, sellers absorb most of it. Rule: the inelastic side bears the burden.

Tax revenue = tax per unit times the quantity sold with the tax: a rectangle on the graph.

Deadweight loss. Trades between the old and new quantities no longer happen even though buyers valued those units more than they cost to produce. The lost total surplus is the triangle between the demand and supply curves over that range. Deadweight loss = (1/2) times the tax times the fall in quantity.

Example. Demand P = 100 - Q, supply P = 20 + Q, tax of 20 per unit. With the tax, buyers' price minus sellers' price = 20: 100 - Q - (20 + Q) = 20, so Q = 30. Buyers pay 70, sellers receive 50. Revenue = 20 times 30 = 600. Deadweight loss = (1/2)(20)(40 - 30) = 100. Here demand and supply have equal slopes, so the burden splits evenly: buyers pay 10 more, sellers get 10 less.

Elasticity and deadweight loss. The more elastic demand or supply, the larger the fall in quantity and the bigger the deadweight loss. Taxes on goods with inelastic demand raise revenue with little distortion. Doubling a tax roughly quadruples the deadweight loss (the triangle scales with the square of the tax), while revenue first rises, then falls at very high taxes (the Laffer curve).

Exam 2 problem types: find the with-tax quantity and the two prices, compute revenue and deadweight loss, and state which side bears more of the burden and why.`,
      },
      {
        id: "ec-exam2",
        title: "Exam 2 study guide (chapters 5–8)",
        type: "handout",
        week: 8,
        summary:
          "Format and coverage of the Oct 15 exam: elasticity, price controls, surplus, and taxation, with the skills checklist.",
        body: `EC 201 Exam 2. Thursday Oct 15, 10:15-11:30 AM, Nelson 3400. 35 multiple-choice questions (2 points each) and 3 short problems (10 points each). Bring a pencil and a basic calculator. Chapters 5 through 8.

Skills checklist.

Elasticity (ch. 5): compute price elasticity of demand with the midpoint method; classify elastic, inelastic, unit elastic; explain the determinants of elasticity; use the total revenue test; interpret income and cross-price elasticities; compute elasticity of supply.

Price controls (ch. 6): draw a binding price ceiling (below equilibrium) and show the shortage; draw a binding price floor (above equilibrium) and show the surplus; explain why rent control and minimum wage create these effects and who gains and loses.

Welfare (ch. 7): define willingness to pay and cost; compute consumer, producer and total surplus from a graph or linear equations; explain why the competitive equilibrium is efficient.

Taxation (ch. 8): show a tax as a wedge; find the quantity, buyer price and seller price with a tax; compute tax revenue and deadweight loss; explain tax incidence and the role of elasticity; describe how deadweight loss and revenue change as a tax grows.

Practice: Aplia HW 4-7, end-of-chapter problems 5.7, 5.9, 6.4, 6.8, 7.6, 8.3, 8.7, and the Exam 1 format (the same proportions of question types). Review session with Ben Carter: Tuesday Oct 13, 4-6 PM, Nelson 3104.`,
      },
    ],
  },

  "PY 205": {
    code: "PY 205",
    name: "Physics for Engineers I",
    term: T,
    credits: 3,
    about:
      "Calculus-based mechanics: kinematics, Newton's laws, work and energy, momentum, rotation and oscillations.",
    instructor: {
      name: "Dr. Rachel Nguyen",
      email: "rnguyen@ncsu.edu",
      office: "Riddick 414",
      hours: "Mon 1–3 PM",
    },
    ta: {
      name: "Luis Ferreira",
      email: "lferreira@ncsu.edu",
      hours: "Thu 2–4 PM, Riddick 322",
    },
    meets: "Mon, Wed, Fri 8:30–9:20 AM · Riddick 301",
    lab: "Tue 2:20–4:10 PM · Riddick 322",
    textbook:
      "Knight, Physics for Scientists and Engineers, 5th ed. (chapters 1–15)",
    grading: [
      {
        component: "WebAssign homework",
        weight_percent: 15,
        notes: "Weekly, due Fridays 11:59 PM",
      },
      {
        component: "Labs",
        weight_percent: 15,
        notes: "Weekly; two lowest dropped",
      },
      {
        component: "Tests",
        weight_percent: 45,
        notes: "Three tests, 15% each",
      },
      {
        component: "Final exam",
        weight_percent: 25,
        notes: "Common final, cumulative",
      },
    ],
    policies: {
      late_work:
        "WebAssign accepts late submissions for 48 hours at 70% credit. Labs are due at the end of the lab period.",
      attendance:
        "Lecture attendance is not graded. Lab attendance is required; two lab grades are dropped to cover absences.",
      extensions:
        "Test makeups within one week with documentation. No extensions on homework beyond the automatic 48 hours.",
      academic_integrity:
        "Tests use a formula sheet provided by the department; no personal notes. Homework collaboration is allowed.",
    },
    deadlines: [
      {
        title: "Test 2",
        kind: "exam",
        date: "2026-10-13",
        time: "08:30",
        weight_percent: 15,
      },
      {
        title: "Test 3",
        kind: "exam",
        date: "2026-11-16",
        time: "08:30",
        weight_percent: 15,
      },
      {
        title: "Final exam",
        kind: "exam",
        date: "2026-12-14",
        time: "13:00",
        weight_percent: 25,
      },
    ],
    schedule: [
      {
        week: 1,
        starts: "2026-08-17",
        topic: "Units, vectors, motion in one dimension",
        reading: "Ch. 1–2",
      },
      {
        week: 2,
        starts: "2026-08-24",
        topic: "Motion in two dimensions; projectiles",
        reading: "Ch. 3–4",
      },
      {
        week: 3,
        starts: "2026-08-31",
        topic: "Newton's laws; free-body diagrams",
        reading: "Ch. 5–6",
      },
      {
        week: 4,
        starts: "2026-09-07",
        topic: "Friction, drag, circular motion",
        reading: "Ch. 6–8",
      },
      {
        week: 5,
        starts: "2026-09-14",
        topic: "Test 1 (Mon Sep 14); Newton's third law and ropes",
        reading: "Ch. 7",
      },
      {
        week: 6,
        starts: "2026-09-21",
        topic: "Work and kinetic energy",
        reading: "Ch. 9",
      },
      {
        week: 7,
        starts: "2026-09-28",
        topic: "Potential energy and conservation of energy",
        reading: "Ch. 10",
      },
      {
        week: 8,
        starts: "2026-10-05",
        topic: "Impulse and momentum; collisions",
        reading: "Ch. 11",
      },
      {
        week: 9,
        starts: "2026-10-12",
        topic: "Test 2 (Tue Oct 13, evening); rotation of rigid bodies",
        reading: "Ch. 12",
      },
      {
        week: 10,
        starts: "2026-10-19",
        topic: "Torque and angular momentum",
        reading: "Ch. 12",
      },
    ],
    assignments: [
      {
        name: "Lab 1: Measurement and uncertainty",
        category: "Labs",
        due: "2026-08-25",
        max: 10,
      },
      {
        name: "WebAssign HW 1",
        category: "WebAssign homework",
        due: "2026-08-28",
        max: 20,
      },
      {
        name: "WebAssign HW 2",
        category: "WebAssign homework",
        due: "2026-09-04",
        max: 20,
      },
      {
        name: "Lab 2: Projectile motion",
        category: "Labs",
        due: "2026-09-08",
        max: 10,
      },
      {
        name: "WebAssign HW 3",
        category: "WebAssign homework",
        due: "2026-09-11",
        max: 20,
      },
      { name: "Test 1", category: "Tests", due: "2026-09-14", max: 100 },
      {
        name: "Lab 3: Newton's second law",
        category: "Labs",
        due: "2026-09-15",
        max: 10,
      },
      {
        name: "WebAssign HW 4",
        category: "WebAssign homework",
        due: "2026-09-18",
        max: 20,
      },
      { name: "Lab 4: Friction", category: "Labs", due: "2026-09-22", max: 10 },
      {
        name: "WebAssign HW 5",
        category: "WebAssign homework",
        due: "2026-09-25",
        max: 20,
      },
      {
        name: "Lab 5: Work and energy",
        category: "Labs",
        due: "2026-09-29",
        max: 10,
      },
      {
        name: "WebAssign HW 6",
        category: "WebAssign homework",
        due: "2026-10-02",
        max: 20,
      },
      {
        name: "Lab 6: Conservation of energy",
        category: "Labs",
        due: "2026-10-06",
        max: 10,
      },
      {
        name: "WebAssign HW 7",
        category: "WebAssign homework",
        due: "2026-10-09",
        max: 20,
      },
    ],
    docs: [
      {
        id: "py-l11",
        title: "Lecture 11: Newton's laws and free-body diagrams",
        type: "slides",
        week: 3,
        summary:
          "The three laws, a reliable procedure for free-body diagrams, choosing axes, and worked examples with inclines and connected objects.",
        body: `Lecture 11: Newton's laws and free-body diagrams

First law: an object with zero net force moves at constant velocity (including staying at rest). Second law: net force = m a, a vector equation applied one axis at a time. Third law: forces come in pairs; if A pushes on B, B pushes on A with equal magnitude and opposite direction. Third-law pairs act on different objects and never cancel in one free-body diagram.

Free-body diagram procedure. 1. Isolate one object. 2. Draw every force acting on it: weight (always down, mg), normal force (perpendicular to the surface), tension (along the rope, away from the object), friction (along the surface, opposing relative motion or intended motion), applied pushes. Do not draw "ma" or velocity as forces. 3. Choose axes, usually with one axis along the acceleration. 4. Write sum of F = m a for each axis. 5. Solve, then check units and limiting cases.

Incline example. A 5 kg block on a frictionless 30 degree incline. Axes along and perpendicular to the surface. Along: mg sin 30 = m a, so a = 4.9 m/s^2 down the slope. Perpendicular: N - mg cos 30 = 0, so N = 42.4 N. Notice N is less than mg.

Connected objects. Two blocks tied by a rope over a pulley (Atwood machine): m1 = 2 kg, m2 = 3 kg. Draw separate diagrams; the tension is the same magnitude on both (massless rope, frictionless pulley); both accelerate at the same rate. m2 g - T = m2 a and T - m1 g = m1 a. Adding: a = (m2 - m1) g / (m1 + m2) = 1.96 m/s^2; T = 23.5 N. Check: T is between m1 g and m2 g, as it must be.

Apparent weight. In an elevator accelerating up at a, the scale reads m(g + a); accelerating down, m(g - a); in free fall, zero.

Test 2 will include an incline with friction and a connected-object problem. Partial credit is given for a correct free-body diagram even with algebra errors, so always draw it.`,
      },
      {
        id: "py-l14",
        title: "Lecture 14: Work and kinetic energy",
        type: "slides",
        week: 6,
        summary:
          "Work as force times displacement along the motion, the work-energy theorem, work by variable forces as an integral, and power.",
        body: `Lecture 14: Work and kinetic energy (chapter 9)

Work done by a constant force: W = F d cos(theta), where theta is the angle between the force and the displacement. Work is a scalar in joules. A force perpendicular to the motion does no work (the normal force on a sliding block, tension in a circular pendulum). A force opposing motion does negative work (kinetic friction).

Kinetic energy: K = (1/2) m v^2. Work-energy theorem: the net work done on an object equals its change in kinetic energy, W_net = K_final - K_initial. This is Newton's second law integrated over distance, and it is often the fastest route to a speed when the path is messy but the forces are known.

Variable force. W = integral of F(x) dx from x1 to x2, the area under the force-position graph. For a spring, F = -k x, so the work done by the spring from x1 to x2 is (1/2) k x1^2 - (1/2) k x2^2. Stretching a spring from rest to x takes (1/2) k x^2 of work by you.

Example. A 1200 kg car brakes from 20 m/s to rest. Change in kinetic energy: 0 - (1/2)(1200)(400) = -240 kJ. If the braking force is 8000 N, the stopping distance is 240000 / 8000 = 30 m. Doubling the speed quadruples the distance.

Example with friction. A 2 kg block is pushed 3 m across a floor by a 15 N horizontal force with kinetic friction coefficient 0.3. Work by push: 45 J. Work by friction: -(0.3)(2)(9.8)(3) = -17.6 J. Net work 27.4 J, so the final speed is sqrt(2 * 27.4 / 2) = 5.2 m/s if it started from rest.

Power is the rate of doing work: P = W / t, or P = F v for a force along the velocity. Units: watts. A 75 kg student climbing 20 stairs (3.5 m) in 6 s delivers about 430 W.

Lab 5 measured the work done by a spring launcher and compared it with the kinetic energy of the cart; expect a related question on Test 2.`,
      },
      {
        id: "py-l17",
        title: "Lecture 17: Conservation of energy",
        type: "notes",
        week: 7,
        summary:
          "Potential energy for gravity and springs, conservative vs. non-conservative forces, the energy conservation equation with friction, and the pendulum and loop-the-loop examples.",
        body: `Lecture 17: Potential energy and conservation of energy (chapter 10)

Potential energy stores work that can be recovered. Gravitational: U = m g y near the surface, with y measured from any convenient reference level. Spring: U = (1/2) k x^2 with x the stretch or compression from the natural length.

Conservative forces (gravity, springs) do work that depends only on the start and end points, so they have a potential energy. Non-conservative forces (friction, air drag, a person pushing) do not; their work depends on the path and turns mechanical energy into thermal energy.

The master equation: K1 + U1 + W_other = K2 + U2, where W_other is the work by non-conservative forces (negative for friction). With no friction, mechanical energy K + U is conserved.

Pendulum. Released from rest at height h above the bottom: speed at the bottom v = sqrt(2 g h), independent of mass and of the rope length. The tension does no work because it is always perpendicular to the motion.

Loop-the-loop. A cart must start at least 2.5 R above the bottom of a frictionless loop of radius R to stay on the track at the top; at the top, the minimum speed is sqrt(g R) (normal force just reaches zero) and energy conservation gives the height.

Spring and incline with friction. A 0.5 kg block compresses a spring (k = 200 N/m) by 0.1 m and is released up a 20 degree incline with mu_k = 0.2. Spring energy 1 J. Along the incline distance d, gravity takes m g d sin 20 and friction takes mu_k m g d cos 20. Solve 1 = 0.5 * 9.8 * d (sin 20 + 0.2 cos 20) = 2.6 d, so d = 0.38 m.

Energy diagrams. Plot U(x); the object oscillates between turning points where E = U; the force is minus the slope. Stable equilibrium at a minimum of U.

Lab 6 (due Tue Oct 6) checks conservation on a track with a photogate; Test 2 covers chapters 7 through 11.`,
      },
      {
        id: "py-test2",
        title: "Test 2 practice problems",
        type: "handout",
        week: 8,
        summary:
          "Six practice problems in the style of the Oct 13 test, covering Newton's laws with friction, work-energy, conservation of energy and momentum, with answers.",
        body: `PY 205 Test 2 practice. Test 2 is Tuesday Oct 13, 8:30 AM, Riddick 301 (common-exam period). Chapters 7-11. Department formula sheet provided; bring a calculator and a pencil.

1. A 10 kg crate is pulled across a floor by a rope at 30 degrees above horizontal with 60 N of tension; mu_k = 0.25. Find the acceleration. (Answer: normal force = 98 - 30 = 68 N; friction = 17 N; horizontal: 52 - 17 = 10 a; a = 3.5 m/s^2.)

2. Two blocks, 4 kg on a frictionless table and 2 kg hanging over a pulley. Find the acceleration and the tension. (Answer: a = 2 * 9.8 / 6 = 3.27 m/s^2; T = 13.1 N.)

3. A 1500 kg car going 25 m/s brakes to rest in 50 m. Find the average braking force using work-energy. (Answer: K = 468.75 kJ; F = 9375 N.)

4. A 0.2 kg ball is thrown at 12 m/s at 40 degrees from a 15 m cliff. Find its speed just before hitting the ground, ignoring air resistance. (Answer: energy conservation: v = sqrt(144 + 2 * 9.8 * 15) = 20.9 m/s; the angle does not matter.)

5. A 3 kg block slides down a 2 m long, 35 degree incline with mu_k = 0.15, starting from rest. Find its speed at the bottom. (Answer: height 1.15 m; gravity work 33.7 J; friction work -(0.15)(3)(9.8)(cos 35)(2) = -7.2 J; v = sqrt(2 * 26.5 / 3) = 4.2 m/s.)

6. A 2 kg cart at 3 m/s collides with a stationary 1 kg cart and they stick. Find the final speed and the kinetic energy lost. (Answer: v = 2 m/s; K before = 9 J, after = 6 J, 3 J lost.)

Students who did well on Test 1 reported working these without looking at the answers first, then checking. Luis Ferreira's review session: Monday Oct 12, 5-7 PM, Riddick 322.`,
      },
    ],
  },

  "CH 101": {
    code: "CH 101",
    name: "Chemistry: A Molecular Science",
    term: T,
    credits: 3,
    about:
      "Atoms, molecules and reactions: stoichiometry, solutions, gases, thermochemistry and the beginnings of atomic structure.",
    instructor: {
      name: "Dr. Kevin Oduya",
      email: "koduya@ncsu.edu",
      office: "Dabney 322",
      hours: "Fri 1–3 PM",
    },
    ta: {
      name: "Maria Gomez",
      email: "mgomez4@ncsu.edu",
      hours: "Tue 3–5 PM, Dabney 210",
    },
    meets: "Mon, Wed, Fri 10:40–11:30 AM · Dabney 220",
    lab: "Recitation Thu 11:45 AM–12:35 PM · Dabney 210",
    textbook: "Chemistry: The Molecular Science (NC State edition) with OWLv2",
    grading: [
      {
        component: "Exams",
        weight_percent: 45,
        notes: "Three exams, 15% each",
      },
      { component: "Final exam", weight_percent: 25, notes: "Cumulative" },
      {
        component: "Online homework",
        weight_percent: 15,
        notes: "OWL, due Sundays 11:59 PM",
      },
      {
        component: "Quizzes",
        weight_percent: 10,
        notes: "Wednesdays, every other week, in lecture",
      },
      {
        component: "Recitation",
        weight_percent: 5,
        notes: "Weekly worksheets, completion",
      },
    ],
    policies: {
      late_work:
        "OWL assignments can be completed up to 3 days late for 80% credit. Quizzes and recitation worksheets cannot be made up.",
      attendance:
        "Recitation attendance is required for the worksheet credit. Lecture attendance is strongly encouraged; quizzes are given in lecture.",
      extensions:
        "Exam conflicts must be reported one week in advance. Illness requires documentation for a makeup.",
      academic_integrity:
        "Exams allow only the provided periodic table and a non-programmable calculator.",
    },
    deadlines: [
      {
        title: "Exam 1",
        kind: "exam",
        date: "2026-10-08",
        time: "09:00",
        weight_percent: 15,
      },
      {
        title: "Exam 2",
        kind: "exam",
        date: "2026-11-05",
        time: "09:00",
        weight_percent: 15,
      },
      {
        title: "Exam 3",
        kind: "exam",
        date: "2026-12-02",
        time: "09:00",
        weight_percent: 15,
      },
      {
        title: "Final exam",
        kind: "exam",
        date: "2026-12-11",
        time: "08:00",
        weight_percent: 25,
      },
    ],
    schedule: [
      {
        week: 1,
        starts: "2026-08-17",
        topic: "Matter, measurement, significant figures",
        reading: "Ch. 1",
      },
      {
        week: 2,
        starts: "2026-08-24",
        topic: "Atoms, ions and the periodic table",
        reading: "Ch. 2",
      },
      {
        week: 3,
        starts: "2026-08-31",
        topic: "Compounds and nomenclature",
        reading: "Ch. 2–3",
      },
      {
        week: 4,
        starts: "2026-09-07",
        topic: "Stoichiometry: moles, formulas, limiting reactants",
        reading: "Ch. 3",
      },
      {
        week: 5,
        starts: "2026-09-14",
        topic: "Reactions in aqueous solution",
        reading: "Ch. 4",
      },
      {
        week: 6,
        starts: "2026-09-21",
        topic: "Acid-base and redox reactions; solution stoichiometry",
        reading: "Ch. 4",
      },
      {
        week: 7,
        starts: "2026-09-28",
        topic: "Gases: the ideal gas law",
        reading: "Ch. 5",
      },
      {
        week: 8,
        starts: "2026-10-05",
        topic: "Gas mixtures and kinetic theory; Exam 1 (Thu Oct 8)",
        reading: "Ch. 5",
      },
      {
        week: 9,
        starts: "2026-10-12",
        topic: "Thermochemistry: enthalpy",
        reading: "Ch. 6",
      },
      {
        week: 10,
        starts: "2026-10-19",
        topic: "Calorimetry and Hess's law",
        reading: "Ch. 6",
      },
    ],
    assignments: [
      {
        name: "Recitation 1",
        category: "Recitation",
        due: "2026-08-27",
        max: 5,
      },
      {
        name: "OWL HW 1",
        category: "Online homework",
        due: "2026-08-30",
        max: 20,
      },
      { name: "Quiz 1", category: "Quizzes", due: "2026-09-02", max: 10 },
      {
        name: "Recitation 2",
        category: "Recitation",
        due: "2026-09-03",
        max: 5,
      },
      {
        name: "OWL HW 2",
        category: "Online homework",
        due: "2026-09-06",
        max: 20,
      },
      {
        name: "Recitation 3",
        category: "Recitation",
        due: "2026-09-10",
        max: 5,
      },
      {
        name: "OWL HW 3",
        category: "Online homework",
        due: "2026-09-13",
        max: 20,
      },
      { name: "Quiz 2", category: "Quizzes", due: "2026-09-16", max: 10 },
      {
        name: "Recitation 4",
        category: "Recitation",
        due: "2026-09-17",
        max: 5,
      },
      {
        name: "OWL HW 4",
        category: "Online homework",
        due: "2026-09-20",
        max: 20,
      },
      {
        name: "Recitation 5",
        category: "Recitation",
        due: "2026-09-24",
        max: 5,
      },
      {
        name: "OWL HW 5",
        category: "Online homework",
        due: "2026-09-27",
        max: 20,
      },
      { name: "Quiz 3", category: "Quizzes", due: "2026-09-30", max: 10 },
      {
        name: "OWL HW 6",
        category: "Online homework",
        due: "2026-10-04",
        max: 20,
      },
      {
        name: "OWL HW 7",
        category: "Online homework",
        due: "2026-10-11",
        max: 20,
      },
    ],
    docs: [
      {
        id: "ch-c3",
        title: "Chapter 3: Stoichiometry (lecture notes)",
        type: "notes",
        week: 4,
        summary:
          "Moles and molar mass, balancing equations, mole ratios, limiting reactants, theoretical and percent yield, with worked examples.",
        body: `Chapter 3: Stoichiometry

The mole. One mole is 6.022 x 10^23 particles. Molar mass (g/mol) comes from the periodic table: H2O is 2(1.008) + 16.00 = 18.02 g/mol. Converting: grams to moles divide by molar mass; moles to particles multiply by Avogadro's number.

Balancing equations. Change coefficients, never subscripts. Balance elements that appear in only one compound on each side first, leave H and O for last, and clear fractions at the end. Example: C3H8 + 5 O2 -> 3 CO2 + 4 H2O.

Mole ratios. Coefficients give the ratio of moles reacting. From 2.0 mol of propane, 2.0 x 5 = 10 mol of O2 are needed and 2.0 x 3 = 6.0 mol of CO2 form. The road map for any problem: grams of A -> moles of A -> moles of B (mole ratio) -> grams of B.

Limiting reactant. When amounts of two reactants are given, one runs out first. Convert each to moles, divide each by its coefficient, and the smallest result is the limiting reactant; it determines the product amount. Example: 10.0 g of H2 and 64.0 g of O2 making water. H2: 4.96 mol / 2 = 2.48. O2: 2.00 mol / 1 = 2.00. O2 is limiting; water formed = 2 x 2.00 = 4.00 mol = 72.1 g. Excess H2 left = 4.96 - 4.00 = 0.96 mol.

Yield. Theoretical yield is the maximum from the limiting reactant. Percent yield = actual / theoretical x 100. A 65.0 g actual yield in the example above is 90.2%.

Empirical and molecular formulas. From percent composition, assume 100 g, convert to moles, divide by the smallest, and multiply to whole numbers. The molecular formula is a whole-number multiple of the empirical formula, found from the molar mass.

Exam 1 always has a limiting-reactant problem and a percent-yield question. Show the mole conversions; unit-cancelling setups earn partial credit.`,
      },
      {
        id: "ch-c4",
        title: "Chapter 4: Chemical reactions in solution",
        type: "notes",
        week: 5,
        summary:
          "Electrolytes, molarity and dilution, solubility rules and precipitation, net ionic equations, acid-base neutralization, and oxidation numbers for redox.",
        body: `Chapter 4: Reactions in aqueous solution

Electrolytes. Strong electrolytes dissociate completely: soluble ionic compounds, strong acids (HCl, HBr, HI, HNO3, H2SO4, HClO4), strong bases (group 1 hydroxides, Ca(OH)2, Sr(OH)2, Ba(OH)2). Weak electrolytes partially dissociate: weak acids like acetic acid, ammonia. Nonelectrolytes: sugar, ethanol.

Molarity. M = moles of solute / liters of solution. Dilution: M1 V1 = M2 V2. To make 250 mL of 0.100 M NaCl from 2.00 M stock: V1 = (0.100)(250)/2.00 = 12.5 mL.

Solubility rules (memorize). Soluble: all nitrates, acetates, ammonium and group 1 salts; chlorides, bromides, iodides except Ag+, Pb2+, Hg2 2+; sulfates except Ba2+, Sr2+, Pb2+, Ca2+ (slightly). Insoluble: most hydroxides, carbonates, phosphates, sulfides, except with group 1 and ammonium.

Precipitation and net ionic equations. Write the molecular equation, split strong electrolytes into ions (complete ionic), cancel spectator ions. AgNO3(aq) + NaCl(aq) -> AgCl(s) + NaNO3(aq) has the net ionic equation Ag+(aq) + Cl-(aq) -> AgCl(s).

Acid-base. Neutralization: H+ + OH- -> H2O. Titration: moles of acid = moles of base at the equivalence point for monoprotic acids. If 23.4 mL of 0.150 M NaOH neutralizes 25.0 mL of HCl, the HCl is (0.150)(23.4)/25.0 = 0.140 M.

Redox. Assign oxidation numbers: elements 0; monatomic ions their charge; O usually -2, H usually +1; the sum equals the charge of the species. Oxidation is loss of electrons (oxidation number rises); reduction is gain. The oxidizing agent is reduced. In Zn + Cu2+ -> Zn2+ + Cu, zinc is oxidized and copper(II) is the oxidizing agent.

Exam 1 covers through chapter 4 solution stoichiometry; chapter 5 gases are on Exam 2 despite being lectured this week.`,
      },
      {
        id: "ch-c5",
        title: "Chapter 5: Gases",
        type: "slides",
        week: 7,
        summary:
          "Pressure units, the gas laws and the ideal gas law, gas stoichiometry, Dalton's law of partial pressures, and the kinetic molecular theory.",
        body: `Chapter 5: Gases

Pressure. 1 atm = 760 mmHg = 760 torr = 101.325 kPa. Measured with a barometer or manometer.

Simple gas laws. Boyle: P V constant at fixed T and n. Charles: V / T constant (T in kelvin). Avogadro: V / n constant. Combined: P1 V1 / T1 = P2 V2 / T2. Always convert Celsius to kelvin by adding 273.15.

Ideal gas law. P V = n R T with R = 0.08206 L atm / (mol K). Standard temperature and pressure (STP): 0 C and 1 atm, where one mole occupies 22.4 L. Rearrangements: density d = P M / (R T) and molar mass M = d R T / P.

Example. What volume does 4.00 g of O2 occupy at 25 C and 0.950 atm? n = 0.125 mol; V = (0.125)(0.08206)(298) / 0.950 = 3.22 L.

Gas stoichiometry. Use the balanced equation for mole ratios and the ideal gas law to convert between moles and volume. 2 KClO3 -> 2 KCl + 3 O2: 10.0 g of KClO3 (0.0816 mol) gives 0.122 mol O2, which is 2.99 L at STP.

Partial pressures. Dalton's law: the total pressure is the sum of the partial pressures; P_A = X_A P_total, where X_A is the mole fraction. Gas collected over water includes water vapor; subtract the vapor pressure of water at that temperature to get the dry gas pressure.

Kinetic molecular theory. Gas particles are tiny compared with the space between them, move randomly, collide elastically, and have average kinetic energy proportional to kelvin temperature. Root-mean-square speed: u = sqrt(3 R T / M) with R = 8.314 J/(mol K) and M in kg/mol; lighter gases move faster at the same temperature. Graham's law: effusion rate is inversely proportional to the square root of molar mass. Real gases deviate at high pressure (volume of molecules) and low temperature (attractions).

This chapter is on Exam 2 (Nov 5), not Exam 1.`,
      },
      {
        id: "ch-exam1",
        title: "Exam 1 practice set",
        type: "handout",
        week: 8,
        summary:
          "Twelve practice problems for the Oct 8 exam (chapters 1–4) with answers, posted by the TA with extra office hours Tuesday 3–5.",
        body: `CH 101 Exam 1 practice set. Exam 1: Thursday Oct 8, 9:00-10:15 AM, Dabney 220 (during the recitation period; recitation is cancelled that day). Chapters 1-4. A periodic table and conversion sheet are provided; bring a non-programmable calculator. Extra office hours with Maria Gomez: Tuesday Oct 6, 3-5 PM, Dabney 210.

1. Express 0.000 4520 in scientific notation with the correct significant figures. (4.520 x 10^-4; four sig figs.)
2. Convert 65.0 mi/h to m/s. (29.1 m/s.)
3. Give the number of protons, neutrons and electrons in 56Fe3+. (26, 30, 23.)
4. Name Fe2(SO4)3 and write the formula for ammonium phosphate. (Iron(III) sulfate; (NH4)3PO4.)
5. Balance: Al + O2 -> Al2O3. (4 Al + 3 O2 -> 2 Al2O3.)
6. How many moles of CO2 form from 25.0 g of C2H6 burned in excess oxygen? (0.831 mol C2H6 x 4/2 = 1.66 mol.)
7. 15.0 g of Al reacts with 35.0 g of Cl2 to form AlCl3. Find the limiting reactant and the mass of AlCl3. (Al: 0.556 mol/2 = 0.278; Cl2: 0.494 mol/3 = 0.165; Cl2 limits; 0.329 mol AlCl3 = 43.9 g.)
8. A compound is 40.0% C, 6.71% H, 53.3% O with molar mass 180 g/mol. Find the empirical and molecular formulas. (CH2O; C6H12O6.)
9. How many grams of NaOH are needed for 500.0 mL of 0.250 M solution? (5.00 g.)
10. Write the net ionic equation for mixing Pb(NO3)2(aq) and KI(aq). (Pb2+ + 2 I- -> PbI2(s).)
11. 28.6 mL of 0.105 M HCl neutralizes 20.0 mL of Ba(OH)2. Find the base concentration. (2 HCl per Ba(OH)2: 0.0751 M.)
12. Assign oxidation numbers in KMnO4 and identify what is reduced in MnO4- + 5 Fe2+ + 8 H+ -> Mn2+ + 5 Fe3+ + 4 H2O. (K +1, Mn +7, O -2; Mn is reduced from +7 to +2; MnO4- is the oxidizing agent.)`,
      },
    ],
  },
};

/** Every course code with sample content, in catalog order. */
export const COURSE_CODES = Object.keys(COURSES);
