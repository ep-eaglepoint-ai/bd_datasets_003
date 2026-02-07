# Trajectory: Develop-Local-Transaction-Intelligence-Engine

## 1. Problem Analysis & Domain Research

I began by researching the "chaos" of global banking SMS templates. Unlike structured APIs, financial SMS data is a high-variance stream of localized currency formats, masked account numbers, and marketing noise.

- **Noise Filtering:** I researched common patterns for OTPs and promotional spam. I found that messages containing "OTP," "code," or "verification" often mimic transaction amounts (e.g., "Your code is 4922"). I decided to implement a **Hard-Gate Traffic Classifier** that terminates the thread immediately if these tokens appear.
- **Currency & Numeric Localization:** I researched [ISO 4217 standards](https://www.iso.org/iso-4217-currency-codes.html) and common localized shorthand (Rs, AED, £). I tested different decimal separators and found that European vs. US formats ($1.000,50$ vs. $1,000.50$) require a normalization pass before being cast to a floating-point value.
- **Merchant Anchors:** I googled common NLP prepositions used in automated banking. I identified "at", "to", "vpa", and "info" as the most reliable anchors for merchant name extraction.

---

## 2. Backend Architecture: The Logic Pipeline

To meet the "memory-constrained" requirement for our SDK, I avoided heavy NLP libraries like SpaCy. Instead, I engineered a **State-Isolation** design using standard library string manipulation and optimized Regex.

- **Traffic Classifier:** I implemented a gatekeeper function that uses a case-insensitive search for authentication keywords. This satisfies Requirement 1: prioritize security and noise reduction over extraction.
- **Extraction Heuristics:** I developed a "multi-pass" approach for amounts.
  - **Pass 1:** Identify currency symbols/ISO codes.
  - **Pass 2:** Extract the numeric cluster.
  - **Pass 3:** Standardize the decimal (converting commas to dots where appropriate).
- **Directionality Weighting:** I researched linguistic markers for debits and credits. I assigned weights to keywords like "spent" (Debit) vs "refund" (Credit). If the context is neutral, the engine defaults to 'Debit' only if a merchant is present.

---

## 3. Data Structures & Categorization

I designed a `TransactionResult` object that is re-instantiated per function call. This ensures that no sensitive financial data from one SMS leaks into the processing of the next (Requirement 7).

| Module                  | Logic Strategy                                                                                |
| :---------------------- | :-------------------------------------------------------------------------------------------- |
| **Merchant Extraction** | Uses a "sliding window" after anchor words, stopping at special characters like `*` or `-`.   |
| **Categorization**      | Case-insensitive substring search (e.g., "Uber" -> "Travel", "Starbucks" -> "Dining").        |
| **Validation**          | Mathematical sanity check to reject values $\le 0$ or those exceeding a configured threshold. |

---

## 4. Confidence Scoring Algorithm

I researched best practices for heuristic-based scoring. The engine calculates a final score based on the clarity of the data found.

$$\text{Total Score} = S_{amount} + S_{currency} + S_{merchant} + S_{direction}$$

- **Amount Found:** $+0.4$
- **Currency Recognized:** $+0.2$
- **Merchant Cleaned:** $+0.2$
- **Direction Determined:** $+0.2$
- **Threshold:** If the score is $< 0.6$, the engine marks the result as unreliable and returns a null state.

---

## 5. Key Learning & Reference Resources

I validated my compliance logic and technical implementation using these resources:

- **[MDN: Regular Expressions](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions)** — Used to build non-backtracking patterns to prevent ReDoS attacks in a mobile environment.
- **[FMCSA: HOS Guidelines](https://www.fmcsa.dot.gov/regulations/hours-service/summary-hours-service-regulations)** — (Self-Correction: While I used this for my previous logistics project, for banking I pivoted to the **[OWASP Mobile Security Project](https://mas.owasp.org/)** to ensure data isolation).
- **[Unicode Common Locale Data Repository (CLDR)](https://cldr.unicode.org/)** — I researched how different regions handle "thousands-grouping" to ensure our numeric parser is truly global.
