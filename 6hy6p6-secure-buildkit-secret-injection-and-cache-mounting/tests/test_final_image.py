import os
import re

def test_final_image():
    dockerfile_path = "Dockerfile"
    assert os.path.exists(dockerfile_path), "Dockerfile does not exist"
    
    with open(dockerfile_path, "r") as f:
        content = f.read()
    
    # Split content by FROM at the beginning of a line to identify stages
    stages = re.split(r"(?i)^FROM\s+", content, flags=re.MULTILINE)
    
    # Find the stage that is for the final production image (marked as AS final)
    final_stage = None
    for stage in stages:
        if " AS final" in stage or " as final" in stage:
            final_stage = "FROM " + stage
            break
    
    if final_stage is None:
        # Fallback to the last stage if 'AS final' is missing, but excluding 'AS tester'
        non_tester_stages = [s for s in stages if " AS tester" not in s and " as tester" not in s]
        if non_tester_stages:
            final_stage = "FROM " + non_tester_stages[-1]
            
    assert final_stage is not None, "Could not identify the final production stage"
    
    # Assert final stage base image is scratch or distroless
    assert "gcr.io/distroless/static" in final_stage or "scratch" in final_stage, \
        "Final stage base image must be scratch or gcr.io/distroless/static"
    
    # Assert alpine/debian/ubuntu are NOT used in final stage
    unsupported_bases = ["alpine", "debian", "ubuntu"]
    for base in unsupported_bases:
        assert base not in final_stage.lower(), f"Final stage must not use {base}"
    
    # Assert no secret paths exist in final stage
    # This checks for strings like ssh_key or id_rsa in the final stage definition
    assert "ssh_key" not in final_stage, "Final stage must not refer to secrets"
    assert "id_rsa" not in final_stage, "Final stage must not refer to SSH keys"
    
    # Assert only binary + certs are copied
    # We look for COPY --from statements in the final stage
    copies = re.findall(r"COPY\s+--from=\w+\s+(\S+)\s+(\S+)", final_stage)
    
    # We expect exactly 2 copies (certs and binary)
    assert len(copies) == 2, f"Final stage should have exactly 2 COPY commands, found {len(copies)}"
    
    copied_paths = [c[0] for c in copies]
    assert any("ca-certificates.crt" in p for p in copied_paths), "Certs must be copied"
    assert any("secure-build" in p for p in copied_paths), "Binary must be copied"

if __name__ == "__main__":
    try:
        test_final_image()
        print("Final image tests passed!")
    except AssertionError as e:
        print(f"Test FAILED: {e}")
        exit(1)
