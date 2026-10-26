import type {UnifiedResult} from '../types';
const LABELS={website:'Website',reference:'Reference',paper:'Research paper','research-record':'Research record',documentation:'Documentation',discussion:'Discussion',project:'Project',book:'Book',media:'Media','linked-source':'Article-linked source','clinical-trial':'Clinical study record'};
export function resultLabel(result: Pick<UnifiedResult,'domain'|'kind'|'contentType'>): string {
  return LABELS[result.contentType||result.kind||(/(?:^|\.)(?:wikipedia\.org|wikidata\.org)$/.test(result.domain)?'reference':'website')];
}
