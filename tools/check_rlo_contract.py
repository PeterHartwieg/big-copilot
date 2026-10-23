"""Check the vendored RLO contract against an RLO checkout, without network access."""
import argparse
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("rlo", type=Path, help="RLO checkout root")
    args = parser.parse_args()
    source = args.rlo / "contracts" / "companion" / "v1"
    target = Path(__file__).resolve().parents[1] / "contracts" / "rlo"
    different = [name for name in ("schema.json", "ready.json", "partial.json")
                 if not (source / name).is_file() or (source / name).read_bytes() != (target / name).read_bytes()]
    if different:
        parser.exit(1, "RLO contract differs: " + ", ".join(different) + "\n")
    print("RLO contract and producer fixtures match")


if __name__ == "__main__":
    main()
