/** Small editorial catalog: factual artist names and our own broad groupings.
 * No provider IDs, artwork, scraped feeds, private histories or audio assets.
 * These are discovery/search suggestions, not assertions of playback rights.
 */
export const LANGUAGES = ['English', 'Hindi', 'Telugu', 'Tamil', 'Punjabi', 'Malayalam', 'Kannada', 'Bengali', 'Marathi', 'Gujarati', 'Spanish', 'Korean', 'Japanese', 'French'] as const;
export const GENRES = ['Pop', 'Film music', 'Indie', 'Rock', 'Hip-hop', 'Electronic', 'Soul', 'Instrumental', 'Jazz', 'Classical', 'Folk', 'R&B', 'Country', 'Metal', 'Latin'] as const;
export const MAX_CUSTOM_ARTISTS = 50;
export interface ArtistSeed { id: string; name: string; languages: string[]; genres: string[] }
const rows: [string, string, string[], string[]][] = [
  ['anirudh', 'Anirudh Ravichander', ['Tamil', 'Telugu'], ['Film music', 'Pop']],
  ['sid-sriram', 'Sid Sriram', ['Telugu', 'Tamil', 'Malayalam'], ['Film music', 'Soul']],
  ['ar-rahman', 'A. R. Rahman', ['Tamil', 'Hindi', 'Telugu'], ['Film music', 'Instrumental']],
  ['devi-sri-prasad', 'Devi Sri Prasad', ['Telugu', 'Tamil'], ['Film music', 'Pop']],
  ['thaman', 'S. Thaman', ['Telugu', 'Tamil'], ['Film music', 'Pop']],
  ['shreya-ghoshal', 'Shreya Ghoshal', ['Hindi', 'Telugu', 'Tamil', 'Malayalam', 'Kannada'], ['Film music']],
  ['arijit-singh', 'Arijit Singh', ['Hindi'], ['Film music', 'Pop']],
  ['amit-trivedi', 'Amit Trivedi', ['Hindi'], ['Film music', 'Indie']],
  ['prateek-kuhad', 'Prateek Kuhad', ['Hindi', 'English'], ['Indie']],
  ['ritviz', 'Ritviz', ['Hindi'], ['Electronic', 'Pop']],
  ['ilayaraja', 'Ilaiyaraaja', ['Tamil', 'Telugu', 'Malayalam', 'Kannada'], ['Film music', 'Instrumental']],
  ['yuvan', 'Yuvan Shankar Raja', ['Tamil', 'Telugu'], ['Film music', 'Pop']],
  ['diljit', 'Diljit Dosanjh', ['Punjabi', 'Hindi'], ['Pop', 'Film music']],
  ['ap-dhillon', 'AP Dhillon', ['Punjabi'], ['Pop', 'Hip-hop']],
  ['gurdas-maan', 'Gurdas Maan', ['Punjabi'], ['Film music']],
  ['sushin-shyam', 'Sushin Shyam', ['Malayalam'], ['Film music', 'Electronic']],
  ['rex-vijayan', 'Rex Vijayan', ['Malayalam'], ['Film music', 'Rock']],
  ['vijay-prakash', 'Vijay Prakash', ['Kannada', 'Tamil', 'Telugu', 'Hindi'], ['Film music']],
  ['charan-raj', 'Charan Raj', ['Kannada'], ['Film music', 'Electronic']],
  ['weeknd', 'The Weeknd', ['English'], ['Pop', 'Soul']],
  ['dua-lipa', 'Dua Lipa', ['English'], ['Pop']],
  ['billie-eilish', 'Billie Eilish', ['English'], ['Pop', 'Indie']],
  ['coldplay', 'Coldplay', ['English'], ['Rock', 'Pop']],
  ['radiohead', 'Radiohead', ['English'], ['Rock', 'Indie']],
  ['kendrick-lamar', 'Kendrick Lamar', ['English'], ['Hip-hop']],
  ['daft-punk', 'Daft Punk', ['English'], ['Electronic']],
  ['khruangbin', 'Khruangbin', ['English'], ['Instrumental', 'Soul']],
  ['bon-iver', 'Bon Iver', ['English'], ['Indie']],
  ['taylor-swift', 'Taylor Swift', ['English'], ['Pop', 'Country']],
  ['ed-sheeran', 'Ed Sheeran', ['English'], ['Pop', 'Folk']],
  ['adele', 'Adele', ['English'], ['Pop', 'Soul']],
  ['bruno-mars', 'Bruno Mars', ['English'], ['Pop', 'R&B']],
  ['sza', 'SZA', ['English'], ['R&B', 'Soul']],
  ['frank-ocean', 'Frank Ocean', ['English'], ['R&B', 'Soul']],
  ['drake', 'Drake', ['English'], ['Hip-hop', 'R&B']],
  ['eminem', 'Eminem', ['English'], ['Hip-hop']],
  ['lana-del-rey', 'Lana Del Rey', ['English'], ['Indie', 'Pop']],
  ['hozier', 'Hozier', ['English'], ['Folk', 'Soul']],
  ['arctic-monkeys', 'Arctic Monkeys', ['English'], ['Rock', 'Indie']],
  ['tame-impala', 'Tame Impala', ['English'], ['Rock', 'Electronic']],
  ['linkin-park', 'Linkin Park', ['English'], ['Rock', 'Metal']],
  ['metallica', 'Metallica', ['English'], ['Metal']],
  ['laufey', 'Laufey', ['English'], ['Jazz', 'Pop']],
  ['norah-jones', 'Norah Jones', ['English'], ['Jazz', 'Soul']],
  ['hans-zimmer', 'Hans Zimmer', ['English'], ['Instrumental', 'Classical']],
  ['ludovico-einaudi', 'Ludovico Einaudi', ['English'], ['Instrumental', 'Classical']],
  ['pritam', 'Pritam', ['Hindi', 'Bengali'], ['Film music', 'Pop']],
  ['sonu-nigam', 'Sonu Nigam', ['Hindi', 'Kannada'], ['Film music']],
  ['sunidhi-chauhan', 'Sunidhi Chauhan', ['Hindi'], ['Film music', 'Pop']],
  ['shankar-mahadevan', 'Shankar Mahadevan', ['Hindi', 'Tamil', 'Telugu', 'Marathi'], ['Film music']],
  ['anupam-roy', 'Anupam Roy', ['Bengali', 'Hindi'], ['Film music', 'Indie']],
  ['rupam-islam', 'Rupam Islam', ['Bengali'], ['Rock']],
  ['ajay-atul', 'Ajay-Atul', ['Marathi', 'Hindi'], ['Film music']],
  ['avinash-vishwajeet', 'Avinash-Vishwajeet', ['Marathi'], ['Film music']],
  ['aditya-gadhvi', 'Aditya Gadhvi', ['Gujarati'], ['Folk', 'Film music']],
  ['osman-mir', 'Osman Mir', ['Gujarati', 'Hindi'], ['Folk', 'Film music']],
  ['bad-bunny', 'Bad Bunny', ['Spanish'], ['Latin', 'Hip-hop']],
  ['rosalia', 'Rosalía', ['Spanish'], ['Latin', 'Pop']],
  ['shakira', 'Shakira', ['Spanish', 'English'], ['Latin', 'Pop']],
  ['bts', 'BTS', ['Korean', 'English'], ['Pop', 'Hip-hop']],
  ['blackpink', 'BLACKPINK', ['Korean', 'English'], ['Pop', 'Hip-hop']],
  ['iu', 'IU', ['Korean'], ['Pop']],
  ['yoasobi', 'YOASOBI', ['Japanese'], ['Pop']],
  ['hikaru-utada', 'Hikaru Utada', ['Japanese', 'English'], ['Pop', 'R&B']],
  ['aimer', 'Aimer', ['Japanese'], ['Pop', 'Rock']],
  ['stromae', 'Stromae', ['French'], ['Pop', 'Electronic']],
  ['angele', 'Angèle', ['French'], ['Pop']],
  ['zaz', 'Zaz', ['French'], ['Jazz', 'Pop']],
];
export const ARTISTS: ArtistSeed[] = rows.map(([id, name, languages, genres]) => ({ id, name, languages, genres }));
export const normalizeName = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function artistsInText(value: string): ArtistSeed[] {
  const text = ` ${normalizeName(value)} `;
  return ARTISTS.filter(artist => text.includes(` ${normalizeName(artist.name)} `));
}
