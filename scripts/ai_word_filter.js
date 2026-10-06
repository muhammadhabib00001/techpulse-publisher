/**
 * ai_word_filter.js
 * Comprehensive AI Slop Detector and Humanizer Engine
 * 
 * Enforces zero-tolerance blacklist for overused AI vocabulary,
 * academic filler phrases, robotic transitions, and repetitive clichés.
 */

const REPLACEMENTS = [
  // --- High-Frequency AI Verbs & Clichés ---
  { pattern: /\bdelve(?:\s+into)?\b/gi, replacement: 'explore' },
  { pattern: /\bdelved(?:\s+into)?\b/gi, replacement: 'explored' },
  { pattern: /\bdelving(?:\s+into)?\b/gi, replacement: 'exploring' },
  { pattern: /\bdelves(?:\s+into)?\b/gi, replacement: 'explores' },
  { pattern: /\bleverage\b/gi, replacement: 'use' },
  { pattern: /\bleveraged\b/gi, replacement: 'used' },
  { pattern: /\bleveraging\b/gi, replacement: 'using' },
  { pattern: /\bleverages\b/gi, replacement: 'uses' },
  { pattern: /\bfacilitate\b/gi, replacement: 'help' },
  { pattern: /\bfacilitated\b/gi, replacement: 'helped' },
  { pattern: /\bfacilitates\b/gi, replacement: 'helps' },
  { pattern: /\bfacilitating\b/gi, replacement: 'helping' },
  { pattern: /\bstreamline\b/gi, replacement: 'simplify' },
  { pattern: /\bstreamlined\b/gi, replacement: 'simplified' },
  { pattern: /\bstreamlines\b/gi, replacement: 'simplifies' },
  { pattern: /\bstreamlining\b/gi, replacement: 'simplifying' },
  { pattern: /\butilize\b/gi, replacement: 'use' },
  { pattern: /\butilized\b/gi, replacement: 'used' },
  { pattern: /\butilizes\b/gi, replacement: 'uses' },
  { pattern: /\butilizing\b/gi, replacement: 'using' },
  { pattern: /\bfoster\b/gi, replacement: 'build' },
  { pattern: /\bfostered\b/gi, replacement: 'built' },
  { pattern: /\bfosters\b/gi, replacement: 'builds' },
  { pattern: /\bfostering\b/gi, replacement: 'building' },
  { pattern: /\bharness\b/gi, replacement: 'use' },
  { pattern: /\bharnessed\b/gi, replacement: 'used' },
  { pattern: /\bharnesses\b/gi, replacement: 'uses' },
  { pattern: /\bharnessing\b/gi, replacement: 'using' },
  { pattern: /\bnavigate\b/gi, replacement: 'manage' },
  { pattern: /\bnavigated\b/gi, replacement: 'managed' },
  { pattern: /\bnavigates\b/gi, replacement: 'manages' },
  { pattern: /\bnavigating\b/gi, replacement: 'managing' },
  { pattern: /\bembark(?:\s+on|\s+upon)?\b/gi, replacement: 'start' },
  { pattern: /\bembarked(?:\s+on|\s+upon)?\b/gi, replacement: 'started' },
  { pattern: /\bembarks(?:\s+on|\s+upon)?\b/gi, replacement: 'starts' },
  { pattern: /\bembarking(?:\s+on|\s+upon)?\b/gi, replacement: 'starting' },
  { pattern: /\belevate\b/gi, replacement: 'boost' },
  { pattern: /\belevated\b/gi, replacement: 'boosted' },
  { pattern: /\belevates\b/gi, replacement: 'boosts' },
  { pattern: /\belevating\b/gi, replacement: 'boosting' },
  { pattern: /\bunveil\b/gi, replacement: 'show' },
  { pattern: /\bunveiled\b/gi, replacement: 'showed' },
  { pattern: /\bunveils\b/gi, replacement: 'shows' },
  { pattern: /\bunveiling\b/gi, replacement: 'showing' },
  { pattern: /\bcultivate\b/gi, replacement: 'grow' },
  { pattern: /\bcultivated\b/gi, replacement: 'grown' },
  { pattern: /\bcultivates\b/gi, replacement: 'grows' },
  { pattern: /\bcultivating\b/gi, replacement: 'growing' },
  { pattern: /\belucidate\b/gi, replacement: 'explain' },
  { pattern: /\belucidates\b/gi, replacement: 'explains' },
  { pattern: /\belucidating\b/gi, replacement: 'explaining' },
  { pattern: /\bembody\b/gi, replacement: 'represent' },
  { pattern: /\bembodies\b/gi, replacement: 'represents' },
  { pattern: /\bembodying\b/gi, replacement: 'representing' },
  { pattern: /\bintertwine\b/gi, replacement: 'connect' },
  { pattern: /\bintertwined\b/gi, replacement: 'connected' },
  { pattern: /\bintertwines\b/gi, replacement: 'connects' },
  { pattern: /\bgrapple(?:\s+with)?\b/gi, replacement: 'deal with' },
  { pattern: /\bgrapples(?:\s+with)?\b/gi, replacement: 'deals with' },
  { pattern: /\bgrappling(?:\s+with)?\b/gi, replacement: 'dealing with' },
  { pattern: /\bresonate(?:\s+with)?\b/gi, replacement: 'connect with' },
  { pattern: /\bresonates(?:\s+with)?\b/gi, replacement: 'connects with' },
  { pattern: /\bresonating(?:\s+with)?\b/gi, replacement: 'connecting with' },
  { pattern: /\breverberate\b/gi, replacement: 'echo' },
  { pattern: /\breverberates\b/gi, replacement: 'echoes' },
  { pattern: /\breverberated\b/gi, replacement: 'echoed' },
  { pattern: /\brevolutionize\b/gi, replacement: 'transform' },
  { pattern: /\brevolutionized\b/gi, replacement: 'transformed' },
  { pattern: /\brevolutionizes\b/gi, replacement: 'transforms' },
  { pattern: /\brevolutionizing\b/gi, replacement: 'transforming' },
  { pattern: /\bempower\b/gi, replacement: 'help' },
  { pattern: /\bempowers\b/gi, replacement: 'helps' },
  { pattern: /\bempowered\b/gi, replacement: 'helped' },
  { pattern: /\bempowering\b/gi, replacement: 'helping' },
  { pattern: /\bunleash\b/gi, replacement: 'release' },
  { pattern: /\bunleashes\b/gi, replacement: 'releases' },
  { pattern: /\bunleashed\b/gi, replacement: 'released' },
  { pattern: /\bunleashing\b/gi, replacement: 'releasing' },
  { pattern: /\bunlock\b/gi, replacement: 'open' },
  { pattern: /\bunlocks\b/gi, replacement: 'opens' },
  { pattern: /\bunlocking\b/gi, replacement: 'opening' },
  { pattern: /\bendeavor\b/gi, replacement: 'effort' },
  { pattern: /\bendeavors\b/gi, replacement: 'efforts' },
  { pattern: /\bendeavored\b/gi, replacement: 'attempted' },
  { pattern: /\bunderscore\b/gi, replacement: 'highlight' },
  { pattern: /\bunderscores\b/gi, replacement: 'highlights' },
  { pattern: /\bunderscored\b/gi, replacement: 'highlighted' },
  { pattern: /\bunderscoring\b/gi, replacement: 'highlighting' },

  // --- High-Frequency AI Adjectives & Nouns ---
  { pattern: /\btapestry\b/gi, replacement: 'mix' },
  { pattern: /\btapestries\b/gi, replacement: 'collections' },
  { pattern: /\bkaleidoscope\b/gi, replacement: 'variety' },
  { pattern: /\bmultifaceted\b/gi, replacement: 'varied' },
  { pattern: /\bnuanced\b/gi, replacement: 'detailed' },
  { pattern: /\bnuance\b/gi, replacement: 'detail' },
  { pattern: /\bnuances\b/gi, replacement: 'details' },
  { pattern: /\bcomprehensive\b/gi, replacement: 'thorough' },
  { pattern: /\bpivotal\b/gi, replacement: 'key' },
  { pattern: /\bcrucial\b/gi, replacement: 'important' },
  { pattern: /\brobust\b/gi, replacement: 'strong' },
  { pattern: /\bparamount\b/gi, replacement: 'top priority' },
  { pattern: /\binvaluable\b/gi, replacement: 'very useful' },
  { pattern: /\bintricate\b/gi, replacement: 'detailed' },
  { pattern: /\bintricacies\b/gi, replacement: 'details' },
  { pattern: /\bvibrant\b/gi, replacement: 'lively' },
  { pattern: /\bdynamic\b/gi, replacement: 'active' },
  { pattern: /\bgroundbreaking\b/gi, replacement: 'new' },
  { pattern: /\bcutting-edge\b/gi, replacement: 'modern' },
  { pattern: /\btestament\b/gi, replacement: 'proof' },
  { pattern: /\ba testament to\b/gi, replacement: 'proof of' },
  { pattern: /\blin行為pin\b/gi, replacement: 'anchor' },

  // --- Formal Filler & Hedging Phrases ---
  { pattern: /it['’]s worth noting that/gi, replacement: 'Notably,' },
  { pattern: /it is worth noting that/gi, replacement: 'Notably,' },
  { pattern: /it['’]s important to note that/gi, replacement: 'Importantly,' },
  { pattern: /it is important to note that/gi, replacement: 'Importantly,' },
  { pattern: /it['’]s important to note/gi, replacement: 'Note:' },
  { pattern: /it is important to note/gi, replacement: 'Note:' },
  { pattern: /it is essential to/gi, replacement: 'Make sure to' },
  { pattern: /it['’]s essential to/gi, replacement: 'Make sure to' },
  { pattern: /it is crucial to/gi, replacement: 'Be sure to' },
  { pattern: /it['’]s crucial to/gi, replacement: 'Be sure to' },
  { pattern: /it goes without saying that/gi, replacement: 'Clearly,' },
  { pattern: /it goes without saying/gi, replacement: 'Clearly,' },
  { pattern: /in today['’]s digital age/gi, replacement: 'today' },
  { pattern: /in today['’]s fast-paced world/gi, replacement: 'today' },
  { pattern: /in today['’]s modern world/gi, replacement: 'today' },
  { pattern: /in today['’]s world/gi, replacement: 'today' },
  { pattern: /in the digital landscape/gi, replacement: 'online' },
  { pattern: /in the realm of/gi, replacement: 'in' },
  { pattern: /in the world of/gi, replacement: 'in' },
  { pattern: /in an era where/gi, replacement: 'now that' },
  { pattern: /at the end of the day/gi, replacement: 'in practice' },
  { pattern: /when it comes to/gi, replacement: 'for' },
  { pattern: /one might argue that/gi, replacement: 'some argue that' },
  { pattern: /this is particularly true/gi, replacement: 'this matters especially' },

  // --- Overused Formal Academic Transitions ---
  { pattern: /\bfurthermore,\s*/gi, replacement: 'Also, ' },
  { pattern: /\bmoreover,\s*/gi, replacement: 'Plus, ' },
  { pattern: /\badditionally,\s*/gi, replacement: 'Also, ' },
  { pattern: /\bconsequently,\s*/gi, replacement: 'As a result, ' },
  { pattern: /\bnevertheless,\s*/gi, replacement: 'Still, ' },
  { pattern: /\bnonetheless,\s*/gi, replacement: 'Even so, ' },
  { pattern: /\bin conclusion,\s*/gi, replacement: 'In summary, ' },
  { pattern: /\bto summarize,\s*/gi, replacement: 'Overall, ' },
  { pattern: /\bthat being said,\s*/gi, replacement: 'However, ' },
  { pattern: /\bwith that in mind,\s*/gi, replacement: 'Given this, ' },
  { pattern: /\bin light of this,\s*/gi, replacement: 'Because of this, ' },

  // --- Corporate / AI Buzzword Clichés ---
  { pattern: /foster innovation/gi, replacement: 'encourage new ideas' },
  { pattern: /drive engagement/gi, replacement: 'increase interaction' },
  { pattern: /harness the power of/gi, replacement: 'use' },
  { pattern: /navigate the complexities of/gi, replacement: 'handle' },
  { pattern: /unlock the potential of/gi, replacement: 'make the most of' },
  { pattern: /shed light on/gi, replacement: 'explain' },
  { pattern: /stands as/gi, replacement: 'is' },
  { pattern: /plays a crucial role in/gi, replacement: 'is important for' },
  { pattern: /plays a pivotal role in/gi, replacement: 'drives' },
  { pattern: /game[- ]changer/gi, replacement: 'major shift' },
  { pattern: /let['’]s dive in/gi, replacement: 'let us begin' },
  { pattern: /ever wondered/gi, replacement: 'have you asked' }
];

/**
 * Cleans text by replacing all banned AI words/phrases with natural human alternatives
 * @param {string} text - Raw input text
 * @returns {string} - Cleaned humanized text
 */
function cleanText(text) {
  if (!text || typeof text !== 'string') return text;
  let result = text;
  for (const { pattern, replacement } of REPLACEMENTS) {
    result = result.replace(pattern, (match) => {
      // Preserve first character capitalization
      if (match[0] === match[0].toUpperCase()) {
        return replacement.charAt(0).toUpperCase() + replacement.slice(1);
      }
      return replacement;
    });
  }
  return result;
}

/**
 * Detects any banned AI words remaining in text
 * @param {string} text - Input text
 * @returns {Array<{word: string, count: number}>}
 */
function detectAiWords(text) {
  if (!text || typeof text !== 'string') return [];
  const found = [];
  for (const { pattern } of REPLACEMENTS) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      found.push({
        term: pattern.source,
        count: matches.length,
        examples: matches.slice(0, 3)
      });
    }
  }
  return found;
}

module.exports = {
  cleanText,
  detectAiWords,
  REPLACEMENTS
};
