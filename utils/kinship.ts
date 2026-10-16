// utils/kinship.ts
import { Person } from "@/types/database";

export interface KinshipResult {
  term_ne: string;
  term_en: string;
}

/**
 * Normalizes gender to standard format
 */
function isMale(gender: string): boolean {
  const g = gender?.toLowerCase();
  return g === "m" || g === "male" || g === "पुरुष";
}

function isFemale(gender: string): boolean {
  const g = gender?.toLowerCase();
  return g === "f" || g === "female" || g === "महिला";
}

/**
 * Checks if person A is older than person B based on birth_bs
 */
function isOlder(a?: Person | null, b?: Person | null): boolean | null {
  if (!a?.birth_bs || !b?.birth_bs) return null;
  return a.birth_bs < b.birth_bs;
}

/**
 * Resolves comprehensive, culturally authentic Nepali kinship relationships
 */
export function resolveNepaliKinship(
  source: Person,
  target: Person,
  peopleMap: Map<string, Person>
): KinshipResult {
  if (source.id === target.id) {
    return { term_ne: "स्वयं (आफैं)", term_en: "Self" };
  }

  const sourceIsMale = isMale(source.gender);
  const sourceIsFemale = isFemale(source.gender);
  const targetIsMale = isMale(target.gender);

  // 1. Direct Parent
  if (target.father_id === source.id) {
    return {
      term_ne: sourceIsFemale ? "आमा (माता)" : "बुबा (पिता)",
      term_en: sourceIsFemale ? "Mother" : "Father",
    };
  }
  if (target.mother_id === source.id) {
    return { term_ne: "आमा (माता)", term_en: "Mother" };
  }

  // 2. Direct Child
  if (source.father_id === target.id || source.mother_id === target.id) {
    return {
      term_ne: sourceIsFemale ? "छोरी (सुपुत्री)" : "छोरा (सुपुत्र)",
      term_en: sourceIsFemale ? "Daughter" : "Son",
    };
  }

  // 3. Spouse
  const isSpouse =
    source.spouse_id === target.id ||
    target.spouse_id === source.id ||
    (source.more_spouse_ids && source.more_spouse_ids.includes(target.id)) ||
    (target.more_spouse_ids && target.more_spouse_ids.includes(source.id));

  if (isSpouse) {
    return {
      term_ne: sourceIsFemale ? "पत्नी (श्रीमती)" : "पति (श्रीमान्)",
      term_en: sourceIsFemale ? "Wife" : "Husband",
    };
  }

  // 4. Siblings (Sharing Father or Mother)
  const isSameFather = source.father_id && target.father_id && source.father_id === target.father_id;
  const isSameMother = source.mother_id && target.mother_id && source.mother_id === target.mother_id;

  if (isSameFather || isSameMother) {
    const older = isOlder(source, target);
    if (sourceIsFemale) {
      return {
        term_ne: older === true ? "दिदी" : older === false ? "बहिनी" : "दिदी/बहिनी",
        term_en: older === true ? "Elder Sister" : "Younger Sister",
      };
    } else {
      return {
        term_ne: older === true ? "दाजु" : older === false ? "भाइ" : "दाजु/भाइ",
        term_en: older === true ? "Elder Brother" : "Younger Brother",
      };
    }
  }

  // Target's parents
  const targetFather = target.father_id ? peopleMap.get(target.father_id) : null;
  const targetMother = target.mother_id ? peopleMap.get(target.mother_id) : null;

  // 5. Paternal Uncles & Aunts (Siblings of Target's Father)
  if (targetFather && targetFather.father_id && source.father_id === targetFather.father_id) {
    const olderThanFather = isOlder(source, targetFather);
    if (sourceIsFemale) {
      return { term_ne: "फुपू", term_en: "Paternal Aunt" };
    } else {
      return {
        term_ne: olderThanFather === true ? "ठूलोबुबा" : "काका",
        term_en: olderThanFather === true ? "Elder Paternal Uncle" : "Younger Paternal Uncle",
      };
    }
  }

  // 6. Maternal Uncles & Aunts (Siblings of Target's Mother)
  if (targetMother && targetMother.father_id && source.father_id === targetMother.father_id) {
    if (sourceIsMale) {
      return { term_ne: "मामा", term_en: "Maternal Uncle" };
    } else {
      return { term_ne: "सानिमा / ठूलीआमा", term_en: "Maternal Aunt" };
    }
  }

  // 7. Grandparents (Paternal & Maternal)
  if (targetFather && targetFather.father_id === source.id) {
    return { term_ne: "हजुरबुबा (बाजे)", term_en: "Paternal Grandfather" };
  }
  if (targetFather && targetFather.mother_id === source.id) {
    return { term_ne: "हजुरआमा (बज्यै)", term_en: "Paternal Grandmother" };
  }
  if (targetMother && targetMother.father_id === source.id) {
    return { term_ne: "हजुरबुबा (मावली बाजे)", term_en: "Maternal Grandfather" };
  }
  if (targetMother && targetMother.mother_id === source.id) {
    return { term_ne: "हजुरआमा (मावली बज्यै)", term_en: "Maternal Grandmother" };
  }

  // 8. Grandchildren
  const sourceFather = source.father_id ? peopleMap.get(source.father_id) : null;
  if (sourceFather && (sourceFather.father_id === target.id || sourceFather.mother_id === target.id)) {
    return {
      term_ne: sourceIsFemale ? "नातिनी" : "नाति",
      term_en: sourceIsFemale ? "Granddaughter" : "Grandson",
    };
  }

  // 9. Nephew / Niece (Children of Sibling)
  if (sourceFather && targetFather && sourceFather.father_id === targetFather.father_id) {
    // Source's father is brother of target
    return {
      term_ne: sourceIsFemale ? "भतिजी" : "भतिजा",
      term_en: sourceIsFemale ? "Niece" : "Nephew",
    };
  }

  // 10. Default fallback
  return { term_ne: "नातेदार / वंशज", term_en: "Relative" };
}
