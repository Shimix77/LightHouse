use std::collections::BTreeMap;
use std::env;
use std::error::Error;
use std::fs;
use std::io::BufWriter;
use std::path::Path;

use lighthouse_fixture_library::import_ofl_fixture;
use serde_json::Value;

fn main() -> Result<(), Box<dyn Error>> {
    let arguments: Vec<_> = env::args_os().collect();
    if arguments.len() != 3 {
        return Err("usage: build_ofl_pack <ofl-fixtures-directory> <output-json>".into());
    }
    let source = Path::new(&arguments[1]);
    let output = Path::new(&arguments[2]);
    let manufacturers: Value =
        serde_json::from_slice(&fs::read(source.join("manufacturers.json"))?)?;
    let manufacturer_names: BTreeMap<String, String> = manufacturers
        .as_object()
        .into_iter()
        .flatten()
        .filter(|(key, _)| !key.starts_with('$'))
        .filter_map(|(key, value)| Some((key.clone(), value.get("name")?.as_str()?.to_owned())))
        .collect();

    let mut definitions = Vec::new();
    let mut skipped = Vec::new();
    for manufacturer_entry in fs::read_dir(source)? {
        let manufacturer_entry = manufacturer_entry?;
        if !manufacturer_entry.file_type()?.is_dir() {
            continue;
        }
        let manufacturer_key = manufacturer_entry
            .file_name()
            .to_string_lossy()
            .into_owned();
        let manufacturer_name = manufacturer_names
            .get(&manufacturer_key)
            .cloned()
            .unwrap_or_else(|| manufacturer_key.clone());
        for fixture_entry in fs::read_dir(manufacturer_entry.path())? {
            let fixture_entry = fixture_entry?;
            let path = fixture_entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            let fixture_key = path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("fixture");
            match import_ofl_fixture(
                &manufacturer_key,
                fixture_key,
                &manufacturer_name,
                &fs::read_to_string(&path)?,
            ) {
                Ok(definition) => definitions.push(definition),
                Err(error) => skipped.push(format!("{manufacturer_key}/{fixture_key}: {error}")),
            }
        }
    }
    definitions.sort_by(|left, right| {
        (&left.manufacturer, &left.model).cmp(&(&right.manufacturer, &right.model))
    });
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)?;
    }
    serde_json::to_writer(BufWriter::new(fs::File::create(output)?), &definitions)?;
    eprintln!(
        "converted {} fixtures; skipped {}",
        definitions.len(),
        skipped.len()
    );
    for fixture in skipped.iter().take(30) {
        eprintln!("skipped {fixture}");
    }
    Ok(())
}
