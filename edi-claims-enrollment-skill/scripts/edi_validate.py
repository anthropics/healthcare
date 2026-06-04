#!/usr/bin/env python3
"""
Deterministic X12 EDI envelope validator.

Checks that can be done mechanically before Claude reviews business rules:
  - ISA/IEA control number match and group count (IEA01)
  - GS/GE control number match and transaction count (GE01)
  - ST/SE control number match and segment count (SE01)
  - Transaction type detection (ST01)
  - Basic delimiter consistency

Usage:
    python scripts/edi_validate.py <edi_file> [--json]

Output: human-readable report (default) or JSON (--json).
Pass the JSON output to Claude for business-rule explanation.
"""

import argparse
import json
import re
import sys
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional


@dataclass
class Issue:
    severity: str   # "error" | "warning"
    rule_id: str
    segment: str
    message: str


@dataclass
class TransactionResult:
    index: int
    transaction_type: Optional[str]
    control_number: Optional[str]
    segment_count_declared: Optional[int]
    segment_count_actual: int
    issues: list[Issue] = field(default_factory=list)


@dataclass
class GroupResult:
    index: int
    sender: Optional[str]
    receiver: Optional[str]
    control_number: Optional[str]
    transaction_count_declared: Optional[int]
    transaction_count_actual: int
    transactions: list[TransactionResult] = field(default_factory=list)
    issues: list[Issue] = field(default_factory=list)


@dataclass
class EnvelopeResult:
    file: str
    sender: Optional[str]
    receiver: Optional[str]
    control_number: Optional[str]
    group_count_declared: Optional[int]
    group_count_actual: int
    groups: list[GroupResult] = field(default_factory=list)
    issues: list[Issue] = field(default_factory=list)

    def all_issues(self) -> list[Issue]:
        out = list(self.issues)
        for g in self.groups:
            out.extend(g.issues)
            for t in g.transactions:
                out.extend(t.issues)
        return out

    def has_errors(self) -> bool:
        return any(i.severity == "error" for i in self.all_issues())


def _split_segments(text: str, segment_delimiter: str = "~") -> list[str]:
    return [s.strip() for s in text.split(segment_delimiter) if s.strip()]


def _elements(segment: str, element_delimiter: str = "*") -> list[str]:
    return segment.split(element_delimiter)


def validate(path: Path) -> EnvelopeResult:
    raw = path.read_text(encoding="utf-8", errors="replace")

    # Detect delimiters from ISA segment (fixed-length header)
    if not raw.startswith("ISA"):
        result = EnvelopeResult(
            file=str(path),
            sender=None, receiver=None, control_number=None,
            group_count_declared=None, group_count_actual=0,
        )
        result.issues.append(Issue("error", "ENV-001", "ISA",
                                   "File does not begin with ISA segment"))
        return result

    element_delim = raw[3]   # character at position 3
    segment_delim = raw[105] # character at position 105

    segments = _split_segments(raw, segment_delim)

    result = EnvelopeResult(
        file=str(path),
        sender=None, receiver=None, control_number=None,
        group_count_declared=None, group_count_actual=0,
    )

    current_group: Optional[GroupResult] = None
    current_tx: Optional[TransactionResult] = None
    tx_segment_count = 0  # segments from ST through SE inclusive

    isa_control = None
    gs_control = None

    for seg in segments:
        els = _elements(seg, element_delim)
        tag = els[0] if els else ""

        if tag == "ISA":
            if len(els) < 16:
                result.issues.append(Issue("error", "ENV-002", "ISA",
                                           f"ISA has {len(els)-1} elements; expected 15"))
                continue
            result.sender = els[6].strip()
            result.receiver = els[8].strip()
            isa_control = els[13].strip()
            result.control_number = isa_control

        elif tag == "IEA":
            declared = None
            actual = len(result.groups)
            if len(els) >= 3:
                try:
                    declared = int(els[1])
                    result.group_count_declared = declared
                except ValueError:
                    result.issues.append(Issue("error", "ENV-007", "IEA",
                                               f"IEA01 is not numeric: '{els[1]}'"))
                iea_ctrl = els[2].strip()
                if isa_control and iea_ctrl != isa_control:
                    result.issues.append(Issue("error", "ENV-006", "IEA",
                                               f"IEA02 control '{iea_ctrl}' does not match ISA13 '{isa_control}'"))
            result.group_count_actual = actual
            if declared is not None and actual != declared:
                result.issues.append(Issue("error", "ENV-008", "IEA",
                                           f"IEA01 declares {declared} groups but {actual} GS/GE pairs found"))

        elif tag == "GS":
            current_group = GroupResult(
                index=len(result.groups) + 1,
                sender=els[2].strip() if len(els) > 2 else None,
                receiver=els[3].strip() if len(els) > 3 else None,
                control_number=els[6].strip() if len(els) > 6 else None,
                transaction_count_declared=None,
                transaction_count_actual=0,
            )
            gs_control = current_group.control_number
            result.groups.append(current_group)

        elif tag == "GE":
            if current_group is None:
                result.issues.append(Issue("error", "ENV-009", "GE",
                                           "GE segment found without matching GS"))
                continue
            actual = len(current_group.transactions)
            current_group.transaction_count_actual = actual
            if len(els) >= 3:
                ge_ctrl = els[2].strip()
                if gs_control and ge_ctrl != gs_control:
                    current_group.issues.append(Issue("error", "GRP-004", "GE",
                                                       f"GE02 control '{ge_ctrl}' does not match GS06 '{gs_control}'"))
            if len(els) >= 2:
                try:
                    declared = int(els[1])
                    current_group.transaction_count_declared = declared
                    if actual != declared:
                        current_group.issues.append(Issue("error", "GRP-003", "GE",
                                                           f"GE01 declares {declared} transactions but {actual} ST/SE pairs found"))
                except ValueError:
                    current_group.issues.append(Issue("error", "GRP-005", "GE",
                                                       f"GE01 is not numeric: '{els[1]}'"))

        elif tag == "ST":
            if current_group is None:
                result.issues.append(Issue("error", "TXN-001", "ST",
                                           "ST segment found outside a GS/GE group"))
                continue
            tx_type = els[1].strip() if len(els) > 1 else None
            ctrl = els[2].strip() if len(els) > 2 else None
            current_tx = TransactionResult(
                index=len(current_group.transactions) + 1,
                transaction_type=tx_type,
                control_number=ctrl,
                segment_count_declared=None,
                segment_count_actual=0,
            )
            current_group.transactions.append(current_tx)
            tx_segment_count = 1  # count ST itself

        elif tag == "SE":
            if current_tx is None:
                result.issues.append(Issue("error", "TXN-005", "SE",
                                           "SE segment found without matching ST"))
                continue
            tx_segment_count += 1  # count SE itself
            current_tx.segment_count_actual = tx_segment_count

            if len(els) >= 2:
                try:
                    declared = int(els[1])
                    current_tx.segment_count_declared = declared
                    if declared != tx_segment_count:
                        current_tx.issues.append(Issue("error", "TXN-003", "SE",
                                                        f"SE01 declares {declared} segments but actual count is {tx_segment_count}"))
                except ValueError:
                    current_tx.issues.append(Issue("error", "TXN-004", "SE",
                                                    f"SE01 is not numeric: '{els[1]}'"))

            if len(els) >= 3 and current_tx.control_number:
                se_ctrl = els[2].strip()
                if se_ctrl != current_tx.control_number:
                    current_tx.issues.append(Issue("error", "TXN-002", "SE",
                                                    f"SE02 control '{se_ctrl}' does not match ST02 '{current_tx.control_number}'"))
            current_tx = None
            tx_segment_count = 0

        else:
            if current_tx is not None:
                tx_segment_count += 1

    return result


def _print_report(result: EnvelopeResult) -> None:
    print(f"File: {result.file}")
    print(f"Sender: {result.sender}  Receiver: {result.receiver}  Control: {result.control_number}")
    print(f"Groups: {result.group_count_actual} found"
          + (f" / {result.group_count_declared} declared" if result.group_count_declared is not None else ""))

    issues = result.all_issues()
    if not issues:
        print("\n✓ No envelope issues found.")
    else:
        errors = [i for i in issues if i.severity == "error"]
        warnings = [i for i in issues if i.severity == "warning"]
        print(f"\n{'❌' if errors else '⚠️'} {len(errors)} error(s), {len(warnings)} warning(s):\n")
        for i in issues:
            icon = "❌" if i.severity == "error" else "⚠️"
            print(f"  {icon} [{i.rule_id}] {i.segment}: {i.message}")

    for g in result.groups:
        for t in g.transactions:
            print(f"\n  Transaction {t.index} (type={t.transaction_type}, ctrl={t.control_number}): "
                  f"{t.segment_count_actual} segments"
                  + (f" (declared {t.segment_count_declared})" if t.segment_count_declared else ""))


def main() -> int:
    parser = argparse.ArgumentParser(description="X12 EDI envelope validator")
    parser.add_argument("file", help="Path to EDI file")
    parser.add_argument("--json", action="store_true", help="Output JSON")
    args = parser.parse_args()

    path = Path(args.file)
    if not path.exists():
        print(f"Error: file not found: {path}", file=sys.stderr)
        return 2

    result = validate(path)

    if args.json:
        print(json.dumps(asdict(result), indent=2))
    else:
        _print_report(result)

    return 1 if result.has_errors() else 0


if __name__ == "__main__":
    sys.exit(main())
