import argparse
import os
from pathlib import Path
import subprocess
import tempfile
from uuid import UUID, uuid5
import warnings
from zipfile import ZIP_DEFLATED, ZipFile

with warnings.catch_warnings():
    warnings.simplefilter("ignore", DeprecationWarning)
    import msilib
    from msilib import schema, sequence


ROOT = Path(__file__).resolve().parents[2]
VERSION = "1.0.0"
APP_NAME = "Voice Proof"
EXE_NAME = "VoiceProof.exe"
UPGRADE_NAMESPACE = UUID("2936d770-b496-4b5a-9caf-616c88c65f0f")
ASSETS = (
    "index.html",
    "styles.css",
    "app.js",
    "audio.js",
    "registry.js",
    "role-portraits.webp",
    "node_modules/ethers/dist/ethers.min.js",
)
PROJECT_FILES = (
    ".gitignore",
    "README.md",
    "CONTRIBUTING.md",
    "LICENSE",
    "package.json",
    "package-lock.json",
    "contracts/VoiceRightsRegistry.sol",
    "packaging/windows/Launcher.cs",
    "packaging/windows/build.py",
)
LICENSE_FILES = (
    ("Voice Proof", "LICENSE"),
    ("ethers", "node_modules/ethers/LICENSE.md"),
    ("@adraffy/ens-normalize", "node_modules/@adraffy/ens-normalize/LICENSE"),
    ("@noble/curves", "node_modules/@noble/curves/LICENSE"),
    ("@noble/hashes", "node_modules/@noble/hashes/LICENSE"),
    ("aes-js", "node_modules/aes-js/LICENSE.txt"),
    ("tslib", "node_modules/tslib/LICENSE.txt"),
    ("ws", "node_modules/ws/LICENSE"),
)


def guid(value):
    return "{" + str(value).upper() + "}"


def compile_launcher(stage):
    compiler = Path(os.environ["WINDIR"]) / "Microsoft.NET/Framework/v4.0.30319/csc.exe"
    version_source = stage / "Version.cs"
    version_source.write_text(
        f'[assembly: System.Reflection.AssemblyVersion("{VERSION}.0")]\n'
        f'[assembly: System.Reflection.AssemblyFileVersion("{VERSION}.0")]\n',
        encoding="utf-8",
    )
    executable = stage / EXE_NAME
    subprocess.run(
        [
            str(compiler),
            "/nologo",
            "/target:winexe",
            "/platform:anycpu",
            "/optimize+",
            "/codepage:65001",
            f"/out:{executable}",
            "/reference:System.Windows.Forms.dll",
            "/reference:System.Drawing.dll",
            *(f"/resource:{ROOT / asset},web/{asset}" for asset in ASSETS),
            str(Path(__file__).with_name("Launcher.cs")),
            str(version_source),
        ],
        check=True,
    )
    return executable


def write_notices(stage):
    notices = stage / "Licenses.txt"
    notices.write_text(
        "\n\n".join(f"{name}\n{'=' * len(name)}\n{(ROOT / file).read_text(encoding='utf-8')}"
                    for name, file in LICENSE_FILES),
        encoding="utf-8",
    )
    return notices


def create_portable(stage):
    executable = compile_launcher(stage)
    notices = write_notices(stage)
    portable = stage / f"VoiceProof-Portable-{VERSION}.zip"
    with ZipFile(portable, "w", ZIP_DEFLATED, compresslevel=9) as archive:
        archive.write(executable, "打开声证.exe")
        archive.write(notices, "源码/Licenses.txt")
        source_files = dict.fromkeys((*PROJECT_FILES, *ASSETS, *(file for _, file in LICENSE_FILES)))
        for file in source_files:
            archive.write(ROOT / file, f"源码/{file}")
    return portable


def create_installer(stage):
    executable = compile_launcher(stage)
    notices = write_notices(stage)
    installer = stage / f"VoiceProof-Setup-{VERSION}.msi"
    product_id = guid(uuid5(UPGRADE_NAMESPACE, VERSION))
    component_id = guid(uuid5(UPGRADE_NAMESPACE, "desktop"))
    upgrade_id = guid(UPGRADE_NAMESPACE)
    db = msilib.init_database(str(installer), schema, APP_NAME, product_id, VERSION, APP_NAME)
    summary = db.GetSummaryInformation(6)
    summary.SetProperty(msilib.PID_TEMPLATE, "Intel;1033")
    summary.SetProperty(msilib.PID_WORDCOUNT, 10)
    summary.SetProperty(msilib.PID_PAGECOUNT, 300)
    summary.SetProperty(msilib.PID_APPNAME, APP_NAME)
    summary.Persist()
    msilib.add_tables(db, sequence)

    def rows(table, *records):
        msilib.add_data(db, table, records)

    rows("Property",
         ("UpgradeCode", upgrade_id),
         ("SecureCustomProperties", "OLDVOICEPROOF;NEWVOICEPROOF"),
         ("ARPNOMODIFY", "1"))
    rows("Directory",
         ("TARGETDIR", None, "SourceDir"),
         ("LocalAppDataFolder", "TARGETDIR", "."),
         ("VoicePrograms", "LocalAppDataFolder", "Programs"),
         ("INSTALLDIR", "VoicePrograms", "VOICEP~1|Voice Proof"),
         ("ProgramMenuFolder", "TARGETDIR", "."))
    rows("Feature", ("Desktop", None, APP_NAME, None, 1, 1, "INSTALLDIR", 0))
    rows("Component", ("DesktopFiles", component_id, "INSTALLDIR", 4, None, "InstallMarker"))
    rows("FeatureComponents", ("Desktop", "DesktopFiles"))
    rows("Registry", ("InstallMarker", 1, r"Software\Voice Proof", "InstallPath", "[INSTALLDIR]", "DesktopFiles"))
    rows("Shortcut", ("StartMenuLink", "ProgramMenuFolder", "VOICEP~1|Voice Proof", "DesktopFiles",
                      "[#Launcher]", None, "Open the Voice Proof role lobby", None, None, None, None, "INSTALLDIR"))
    rows("Upgrade",
         (upgrade_id, None, VERSION, None, 0, None, "OLDVOICEPROOF"),
         (upgrade_id, VERSION, None, None, 2, None, "NEWVOICEPROOF"))
    rows("LaunchCondition", ("NOT NEWVOICEPROOF OR Installed", "A newer version of Voice Proof is already installed."))
    update_actions = db.OpenView("UPDATE `InstallExecuteSequence` SET `Sequence` = 90 WHERE `Action` = 'FindRelatedProducts'")
    update_actions.Execute(None)
    update_actions.Close()
    update_actions = db.OpenView("UPDATE `InstallUISequence` SET `Sequence` = 90 WHERE `Action` = 'FindRelatedProducts'")
    update_actions.Execute(None)
    update_actions.Close()

    cabinet = msilib.CAB("VoiceProof.cab")
    files = (
        (executable, "Launcher", f"VOICEP~1.EXE|{EXE_NAME}", f"{VERSION}.0"),
        (notices, "Licenses", notices.name, None),
    )
    for file, logical_name, filename, version in files:
        file_sequence, identifier = cabinet.append(str(file), file.name, logical_name)
        rows("File", (identifier, "DesktopFiles", filename, file.stat().st_size, version, None, 512, file_sequence))
    cabinet.commit(db)
    db.Commit()
    del update_actions, summary, db
    return installer


def main():
    parser = argparse.ArgumentParser(description="Build a distributable Windows package for Voice Proof.")
    parser.add_argument("--portable", action="store_true", help="Make a ZIP with one launcher and the project source.")
    options = parser.parse_args()
    output = ROOT / "dist"
    output.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="voice-proof-", dir=output, ignore_cleanup_errors=True) as temporary:
        stage = Path(temporary)
        package = create_portable(stage) if options.portable else create_installer(stage)
        destination = package.replace(output / package.name)
    print(destination)


if __name__ == "__main__":
    main()
