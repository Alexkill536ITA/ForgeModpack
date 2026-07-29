//! Verifica della compatibilita' tra la versione di Minecraft del progetto e il
//! vincolo che ogni mod dichiara nei propri metadati.
//!
//! Le mod esprimono quel vincolo in DUE dialetti diversi, secondo il loader:
//!
//! - Forge / NeoForge (`mods.toml`): *Maven version range* nella dipendenza
//!   verso `minecraft` -> `versionRange = "[1.20.1,1.21)"`, `"[1.20,)"`, `"(,1.19]"`.
//! - Fabric / Quilt (`fabric.mod.json`, `quilt.mod.json`): espressione
//!   semver-like -> `">=1.20.1 <1.21"`, `"~1.20.1"`, `"1.20.x"`, `"*"`, con `||`.
//! - Forge legacy (`mcmod.info`): campo `mcversion`, di solito una versione
//!   secca (`"1.12.2"`), a volte un range Maven.
//!
//! Modulo PURO: nessuna I/O, tutto coperto da test. La regola che conta e' che in
//! caso di dubbio si risponde `None` ("non lo so") e NON `Some(false)`: un falso
//! "mod incompatibile" farebbe cercare all'utente un problema che non esiste.

use std::cmp::Ordering;

/// Componente di una versione: i numeri si confrontano come numeri, il resto
/// come testo (serve per `1.20.1-pre2`, `1.16.5-rc1`).
#[derive(Debug, PartialEq, Eq)]
enum Part {
    Num(u64),
    Text(String),
}

/// Spezza una versione in componenti confrontabili.
/// `"1.20.1-pre2"` -> `[Num(1), Num(20), Num(1), Text("pre"), Num(2)]`
fn parts(version: &str) -> Vec<Part> {
    let mut out = Vec::new();
    let mut buf = String::new();
    let mut buf_is_digit = false;

    let flush = |buf: &mut String, is_digit: bool, out: &mut Vec<Part>| {
        if buf.is_empty() {
            return;
        }
        if is_digit {
            match buf.parse::<u64>() {
                Ok(n) => out.push(Part::Num(n)),
                // Numero assurdamente lungo: meglio testo che perdere il pezzo.
                Err(_) => out.push(Part::Text(buf.clone())),
            }
        } else {
            out.push(Part::Text(buf.to_lowercase()));
        }
        buf.clear();
    };

    for ch in version.trim().chars() {
        if matches!(ch, '.' | '-' | '+' | '_' | ' ') {
            flush(&mut buf, buf_is_digit, &mut out);
            continue;
        }
        let is_digit = ch.is_ascii_digit();
        if !buf.is_empty() && is_digit != buf_is_digit {
            flush(&mut buf, buf_is_digit, &mut out);
        }
        buf_is_digit = is_digit;
        buf.push(ch);
    }
    flush(&mut buf, buf_is_digit, &mut out);
    out
}

/// Confronta due versioni per componenti.
///
/// I componenti mancanti valgono 0 (`1.20` == `1.20.0`), mentre una coda
/// testuale abbassa la versione (`1.20.1-pre1` < `1.20.1`), come in semver.
pub fn compare_versions(a: &str, b: &str) -> Ordering {
    let pa = parts(a);
    let pb = parts(b);
    let len = pa.len().max(pb.len());
    for i in 0..len {
        let ord = match (pa.get(i), pb.get(i)) {
            (Some(Part::Num(x)), Some(Part::Num(y))) => x.cmp(y),
            (Some(Part::Text(x)), Some(Part::Text(y))) => x.cmp(y),
            // Un numero batte una coda testuale: 1.20.1 > 1.20.1-pre
            (Some(Part::Num(_)), Some(Part::Text(_))) => Ordering::Greater,
            (Some(Part::Text(_)), Some(Part::Num(_))) => Ordering::Less,
            // Componente assente = 0: "1.20" e "1.20.0" sono la stessa versione.
            (Some(Part::Num(x)), None) => x.cmp(&0),
            (None, Some(Part::Num(y))) => 0.cmp(y),
            // ...ma un suffisso testuale rende la versione MINORE di quella senza.
            (Some(Part::Text(_)), None) => Ordering::Less,
            (None, Some(Part::Text(_))) => Ordering::Greater,
            (None, None) => Ordering::Equal,
        };
        if ord != Ordering::Equal {
            return ord;
        }
    }
    Ordering::Equal
}

/// True se `constraint` e' un prefisso di generazione di `version`:
/// `"1.20"` copre `1.20.1`, ma `"1.20.1"` non copre `1.20`.
fn is_prefix_of(constraint: &str, version: &str) -> bool {
    let pc = parts(constraint);
    let pv = parts(version);
    if pc.len() > pv.len() {
        return false;
    }
    pc.iter().zip(pv.iter()).all(|(a, b)| a == b)
}

// ---------------------------------------------------------------------------
// Maven version range (Forge / NeoForge)
// ---------------------------------------------------------------------------

/// Un gruppo `[min,max]` del range; `None` = estremo aperto.
struct Interval {
    min: Option<String>,
    min_inclusive: bool,
    max: Option<String>,
    max_inclusive: bool,
}

impl Interval {
    fn contains(&self, version: &str) -> bool {
        if let Some(min) = &self.min {
            let ord = compare_versions(version, min);
            if ord == Ordering::Less || (ord == Ordering::Equal && !self.min_inclusive) {
                return false;
            }
        }
        if let Some(max) = &self.max {
            let ord = compare_versions(version, max);
            if ord == Ordering::Greater || (ord == Ordering::Equal && !self.max_inclusive) {
                return false;
            }
        }
        true
    }
}

/// Estrae i gruppi `[...]`/`(...)` di un range Maven. I gruppi sono in OR fra
/// loro: `"[1.16,1.17),[1.18,1.19)"`.
fn parse_maven(range: &str) -> Option<Vec<Interval>> {
    let mut intervals = Vec::new();
    let mut rest = range.trim();

    while !rest.is_empty() {
        // Salta i separatori tra gruppi.
        rest = rest.trim_start_matches([',', ' ']);
        if rest.is_empty() {
            break;
        }
        let min_inclusive = match rest.chars().next()? {
            '[' => true,
            '(' => false,
            // Non e' un gruppo: range malformato, meglio non pronunciarsi.
            _ => return None,
        };
        let end = rest.find([']', ')'])?;
        let max_inclusive = rest.as_bytes()[end] == b']';
        let body = &rest[1..end];
        rest = &rest[end + 1..];

        let interval = match body.split_once(',') {
            Some((min, max)) => {
                let min = min.trim();
                let max = max.trim();
                Interval {
                    min: (!min.is_empty()).then(|| min.to_string()),
                    min_inclusive,
                    max: (!max.is_empty()).then(|| max.to_string()),
                    max_inclusive,
                }
            }
            // `[1.12.2]` = versione esatta.
            None => {
                let exact = body.trim();
                if exact.is_empty() {
                    return None;
                }
                Interval {
                    min: Some(exact.to_string()),
                    min_inclusive: true,
                    max: Some(exact.to_string()),
                    max_inclusive: true,
                }
            }
        };
        intervals.push(interval);
    }

    (!intervals.is_empty()).then_some(intervals)
}

// ---------------------------------------------------------------------------
// Espressioni semver-like (Fabric / Quilt)
// ---------------------------------------------------------------------------

/// Valuta un singolo predicato (`">=1.20.1"`, `"~1.20"`, `"1.20.x"`, `"*"`).
/// `None` = sintassi non riconosciuta.
fn semver_predicate(pred: &str, version: &str) -> Option<bool> {
    let pred = pred.trim();
    if pred.is_empty() {
        return None;
    }
    if matches!(pred, "*" | "any" | "x" | "X") {
        return Some(true);
    }

    // Operatori, dal piu' lungo al piu' corto per non confondere ">=" con ">".
    for (op, _) in [(">=", 0), ("<=", 0), ("==", 0), (">", 0), ("<", 0), ("=", 0), ("^", 0), ("~", 0)] {
        if let Some(rest) = pred.strip_prefix(op) {
            let target = rest.trim();
            if target.is_empty() {
                return None;
            }
            let ord = compare_versions(version, target);
            return match op {
                ">=" => Some(ord != Ordering::Less),
                "<=" => Some(ord != Ordering::Greater),
                ">" => Some(ord == Ordering::Greater),
                "<" => Some(ord == Ordering::Less),
                "=" | "==" => Some(ord == Ordering::Equal || is_prefix_of(target, version)),
                // `~1.20.1` = >=1.20.1 <1.21.0 (varia solo la patch);
                // `^1.20.1` = >=1.20.1 <2.0.0 (varia minor e patch).
                "~" | "^" => {
                    if ord == Ordering::Less {
                        return Some(false);
                    }
                    let keep = if op == "~" { 2 } else { 1 };
                    let bound = next_bound(target, keep)?;
                    Some(compare_versions(version, &bound) == Ordering::Less)
                }
                _ => None,
            };
        }
    }

    // Wildcard di generazione: "1.20.x", "1.20.*"
    if let Some(base) = pred
        .strip_suffix(".x")
        .or_else(|| pred.strip_suffix(".X"))
        .or_else(|| pred.strip_suffix(".*"))
    {
        return Some(is_prefix_of(base, version));
    }

    // Versione secca: vale la generazione, cosi' "1.20" copre 1.20.1.
    if pred.chars().next()?.is_ascii_digit() {
        return Some(compare_versions(pred, version) == Ordering::Equal || is_prefix_of(pred, version));
    }
    None
}

/// Limite superiore esclusivo per `~`/`^`: incrementa il componente in posizione
/// `keep` (1 = minor per `~`, 0 = major per `^`) azzerando i successivi.
fn next_bound(target: &str, keep: usize) -> Option<String> {
    let nums: Vec<u64> = parts(target)
        .into_iter()
        .filter_map(|p| match p {
            Part::Num(n) => Some(n),
            Part::Text(_) => None,
        })
        .collect();
    if nums.is_empty() {
        return None;
    }
    let idx = (keep.saturating_sub(1)).min(nums.len() - 1);
    let mut bound: Vec<u64> = nums[..=idx].to_vec();
    bound[idx] += 1;
    Some(
        bound
            .iter()
            .map(|n| n.to_string())
            .collect::<Vec<_>>()
            .join("."),
    )
}

/// Valuta un'espressione semver-like: `||` = OR, spazi/virgole = AND.
fn matches_semver(expr: &str, version: &str) -> Option<bool> {
    let mut any = false;
    for group in expr.split("||") {
        let predicates: Vec<&str> = group
            .split([' ', ','])
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .collect();
        if predicates.is_empty() {
            continue;
        }
        let mut all = true;
        for pred in predicates {
            // Un solo predicato incomprensibile invalida il verdetto: meglio
            // "non lo so" che una risposta inventata.
            match semver_predicate(pred, version)? {
                true => {}
                false => {
                    all = false;
                    break;
                }
            }
        }
        any |= all;
    }
    Some(any)
}

// ---------------------------------------------------------------------------
// API pubblica
// ---------------------------------------------------------------------------

/// Verifica se la versione MC `mc` soddisfa il vincolo dichiarato da una mod.
///
/// - `Some(true)` compatibile, `Some(false)` incompatibile;
/// - `None` quando non c'e' un vincolo utilizzabile o la sintassi non e'
///   riconosciuta: la UI mostra "sconosciuto", non un errore.
pub fn matches(constraint: &str, mc: &str) -> Option<bool> {
    let constraint = constraint.trim();
    if constraint.is_empty() || mc.trim().is_empty() {
        return None;
    }
    // Vincolo "qualsiasi versione": nessun conflitto possibile.
    if matches!(constraint, "*" | "any") {
        return Some(true);
    }
    if constraint.starts_with('[') || constraint.starts_with('(') {
        let intervals = parse_maven(constraint)?;
        return Some(intervals.iter().any(|i| i.contains(mc)));
    }
    matches_semver(constraint, mc)
}

/// Vincolo MC dichiarato, cercato tra le dipendenze del jar. `deps` e' una lista
/// `(nome, versionRange)`; il confronto sul nome e' case-insensitive perche' i
/// mod scrivono `minecraft`, `Minecraft`, a volte `MINECRAFT`.
pub fn constraint_from_deps<'a, I>(deps: I) -> Option<String>
where
    I: IntoIterator<Item = (&'a str, &'a str)>,
{
    deps.into_iter()
        .find(|(name, range)| name.eq_ignore_ascii_case("minecraft") && !range.trim().is_empty())
        .map(|(_, range)| range.trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_numeric_components_not_strings() {
        // Il caso che un confronto alfabetico sbaglia.
        assert_eq!(compare_versions("1.10", "1.9"), Ordering::Greater);
        assert_eq!(compare_versions("1.20.1", "1.20.10"), Ordering::Less);
        assert_eq!(compare_versions("1.20", "1.20.0"), Ordering::Equal);
        assert_eq!(compare_versions("1.20.1", "1.20.1"), Ordering::Equal);
    }

    #[test]
    fn prereleases_are_lower_than_the_release() {
        assert_eq!(compare_versions("1.20.1-pre1", "1.20.1"), Ordering::Less);
        assert_eq!(compare_versions("1.20.1-pre1", "1.20.1-pre2"), Ordering::Less);
        assert_eq!(compare_versions("1.16.5-rc1", "1.16.5"), Ordering::Less);
    }

    #[test]
    fn maven_ranges_from_real_mods_toml() {
        // JEI su 1.20.1
        assert_eq!(matches("[1.20.1,1.21)", "1.20.1"), Some(true));
        assert_eq!(matches("[1.20.1,1.21)", "1.20.4"), Some(true));
        assert_eq!(matches("[1.20.1,1.21)", "1.21"), Some(false));
        assert_eq!(matches("[1.20.1,1.21)", "1.19.2"), Some(false));
        // Estremi aperti
        assert_eq!(matches("[1.20,)", "1.21.4"), Some(true));
        assert_eq!(matches("[1.20,)", "1.19"), Some(false));
        assert_eq!(matches("(,1.19]", "1.18.2"), Some(true));
        assert_eq!(matches("(,1.19]", "1.19"), Some(true));
        assert_eq!(matches("(,1.19]", "1.19.1"), Some(false));
        // Versione esatta e gruppi in OR
        assert_eq!(matches("[1.12.2]", "1.12.2"), Some(true));
        assert_eq!(matches("[1.12.2]", "1.12.1"), Some(false));
        assert_eq!(matches("[1.16,1.17),[1.18,1.19)", "1.18.2"), Some(true));
        assert_eq!(matches("[1.16,1.17),[1.18,1.19)", "1.17.1"), Some(false));
        // Estremo inclusivo/esclusivo sul minimo
        assert_eq!(matches("(1.20,1.21)", "1.20"), Some(false));
        assert_eq!(matches("[1.20,1.21)", "1.20"), Some(true));
    }

    #[test]
    fn fabric_style_expressions() {
        assert_eq!(matches(">=1.20.1", "1.20.4"), Some(true));
        assert_eq!(matches(">=1.20.1", "1.20"), Some(false));
        assert_eq!(matches(">=1.20.1 <1.21", "1.20.6"), Some(true));
        assert_eq!(matches(">=1.20.1 <1.21", "1.21"), Some(false));
        assert_eq!(matches("~1.20.1", "1.20.9"), Some(true));
        assert_eq!(matches("~1.20.1", "1.21"), Some(false));
        assert_eq!(matches("^1.20.1", "1.21.4"), Some(true));
        assert_eq!(matches("^1.20.1", "2.0"), Some(false));
        assert_eq!(matches("1.20.x", "1.20.4"), Some(true));
        assert_eq!(matches("1.20.x", "1.21"), Some(false));
        assert_eq!(matches("*", "1.20.1"), Some(true));
        assert_eq!(matches(">=1.19 <1.20 || >=1.21", "1.21.1"), Some(true));
        assert_eq!(matches(">=1.19 <1.20 || >=1.21", "1.20.1"), Some(false));
    }

    #[test]
    fn bare_versions_cover_their_generation() {
        // mcmod.info legacy: "1.12.2" secco.
        assert_eq!(matches("1.12.2", "1.12.2"), Some(true));
        assert_eq!(matches("1.12.2", "1.12.1"), Some(false));
        // "1.20" dichiarato dalla mod copre 1.20.1: e' la stessa generazione, e
        // trattarlo come uguaglianza stretta darebbe un falso incompatibile.
        assert_eq!(matches("1.20", "1.20.1"), Some(true));
        // Il contrario no: chi chiede 1.20.1 non gira su 1.20.
        assert_eq!(matches("1.20.1", "1.20"), Some(false));
    }

    #[test]
    fn unknown_syntax_never_reports_incompatible() {
        assert_eq!(matches("", "1.20.1"), None);
        assert_eq!(matches("[1.20.1,1.21)", ""), None);
        assert_eq!(matches("qualcosa-di-strano", "1.20.1"), None);
        assert_eq!(matches("[1.20.1", "1.20.1"), None); // parentesi non chiusa
        assert_eq!(matches(">=", "1.20.1"), None);
    }

    #[test]
    fn finds_the_minecraft_constraint_among_dependencies() {
        let deps = vec![
            ("forge", "[47,)"),
            ("Minecraft", "[1.20.1,1.21)"),
            ("jei", "*"),
        ];
        assert_eq!(
            constraint_from_deps(deps.clone()),
            Some("[1.20.1,1.21)".to_string())
        );
        // Nessuna dipendenza verso minecraft, o range vuoto: nessun vincolo.
        assert_eq!(constraint_from_deps(vec![("forge", "[47,)")]), None);
        assert_eq!(constraint_from_deps(vec![("minecraft", "  ")]), None);
    }
}
