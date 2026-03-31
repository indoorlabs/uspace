#!/usr/bin/env python3
"""
ifc_parser.py
-------------
IFC 파일을 읽어서 JSON으로 변환하는 백엔드 파서 스크립트.
Neo4j 연동 전처리에 사용.

사용법:
  python ifc_parser.py <ifc_file_path> [--output <output_json_path>]

예시:
  python ifc_parser.py building.ifc
  python ifc_parser.py building.ifc --output building_parsed.json
"""

import sys
import json
import argparse
from pathlib import Path

try:
    import ifcopenshell
    import ifcopenshell.util.element as util_element
    import ifcopenshell.util.placement as util_placement
except ImportError:
    print("❌ ifcopenshell가 설치되지 않았습니다.")
    print("   설치 명령: pip install ifcopenshell")
    sys.exit(1)


def parse_ifc(ifc_path: str) -> dict:
    """IFC 파일을 파싱하여 구조화된 딕셔너리로 반환"""

    print(f"📂 IFC 파일 로딩: {ifc_path}")
    ifc_file = ifcopenshell.open(ifc_path)

    schema = ifc_file.schema
    print(f"✅ 스키마: {schema}")

    result = {
        "file": Path(ifc_path).name,
        "schema": schema,
        "project": {},
        "sites": [],
        "buildings": [],
        "storeys": [],
        "spaces": [],
        "elements": [],
        "summary": {}
    }

    # 프로젝트 정보
    projects = ifc_file.by_type("IfcProject")
    if projects:
        proj = projects[0]
        result["project"] = {
            "id": proj.GlobalId,
            "name": proj.Name or "",
            "description": proj.Description or "",
        }

    # 사이트
    for site in ifc_file.by_type("IfcSite"):
        result["sites"].append({
            "id": site.GlobalId,
            "name": site.Name or "",
        })

    # 건물
    for building in ifc_file.by_type("IfcBuilding"):
        result["buildings"].append({
            "id": building.GlobalId,
            "name": building.Name or "",
            "description": building.Description or "",
        })

    # 층 (Storey)
    for storey in ifc_file.by_type("IfcBuildingStorey"):
        elevation = storey.Elevation if hasattr(storey, "Elevation") else None
        result["storeys"].append({
            "id": storey.GlobalId,
            "name": storey.Name or "",
            "elevation": elevation,
        })

    # 공간 (Space)
    for space in ifc_file.by_type("IfcSpace"):
        props = {}
        try:
            psets = util_element.get_psets(space)
            for pset_name, pset_props in psets.items():
                props[pset_name] = pset_props
        except Exception:
            pass

        result["spaces"].append({
            "id": space.GlobalId,
            "name": space.Name or "",
            "long_name": space.LongName or "",
            "properties": props,
        })

    # 주요 건축 요소 (벽, 슬래브, 문, 창문, 기둥, 빔)
    element_types = [
        "IfcWall", "IfcWallStandardCase",
        "IfcSlab",
        "IfcDoor",
        "IfcWindow",
        "IfcColumn",
        "IfcBeam",
        "IfcStair",
        "IfcRoof",
        "IfcFurnishingElement",
    ]

    for ifc_type in element_types:
        elements = ifc_file.by_type(ifc_type)
        for elem in elements:
            result["elements"].append({
                "id": elem.GlobalId,
                "type": ifc_type,
                "name": elem.Name or "",
            })

    # 요약 통계
    result["summary"] = {
        "total_spaces": len(result["spaces"]),
        "total_storeys": len(result["storeys"]),
        "total_buildings": len(result["buildings"]),
        "total_elements": len(result["elements"]),
        "element_counts": _count_by_type(result["elements"]),
    }

    print(f"\n📊 파싱 결과 요약:")
    print(f"   - 건물: {result['summary']['total_buildings']}개")
    print(f"   - 층: {result['summary']['total_storeys']}개")
    print(f"   - 공간: {result['summary']['total_spaces']}개")
    print(f"   - 요소: {result['summary']['total_elements']}개")
    for elem_type, count in result["summary"]["element_counts"].items():
        print(f"     {elem_type}: {count}개")

    return result


def _count_by_type(elements: list) -> dict:
    counts = {}
    for elem in elements:
        t = elem["type"]
        counts[t] = counts.get(t, 0) + 1
    return counts


def main():
    parser = argparse.ArgumentParser(description="IFC 파일 파서 (IfcOpenShell 기반)")
    parser.add_argument("ifc_file", help="파싱할 IFC 파일 경로")
    parser.add_argument("--output", "-o", help="출력 JSON 파일 경로 (기본: <ifc_name>_parsed.json)")
    args = parser.parse_args()

    ifc_path = args.ifc_file
    if not Path(ifc_path).exists():
        print(f"❌ 파일을 찾을 수 없습니다: {ifc_path}")
        sys.exit(1)

    # 파싱
    data = parse_ifc(ifc_path)

    # 출력 경로 결정
    if args.output:
        output_path = args.output
    else:
        stem = Path(ifc_path).stem
        output_path = str(Path(ifc_path).parent / f"{stem}_parsed.json")

    # JSON 저장
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n✅ JSON 저장 완료: {output_path}")
    print("   → 이 JSON을 Neo4j Cypher 변환에 사용하세요.")


if __name__ == "__main__":
    main()
