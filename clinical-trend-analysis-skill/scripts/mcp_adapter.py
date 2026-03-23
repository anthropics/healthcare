"""
Optional MCP client (stdio) for any FHIR MCP server whose tools match the
expected text formats (see MCPRetrievalAdapter). Requires: pip install mcp

Not used by evals (evals use bundle JSON + clinical_trend_analysis only).
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Optional

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from clinical_trend_analysis import LabObservation, MedicationEvent, analyze_clinical_trends, parse_dt


class MCPRetrievalAdapter:
    def __init__(self, python_bin: str, mcp_script: str, synthea_dir: str):
        self.python_bin = python_bin
        self.mcp_script = mcp_script
        self.synthea_dir = synthea_dir
        self._session: Optional[ClientSession] = None
        self._stdio_ctx = None
        self._sess_ctx = None

    async def __aenter__(self):
        params = StdioServerParameters(
            command=self.python_bin,
            args=[self.mcp_script],
            env={**os.environ, "SYNTHEA_JSON_DIR": self.synthea_dir},
        )
        self._stdio_ctx = stdio_client(params)
        read_stream, write_stream = await self._stdio_ctx.__aenter__()
        self._sess_ctx = ClientSession(read_stream, write_stream)
        self._session = self._sess_ctx
        await self._session.__aenter__()
        await self._session.initialize()
        return self

    async def __aexit__(self, exc_type, exc, tb):
        if self._sess_ctx:
            await self._sess_ctx.__aexit__(exc_type, exc, tb)
        if self._stdio_ctx:
            await self._stdio_ctx.__aexit__(exc_type, exc, tb)
        self._session = None

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> str:
        if not self._session:
            raise RuntimeError("MCP session not initialized")
        result = await self._session.call_tool(name, arguments)
        parts: list[str] = []
        for block in result.content:
            if hasattr(block, "text"):
                parts.append(block.text)
        return "\n".join(parts)

    async def list_patient_ids(self, count: int = 100) -> list[str]:
        raw = await self.call_tool("search_all_patients", {"_count": count})
        ids: list[str] = []
        for line in raw.splitlines():
            m = re.match(r"^- ID:\s*(\S+)\s*\|", line.strip())
            if m:
                ids.append(m.group(1))
        return ids

    async def get_medication_events(self, patient_id: str, count: int = 500) -> list[MedicationEvent]:
        raw = await self.call_tool("search_medication_requests", {"patient": patient_id, "_count": count})
        events: list[MedicationEvent] = []
        for line in raw.splitlines():
            m = re.match(r"^-\s*(.*?)\s*\|\s*Status:\s*(.*?)\s*\|\s*Date:\s*(.*)$", line.strip())
            if not m:
                continue
            events.append(
                MedicationEvent(name=m.group(1).strip(), status=m.group(2).strip(), date=parse_dt(m.group(3).strip()))
            )
        return events

    async def get_labs(self, patient_id: str, count: int = 1000) -> list[LabObservation]:
        raw = await self.call_tool("search_observations", {"patient": patient_id, "_count": count})
        labs: list[LabObservation] = []
        line_re = re.compile(r"^-\s*(.+?):\s*(.+)\s*\(date:\s*(.+)\)\s*$")
        for line in raw.splitlines():
            m = line_re.match(line.strip())
            if not m:
                continue
            name = m.group(1).strip()
            rest = m.group(2).strip()
            dt = parse_dt(m.group(3).strip())
            unit = ""
            value: Optional[float] = None
            if " " in rest:
                value_part, unit = rest.rsplit(" ", 1)
            else:
                value_part = rest
            try:
                value = float(value_part)
            except ValueError:
                value = None
            labs.append(LabObservation(name=name, value=value, unit=unit, date=dt))
        return labs


async def analyze_patient_via_mcp(
    patient_id: str,
    python_bin: Path,
    mcp_script: Path,
    synthea_dir: Path,
) -> dict[str, Any]:
    async with MCPRetrievalAdapter(str(python_bin), str(mcp_script), str(synthea_dir)) as adapter:
        meds = await adapter.get_medication_events(patient_id)
        labs = await adapter.get_labs(patient_id)
        return analyze_clinical_trends(patient_id=patient_id, meds=meds, labs=labs)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run clinical trend analysis by spawning an MCP server (stdio). All paths are explicit."
    )
    parser.add_argument("--patient-id", required=True)
    parser.add_argument("--python-bin", type=Path, required=True, help="Python to run the MCP server entrypoint")
    parser.add_argument("--mcp-script", type=Path, required=True, help="Path to MCP server script/module")
    parser.add_argument("--synthea-dir", type=Path, required=True, help="Directory of FHIR bundle JSON (SYNTHEA_JSON_DIR for server)")
    args = parser.parse_args()
    result = asyncio.run(
        analyze_patient_via_mcp(args.patient_id, args.python_bin, args.mcp_script, args.synthea_dir)
    )
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    main()
