/**
 * Personalization Service
 * Extracts corrections from user edits and applies them to future transcriptions
 */

/**
 * Tokenize text into words while preserving punctuation info
 */
function tokenize(text) {
  if (!text) return [];
  // Split on whitespace, keep punctuation attached to words
  return text.trim().split(/\s+/).filter(w => w.length > 0);
}

/**
 * Normalize text for comparison (lowercase, remove punctuation)
 */
function normalize(word) {
  return word.toLowerCase().replace(/[.,!?;:'"]/g, '');
}

/**
 * Find longest common subsequence between two word arrays
 * Returns indices of matching words in both arrays
 */
function findLCS(words1, words2) {
  const m = words1.length;
  const n = words2.length;

  // Build LCS length table
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (normalize(words1[i - 1]) === normalize(words2[j - 1])) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find the actual LCS indices
  const matches = [];
  let i = m, j = n;

  while (i > 0 && j > 0) {
    if (normalize(words1[i - 1]) === normalize(words2[j - 1])) {
      matches.unshift({ i: i - 1, j: j - 1 });
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return matches;
}

/**
 * Strip punctuation from word for matching, preserving for output
 */
function stripPunctuation(word) {
  return word.replace(/^[.,!?;:'"]+|[.,!?;:'"]+$/g, '');
}

/**
 * Decompose a phrase correction into word-level corrections
 * Only works when original and corrected have equal word counts
 *
 * @param {string[]} originalWords - Words from original phrase
 * @param {string[]} correctedWords - Words from corrected phrase
 * @returns {Array<{original: string, corrected: string}>} Word-level corrections
 */
function decomposePhraseToWords(originalWords, correctedWords) {
  const wordCorrections = [];

  for (let i = 0; i < originalWords.length; i++) {
    const original = originalWords[i];
    const corrected = correctedWords[i];

    // Compare without punctuation
    const originalClean = stripPunctuation(original);
    const correctedClean = stripPunctuation(corrected);

    // Only add if actually different (case-insensitive comparison)
    if (originalClean.toLowerCase() !== correctedClean.toLowerCase()) {
      // Store without trailing punctuation for cleaner matching
      wordCorrections.push({
        original: originalClean,
        corrected: correctedClean
      });
    }
  }

  return wordCorrections;
}

/**
 * Extract corrections by comparing raw text with edited text
 * Uses LCS for alignment, then decomposes equal-length phrases into word-level corrections
 *
 * @param {string} rawText - Original transcription from Whisper
 * @param {string} finalText - User-edited text
 * @returns {Array<{original: string, corrected: string}>} List of corrections
 */
function extractCorrections(rawText, finalText) {
  if (!rawText || !finalText) return [];

  // If texts are identical, no corrections
  if (rawText.trim() === finalText.trim()) return [];

  const rawWords = tokenize(rawText);
  const finalWords = tokenize(finalText);

  // Find LCS to identify unchanged portions
  const matches = findLCS(rawWords, finalWords);

  // Extract differences between matched portions
  const corrections = [];

  // Add sentinel matches at start and end for easier processing
  const extendedMatches = [
    { i: -1, j: -1 },
    ...matches,
    { i: rawWords.length, j: finalWords.length }
  ];

  for (let k = 0; k < extendedMatches.length - 1; k++) {
    const curr = extendedMatches[k];
    const next = extendedMatches[k + 1];

    // Words between current match and next match are differences
    const rawStart = curr.i + 1;
    const rawEnd = next.i;
    const finalStart = curr.j + 1;
    const finalEnd = next.j;

    // Extract the differing word arrays
    const originalWordArray = rawWords.slice(rawStart, rawEnd);
    const correctedWordArray = finalWords.slice(finalStart, finalEnd);

    // Skip if either side is empty (pure insertion or deletion)
    if (originalWordArray.length === 0 || correctedWordArray.length === 0) {
      continue;
    }

    // Check if word counts are equal - if so, decompose into word pairs
    if (originalWordArray.length === correctedWordArray.length) {
      // Decompose into word-level corrections
      const wordCorrections = decomposePhraseToWords(originalWordArray, correctedWordArray);
      corrections.push(...wordCorrections);
    } else {
      // Unequal word counts - keep as phrase correction
      const originalPhrase = originalWordArray.join(' ');
      const correctedPhrase = correctedWordArray.join(' ');

      const normalizedOriginal = normalize(originalPhrase);
      const normalizedCorrected = normalize(correctedPhrase);

      if (normalizedOriginal !== normalizedCorrected) {
        corrections.push({
          original: originalPhrase,
          corrected: correctedPhrase
        });
      }
    }
  }

  return corrections;
}

/**
 * Apply learned corrections to a new transcription
 * Only applies corrections that have been seen multiple times (count >= minCount)
 *
 * @param {string} text - New transcription text
 * @param {Array<{original_token: string, corrected_token: string, count: number}>} corrections - Learned corrections
 * @param {number} minCount - Minimum count required to apply a correction (default: 2)
 * @returns {string} Text with corrections applied
 */
function applyCorrections(text, corrections, minCount = 2) {
  if (!text || !corrections || corrections.length === 0) return text;

  let result = text;

  // Sort by original phrase length (longest first) to avoid partial replacements
  const sortedCorrections = [...corrections]
    .filter(c => c.count >= minCount)
    .sort((a, b) => b.original_token.length - a.original_token.length);

  for (const correction of sortedCorrections) {
    const original = correction.original_token;
    const corrected = correction.corrected_token;

    // Case-insensitive replacement while preserving surrounding context
    // Use word boundaries to avoid partial word matches
    const escapedOriginal = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedOriginal}\\b`, 'gi');

    result = result.replace(regex, corrected);
  }

  return result;
}

/**
 * Check if two phrases are similar enough to be considered the same correction
 * Used for deduplication
 */
function areSimilarPhrases(phrase1, phrase2) {
  return normalize(phrase1) === normalize(phrase2);
}

module.exports = {
  extractCorrections,
  applyCorrections,
  tokenize,
  normalize,
  areSimilarPhrases
};
