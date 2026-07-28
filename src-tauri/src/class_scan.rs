// Lettura del bytecode (`.class`) contenuto nei jar dei mod.
//
// PERCHE': su Forge/NeoForge una keybind non e' un dato dichiarativo, e' un
// oggetto `KeyBinding`/`KeyMapping` costruito nel codice; la sua chiave di
// traduzione e' una STRINGA COSTANTE nel class file. Leggere il constant pool
// permette quindi di sapere quali chiavi sono DAVVERO keybind, invece di
// indovinarlo dal nome della chiave (vedi `keybind_scan.rs`).
//
// FATTIBILE perche' la reobfuscation dei mod Forge (SRG) rinomina solo metodi e
// campi: i NOMI DELLE CLASSI di Minecraft restano leggibili anche nei jar
// pubblicati (`net/minecraft/client/settings/KeyBinding` fino a 1.16,
// `net/minecraft/client/KeyMapping` da 1.17). Su Fabric/Quilt invece le classi MC
// sono in *intermediary* (`net/minecraft/class_304`), quindi questo scan non si
// applica: la' resta l'euristica sui file di lingua.
//
// Del class file leggiamo SOLO l'header e il constant pool, che stanno all'inizio:
// la lettura (e quindi la decompressione) si ferma appena finito il pool, senza
// toccare il resto della classe.
//
// Struttura letta (JVM spec, ClassFile):
//   u4 magic (0xCAFEBABE) | u2 minor | u2 major | u2 constant_pool_count
//   cp_info[constant_pool_count - 1]

use std::collections::HashMap;
use std::io::Read;

// Tag delle voci del constant pool (JVM spec, Table 4.4-A).
const TAG_UTF8: u8 = 1;
const TAG_INTEGER: u8 = 3;
const TAG_FLOAT: u8 = 4;
const TAG_LONG: u8 = 5;
const TAG_DOUBLE: u8 = 6;
const TAG_CLASS: u8 = 7;
const TAG_STRING: u8 = 8;
const TAG_FIELDREF: u8 = 9;
const TAG_METHODREF: u8 = 10;
const TAG_INTERFACE_METHODREF: u8 = 11;
const TAG_NAME_AND_TYPE: u8 = 12;
const TAG_METHOD_HANDLE: u8 = 15;
const TAG_METHOD_TYPE: u8 = 16;
const TAG_DYNAMIC: u8 = 17;
const TAG_INVOKE_DYNAMIC: u8 = 18;
const TAG_MODULE: u8 = 19;
const TAG_PACKAGE: u8 = 20;

/// Guardia contro class file patologici (o entry che non sono class file): oltre
/// questo numero di byte letti si abbandona la classe.
const MAX_CLASS_BYTES: usize = 4 * 1024 * 1024;

/// Le costanti che ci interessano di un class file.
pub struct ClassConstants {
    /// Classi referenziate (`CONSTANT_Class`), in forma interna `a/b/C`.
    pub class_refs: Vec<String>,
    /// Stringhe letterali (`CONSTANT_String`): qui vivono le chiavi di traduzione.
    pub strings: Vec<String>,
}

/// Lettore big-endian con contatore dei byte letti (per il limite di sicurezza).
struct Reader<R: Read> {
    inner: R,
    read: usize,
}

impl<R: Read> Reader<R> {
    fn fill(&mut self, buf: &mut [u8]) -> Option<()> {
        let next = self.read.checked_add(buf.len())?;
        if next > MAX_CLASS_BYTES {
            return None;
        }
        self.inner.read_exact(buf).ok()?;
        self.read = next;
        Some(())
    }

    fn u1(&mut self) -> Option<u8> {
        let mut b = [0u8; 1];
        self.fill(&mut b)?;
        Some(b[0])
    }

    fn u2(&mut self) -> Option<u16> {
        let mut b = [0u8; 2];
        self.fill(&mut b)?;
        Some(u16::from_be_bytes(b))
    }

    fn u4(&mut self) -> Option<u32> {
        let mut b = [0u8; 4];
        self.fill(&mut b)?;
        Some(u32::from_be_bytes(b))
    }

    fn skip(&mut self, n: usize) -> Option<()> {
        let mut buf = [0u8; 8];
        let mut left = n;
        while left > 0 {
            let take = left.min(buf.len());
            self.fill(&mut buf[..take])?;
            left -= take;
        }
        Some(())
    }

    fn bytes(&mut self, n: usize) -> Option<Vec<u8>> {
        let mut buf = vec![0u8; n];
        self.fill(&mut buf)?;
        Some(buf)
    }
}

/// Legge header + constant pool di un class file e si ferma li'. Ritorna `None`
/// se la entry non e' un class file valido o usa costanti non riconosciute (in
/// quel caso la classe viene semplicemente ignorata: nessun errore all'utente).
///
/// Le stringhe sono in "modified UTF-8" di Java: per le chiavi di traduzione
/// (ASCII) coincide con UTF-8, e per il resto la conversione e' lossy.
pub fn read_constants<R: Read>(source: R) -> Option<ClassConstants> {
    let mut r = Reader {
        inner: source,
        read: 0,
    };

    if r.u4()? != 0xCAFE_BABE {
        return None;
    }
    let _minor = r.u2()?;
    let _major = r.u2()?;
    let count = r.u2()? as u32;
    if count == 0 {
        return None;
    }

    // Gli indici del pool partono da 1; `long`/`double` occupano DUE slot.
    let mut utf8: HashMap<u32, String> = HashMap::new();
    let mut class_idx: Vec<u32> = Vec::new();
    let mut string_idx: Vec<u32> = Vec::new();

    let mut i: u32 = 1;
    while i < count {
        let tag = r.u1()?;
        match tag {
            TAG_UTF8 => {
                let len = r.u2()? as usize;
                let raw = r.bytes(len)?;
                utf8.insert(i, String::from_utf8_lossy(&raw).into_owned());
            }
            TAG_CLASS => class_idx.push(r.u2()? as u32),
            TAG_STRING => string_idx.push(r.u2()? as u32),
            TAG_INTEGER | TAG_FLOAT => r.skip(4)?,
            TAG_LONG | TAG_DOUBLE => {
                r.skip(8)?;
                i += 1; // occupa due voci del pool
            }
            TAG_FIELDREF | TAG_METHODREF | TAG_INTERFACE_METHODREF | TAG_NAME_AND_TYPE
            | TAG_DYNAMIC | TAG_INVOKE_DYNAMIC => r.skip(4)?,
            TAG_METHOD_HANDLE => r.skip(3)?,
            TAG_METHOD_TYPE | TAG_MODULE | TAG_PACKAGE => r.skip(2)?,
            // Tag sconosciuto: non sappiamo quanti byte occupa, quindi non si puo'
            // proseguire in modo affidabile.
            _ => return None,
        }
        i += 1;
    }

    let resolve = |idx: &u32| utf8.get(idx).cloned();
    Some(ClassConstants {
        class_refs: class_idx.iter().filter_map(resolve).collect(),
        strings: string_idx.iter().filter_map(resolve).collect(),
    })
}

#[cfg(test)]
pub mod test_support {
    //! Costruzione di class file minimi per i test (qui e in `keybind_scan`).

    /// Class file con un constant pool che contiene le classi referenziate e le
    /// stringhe letterali indicate. Non e' una classe eseguibile: contiene solo
    /// header + constant pool, che e' tutto quello che il parser legge.
    pub fn class_file(class_refs: &[&str], strings: &[&str]) -> Vec<u8> {
        let mut pool: Vec<u8> = Vec::new();
        let mut entries: u16 = 0;

        let push_utf8 = |pool: &mut Vec<u8>, entries: &mut u16, text: &str| -> u16 {
            pool.push(1); // CONSTANT_Utf8
            pool.extend_from_slice(&(text.len() as u16).to_be_bytes());
            pool.extend_from_slice(text.as_bytes());
            *entries += 1;
            *entries // indice della voce appena aggiunta (il pool parte da 1)
        };

        // Per ogni nome: la Utf8 e poi la voce che la referenzia.
        let mut refs: Vec<(u8, u16)> = Vec::new();
        for name in class_refs {
            let idx = push_utf8(&mut pool, &mut entries, name);
            refs.push((7, idx)); // CONSTANT_Class
        }
        for text in strings {
            let idx = push_utf8(&mut pool, &mut entries, text);
            refs.push((8, idx)); // CONSTANT_String
        }
        for (tag, idx) in refs {
            pool.push(tag);
            pool.extend_from_slice(&idx.to_be_bytes());
            entries += 1;
        }

        let mut out: Vec<u8> = Vec::new();
        out.extend_from_slice(&0xCAFE_BABEu32.to_be_bytes());
        out.extend_from_slice(&0u16.to_be_bytes()); // minor
        out.extend_from_slice(&52u16.to_be_bytes()); // major (Java 8)
        out.extend_from_slice(&(entries + 1).to_be_bytes()); // constant_pool_count
        out.extend_from_slice(&pool);
        // Coda "sporca": il parser deve fermarsi a fine constant pool.
        out.extend_from_slice(&[0xFF; 16]);
        out
    }
}

#[cfg(test)]
mod tests {
    use super::test_support::class_file;
    use super::*;

    #[test]
    fn legge_classi_e_stringhe_dal_constant_pool() {
        let bytes = class_file(
            &["net/minecraft/client/KeyMapping", "java/lang/Object"],
            &["key.examplemod.jump", "unrelated"],
        );
        let c = read_constants(&bytes[..]).expect("class file valido");
        assert!(c
            .class_refs
            .contains(&"net/minecraft/client/KeyMapping".to_string()));
        assert!(c.strings.contains(&"key.examplemod.jump".to_string()));
        // Le stringhe non devono includere i nomi delle classi referenziate.
        assert!(!c.strings.contains(&"java/lang/Object".to_string()));
    }

    #[test]
    fn rifiuta_le_entry_che_non_sono_class_file() {
        assert!(read_constants(&b"not a class file at all"[..]).is_none());
        assert!(read_constants(&[][..]).is_none());
    }

    #[test]
    fn gestisce_long_e_double_che_occupano_due_slot() {
        // Pool: Utf8("x") | Long | CONSTANT_String -> se il doppio slot non fosse
        // gestito, l'indice della stringa non tornerebbe.
        let mut pool: Vec<u8> = Vec::new();
        pool.push(1);
        pool.extend_from_slice(&1u16.to_be_bytes());
        pool.extend_from_slice(b"x");
        pool.push(5); // CONSTANT_Long (indici 2 e 3)
        pool.extend_from_slice(&0u64.to_be_bytes());
        pool.push(8); // CONSTANT_String -> Utf8 #1 (indice 4)
        pool.extend_from_slice(&1u16.to_be_bytes());

        let mut bytes: Vec<u8> = Vec::new();
        bytes.extend_from_slice(&0xCAFE_BABEu32.to_be_bytes());
        bytes.extend_from_slice(&0u16.to_be_bytes());
        bytes.extend_from_slice(&52u16.to_be_bytes());
        bytes.extend_from_slice(&5u16.to_be_bytes()); // 4 voci occupate + 1
        bytes.extend_from_slice(&pool);

        let c = read_constants(&bytes[..]).expect("class file valido");
        assert_eq!(c.strings, vec!["x".to_string()]);
    }
}
