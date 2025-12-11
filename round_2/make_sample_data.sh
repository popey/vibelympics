#!/bin/bash -xeu

# Make some sample data

mkdir ./sample_data

for SNAP in firefox spotify nextcloud null ncspot bandwhich; do
    echo "Processing $SNAP"
    syft $SNAP -o syft-json | jq . > ./sample_data/${SNAP}_sbom.json
    BASE=$(jq -r '.artifacts[0].metadata.base' < ./sample_data/${SNAP}_sbom.json)
    echo "Base image for $SNAP: $BASE"
    case $BASE in
        "core24")
            DISTRO=" --distro ubuntu:24.04"
            ;;
        "core22")
            DISTRO=" --distro ubuntu:22.04"
            ;;
        "core20")
            DISTRO=" --distro ubuntu:20.04"
            ;;
        "core18")
            DISTRO=" --distro ubuntu:18.04"
            ;;
        "core")
            DISTRO=" --distro ubuntu:16.04"
            ;;
        *)
            echo "Unknown base image: $BASE"
            DISTRO=""
            ;;
    esac

    grype ./sample_data/${SNAP}_sbom.json ${DISTRO} -o json | jq . > ./sample_data/${SNAP}_vuln.json
done
