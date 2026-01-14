---
name: medical-imaging-skill
description: A skill for working with medical images.
---

# Medical Imaging Skill

This skill helps you work with medical images like DICOM files and X-rays.

## Introduction

Medical imaging is a very important part of healthcare. There are many different types of medical images including X-rays, CT scans, MRIs, and ultrasounds. This skill will help you work with these images effectively.

Medical imaging dates back to 1895 when Wilhelm Röntgen discovered X-rays. Since then, the field has grown tremendously with the introduction of CT scanning in the 1970s, MRI in the 1980s, and digital imaging in the 1990s.

## When to Use This Skill

You should use this skill when you need to work with medical images. This includes reading DICOM files, processing X-rays, and analyzing medical imaging data.

## DICOM Processing Script

Here is a Python script for processing DICOM files:

```python
#!/usr/bin/env python3
"""
DICOM Processing Script
This script handles all DICOM file operations including reading, writing,
anonymization, and metadata extraction.
"""

import pydicom
import numpy as np
from pathlib import Path
import json
import hashlib
from datetime import datetime

def read_dicom(file_path: str) -> dict:
    """
    Read a DICOM file and extract its metadata and pixel data.

    Args:
        file_path: Path to the DICOM file

    Returns:
        Dictionary containing metadata and pixel array
    """
    ds = pydicom.dcmread(file_path)

    metadata = {
        'patient_id': str(ds.PatientID) if hasattr(ds, 'PatientID') else None,
        'patient_name': str(ds.PatientName) if hasattr(ds, 'PatientName') else None,
        'study_date': str(ds.StudyDate) if hasattr(ds, 'StudyDate') else None,
        'modality': str(ds.Modality) if hasattr(ds, 'Modality') else None,
        'manufacturer': str(ds.Manufacturer) if hasattr(ds, 'Manufacturer') else None,
        'rows': int(ds.Rows) if hasattr(ds, 'Rows') else None,
        'columns': int(ds.Columns) if hasattr(ds, 'Columns') else None,
    }

    pixel_array = None
    if hasattr(ds, 'PixelData'):
        pixel_array = ds.pixel_array

    return {
        'metadata': metadata,
        'pixel_array': pixel_array,
        'dataset': ds
    }

def anonymize_dicom(file_path: str, output_path: str) -> None:
    """
    Anonymize a DICOM file by removing patient identifying information.

    Args:
        file_path: Path to the input DICOM file
        output_path: Path for the anonymized output file
    """
    ds = pydicom.dcmread(file_path)

    # List of tags to anonymize
    tags_to_anonymize = [
        'PatientName',
        'PatientID',
        'PatientBirthDate',
        'PatientSex',
        'PatientAge',
        'PatientAddress',
        'PatientTelephoneNumbers',
        'InstitutionName',
        'InstitutionAddress',
        'ReferringPhysicianName',
        'PerformingPhysicianName',
        'OperatorsName',
    ]

    for tag in tags_to_anonymize:
        if hasattr(ds, tag):
            if tag == 'PatientID':
                # Generate anonymous ID
                original_id = str(getattr(ds, tag))
                anon_id = hashlib.sha256(original_id.encode()).hexdigest()[:16]
                setattr(ds, tag, anon_id)
            else:
                setattr(ds, tag, 'ANONYMIZED')

    ds.save_as(output_path)
    print(f"Anonymized DICOM saved to {output_path}")

def extract_metadata_batch(directory: str) -> list:
    """
    Extract metadata from all DICOM files in a directory.

    Args:
        directory: Path to directory containing DICOM files

    Returns:
        List of metadata dictionaries
    """
    results = []
    dicom_dir = Path(directory)

    for file_path in dicom_dir.glob('**/*.dcm'):
        try:
            data = read_dicom(str(file_path))
            data['metadata']['file_path'] = str(file_path)
            results.append(data['metadata'])
        except Exception as e:
            print(f"Error processing {file_path}: {e}")

    return results

def convert_to_png(file_path: str, output_path: str) -> None:
    """
    Convert a DICOM file to PNG format.

    Args:
        file_path: Path to the DICOM file
        output_path: Path for the output PNG file
    """
    from PIL import Image

    data = read_dicom(file_path)
    pixel_array = data['pixel_array']

    if pixel_array is None:
        raise ValueError("No pixel data in DICOM file")

    # Normalize to 8-bit
    pixel_array = pixel_array.astype(float)
    pixel_array = (pixel_array - pixel_array.min()) / (pixel_array.max() - pixel_array.min())
    pixel_array = (pixel_array * 255).astype(np.uint8)

    img = Image.fromarray(pixel_array)
    img.save(output_path)
    print(f"PNG saved to {output_path}")

if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='DICOM Processing Tool')
    parser.add_argument('command', choices=['read', 'anonymize', 'batch', 'convert'])
    parser.add_argument('input', help='Input file or directory')
    parser.add_argument('--output', '-o', help='Output file or directory')

    args = parser.parse_args()

    if args.command == 'read':
        data = read_dicom(args.input)
        print(json.dumps(data['metadata'], indent=2))
    elif args.command == 'anonymize':
        anonymize_dicom(args.input, args.output)
    elif args.command == 'batch':
        results = extract_metadata_batch(args.input)
        print(json.dumps(results, indent=2))
    elif args.command == 'convert':
        convert_to_png(args.input, args.output)
```

## X-Ray Analysis Script

Here is another script for analyzing X-ray images:

```python
#!/usr/bin/env python3
"""
X-Ray Analysis Script
Provides basic analysis functions for chest X-rays.
"""

import numpy as np
from PIL import Image
import cv2

def load_xray(image_path: str) -> np.ndarray:
    """Load an X-ray image."""
    img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    return img

def enhance_contrast(image: np.ndarray) -> np.ndarray:
    """Apply CLAHE contrast enhancement."""
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
    return clahe.apply(image)

def detect_edges(image: np.ndarray) -> np.ndarray:
    """Detect edges using Canny edge detection."""
    return cv2.Canny(image, 50, 150)

def calculate_lung_ratio(image: np.ndarray) -> float:
    """
    Calculate approximate cardiothoracic ratio.
    This is a simplified version for demonstration.
    """
    height, width = image.shape

    # Find the widest horizontal extent
    mid_row = height // 2
    row = image[mid_row, :]

    # Simple thresholding
    threshold = np.mean(row)
    mask = row > threshold

    if np.any(mask):
        indices = np.where(mask)[0]
        lung_width = indices[-1] - indices[0]
        return lung_width / width

    return 0.0

def analyze_xray(image_path: str) -> dict:
    """
    Perform comprehensive X-ray analysis.

    Returns dictionary with analysis results.
    """
    img = load_xray(image_path)
    enhanced = enhance_contrast(img)
    edges = detect_edges(enhanced)
    ratio = calculate_lung_ratio(enhanced)

    return {
        'original_shape': img.shape,
        'mean_intensity': float(np.mean(img)),
        'std_intensity': float(np.std(img)),
        'lung_ratio': ratio,
        'edge_density': float(np.sum(edges > 0) / edges.size)
    }

if __name__ == '__main__':
    import sys
    import json

    if len(sys.argv) < 2:
        print("Usage: python xray_analysis.py <image_path>")
        sys.exit(1)

    results = analyze_xray(sys.argv[1])
    print(json.dumps(results, indent=2))
```

## Common DICOM Tags

Here are some common DICOM tags you might need:

| Tag | Name | Description |
|-----|------|-------------|
| (0010,0010) | PatientName | Patient's full name |
| (0010,0020) | PatientID | Primary hospital identification number |
| (0008,0060) | Modality | Type of equipment (CT, MR, CR, etc.) |
| (0008,0020) | StudyDate | Date the study started |
| (0008,0030) | StudyTime | Time the study started |
| (0020,000D) | StudyInstanceUID | Unique identifier for the study |
| (0020,000E) | SeriesInstanceUID | Unique identifier for the series |
| (0008,0018) | SOPInstanceUID | Unique identifier for the image |

## Modality Codes

| Code | Description |
|------|-------------|
| CR | Computed Radiography |
| CT | Computed Tomography |
| MR | Magnetic Resonance |
| US | Ultrasound |
| XA | X-Ray Angiography |
| NM | Nuclear Medicine |
| PT | Positron Emission Tomography |
| DX | Digital Radiography |

## Usage Examples

To read a DICOM file:
```bash
python dicom_processor.py read /path/to/file.dcm
```

To anonymize a DICOM file:
```bash
python dicom_processor.py anonymize /path/to/file.dcm --output /path/to/anon.dcm
```

To analyze an X-ray:
```bash
python xray_analysis.py /path/to/xray.png
```
