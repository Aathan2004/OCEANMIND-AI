"""
Inspect a single image with the exact predictor and rejection policy used by
POST /predict, including the fish/non-fish gate.

    cd ml-py && python test_prediction.py path/to/photo.jpg
"""
import sys

from app.predictor import get_predictor


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python test_prediction.py <image>")

    result = get_predictor().predict(sys.argv[1], top_k=5)
    if not result.get("success"):
        raise SystemExit(result["error"])

    status = result["status"]
    print(f"Status: {status}")

    if result.get("gate"):
        gate = result["gate"]
        print(
            f"Gate: is_fish={gate['is_fish']} fish={gate['fish_score']} "
            f"aquatic={gate['aquatic_context_score']} top_imagenet={gate['top_imagenet_label']}"
        )

    if status == "not_fish":
        print(result["message"])
        return

    top = result["top_candidate"]
    print(f"\nTop candidate: {top['name']}  {top['confidence'] * 100:.2f}%")
    print("\nTop 5:")
    for number, item in enumerate([top, *result["alternatives"]], 1):
        print(f"  {number}. {item['name']:45s} {item['confidence'] * 100:6.2f}%")

    print(
        f"\nmargin={result['confidence_margin']:.4f}  "
        f"normalized_entropy={result['normalized_entropy']:.4f}  "
        f"blur_score={result['blur_score']:.2f}"
    )

    if status != "identified":
        print(f"\nRejected because: {', '.join(result['rejection_reasons'])}")
        print(result["message"])


if __name__ == "__main__":
    main()
