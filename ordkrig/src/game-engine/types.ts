/** Et ord i spillets ordliste (fra src/data/words/no.csv → words.no.json). */
export interface Word {
  id: string;
  word: string;
  definition: string;
  tags?: string[];
}
